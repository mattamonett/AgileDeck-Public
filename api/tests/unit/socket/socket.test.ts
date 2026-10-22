const recordInteractionMock = jest.fn().mockResolvedValue(true);
jest.mock('../../../src/modules/rooms/room-stats.service', () => ({
  recordInteraction: (...args: unknown[]) => recordInteractionMock(...args),
}));
import { GameEvents, NAME_TAKEN_MESSAGE, SocketEvents, Theme } from '@poker/shared';
import { getSiteAgreement, setSiteConfig } from '../../../src/config/site-config';
import {
  encodeSiteAccessCookie,
  SITE_ACCESS_COOKIE_NAME,
} from '../../../src/modules/site/site-access';
import { randomUUID } from 'node:crypto';
const FEEDBACK_AGREEMENT_VERSION = getSiteAgreement().version;

const recordRateLimitHitMock = jest.fn();
jest.mock('../../../src/modules/telemetry/rate-limit-telemetry', () => ({
  recordRateLimitHit: (...args: unknown[]) => recordRateLimitHitMock(...args),
  recordCookieRateLimitHit: jest.fn(),
}));
const checkRateLimitMock = jest.fn();
const sanitizeMock = jest.fn();
const getHealthStatusMock = jest.fn();
class SiteAgreementRequiredError extends Error {}
class JoinRejectedError extends Error {}
const roomServiceMock = {
  SiteAgreementRequiredError,
  JoinRejectedError,
  PENDING_REQUEST_TTL_MS: 5 * 60_000,
  init: jest.fn(),
  joinRoom: jest.fn(),
  cleanupUser: jest.fn(),
  broadcastUserUpdate: jest.fn(),
  checkAutoReveal: jest.fn(),
  startRevelation: jest.fn(),
  resetRoom: jest.fn(),
  updateRoom: jest.fn(),
  toggleAutoReveal: jest.fn(),
  toPublicUser: jest.fn((user) => user),
  toPublicRoom: jest.fn((room) => room),
  isRevealPending: jest.fn(() => false),
  getRevelationRemainingSeconds: jest.fn<number | null, []>(() => null),
  approveUser: jest.fn(),
  denyUser: jest.fn(),
};
const userServiceMock = {
  setVote: jest.fn(),
  updateName: jest.fn(),
  toggleObserver: jest.fn(),
};

jest.mock('../../../src/platform/concurrency/action-cooldowns', () => ({
  ...jest.requireActual<typeof import('../../../src/platform/concurrency/action-cooldowns')>(
    '../../../src/platform/concurrency/action-cooldowns',
  ),
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}));
jest.mock('../../../src/socket/sanitize', () => ({
  sanitize: (...args: unknown[]) => sanitizeMock(...args),
}));

jest.mock('../../../src/modules/site/health.service', () => ({
  getHealthStatus: (...args: unknown[]) => getHealthStatusMock(...args),
}));

jest.mock('../../../src/modules/rooms/room.service', () => roomServiceMock);

const userRepositoryMock = {
  findById: jest.fn(),
  findByRoomId: jest.fn(),
  isNameTaken: jest.fn(),
};
const roomRepositoryMock = {
  findById: jest.fn(),
};

jest.mock('../../../src/modules/rooms/user.repository', () => userRepositoryMock);

jest.mock('../../../src/modules/rooms/room.repository', () => roomRepositoryMock);

jest.mock('../../../src/modules/rooms/member.service', () => userServiceMock);

import { VISITOR_COOKIE_NAME } from '../../../src/platform/http/visitor-session';
import { setupSocket } from '../../../src/socket';
import { UNJOINED_SOCKET_TIMEOUT_MS } from '../../../src/socket/handlers/join.handlers';
import type { RoomBroadcaster } from '../../../src/modules/rooms/room-broadcaster';
import { clearThrowPenalties } from '../../../src/modules/interactions/throw-penalty.service';
import { HEALTH_BUDGET, JOIN_BUDGET, JOIN_NETWORK_BUDGET } from '../../../src/socket/rate-limits';

// Budgets stay real objects; tests observe keys and force outcomes through spies.
const joinNetworkConsume = jest.spyOn(JOIN_NETWORK_BUDGET, 'consume');
const joinConsume = jest.spyOn(JOIN_BUDGET, 'consume');
const healthConsume = jest.spyOn(HEALTH_BUDGET, 'consume');

type Handler = (...args: unknown[]) => unknown;
type PacketMiddleware = (packet: [string, unknown?], next: (error?: Error) => void) => void;
type HandlerMap = Record<string, Handler> & { connection: Handler } & Record<SocketEvents, Handler>;

// The test double implements only the Socket.IO surface exercised by handlers.
function setupTestSocket(io: ReturnType<typeof createIo>['io']): void {
  setupSocket(io as unknown as Parameters<typeof setupSocket>[0]);
}

const createIo = () => {
  const handlers = {} as HandlerMap;
  const emitMock = jest.fn();
  const fetchSocketsMock = jest.fn().mockResolvedValue([]);
  const toMock = jest.fn(() => ({
    emit: emitMock,
    fetchSockets: fetchSocketsMock,
  }));
  const io = {
    on: (event: string, cb: Handler) => {
      handlers[event] = cb;
    },
    to: toMock,
    in: toMock,
    fetchSockets: fetchSocketsMock,
    use: jest.fn(),
  };
  return { io, handlers, emitMock, fetchSocketsMock };
};

const createSocket = () => {
  const handlers = {} as HandlerMap;
  let packetMiddleware: PacketMiddleware | null = null;
  const socket = {
    id: 'socket-1',
    data: { visitorId: 'visitor-1', clientIp: '127.0.0.1' } as Record<string, unknown>,
    visitorId: 'visitor-1',
    request: { headers: { cookie: `${VISITOR_COOKIE_NAME}=visitor-1` } },
    handshake: { auth: { visitorId: 'visitor-1' } as Record<string, unknown> },
    on: (event: string, cb: Handler) => {
      handlers[event] = cb;
    },
    use: jest.fn((middleware: PacketMiddleware) => {
      packetMiddleware = middleware;
    }),
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    disconnected: false,
    disconnect: jest.fn(),
  };
  return {
    socket,
    handlers,
    getPacketMiddleware: () => packetMiddleware,
  };
};

