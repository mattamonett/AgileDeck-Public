import type { IncomingMessage, Server as HttpServer } from 'node:http';

// Bootstrap tests must not open the developer's database or leave real
// diagnostic queries running after the server has finished.
jest.mock('../../../src/platform/db/prisma', () => ({
  __esModule: true,
  default: {
    room: { count: jest.fn().mockResolvedValue(0) },
    $disconnect: jest.fn().mockResolvedValue(undefined),
  },
}));

type AllowRequest = (
  req: Pick<IncomingMessage, 'headers'>,
  callback: (err: string | null | undefined, success: boolean) => void,
) => void;

interface FakeIo {
  options: Record<string, unknown> & { allowRequest: AllowRequest };
  attach: jest.Mock;
  engine: { on: jest.Mock } | undefined;
  sockets: { adapter: { rooms: Map<string, Set<string>> } };
  disconnectSockets: jest.Mock;
}

const ios: FakeIo[] = [];
jest.mock('socket.io', () => ({
  Server: jest.fn((options: FakeIo['options']) => {
    const io: FakeIo = {
      options,
      attach: jest.fn(() => {
        io.engine = { on: jest.fn() };
      }),
      engine: undefined,
      sockets: { adapter: { rooms: new Map() } },
      disconnectSockets: jest.fn(),
    };
    ios.push(io);
    return io;
  }),
}));

const setupSocket = jest.fn();
jest.mock('../../../src/socket', () => ({
  setupSocket: (io: unknown) => setupSocket(io),
}));
const startCleanupJob = jest.fn();
jest.mock('../../../src/modules/maintenance/cleanup.job', () => ({
  startCleanupJob: (isRoomActive: unknown) => startCleanupJob(isRoomActive),
}));

import { createServer } from '../../../src/server';
import type { ServerEnv } from '../../../src/config/env';

const DEV_ENV: ServerEnv = {
  allowedOrigins: ['http://localhost:4300', 'http://127.0.0.1:4300'],
  secureCookies: false,
  port: '4000',
  buildTime: 'Development',
  adminEnabled: false,
};

function lastIo(): FakeIo {
  const io = ios.at(-1);
  if (!io) throw new Error('Expected a Socket.IO server');
  return io;
}

function stubListen(httpServer: HttpServer): jest.SpyInstance {
  return jest.spyOn(httpServer, 'listen').mockImplementation(() => httpServer);
}

