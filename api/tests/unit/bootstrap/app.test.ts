import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { NextFunction, Request, Response } from 'express';
import type { Options } from 'express-rate-limit';

// The app must not open the developer's database.
jest.mock('../../../src/platform/db/prisma', () => ({
  __esModule: true,
  default: {},
}));

const order: string[] = [];
const globalLimiterOptions: Partial<Options>[] = [];
jest.mock('express-rate-limit', () => {
  const actual = jest.requireActual<typeof import('express-rate-limit')>('express-rate-limit');
  return {
    ...actual,
    __esModule: true,
    default: (options: Partial<Options>) => {
      globalLimiterOptions.push(options);
      return actual.default(options);
    },
  };
});

/** Each stand-in router reports whether a JSON body was parsed before it ran. */
function probe(name: string) {
  return (req: Request, res: Response) => {
    order.push(name);
    res.json({ router: name, bodyParsed: req.body !== undefined });
  };
}
jest.mock('../../../src/modules/rooms/room-stats.routes', () => ({
  createRoomStatsRouter: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
const issuesRouterIo: unknown[] = [];
jest.mock('../../../src/modules/issues/issues.routes', () => ({
  createIssuesRouter: (io: unknown) => {
    issuesRouterIo.push(io);
    return probe('issues');
  },
}));
jest.mock('../../../src/modules/feedback/feedback.routes', () => ({
  createFeedbackRouter: () => probe('feedback'),
}));
jest.mock('../../../src/modules/site/site-access.routes', () => ({
  siteAccessGate: (_req: Request, _res: Response, next: NextFunction) => {
    order.push('gate');
    next();
  },
  createSiteAccessRouter: () => probe('access'),
}));

import { createApp } from '../../../src/app';
import { originAllowList } from '../../../src/platform/http/origin-policy';
import type { PokerServer } from '../../../src/socket/types';

const ALLOWED = 'http://localhost:4300';

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

describe('public HTTP app', () => {
  const io = { to: jest.fn() } as unknown as PokerServer;
  const app = createApp({
    io,
    isOriginAllowed: originAllowList([ALLOWED, 'http://127.0.0.1:4300']),
    secureCookies: false,
    buildTime: 'build-1',
  });
  let server: Server;
  let port: number;

  function send(
    method: string,
    path: string,
    headers: Record<string, string> = {},
    body?: string,
  ): Promise<Reply> {
    return new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (text += chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: text,
          }),
        );
      });
      req.on('error', reject);
      req.end(body);
    });
  }

  beforeAll(async () => {
    delete process.env.NODE_ENV;
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });
  beforeEach(() => {
    order.length = 0;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('passes the socket server to the issue routes and trusts no proxy hops', () => {
    expect(issuesRouterIo).toEqual([io]);
    expect(app.get('trust proxy')).toBe(0);
  });

  it('runs the password gate before routers and parses JSON only after them', async () => {
    const json = { 'Content-Type': 'application/json', Origin: ALLOWED };
    const feedback = await send('POST', '/api/feedback', json, '{"a":1}');
    expect(JSON.parse(feedback.body)).toEqual({
      router: 'feedback',
      bodyParsed: false,
    });
    expect(order).toEqual(['gate', 'feedback']);

    const access = await send('POST', '/api/access', json, '{"a":1}');
    expect(JSON.parse(access.body)).toEqual({
      router: 'access',
      bodyParsed: false,
    });

    const issues = await send('POST', '/api/rooms/room/issues', json, '{}');
    expect(JSON.parse(issues.body)).toMatchObject({ router: 'issues' });

    // The shared parser runs after the routers: malformed JSON is refused there.
    const malformed = await send('POST', '/api/version', json, '{bad');
    expect(malformed.status).toBe(400);
  });

  it('treats a malformed room path escape as no room instead of a server error', async () => {
    const reply = await send('GET', '/api/rooms/%E0%A4%A/issues', { Origin: ALLOWED });
    expect(reply.status).toBeLessThan(500);
  });

  it('answers every admin route with 404 while ADMIN_PASSWORD is unset', async () => {
    delete process.env.ADMIN_PASSWORD;
    const reply = await send('GET', '/api/admin/usage', { Origin: ALLOWED });
    expect(reply.status).toBe(404);
    expect(order).toEqual(['gate']);
  });

  it('guards the admin routes after the site gate and before every parser', async () => {
    process.env.ADMIN_PASSWORD = 'Unit-operator-key-41Hd';
    try {
      const json = { 'Content-Type': 'application/json', Origin: ALLOWED };
      // No admin cookie: refused before any admin handler or later router runs.
      expect((await send('GET', '/api/admin/usage', { Origin: ALLOWED })).status).toBe(401);
      expect((await send('POST', '/api/admin/feedback/x/replies', json, '{bad')).status).toBe(401);
      // Sign-in checks the Origin and browser ID before parsing its body.
      const noOrigin = { 'Content-Type': 'application/json' };
      expect((await send('POST', '/api/admin/session', noOrigin, '{bad')).status).toBe(403);
      expect((await send('POST', '/api/admin/session', json, '{bad')).status).toBe(401);
      expect(order).toEqual(['gate', 'gate', 'gate', 'gate']);
      const session = await send('GET', '/api/admin/session', { Origin: ALLOWED });
      expect(JSON.parse(session.body)).toEqual({ signedIn: false });
      expect(session.headers['cache-control']).toBe('no-store');
    } finally {
      delete process.env.ADMIN_PASSWORD;
    }
  });

  it('applies CORS to allowed and same-origin requests and refuses other origins', async () => {
    const allowed = await send('GET', '/api/version', { Origin: ALLOWED });
    expect(allowed.status).toBe(200);
    expect(allowed.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    // Same-origin GETs through the web proxy carry no Origin header.
    const sameOrigin = await send('GET', '/api/version', {
      'Sec-Fetch-Site': 'same-origin',
    });
    expect(sameOrigin.status).toBe(200);

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const evil = await send('GET', '/api/version', {
      Origin: 'https://evil.example',
    });
    expect(evil.status).toBe(403);
    expect(JSON.parse(evil.body)).toEqual({ message: 'Origin not allowed.' });
    const spoofed = await send('GET', '/api/version', {
      Origin: 'https://evil.example',
      'Sec-Fetch-Site': 'same-origin',
    });
    expect(spoofed.status).toBe(403);
    warn.mockRestore();
  });

  it('answers the version check on / and /api/version', async () => {
    for (const path of ['/', '/api/version']) {
      const reply = await send('GET', path);
      expect(JSON.parse(reply.body)).toEqual({
        status: 'ok',
        message: 'Poker API is running',
        version: 'build-1',
      });
    }
  });

  it('issues the visitor cookie from /api/init', async () => {
    const reply = await send('GET', '/api/init', { Origin: ALLOWED });
    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body)).toEqual({ status: 'ok' });
    expect(String(reply.headers['set-cookie'])).toContain('agiledeck_visitor_id_v2=');
  });

  it('keys the global limiter on the peer address, never on forwarding headers', () => {
    const global = globalLimiterOptions.find((options) => options.max === 1000);
    const keyGen = global?.keyGenerator as
      ((req: { headers: Record<string, unknown>; ip?: string | undefined }) => string) | undefined;
    if (!keyGen) throw new Error('Expected the global rate limiter');
    const reqBase = { headers: {}, ip: '1.2.3.4' };
    expect(keyGen({ ...reqBase, headers: { 'cf-connecting-ip': ['9.9.9.9'] } })).toBe('1.2.3.4');
    expect(keyGen({ ...reqBase, headers: { 'cf-connecting-ip': '8.8.8.8' } })).toBe('1.2.3.4');
    expect(keyGen({ ...reqBase, headers: { 'x-forwarded-for': ['7.7.7.7'] } })).toBe('1.2.3.4');
    expect(keyGen({ ...reqBase, headers: { 'x-forwarded-for': '6.6.6.6' } })).toBe('1.2.3.4');
    expect(keyGen(reqBase)).toBe('1.2.3.4');
    expect(keyGen({ headers: {}, ip: undefined })).toBe('127.0.0.1');
  });
});