describe('socket setup', () => {
  it('rejects overlapping joins and leaves no subscription after leaving', async () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const { socket, handlers: events } = createSocket();
    const memberships = new Set<string>();
    socket.join.mockImplementation((room: string) => {
      memberships.add(room);
    });
    socket.leave.mockImplementation((room: string) => {
      memberships.delete(room);
    });
    handlers.connection(socket);
    const deferred = Promise.withResolvers<unknown>();
    roomServiceMock.joinRoom.mockReturnValueOnce(deferred.promise);
    const first = events[SocketEvents.JOIN_ROOM]({
      roomId: 'room-a',
      userName: 'Alice',
    });
    await events[SocketEvents.JOIN_ROOM]({
      roomId: 'room-b',
      userName: 'Alice',
    });
    expect(roomServiceMock.joinRoom).toHaveBeenCalledTimes(1);
    deferred.resolve({
      user: { id: 'a', isApproved: true },
      room: { id: 'room-a' },
    });
    await first;
    await events[SocketEvents.LEAVE_ROOM]();
    expect([...memberships]).toEqual([]);
  });

  it.each([false, true])(
    'cleans a join abandoned by disconnect, approved=%s',
    async (isApproved) => {
      const { io, handlers } = createIo();
      setupTestSocket(io);
      const { socket, handlers: events } = createSocket();
      handlers.connection(socket);
      const deferred = Promise.withResolvers<unknown>();
      roomServiceMock.joinRoom.mockReturnValueOnce(deferred.promise);
      const joining = events[SocketEvents.JOIN_ROOM]({
        roomId: 'room-a',
        userName: 'Alice',
      });
      socket.disconnected = true;
      await events[SocketEvents.DISCONNECT]('closed');
      deferred.resolve({
        user: { id: 'a', isApproved },
        room: { id: 'room-a' },
      });
      await joining;
      expect(socket.join).not.toHaveBeenCalled();
      expect(roomServiceMock.cleanupUser).toHaveBeenCalledWith(
        'a',
        'room-a',
        socket.id,
        !isApproved,
      );
      expect(socket.data.userId).toBeNull();
    },
  );

  it('cancels a join abandoned by leave_room while preserving the connection', async () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const { socket, handlers: events } = createSocket();
    handlers.connection(socket);
    const deferred = Promise.withResolvers<unknown>();
    roomServiceMock.joinRoom.mockReturnValueOnce(deferred.promise);
    const joining = events[SocketEvents.JOIN_ROOM]({
      roomId: 'room-a',
      userName: 'Alice',
    });
    await events[SocketEvents.LEAVE_ROOM]();
    deferred.resolve({
      user: { id: 'a', isApproved: true },
      room: { id: 'room-a' },
    });
    await joining;
    expect(socket.join).not.toHaveBeenCalled();
    expect(roomServiceMock.cleanupUser).toHaveBeenCalledWith('a', 'room-a', socket.id, true);
  });

  it.each([false, true])(
    'checks approval before expiring a pending request (approved: %s)',
    async (isApproved) => {
      jest.useFakeTimers();
      try {
        const { io, handlers } = createIo();
        setupTestSocket(io);
        const { socket, handlers: events } = createSocket();
        handlers.connection(socket);
        const pending = {
          id: 'a',
          roomId: 'room-a',
          visitorId: 'visitor-1',
          isApproved: false,
          createdAt: new Date(),
        };
        roomServiceMock.joinRoom.mockResolvedValueOnce({
          user: pending,
          room: { id: 'room-a' },
        });
        userRepositoryMock.findById
          .mockResolvedValueOnce(pending)
          .mockResolvedValueOnce({ ...pending, isApproved });
        await events[SocketEvents.JOIN_ROOM]({
          roomId: 'room-a',
          userName: 'Alice',
        });
        await jest.advanceTimersByTimeAsync(5 * 60_000);
        if (isApproved) expect(socket.disconnect).not.toHaveBeenCalled();
        else expect(socket.disconnect).toHaveBeenCalledWith(true);
      } finally {
        jest.useRealTimers();
      }
    },
  );

  it('closes a socket that stays outside any room, but not one in a room', async () => {
    jest.useFakeTimers();
    try {
      const { io, handlers } = createIo();
      setupTestSocket(io);
      const idle = createSocket();
      handlers.connection(idle.socket);
      const member = createSocket();
      handlers.connection(member.socket);
      roomServiceMock.joinRoom.mockResolvedValueOnce({
        user: { id: 'user-1', isApproved: true },
        room: { id: 'room-1' },
      });
      await member.handlers[SocketEvents.JOIN_ROOM]({ roomId: 'room-1', userName: 'Alice' });

      await jest.advanceTimersByTimeAsync(UNJOINED_SOCKET_TIMEOUT_MS - 1);
      expect(idle.socket.disconnect).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(idle.socket.disconnect).toHaveBeenCalledWith(true);
      expect(member.socket.disconnect).not.toHaveBeenCalled();

      // Leaving starts the clock again.
      await member.handlers[SocketEvents.LEAVE_ROOM]();
      await jest.advanceTimersByTimeAsync(UNJOINED_SOCKET_TIMEOUT_MS);
      expect(member.socket.disconnect).toHaveBeenCalledWith(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('waits for a join in flight before closing an unjoined socket', async () => {
    jest.useFakeTimers();
    try {
      const { io, handlers } = createIo();
      setupTestSocket(io);
      const { socket, handlers: events } = createSocket();
      handlers.connection(socket);
      const deferred = Promise.withResolvers<unknown>();
      roomServiceMock.joinRoom.mockReturnValueOnce(deferred.promise);
      const joining = events[SocketEvents.JOIN_ROOM]({ roomId: 'room-1', userName: 'Alice' });
      await jest.advanceTimersByTimeAsync(UNJOINED_SOCKET_TIMEOUT_MS);
      expect(socket.disconnect).not.toHaveBeenCalled();
      deferred.resolve({ user: { id: 'user-1', isApproved: true }, room: { id: 'room-1' } });
      await joining;
      await jest.advanceTimersByTimeAsync(UNJOINED_SOCKET_TIMEOUT_MS);
      expect(socket.disconnect).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not register the retired room reaction event', () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);
    expect(socketHandlers['emoji_reaction']).toBeUndefined();
  });

  it('disconnects a visitor flooding unprotected or unknown events', () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const harness = createSocket();
    harness.socket.data.visitorId = 'ingress-test-visitor';
    handlers.connection(harness.socket);
    const middleware = harness.getPacketMiddleware();
    if (!middleware) throw new Error('Missing middleware');
    for (let i = 0; i < 301; i++) middleware(['unknown_event'], jest.fn());
    expect(harness.socket.disconnect).toHaveBeenCalledWith(true);
  });

  beforeEach(() => {
    clearThrowPenalties();
    jest.clearAllMocks();
    sanitizeMock.mockImplementation((val: unknown) => (typeof val === 'string' ? val : ''));
    checkRateLimitMock.mockReturnValue(true);
    joinNetworkConsume.mockReturnValue(true);
    joinConsume.mockReturnValue(true);
    healthConsume.mockReturnValue(true);
    getHealthStatusMock.mockResolvedValue({
      api: 'healthy',
      db: 'healthy',
      timestamp: 'now',
    });
    roomServiceMock.joinRoom.mockResolvedValue({
      user: { id: 'user-1' },
      room: { id: 'room-1' },
    });
    roomServiceMock.cleanupUser.mockResolvedValue(undefined);
    roomServiceMock.broadcastUserUpdate.mockResolvedValue(undefined);
    roomServiceMock.checkAutoReveal.mockResolvedValue(undefined);
    roomServiceMock.startRevelation.mockResolvedValue(undefined);
    roomServiceMock.resetRoom.mockResolvedValue(undefined);
    roomServiceMock.updateRoom.mockResolvedValue(undefined);
    roomServiceMock.toggleAutoReveal.mockResolvedValue(undefined);
    userServiceMock.setVote.mockResolvedValue(undefined);
    userServiceMock.updateName.mockResolvedValue({ id: 'user-1', name: 'Bob' });
    userServiceMock.toggleObserver.mockResolvedValue({ id: 'user-1' });
    userRepositoryMock.findById.mockResolvedValue({
      id: 'user-1',
      roomId: 'room-1',
      visitorId: 'visitor-1',
      isApproved: true,
    });
    userRepositoryMock.isNameTaken.mockResolvedValue(false);
    roomRepositoryMock.findById.mockResolvedValue({
      id: 'room-1',
      reveal: false,
    });
  });

  it('validates and authorizes the room issues setting', async () => {
    const { io, handlers } = createIo();
    setupSocket(io as unknown as Parameters<typeof setupSocket>[0]);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);
    socket.data.userId = 'user-1';
    socket.data.roomId = 'room-1';

    await socketHandlers[SocketEvents.TOGGLE_ISSUES]({ issuesEnabled: false });
    expect(roomServiceMock.updateRoom).toHaveBeenCalledWith('room-1', {
      issuesEnabled: false,
    });
    roomServiceMock.updateRoom.mockClear();
    await socketHandlers[SocketEvents.TOGGLE_ISSUES]({
      issuesEnabled: 'false',
    });
    expect(roomServiceMock.updateRoom).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(GameEvents.ERROR, 'Invalid issues setting');
    userRepositoryMock.findById.mockResolvedValue({
      roomId: 'room-1',
      isApproved: false,
    });
    await socketHandlers[SocketEvents.TOGGLE_ISSUES]({ issuesEnabled: true });
    expect(roomServiceMock.updateRoom).not.toHaveBeenCalled();
    userRepositoryMock.findById.mockResolvedValue({
      roomId: 'another-room',
      isApproved: true,
    });
    await socketHandlers[SocketEvents.TOGGLE_ISSUES]({ issuesEnabled: true });
    expect(roomServiceMock.updateRoom).not.toHaveBeenCalled();
  });

  it('refuses to turn issues on when the site has them turned off', async () => {
    const { io, handlers } = createIo();
    setupSocket(io as unknown as Parameters<typeof setupSocket>[0]);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);
    socket.data.userId = 'user-1';
    socket.data.roomId = 'room-1';
    setSiteConfig({ features: { issues: false } });
    try {
      await socketHandlers[SocketEvents.TOGGLE_ISSUES]({ issuesEnabled: true });
      expect(roomServiceMock.updateRoom).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith(
        GameEvents.ERROR,
        'Issues are turned off on this site.',
      );
    } finally {
      setSiteConfig();
    }
  });

  it('refuses a seasonal theme out of season', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-20T12:00:00Z'), doNotFake: ['nextTick'] });
    try {
      const { io, handlers } = createIo();
      setupTestSocket(io);
      const { socket, handlers: socketHandlers } = createSocket();
      handlers.connection(socket);
      socket.data = { userId: 'user-1', roomId: 'room-1' };
      userRepositoryMock.findById.mockResolvedValue({
        roomId: 'room-1',
        isApproved: true,
      });
      roomServiceMock.updateRoom.mockReset();

      await socketHandlers[SocketEvents.UPDATE_THEME]({ theme: 'harvest' });
      expect(roomServiceMock.updateRoom).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith(
        GameEvents.ERROR,
        'That theme is only available in its season',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('validates and authorizes room mood updates', async () => {
    const { io, handlers } = createIo();
    setupSocket(io as unknown as Parameters<typeof setupSocket>[0]);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);
    socket.data.userId = 'user-1';
    socket.data.roomId = 'room-1';

    await socketHandlers[SocketEvents.UPDATE_ROOM_MOOD]({ mood: 'friendly' });
    expect(roomServiceMock.updateRoom).toHaveBeenCalledWith('room-1', {
      mood: 'friendly',
    });

    roomServiceMock.updateRoom.mockClear();
    await socketHandlers[SocketEvents.UPDATE_ROOM_MOOD]({ mood: 'feral' });
    expect(roomServiceMock.updateRoom).not.toHaveBeenCalled();

    userRepositoryMock.findById.mockResolvedValue({
      roomId: 'room-1',
      isApproved: false,
    });
    await socketHandlers[SocketEvents.UPDATE_ROOM_MOOD]({ mood: 'spicy' });
    expect(roomServiceMock.updateRoom).not.toHaveBeenCalled();
  });

  it('refuses moods and themes the operator does not allow', async () => {
    setSiteConfig({
      content: {
        moods: ['friendly', 'playful'],
        themes: [Theme.GARDEN, Theme.SPACE],
      },
    });
    try {
      const { io, handlers } = createIo();
      setupTestSocket(io);
      const { socket, handlers: socketHandlers } = createSocket();
      handlers.connection(socket);
      socket.data = { userId: 'user-1', roomId: 'room-1' };
      userRepositoryMock.findById.mockResolvedValue({
        roomId: 'room-1',
        isApproved: true,
      });
      roomServiceMock.updateRoom.mockReset();

      await socketHandlers[SocketEvents.UPDATE_ROOM_MOOD]({ mood: 'spicy' });
      await socketHandlers[SocketEvents.UPDATE_THEME]({ theme: 'vegas' });
      expect(roomServiceMock.updateRoom).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith(
        GameEvents.ERROR,
        'That mood is not available on this site',
      );
      expect(socket.emit).toHaveBeenCalledWith(
        GameEvents.ERROR,
        'That theme is not available on this site',
      );

      await socketHandlers[SocketEvents.UPDATE_ROOM_MOOD]({ mood: 'friendly' });
      sanitizeMock.mockReturnValue('space');
      await socketHandlers[SocketEvents.UPDATE_THEME]({ theme: 'space' });
      expect(roomServiceMock.updateRoom).toHaveBeenCalledWith('room-1', {
        mood: 'friendly',
      });
      expect(roomServiceMock.updateRoom).toHaveBeenCalledWith('room-1', {
        theme: 'space',
      });
    } finally {
      setSiteConfig();
    }
  });

  it.each(['observer', 'revealed', 'missing-room'])('rejects voting when %s', async (condition) => {
    const { io, handlers } = createIo();
    setupSocket(io as unknown as Parameters<typeof setupSocket>[0]);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);
    socket.data.userId = 'user-1';
    socket.data.roomId = 'room-1';
    userRepositoryMock.findById.mockResolvedValue({
      roomId: 'room-1',
      isApproved: true,
      isObserver: condition === 'observer',
    });
    roomRepositoryMock.findById.mockResolvedValue(
      condition === 'missing-room' ? null : { id: 'room-1', reveal: condition === 'revealed' },
    );
    await socketHandlers[SocketEvents.VOTE]({ vote: '5' });
    expect(userServiceMock.setVote).not.toHaveBeenCalled();
  });

  it.each([
    [SocketEvents.APPROVE_USER, 'approveUser'],
    [SocketEvents.DENY_USER, 'denyUser'],
  ] as const)('validates, authorizes and dispatches %s', async (event, method) => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);
    socket.data.userId = 'user-1';
    socket.data.roomId = 'room-1';
    await socketHandlers[event]({ userId: 'target' });
    expect(roomServiceMock[method]).toHaveBeenCalledWith('target', 'room-1');
    roomServiceMock[method].mockClear();
    await socketHandlers[event]({ userId: '' });
    expect(roomServiceMock[method]).not.toHaveBeenCalled();
    userRepositoryMock.findById.mockResolvedValue({
      roomId: 'room-1',
      isApproved: false,
    });
    await socketHandlers[event]({ userId: 'target' });
    expect(roomServiceMock[method]).not.toHaveBeenCalled();
  });

  it.each([
    [SocketEvents.APPROVE_USER, 'approveUser'],
    [SocketEvents.DENY_USER, 'denyUser'],
  ] as const)('handles service failures for %s', async (event, method) => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);
    socket.data.userId = 'user-1';
    socket.data.roomId = 'room-1';
    roomServiceMock[method].mockRejectedValueOnce(new Error('database unavailable'));
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(socketHandlers[event]({ userId: 'target' })).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it('handles join with cleanup and success path', async () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    expect(roomServiceMock.init).toHaveBeenCalledWith(
      expect.objectContaining({ emitToRoom: expect.any(Function) }),
    );
    const broadcaster: RoomBroadcaster = roomServiceMock.init.mock.calls[0][0];
    broadcaster.emitToRoom('room-1', GameEvents.RESET);
    expect(io.to).toHaveBeenCalledWith('room-1');

    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);

    roomServiceMock.joinRoom.mockResolvedValue({
      user: { id: 'user-1' },
      room: { id: 'room-1' },
    });

    socket.data = {
      userId: 'user-old',
      roomId: 'room-old',
      visitorId: 'visitor-1',
      clientIp: '127.0.0.1',
    };
    sanitizeMock.mockImplementationOnce(() => '').mockImplementationOnce(() => 'room-1');
    // visitorId no longer goes in the payload — it lives in handshake.auth
    await socketHandlers[SocketEvents.JOIN_ROOM]({
      roomId: 'room-1',
      userName: 'Alice',
    });

    await socketHandlers[SocketEvents.JOIN_ROOM]({
      roomId: 'room-1',
      userName: 'Alice',
    });

    expect(socket.leave).toHaveBeenCalledWith('room-old');
    expect(roomServiceMock.cleanupUser).toHaveBeenCalledWith(
      'user-old',
      'room-old',
      'socket-1',
      true,
    );
    expect(socket.join).toHaveBeenCalledWith('room-1');
    expect(roomServiceMock.broadcastUserUpdate).toHaveBeenCalledWith('room-1');
    expect(socket.emit).toHaveBeenCalledWith(GameEvents.JOINED, {
      user: expect.objectContaining({ id: 'user-1' }),
      room: { id: 'room-1' },
      connectionNonce: expect.any(String),
    });
    expect(socket.emit).toHaveBeenCalledWith(GameEvents.HEALTH_STATUS, {
      api: 'healthy',
      db: 'healthy',
      timestamp: 'now',
    });
  });

  it('rejects JOIN_ROOM when no visitorId in handshake', async () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);

    // Socket with NO visitorId in handshake auth
    const { socket, handlers: socketHandlers } = createSocket();
    socket.handshake.auth = {}; // no visitorId
    socket.data.visitorId = null;
    handlers.connection(socket);

    sanitizeMock.mockImplementation((val: unknown) => (typeof val === 'string' ? val : ''));
    await socketHandlers[SocketEvents.JOIN_ROOM]({
      roomId: 'room-1',
      userName: 'Alice',
    });

    expect(roomServiceMock.joinRoom).not.toHaveBeenCalled();
  });

  it('accepts the next protected sequence and rejects an exact replay', () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const { socket, getPacketMiddleware } = createSocket();
    handlers.connection(socket);
    socket.data.userId = 'user-1';
    socket.data.roomId = 'room-1';
    const middleware = getPacketMiddleware();
    expect(middleware).not.toBeNull();

    const packet: [string, unknown] = [
      SocketEvents.VOTE,
      {
        vote: '5',
        _meta: {
          connectionNonce: socket.data.connectionNonce,
          clientSeq: 1,
        },
      },
    ];
    const accepted = jest.fn();
    middleware!(packet, accepted);

    expect(accepted).toHaveBeenCalledWith();
    expect(socket.data.lastClientSeq).toBe(1);

    const replayed = jest.fn();
    middleware!(packet, replayed);
    expect(replayed).toHaveBeenCalledWith(expect.any(Error));
    expect(socket.data.lastClientSeq).toBe(1);
  });

  it('rejects protected messages from another connection or out of order', () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const { socket, getPacketMiddleware } = createSocket();
    handlers.connection(socket);
    socket.data.userId = 'user-1';
    socket.data.roomId = 'room-1';
    const middleware = getPacketMiddleware();

    const staleConnection = jest.fn();
    middleware!(
      [
        SocketEvents.RESET,
        {
          _meta: {
            connectionNonce: 'old-connection',
            clientSeq: 1,
          },
        },
      ],
      staleConnection,
    );
    expect(staleConnection).toHaveBeenCalledWith(expect.any(Error));

    const skippedSequence = jest.fn();
    middleware!(
      [
        SocketEvents.RESET,
        {
          _meta: {
            connectionNonce: socket.data.connectionNonce,
            clientSeq: 2,
          },
        },
      ],
      skippedSequence,
    );
    expect(skippedSequence).toHaveBeenCalledWith(expect.any(Error));
    expect(socket.data.lastClientSeq).toBe(0);
  });

  it('does not require replay metadata for join and health events', () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const { socket, getPacketMiddleware } = createSocket();
    handlers.connection(socket);
    const middleware = getPacketMiddleware();

    for (const event of [SocketEvents.JOIN_ROOM, SocketEvents.CHECK_HEALTH]) {
      const next = jest.fn();
      middleware!([event, {}], next);
      expect(next).toHaveBeenCalledWith();
    }
  });

  it('keeps independent sequence state for multiple live sockets', () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const first = createSocket();
    const second = createSocket();
    handlers.connection(first.socket);
    handlers.connection(second.socket);

    for (const current of [first, second]) {
      current.socket.data.userId = 'user-1';
      current.socket.data.roomId = 'room-1';
      const next = jest.fn();
      current.getPacketMiddleware()!(
        [
          SocketEvents.VOTE,
          {
            _meta: {
              connectionNonce: current.socket.data.connectionNonce,
              clientSeq: 1,
            },
          },
        ],
        next,
      );
      expect(next).toHaveBeenCalledWith();
      expect(current.socket.data.lastClientSeq).toBe(1);
    }

    expect(first.socket.data.connectionNonce).not.toBe(second.socket.data.connectionNonce);
  });

  it('uses visitor-room bursts plus a generous shared-network ceiling', async () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);

    await socketHandlers[SocketEvents.JOIN_ROOM]({
      roomId: 'room-1',
      userName: 'Alice',
    });

    expect(joinNetworkConsume).toHaveBeenCalledTimes(1);
    expect(joinNetworkConsume).toHaveBeenCalledWith('127.0.0.1');
    expect(JOIN_NETWORK_BUDGET).toMatchObject({ windowMs: 60_000, limit: 120 });
    expect(joinConsume).toHaveBeenCalledTimes(1);
    expect(joinConsume).toHaveBeenCalledWith('visitor-1:room-1');
    expect(JOIN_BUDGET).toMatchObject({ windowMs: 10_000, limit: 10 });
    expect(joinNetworkConsume.mock.invocationCallOrder[0]).toBeLessThan(
      joinConsume.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('refuses joins over the network or visitor-room budget before joining', async () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);

    joinNetworkConsume.mockReturnValueOnce(false);
    await socketHandlers[SocketEvents.JOIN_ROOM]({
      roomId: 'room-1',
      userName: 'Alice',
    });
    expect(joinConsume).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenLastCalledWith(
      GameEvents.ERROR,
      'Too many join attempts from this network. Please wait a moment and try again.',
    );

    joinConsume.mockReturnValueOnce(false);
    await socketHandlers[SocketEvents.JOIN_ROOM]({
      roomId: 'room-1',
      userName: 'Alice',
    });
    expect(socket.emit).toHaveBeenLastCalledWith(
      GameEvents.ERROR,
      'Too many join attempts. Please slow down and try again.',
    );
    expect(recordRateLimitHitMock).toHaveBeenCalledTimes(2);
    expect(roomServiceMock.joinRoom).not.toHaveBeenCalled();
  });

  it('tells the room service whether the visitor entered the site password', async () => {
    setSiteConfig({ access: { passwordProtects: 'room-creation' } });
    process.env.SITE_PASSWORD = 'correct horse battery';
    try {
      const { io, handlers } = createIo();
      setupTestSocket(io);
      const { socket, handlers: socketHandlers } = createSocket();
      handlers.connection(socket);
      const join = {
        roomId: 'room-1',
        userName: 'Alice',
        createRoomIntent: true,
      };
      await socketHandlers[SocketEvents.JOIN_ROOM](join);
      expect(roomServiceMock.joinRoom).toHaveBeenLastCalledWith(
        'room-1',
        'Alice',
        'visitor-1',
        true,
        undefined,
        '127.0.0.1',
        false,
      );
      Object.assign(socket, {
        request: {
          headers: {
            cookie: `${SITE_ACCESS_COOKIE_NAME}=${encodeSiteAccessCookie('visitor-1')}`,
          },
        },
      });
      await socketHandlers[SocketEvents.JOIN_ROOM]({
        ...join,
        roomId: 'room-2',
      });
      expect(roomServiceMock.joinRoom).toHaveBeenLastCalledWith(
        'room-2',
        'Alice',
        'visitor-1',
        true,
        undefined,
        '127.0.0.1',
        true,
      );
    } finally {
      setSiteConfig();
      delete process.env.SITE_PASSWORD;
    }
  });

  it('refuses namespace connections without the password when it protects everything', () => {
    setSiteConfig({ access: { passwordProtects: 'everything' } });
    process.env.SITE_PASSWORD = 'correct horse battery';
    try {
      const { io } = createIo();
      setupTestSocket(io);
      const middleware = io.use.mock.calls[0]?.[0] as (
        socket: unknown,
        next: (error?: Error) => void,
      ) => void;
      const visitor = randomUUID();
      const connect = (cookie: string) => {
        const socket = {
          handshake: { address: '127.0.0.1', headers: {} },
          request: { headers: { cookie } },
          data: {} as Record<string, unknown>,
        };
        const next = jest.fn();
        middleware(socket, next);
        return { socket, next };
      };
      const locked = connect(`${VISITOR_COOKIE_NAME}=${visitor}`);
      expect(locked.next).toHaveBeenCalledWith(new Error('The site password is required.'));
      expect(locked.socket.data.visitorId).toBeUndefined();
      const unlocked = connect(
        `${VISITOR_COOKIE_NAME}=${visitor}; ${SITE_ACCESS_COOKIE_NAME}=${encodeSiteAccessCookie(visitor)}`,
      );
      expect(unlocked.next).toHaveBeenCalledWith();
      expect(unlocked.socket.data.visitorId).toBe(visitor);
    } finally {
      setSiteConfig();
      delete process.env.SITE_PASSWORD;
    }
  });

  it('passes the site agreement and client address to the room service', async () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);

    await socketHandlers[SocketEvents.JOIN_ROOM]({
      roomId: 'room-1',
      userName: 'Alice',
      siteAgreement: { version: FEEDBACK_AGREEMENT_VERSION, accepted: true },
    });

    expect(roomServiceMock.joinRoom).toHaveBeenCalledWith(
      'room-1',
      'Alice',
      'visitor-1',
      false,
      { version: FEEDBACK_AGREEMENT_VERSION, accepted: true },
      '127.0.0.1',
      true,
    );
  });

  it('sends remaining countdown to client that joins during active revelation', async () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);

    roomServiceMock.joinRoom.mockResolvedValue({
      user: { id: 'user-1' },
      room: { id: 'room-1' },
    });
    // Simulate an active countdown with 1.5 seconds remaining
    roomServiceMock.getRevelationRemainingSeconds.mockReturnValueOnce(1.5);

    sanitizeMock.mockImplementation((val: unknown) => (typeof val === 'string' ? val : ''));
    await socketHandlers[SocketEvents.JOIN_ROOM]({
      roomId: 'room-1',
      userName: 'Alice',
    });

    expect(socket.emit).toHaveBeenCalledWith(GameEvents.REVELATION_STARTED, {
      seconds: 1.5,
    });
  });

  it('does not send REVELATION_STARTED when no countdown is active on join', async () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);

    roomServiceMock.joinRoom.mockResolvedValue({
      user: { id: 'user-1' },
      room: { id: 'room-1' },
    });
    roomServiceMock.getRevelationRemainingSeconds.mockReturnValueOnce(null);

    sanitizeMock.mockImplementation((val: unknown) => (typeof val === 'string' ? val : ''));
    await socketHandlers[SocketEvents.JOIN_ROOM]({
      roomId: 'room-1',
      userName: 'Alice',
    });

    const calls = (socket.emit as jest.Mock).mock.calls.map((call: unknown[]) => call[0]);
    expect(calls).not.toContain(GameEvents.REVELATION_STARTED);
  });

  it('handles join errors and missing room ids', async () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);

    // Fails Zod validation (empty roomId)
    await socketHandlers[SocketEvents.JOIN_ROOM]({
      roomId: '',
      userName: 'Alice',
    });
    expect(roomServiceMock.joinRoom).not.toHaveBeenCalled();

    (socket.emit as jest.Mock).mockClear();
    roomServiceMock.joinRoom.mockRejectedValue(new Error('nope'));
    sanitizeMock.mockImplementation((val: unknown) => (typeof val === 'string' ? val : ''));
    await socketHandlers[SocketEvents.JOIN_ROOM]({
      roomId: 'room-valid',
      userName: 'Alice',
    });

    // Unexpected failures must not reveal internal error details.
    expect(socket.emit).toHaveBeenCalledWith(
      GameEvents.ERROR,
      'Could not join the room. Please try again.',
    );
    expect(socket.emit).not.toHaveBeenCalledWith(GameEvents.ERROR, 'nope');
    expect(socket.join).not.toHaveBeenCalledWith('room-valid');
    expect(socket.data.roomId).toBeNull();
    expect(socket.data.userId).toBeNull();

    roomServiceMock.joinRoom.mockRejectedValueOnce('bad');
    await socketHandlers[SocketEvents.JOIN_ROOM]({
      roomId: 'room-1',
      userName: 'Alice',
    });
    expect(socket.emit).toHaveBeenCalledWith(
      GameEvents.ERROR,
      'Could not join the room. Please try again.',
    );

    roomServiceMock.joinRoom.mockRejectedValueOnce(
      new JoinRejectedError('Room is full (Max 25 players)'),
    );
    await socketHandlers[SocketEvents.JOIN_ROOM]({
      roomId: 'room-1',
      userName: 'Alice',
    });
    expect(socket.emit).toHaveBeenCalledWith(GameEvents.ERROR, 'Room is full (Max 25 players)');
  });

  it('keeps pending joiners out of the room broadcast channel', async () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);
    const pending = {
      id: 'pending-1',
      roomId: 'room-1',
      visitorId: 'visitor-1',
      isApproved: false,
      createdAt: new Date(),
    };
    roomServiceMock.joinRoom.mockResolvedValue({
      user: pending,
      room: { id: 'room-1' },
    });
    userRepositoryMock.findById.mockResolvedValue(pending);

    await socketHandlers[SocketEvents.JOIN_ROOM]({
      roomId: 'room-1',
      userName: 'Alice',
    });

    expect(socket.join).toHaveBeenCalledWith('lobby:room-1');
    expect(socket.join).not.toHaveBeenCalledWith('room-1');
    expect(socket.data.userId).toBe('pending-1');

    await socketHandlers[SocketEvents.LEAVE_ROOM]();
    expect(socket.leave).toHaveBeenCalledWith('room-1');
    expect(socket.leave).toHaveBeenCalledWith('lobby:room-1');
  });

  it('does not commit a join whose user was removed before the commit', async () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);
    roomServiceMock.joinRoom.mockResolvedValue({
      user: { id: 'user-1', isApproved: true },
      room: { id: 'room-1' },
    });
    // A denial, cleanup or administrative deletion won the room lock first.
    userRepositoryMock.findById.mockResolvedValue(null);

    await socketHandlers[SocketEvents.JOIN_ROOM]({
      roomId: 'room-1',
      userName: 'Alice',
    });

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.data.roomId).toBeNull();
    expect(socket.emit).not.toHaveBeenCalledWith(GameEvents.JOINED, expect.anything());
    expect(roomServiceMock.cleanupUser).toHaveBeenCalledWith('user-1', 'room-1', 'socket-1', true);
  });

  it('handles room leave and vote flow', async () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);

    socket.data = { userId: null, roomId: null };
    await socketHandlers[SocketEvents.VOTE]({ vote: '5' });

    socket.data = { userId: 'user-1', roomId: 'room-1' };
    await socketHandlers[SocketEvents.VOTE]({ vote: '5' });
    expect(userServiceMock.setVote).toHaveBeenCalledWith('user-1', '5');
    expect(roomServiceMock.broadcastUserUpdate).toHaveBeenCalledWith('room-1');
    expect(roomServiceMock.checkAutoReveal).toHaveBeenCalledWith('room-1');

    userServiceMock.setVote.mockRejectedValue(new Error('fail'));
    await socketHandlers[SocketEvents.VOTE]({ vote: '' });

    await socketHandlers[SocketEvents.LEAVE_ROOM]();
    expect(socket.leave).toHaveBeenCalledWith('room-1');
    expect(roomServiceMock.cleanupUser).toHaveBeenCalledWith('user-1', 'room-1', 'socket-1', true);
  });

  it('handles reveal/reset and room updates', async () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);

    socket.data = { userId: 'user-1', roomId: 'room-1' };
    await socketHandlers[SocketEvents.REVEAL]();
    expect(roomServiceMock.startRevelation).toHaveBeenCalledWith('room-1');

    roomServiceMock.resetRoom.mockRejectedValue(new Error('boom'));
    await socketHandlers[SocketEvents.RESET]();
    roomServiceMock.updateRoom.mockRejectedValue(new Error('boom'));
    await socketHandlers[SocketEvents.UPDATE_ROOM_NAME]({ name: 'New' });
    checkRateLimitMock.mockReturnValueOnce(false);
    await socketHandlers[SocketEvents.UPDATE_ROOM_NAME]({ name: 'Skip' });
    await socketHandlers[SocketEvents.UPDATE_MULTIPLIER]({
      useMultiplier: true,
      multiplierValue: '2.5',
    });
    await socketHandlers[SocketEvents.UPDATE_MULTIPLIER]({
      useMultiplier: false,
      multiplierValue: '0',
    });
    roomServiceMock.toggleAutoReveal.mockRejectedValue(new Error('boom'));
    await socketHandlers[SocketEvents.TOGGLE_AUTO_REVEAL]({
      autoReveal: false,
    });
  });

  it('handles theme and user updates', async () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);

    socket.data = { userId: null, roomId: null };
    await socketHandlers[SocketEvents.UPDATE_THEME]({ theme: '' });

    socket.data = { userId: 'user-1', roomId: 'room-1' };
    sanitizeMock.mockReturnValue('space');
    await socketHandlers[SocketEvents.UPDATE_THEME]({ theme: 'space' });
    expect(roomServiceMock.updateRoom).toHaveBeenCalledWith('room-1', {
      theme: 'space',
    });

    socket.data = {
      userId: 'user-1',
      roomId: 'room-1',
      visitorId: 'visitor-1',
    };
    await socketHandlers[SocketEvents.UPDATE_USER]({ name: '  ' });
    sanitizeMock.mockReturnValue('');
    await socketHandlers[SocketEvents.UPDATE_USER]({ name: 'Bob' });
    userServiceMock.updateName.mockResolvedValue({ id: 'user-1', name: 'Bob' });
    sanitizeMock.mockReturnValue('Bob');
    await socketHandlers[SocketEvents.UPDATE_USER]({ name: 'Bob' });
    expect(socket.emit).toHaveBeenCalledWith(GameEvents.USER_UPDATED, {
      id: 'user-1',
      name: 'Bob',
    });

    roomServiceMock.updateRoom.mockRejectedValue(new Error('boom'));
    await socketHandlers[SocketEvents.UPDATE_THEME]({ theme: 'space' });
    userServiceMock.updateName.mockRejectedValue(new Error('boom'));
    await socketHandlers[SocketEvents.UPDATE_USER]({ name: 'Bob' });
  });

  it('refuses a rename to a name another room member uses', async () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);
    socket.data = {
      userId: 'user-1',
      roomId: 'room-1',
      visitorId: 'visitor-1',
    };
    userRepositoryMock.isNameTaken.mockResolvedValue(true);

    await socketHandlers[SocketEvents.UPDATE_USER]({ name: 'Matt' });

    expect(userRepositoryMock.isNameTaken).toHaveBeenCalledWith('room-1', 'Matt', 'visitor-1');
    expect(userServiceMock.updateName).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(GameEvents.ERROR, NAME_TAKEN_MESSAGE);
  });

  it('nudges only players the room is still waiting on, getting louder each time', async () => {
    const { io, handlers, emitMock } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);
    socket.data = { userId: 'user-1', roomId: 'room-1' };
    const members: Record<string, Record<string, unknown>> = {
      'user-1': { id: 'user-1', isApproved: true },
      waiting: { id: 'waiting' },
      voted: { id: 'voted', vote: '5' },
      watching: { id: 'watching', isObserver: true },
      pending: { id: 'pending', isApproved: false },
    };
    const member = (id: string) => ({
      roomId: 'room-1',
      isApproved: true,
      isObserver: false,
      vote: null,
      ...members[id],
    });
    userRepositoryMock.findById.mockImplementation((id: string) =>
      Promise.resolve(members[id] ? member(id) : null),
    );
    roomRepositoryMock.findById.mockResolvedValue({
      id: 'room-1',
      reveal: false,
      roundNumber: 7,
    });

    for (const targetUserId of ['user-1', 'voted', 'watching', 'pending', 'nobody'])
      await socketHandlers[SocketEvents.NUDGE]({ targetUserId });
    await socketHandlers[SocketEvents.NUDGE]({ targetUserId: '' });
    expect(emitMock).not.toHaveBeenCalledWith(GameEvents.NUDGED, expect.anything());

    for (const level of [1, 2, 3, 3]) {
      emitMock.mockClear();
      await socketHandlers[SocketEvents.NUDGE]({ targetUserId: 'waiting' });
      expect(emitMock).toHaveBeenCalledWith(GameEvents.NUDGED, {
        targetUserId: 'waiting',
        sourceUserId: 'user-1',
        level,
      });
    }

    emitMock.mockClear();
    roomRepositoryMock.findById.mockResolvedValue({
      id: 'room-1',
      reveal: false,
      roundNumber: 8,
    });
    userRepositoryMock.findByRoomId.mockResolvedValue(Object.keys(members).map(member));
    await socketHandlers[SocketEvents.NUDGE_STRAGGLERS]({});
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(GameEvents.NUDGED, {
      targetUserId: 'waiting',
      sourceUserId: 'user-1',
      level: 1,
    });

    emitMock.mockClear();
    roomRepositoryMock.findById.mockResolvedValue({
      id: 'room-1',
      reveal: true,
      roundNumber: 8,
    });
    await socketHandlers[SocketEvents.NUDGE]({ targetUserId: 'waiting' });
    await socketHandlers[SocketEvents.NUDGE_STRAGGLERS]({});
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('holds back a nudge while its target is cooling down', async () => {
    const { io, handlers, emitMock } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);
    socket.data = { userId: 'user-1', roomId: 'room-1' };
    userRepositoryMock.findById.mockImplementation((id: string) =>
      Promise.resolve({
        id,
        roomId: 'room-1',
        visitorId: 'visitor-1',
        isApproved: true,
        isObserver: false,
        vote: null,
      }),
    );
    checkRateLimitMock.mockImplementation((key: string) => !key.endsWith(':nudged'));
    await socketHandlers[SocketEvents.NUDGE]({ targetUserId: 'cooling' });
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('handles observer toggle and projectile events', async () => {
    const { io, handlers, emitMock } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);

    socket.data = { userId: 'user-1', roomId: 'room-1' };
    userServiceMock.toggleObserver.mockResolvedValue({ id: 'user-1' });
    await socketHandlers[SocketEvents.TOGGLE_OBSERVER]({ isObserver: true });
    expect(roomServiceMock.checkAutoReveal).toHaveBeenCalledWith('room-1');
    userServiceMock.toggleObserver.mockRejectedValue(new Error('boom'));
    await socketHandlers[SocketEvents.TOGGLE_OBSERVER]({ isObserver: false });

    checkRateLimitMock.mockReturnValueOnce(true).mockReturnValueOnce(false);
    sanitizeMock.mockReturnValue('ok');

    checkRateLimitMock.mockReset();
    checkRateLimitMock.mockReturnValue(true);
    emitMock.mockClear();
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.6);
    sanitizeMock.mockReturnValue('🍅');
    await socketHandlers[SocketEvents.THROW_PROJECTILE]({
      targetUserId: 'user-2',
      emoji: '',
    });
    expect(emitMock).toHaveBeenCalledWith(
      GameEvents.PROJECTILE_THROWN,
      expect.objectContaining({
        targetUserId: 'user-2',
        emoji: '🍅',
        side: 'left',
      }),
    );
    randomSpy.mockRestore();

    checkRateLimitMock.mockReturnValue(true);
    const randomSpyRight = jest.spyOn(Math, 'random').mockReturnValue(0.4);
    await socketHandlers[SocketEvents.THROW_PROJECTILE]({
      targetUserId: 'user-3',
      emoji: '',
    });
    expect(emitMock).toHaveBeenCalledWith(
      GameEvents.PROJECTILE_THROWN,
      expect.objectContaining({ targetUserId: 'user-3', side: 'right' }),
    );
    randomSpyRight.mockRestore();
  });

  it.each([
    [SocketEvents.THROW_PROJECTILE, GameEvents.PROJECTILE_THROWN],
    [SocketEvents.BARRAGE_PROJECTILE, GameEvents.PROJECTILE_BARRAGE],
  ])(
    'refuses rough throwables for %s only while the room is Friendly',
    async (event, broadcast) => {
      const { io, handlers, emitMock } = createIo();
      setupTestSocket(io);
      const { socket, handlers: socketHandlers } = createSocket();
      handlers.connection(socket);
      socket.data = { userId: 'user-1', roomId: 'room-1' };
      userRepositoryMock.findById.mockImplementation((id: string) =>
        Promise.resolve({ id, roomId: 'room-1', isApproved: true }),
      );
      for (const [mood, emoji, allowed] of [
        ['friendly', '💩', false],
        ['friendly', '🍅', true],
        ['playful', '💩', true],
      ] as const) {
        roomRepositoryMock.findById.mockResolvedValue({
          id: 'room-1',
          reveal: false,
          mood,
        });
        emitMock.mockClear();
        await socketHandlers[event]({ targetUserId: 'user-2', emoji });
        if (allowed)
          expect(emitMock).toHaveBeenCalledWith(broadcast, expect.objectContaining({ emoji }));
        else expect(emitMock).not.toHaveBeenCalled();
      }
    },
  );
  it.each([
    [SocketEvents.THROW_PROJECTILE, GameEvents.PROJECTILE_THROWN],
    [SocketEvents.BARRAGE_PROJECTILE, GameEvents.PROJECTILE_BARRAGE],
  ])("applies the operator's throwable settings to %s", async (event, broadcast) => {
    const { io, handlers, emitMock } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);
    socket.data = { userId: 'user-1', roomId: 'room-1' };
    userRepositoryMock.findById.mockImplementation((id: string) =>
      Promise.resolve({ id, roomId: 'room-1', isApproved: true }),
    );
    roomRepositoryMock.findById.mockResolvedValue({
      id: 'room-1',
      reveal: false,
      mood: 'spicy',
    });
    try {
      setSiteConfig({ content: { blockedThrowables: ['🍅'] } });
      for (const [emoji, allowed] of [
        ['🍅', false],
        ['🍕', true],
      ] as const) {
        sanitizeMock.mockReturnValue(emoji);
        emitMock.mockClear();
        await socketHandlers[event]({ targetUserId: 'user-2', emoji });
        if (allowed)
          expect(emitMock).toHaveBeenCalledWith(broadcast, expect.objectContaining({ emoji }));
        else expect(emitMock).not.toHaveBeenCalled();
      }

      setSiteConfig({ content: { throwables: false } });
      emitMock.mockClear();
      userRepositoryMock.findById.mockClear();
      await socketHandlers[event]({ targetUserId: 'user-2', emoji: '🍕' });
      expect(emitMock).not.toHaveBeenCalled();
      // Refused before any authorization or rate limit work.
      expect(userRepositoryMock.findById).not.toHaveBeenCalled();
    } finally {
      setSiteConfig();
    }
  });
  it.each([
    [SocketEvents.THROW_PROJECTILE, GameEvents.PROJECTILE_THROWN],
    [SocketEvents.BARRAGE_PROJECTILE, GameEvents.PROJECTILE_BARRAGE],
  ])(
    'enforces the October window for %s even with a stale client selection',
    async (event, broadcast) => {
      jest.useFakeTimers();
      const previousEnv = process.env.APP_ENV;
      process.env.APP_ENV = 'test';
      try {
        const { io, handlers, emitMock } = createIo();
        setupTestSocket(io);
        const { socket, handlers: socketHandlers } = createSocket();
        handlers.connection(socket);
        socket.data = { userId: 'user-1', roomId: 'room-1' };
        userRepositoryMock.findById.mockImplementation((id: string) =>
          Promise.resolve({ id, roomId: 'room-1', isApproved: true }),
        );
        roomRepositoryMock.findById.mockResolvedValue({
          id: 'room-1',
          reveal: false,
        });
        for (const date of [
          '2026-09-30T23:59:59Z',
          '2026-10-01T00:00:00Z',
          '2026-11-01T00:00:00Z',
        ]) {
          jest.setSystemTime(new Date(date));
          emitMock.mockClear();
          await socketHandlers[event]({ targetUserId: 'user-2', emoji: '🎃' });
          if (date.startsWith('2026-10'))
            expect(emitMock).toHaveBeenCalledWith(
              broadcast,
              expect.objectContaining({ emoji: '🎃' }),
            );
          else expect(emitMock).not.toHaveBeenCalled();
        }
      } finally {
        if (previousEnv === undefined) delete process.env.APP_ENV;
        else process.env.APP_ENV = previousEnv;
        jest.useRealTimers();
      }
    },
  );
  it.each([
    [SocketEvents.THROW_PROJECTILE, GameEvents.PROJECTILE_THROWN],
    [SocketEvents.BARRAGE_PROJECTILE, GameEvents.PROJECTILE_BARRAGE],
  ])(
    'enforces the November window for %s even with a stale client selection',
    async (event, broadcast) => {
      jest.useFakeTimers();
      const previousEnv = process.env.APP_ENV;
      process.env.APP_ENV = 'test';
      try {
        const { io, handlers, emitMock } = createIo();
        setupTestSocket(io);
        const { socket, handlers: socketHandlers } = createSocket();
        handlers.connection(socket);
        socket.data = { userId: 'user-1', roomId: 'room-1' };
        userRepositoryMock.findById.mockImplementation((id: string) =>
          Promise.resolve({ id, roomId: 'room-1', isApproved: true }),
        );
        roomRepositoryMock.findById.mockResolvedValue({
          id: 'room-1',
          reveal: false,
        });
        for (const date of [
          '2026-10-31T23:59:59Z',
          '2026-11-01T00:00:00Z',
          '2026-12-01T00:00:00Z',
        ]) {
          jest.setSystemTime(new Date(date));
          emitMock.mockClear();
          await socketHandlers[event]({ targetUserId: 'user-2', emoji: '🦃' });
          if (date.startsWith('2026-11'))
            expect(emitMock).toHaveBeenCalledWith(
              broadcast,
              expect.objectContaining({ emoji: '🦃' }),
            );
          else expect(emitMock).not.toHaveBeenCalled();
        }
      } finally {
        if (previousEnv === undefined) delete process.env.APP_ENV;
        else process.env.APP_ENV = previousEnv;
        jest.useRealTimers();
      }
    },
  );

  it.each([
    [SocketEvents.THROW_PROJECTILE, GameEvents.PROJECTILE_THROWN],
    [SocketEvents.BARRAGE_PROJECTILE, GameEvents.PROJECTILE_BARRAGE],
  ])(
    'enforces the December window for %s even with a stale client selection',
    async (event, broadcast) => {
      jest.useFakeTimers();
      const previousEnv = process.env.APP_ENV;
      process.env.APP_ENV = 'test';
      try {
        const { io, handlers, emitMock } = createIo();
        setupTestSocket(io);
        const { socket, handlers: socketHandlers } = createSocket();
        handlers.connection(socket);
        socket.data = { userId: 'user-1', roomId: 'room-1' };
        userRepositoryMock.findById.mockImplementation((id: string) =>
          Promise.resolve({ id, roomId: 'room-1', isApproved: true }),
        );
        roomRepositoryMock.findById.mockResolvedValue({
          id: 'room-1',
          reveal: false,
        });
        for (const date of [
          '2026-11-30T23:59:59Z',
          '2026-12-01T00:00:00Z',
          '2026-12-31T23:59:59.999Z',
          '2027-01-01T00:00:00Z',
        ]) {
          jest.setSystemTime(new Date(date));
          emitMock.mockClear();
          await socketHandlers[event]({ targetUserId: 'user-2', emoji: '🎅' });
          if (date.startsWith('2026-12'))
            expect(emitMock).toHaveBeenCalledWith(
              broadcast,
              expect.objectContaining({ emoji: '🎅' }),
            );
          else expect(emitMock).not.toHaveBeenCalled();
        }
      } finally {
        if (previousEnv === undefined) delete process.env.APP_ENV;
        else process.env.APP_ENV = previousEnv;
        jest.useRealTimers();
      }
    },
  );

  it.each([
    [SocketEvents.THROW_PROJECTILE, GameEvents.PROJECTILE_THROWN],
    [SocketEvents.BARRAGE_PROJECTILE, GameEvents.PROJECTILE_BARRAGE],
  ])('silently ignores self-targeted %s requests', async (event, broadcast) => {
    const { io, handlers, emitMock } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);

    socket.data = { userId: 'user-1', roomId: 'room-1' };
    userRepositoryMock.findById.mockImplementation((userId: string) =>
      Promise.resolve({ id: userId, roomId: 'room-1', isApproved: true }),
    );
    roomRepositoryMock.findById.mockResolvedValue({
      id: 'room-1',
      reveal: false,
    });

    await socketHandlers[event]({ targetUserId: 'user-1', emoji: '🍅' });

    expect(emitMock).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();

    await socketHandlers[event]({ targetUserId: 'user-2', emoji: '🍅' });

    expect(emitMock).toHaveBeenCalledWith(
      broadcast,
      expect.objectContaining({
        sourceUserId: 'user-1',
        targetUserId: 'user-2',
        emoji: '🍅',
      }),
    );
  });

  it.each([
    [SocketEvents.THROW_PROJECTILE, 100],
    [SocketEvents.BARRAGE_PROJECTILE, 2000],
  ] as const)('drops excess %s requests until its cooldown expires', async (event, cooldown) => {
    const { checkRateLimit, ACTION_COOLDOWNS } = jest.requireActual<
      typeof import('../../../src/platform/concurrency/action-cooldowns')
    >('../../../src/platform/concurrency/action-cooldowns');
    ACTION_COOLDOWNS.clear();
    checkRateLimitMock.mockImplementation(checkRateLimit);
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(10000);

    try {
      const { io, handlers, emitMock } = createIo();
      setupSocket(io as unknown as Parameters<typeof setupSocket>[0]);
      const { socket, handlers: socketHandlers } = createSocket();
      handlers.connection(socket);
      socket.data = { userId: 'user-1', roomId: 'room-1' };
      userRepositoryMock.findById.mockImplementation((userId: string) =>
        Promise.resolve({ id: userId, roomId: 'room-1', isApproved: true }),
      );
      roomRepositoryMock.findById.mockResolvedValue({
        id: 'room-1',
        reveal: false,
      });
      const payload = { targetUserId: 'user-2', emoji: '🍅' };

      await socketHandlers[event](payload);
      expect(emitMock).toHaveBeenCalledTimes(1);

      nowSpy.mockReturnValue(10000 + cooldown - 1);
      await socketHandlers[event](payload);
      expect(emitMock).toHaveBeenCalledTimes(1);
      expect(socket.emit).not.toHaveBeenCalled();

      // A dropped request must not restart the cooldown.
      nowSpy.mockReturnValue(10000 + cooldown);
      await socketHandlers[event](payload);
      expect(emitMock).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
      ACTION_COOLDOWNS.clear();
      checkRateLimitMock.mockReset().mockReturnValue(true);
    }
  });

  it('broadcasts overheating once, blocks both throw types, and leaves voting available', async () => {
    const { io, handlers, emitMock } = createIo();
    setupSocket(io as unknown as Parameters<typeof setupSocket>[0]);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);
    socket.data = { userId: 'user-1', roomId: 'room-1' };
    userRepositoryMock.findById.mockResolvedValue({
      id: 'user-1',
      roomId: 'room-1',
      isApproved: true,
    });
    checkRateLimitMock.mockReturnValue(false);
    const payload = { targetUserId: 'user-2', emoji: '🍅' };
    for (let i = 0; i < 20; i++) {
      await socketHandlers[i % 2 ? SocketEvents.THROW_PROJECTILE : SocketEvents.BARRAGE_PROJECTILE](
        payload,
      );
    }
    expect(roomServiceMock.broadcastUserUpdate).toHaveBeenCalledTimes(1);
    expect(roomServiceMock.broadcastUserUpdate).toHaveBeenCalledWith('room-1');
    checkRateLimitMock.mockReturnValue(true);
    for (let i = 0; i < 30; i++) {
      await socketHandlers[SocketEvents.THROW_PROJECTILE](payload);
      await socketHandlers[SocketEvents.BARRAGE_PROJECTILE](payload);
    }
    expect(emitMock).not.toHaveBeenCalled();
    expect(roomServiceMock.broadcastUserUpdate).toHaveBeenCalledTimes(1);
    await socketHandlers[SocketEvents.VOTE]({ vote: '5' });
    expect(userServiceMock.setVote).toHaveBeenCalled();
  });

  it('does not emit interactions for targets outside the room', async () => {
    const { io, handlers, emitMock } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);

    socket.data = { userId: 'user-1', roomId: 'room-1' };
    userRepositoryMock.findById.mockImplementation((userId: string) => {
      if (userId === 'user-1') {
        return Promise.resolve({
          id: 'user-1',
          roomId: 'room-1',
          isApproved: true,
        });
      }
      return Promise.resolve({
        id: userId,
        roomId: 'room-2',
        isApproved: true,
      });
    });

    await socketHandlers[SocketEvents.NUDGE]({ targetUserId: 'user-2' });
    await socketHandlers[SocketEvents.THROW_PROJECTILE]({
      targetUserId: 'user-2',
      emoji: '',
    });
    await socketHandlers[SocketEvents.BARRAGE_PROJECTILE]({
      targetUserId: 'user-2',
      emoji: '',
    });

    expect(emitMock).not.toHaveBeenCalledWith(GameEvents.NUDGED, expect.anything());
    expect(emitMock).not.toHaveBeenCalledWith(GameEvents.PROJECTILE_THROWN, expect.anything());
    expect(emitMock).not.toHaveBeenCalledWith(GameEvents.PROJECTILE_BARRAGE, expect.anything());
  });

  it('handles health checks and disconnects', async () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);

    socket.data = {
      userId: 'user-1',
      roomId: 'room-1',
      clientIp: '127.0.0.1',
    };
    await socketHandlers[SocketEvents.CHECK_HEALTH]();
    expect(healthConsume).toHaveBeenCalledWith('127.0.0.1');
    expect(HEALTH_BUDGET).toMatchObject({ windowMs: 60_000, limit: 12 });
    expect(socket.emit).toHaveBeenCalledWith(GameEvents.HEALTH_STATUS, {
      api: 'healthy',
      db: 'healthy',
      timestamp: 'now',
    });

    await socketHandlers[SocketEvents.DISCONNECT]();
    expect(roomServiceMock.cleanupUser).toHaveBeenCalledWith('user-1', 'room-1', 'socket-1');
  });

  it('rate limits health checks', async () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);

    socket.data = {
      userId: 'user-1',
      roomId: 'room-1',
      clientIp: '127.0.0.1',
    };
    healthConsume.mockReturnValueOnce(false);

    await socketHandlers[SocketEvents.CHECK_HEALTH]();

    expect(getHealthStatusMock).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      GameEvents.ERROR,
      'Too many health checks. Please try again later.',
    );
  });

  it('returns early when required data is missing', async () => {
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);

    socket.data = { userId: null, roomId: null };
    await socketHandlers[SocketEvents.REVEAL]();
    await socketHandlers[SocketEvents.RESET]();
    await socketHandlers[SocketEvents.UPDATE_ROOM_NAME]({ name: 'New' });
    await socketHandlers[SocketEvents.TOGGLE_AUTO_REVEAL]({ autoReveal: true });
    await socketHandlers[SocketEvents.UPDATE_MULTIPLIER]({
      useMultiplier: false,
      multiplierValue: '1',
    });
    await socketHandlers[SocketEvents.UPDATE_USER]({ name: 'Name' });
    await socketHandlers[SocketEvents.TOGGLE_OBSERVER]({ isObserver: false });
    await socketHandlers[SocketEvents.NUDGE]({ targetUserId: 'user-2' });
    await socketHandlers[SocketEvents.THROW_PROJECTILE]({
      targetUserId: 'user-2',
      emoji: 'x',
    });
  });

  it('skips mutating actions when rate limited', async () => {
    recordRateLimitHitMock.mockClear();
    const { io, handlers } = createIo();
    setupTestSocket(io);
    const { socket, handlers: socketHandlers } = createSocket();
    handlers.connection(socket);

    socket.data = {
      userId: 'user-1',
      roomId: 'room-1',
      visitorId: 'signed-visitor',
    };
    checkRateLimitMock
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false);

    await socketHandlers[SocketEvents.REVEAL]();
    await socketHandlers[SocketEvents.RESET]();
    await socketHandlers[SocketEvents.UPDATE_ROOM_NAME]({ name: 'Room' });
    await socketHandlers[SocketEvents.TOGGLE_AUTO_REVEAL]({ autoReveal: true });
    await socketHandlers[SocketEvents.UPDATE_MULTIPLIER]({
      useMultiplier: true,
      multiplierValue: '2',
    });
    await socketHandlers[SocketEvents.UPDATE_THEME]({ theme: 'space' });
    await socketHandlers[SocketEvents.UPDATE_USER]({ name: 'Bob' });

    expect(roomServiceMock.startRevelation).not.toHaveBeenCalled();
    expect(roomServiceMock.resetRoom).not.toHaveBeenCalled();
    expect(roomServiceMock.updateRoom).not.toHaveBeenCalled();
    expect(roomServiceMock.toggleAutoReveal).not.toHaveBeenCalled();
    expect(userServiceMock.updateName).not.toHaveBeenCalled();
    expect(recordRateLimitHitMock).toHaveBeenCalledTimes(7);
    expect(
      recordRateLimitHitMock.mock.calls.every(([identity]) => identity === 'signed-visitor'),
    ).toBe(true);
  });
});