describe('API server', () => {
  const savedNodeEnv = process.env.NODE_ENV;
  const savedDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.DATABASE_URL;
    setupSocket.mockClear();
    startCleanupJob.mockClear();
  });
  afterAll(() => {
    if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedNodeEnv;
    if (savedDatabaseUrl !== undefined) process.env.DATABASE_URL = savedDatabaseUrl;
  });

  it('configures Socket.IO with admission before attaching it to the HTTP server', () => {
    const server = createServer(DEV_ENV);
    const io = lastIo();

    expect(io.options).toEqual({
      cors: {
        origin: ['http://localhost:4300', 'http://127.0.0.1:4300'],
        methods: ['GET', 'POST'],
        credentials: true,
      },
      allowRequest: expect.any(Function),
      allowEIO3: false,
      maxHttpBufferSize: 16_384,
      connectTimeout: 10_000,
      pingTimeout: 60000,
      pingInterval: 25000,
    });
    expect(io.attach).toHaveBeenCalledWith(server.httpServer);
    expect(io.engine?.on).toHaveBeenCalledWith('connection', expect.any(Function));
    expect(setupSocket).toHaveBeenCalledWith(io);
    expect(server.io).toBe(io);
  });

  it('admits allowed origins and refuses others', () => {
    createServer(DEV_ENV);
    const { allowRequest } = lastIo().options;

    const allowCallback = jest.fn();
    allowRequest(
      {
        headers: {
          origin: 'http://localhost:4300',
          cookie: 'agiledeck_visitor_id_v2=550e8400-e29b-41d4-a716-446655440000',
        },
      },
      allowCallback,
    );
    expect(allowCallback).toHaveBeenCalledWith(null, true);

    allowCallback.mockClear();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    allowRequest({ headers: { origin: 'https://evil.example' } }, allowCallback);
    expect(allowCallback).toHaveBeenCalledWith('origin not allowed', false);
    warnSpy.mockRestore();
  });

  it('rejects missing socket origins in production by default', () => {
    process.env.NODE_ENV = 'production';
    const savedSecret = process.env.COOKIE_SIGNING_SECRET;
    const savedAllowMissing = process.env.ALLOW_MISSING_SOCKET_ORIGIN;
    process.env.COOKIE_SIGNING_SECRET = 'index-test-secret-0123456789abcdef';
    delete process.env.ALLOW_MISSING_SOCKET_ORIGIN;

    createServer({
      ...DEV_ENV,
      allowedOrigins: ['https://poker.example.com'],
    });
    const allowCallback = jest.fn();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    lastIo().options.allowRequest({ headers: {} }, allowCallback);
    expect(allowCallback).toHaveBeenCalledWith('origin not allowed', false);
    warnSpy.mockRestore();

    if (savedSecret === undefined) delete process.env.COOKIE_SIGNING_SECRET;
    else process.env.COOKIE_SIGNING_SECRET = savedSecret;
    if (savedAllowMissing !== undefined)
      process.env.ALLOW_MISSING_SOCKET_ORIGIN = savedAllowMissing;
  });

  it('starts the cleanup job and listens on the configured port', () => {
    const server = createServer(DEV_ENV);
    const listen = stubListen(server.httpServer);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    server.start();

    expect(startCleanupJob).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledWith('4000', expect.any(Function));
    const onListening = listen.mock.calls[0]?.[1] as (() => void) | undefined;
    onListening?.();
    expect(logSpy).toHaveBeenCalledWith('Server running on http://localhost:4000');
    logSpy.mockRestore();
  });

  it('falls back to the default port', () => {
    const server = createServer({ ...DEV_ENV, port: 3000 });
    const listen = stubListen(server.httpServer);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    server.start();

    expect(listen).toHaveBeenCalledWith(3000, expect.any(Function));
    const onListening = listen.mock.calls[0]?.[1] as (() => void) | undefined;
    onListening?.();
    expect(logSpy).toHaveBeenCalledWith('Server running on http://localhost:3000');
    logSpy.mockRestore();
  });

  it('keeps rooms with connected members or pending newcomers out of cleanup', () => {
    const server = createServer(DEV_ENV);
    stubListen(server.httpServer);
    server.start();
    const isRoomActive = startCleanupJob.mock.calls[0]?.[0] as
      ((roomId: string) => boolean) | undefined;
    if (!isRoomActive) throw new Error('Expected the cleanup callback');
    const rooms = lastIo().sockets.adapter.rooms;

    expect(isRoomActive('room-a')).toBe(false);
    rooms.set('room-a', new Set());
    expect(isRoomActive('room-a')).toBe(false);
    rooms.set('lobby:room-a', new Set(['socket-1']));
    expect(isRoomActive('room-a')).toBe(true);
    rooms.set('room-b', new Set(['socket-2']));
    expect(isRoomActive('room-b')).toBe(true);
  });

  it('closes HTTP, sockets and the database when stopped', async () => {
    const server = createServer(DEV_ENV);
    const close = jest.spyOn(server.httpServer, 'close').mockImplementation((done) => {
      done?.();
      return server.httpServer;
    });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await server.stop('SIGTERM');

    expect(close).toHaveBeenCalled();
    expect(lastIo().disconnectSockets).toHaveBeenCalledWith(true);
    expect(logSpy.mock.calls.map((call) => call[0])).toEqual([
      '\nReceived SIGTERM. Gracefully stopping server...',
      'HTTP server closed.',
      'All socket connections terminated.',
      'Database connection closed.',
    ]);
    logSpy.mockRestore();
  });
});
