import { createHash, randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { PrismaClient } from '@prisma/client';
import { encodeVisitorCookie, VISITOR_COOKIE_NAME } from '../../src/platform/http/visitor-session';
import type * as SiteAccessRoutes from '../../src/modules/site/site-access.routes';
import type * as SiteAccess from '../../src/modules/site/site-access';
import type * as SiteConfig from '../../src/config/site-config';
import type * as Quotas from '../../src/platform/db/abuse-quota';
import { MigratedDatabase } from '../helpers/migrated-database';

const PASSWORD = 'correct horse battery';
const ORIGIN = 'http://localhost:4300';

describe('site password HTTP routes with SQLite budgets', () => {
  const database = new MigratedDatabase('poker-access-');
  let db: PrismaClient;
  let routes: typeof SiteAccessRoutes;
  let quotas: typeof Quotas;
  let siteConfig: typeof SiteConfig;
  let SITE_ACCESS_COOKIE_NAME: typeof SiteAccess.SITE_ACCESS_COOKIE_NAME;
  const protect = (passwordProtects: 'nothing' | 'room-creation' | 'everything') =>
    siteConfig.setSiteConfig({ access: { passwordProtects } });
  let server: HttpServer | undefined;
  let base = '';

  beforeAll(async () => {
    database.setUp();
    db = (await import('../../src/platform/db/prisma')).default;
    routes = await import('../../src/modules/site/site-access.routes');
    quotas = await import('../../src/platform/db/abuse-quota');
    siteConfig = await import('../../src/config/site-config');
    SITE_ACCESS_COOKIE_NAME = (await import('../../src/modules/site/site-access'))
      .SITE_ACCESS_COOKIE_NAME;
  }, 30_000);

  afterAll(async () => {
    delete process.env.SITE_PASSWORD;
    await db?.$disconnect();
    database.tearDown();
  });

  beforeEach(async () => {
    process.env.SITE_PASSWORD = PASSWORD;
    siteConfig.setSiteConfig();
    await db.abuseQuota.deleteMany();
    // Production order: cookies, the password gate, then routers and parsers.
    const app = express();
    app.use(cookieParser());
    app.use(routes.siteAccessGate);
    app.use(
      '/api/access',
      routes.createSiteAccessRouter((origin) => origin === ORIGIN, false),
    );
    for (const route of ['/api/init', '/api/site-config', '/api/feedback'])
      app.get(route, (_req, res) => {
        res.json({ ok: true });
      });
    server = createServer(app);
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing port');
    base = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    server?.closeAllConnections();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  const visitorCookie = (visitor: string) =>
    `${VISITOR_COOKIE_NAME}=${encodeVisitorCookie(visitor)}`;

  const unlock = (cookie: string | null, body: string, origin = ORIGIN) =>
    fetch(`${base}/api/access`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(origin ? { Origin: origin } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body,
    });

  const status = async (cookie: string) =>
    (await (await fetch(`${base}/api/access`, { headers: { Cookie: cookie } })).json()) as {
      unlocked: boolean;
    };

  it('reports every visitor unlocked when nothing is protected', async () => {
    const cookie = visitorCookie(randomUUID());
    expect(await status(cookie)).toEqual({ unlocked: true });
    const response = await unlock(cookie, JSON.stringify({ password: 'x' }));
    expect(await response.json()).toEqual({ unlocked: true });
    expect(await db.abuseQuota.count()).toBe(0);
    expect((await fetch(`${base}/api/feedback`)).status).toBe(200);
  });

  it('unlocks with the right password and gates every other API route', async () => {
    protect('everything');
    const visitor = randomUUID();
    const cookie = visitorCookie(visitor);
    for (const open of ['/api/init', '/api/site-config'])
      expect((await fetch(`${base}${open}`)).status).toBe(200);
    expect((await fetch(`${base}/api/feedback`, { headers: { Cookie: cookie } })).status).toBe(401);
    expect(await status(cookie)).toEqual({ unlocked: false });

    expect((await unlock(cookie, JSON.stringify({ password: PASSWORD }), '')).status).toBe(403);
    expect((await unlock(null, JSON.stringify({ password: PASSWORD }))).status).toBe(401);
    expect((await unlock(cookie, '{')).status).toBe(400);
    expect((await unlock(cookie, JSON.stringify({ password: '' }))).status).toBe(400);
    const wrong = await unlock(cookie, JSON.stringify({ password: 'nope' }));
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get('set-cookie')).toBeNull();

    const right = await unlock(cookie, JSON.stringify({ password: PASSWORD }));
    expect(right.status).toBe(200);
    expect(await right.json()).toEqual({ unlocked: true });
    const setCookie = right.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(new RegExp(`^${SITE_ACCESS_COOKIE_NAME}=`));
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    const access = setCookie.split(';')[0] ?? '';
    const both = `${cookie}; ${access}`;
    expect(await status(both)).toEqual({ unlocked: true });
    expect((await fetch(`${base}/api/feedback`, { headers: { Cookie: both } })).status).toBe(200);
    // Already unlocked: no further attempts are charged.
    const before = await db.abuseQuota.findMany();
    expect((await unlock(both, '{}')).status).toBe(200);
    expect(await db.abuseQuota.findMany()).toEqual(before);

    // Another browser cannot reuse the cookie, and a new password locks it.
    expect(
      (
        await fetch(`${base}/api/feedback`, {
          headers: { Cookie: `${visitorCookie(randomUUID())}; ${access}` },
        })
      ).status,
    ).toBe(401);
    process.env.SITE_PASSWORD = 'the password changed';
    expect((await fetch(`${base}/api/feedback`, { headers: { Cookie: both } })).status).toBe(401);
  });

  it('limits attempts per network in a short window', async () => {
    protect('room-creation');
    const body = JSON.stringify({ password: 'wrong guess' });
    for (let i = 0; i < routes.SITE_ACCESS_ATTEMPTS_PER_WINDOW; i++)
      expect((await unlock(visitorCookie(randomUUID()), body)).status).toBe(401);
    const limited = await unlock(
      visitorCookie(randomUUID()),
      JSON.stringify({ password: PASSWORD }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get('set-cookie')).toBeNull();
  });

  it('keeps a durable daily budget per network and site-wide', async () => {
    protect('room-creation');
    for (let i = 0; i < routes.SITE_ACCESS_ATTEMPTS_PER_NETWORK_DAY; i++)
      await quotas.claimDailyQuotas([
        {
          scope: 'site-access-network',
          identity: '127.0.0.1',
          limit: routes.SITE_ACCESS_ATTEMPTS_PER_NETWORK_DAY,
        },
      ]);
    const refused = await unlock(
      visitorCookie(randomUUID()),
      JSON.stringify({ password: PASSWORD }),
    );
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({
      message: 'Too many password attempts today. Please try again tomorrow.',
    });
    expect(refused.headers.get('set-cookie')).toBeNull();

    await db.abuseQuota.deleteMany();
    await db.abuseQuota.create({
      data: {
        key: `site-access-global:${createHash('sha256').update('all').digest('hex')}`,
        day: new Date().toISOString().slice(0, 10),
        count: routes.SITE_ACCESS_ATTEMPTS_PER_DAY,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    expect(
      (await unlock(visitorCookie(randomUUID()), JSON.stringify({ password: PASSWORD }))).status,
    ).toBe(429);
  });

  it('passes unexpected failures to the error handler', async () => {
    protect('room-creation');
    const spy = jest
      .spyOn(quotas, 'claimDailyQuotas')
      .mockRejectedValueOnce(new Error('database is gone'));
    const response = await unlock(
      visitorCookie(randomUUID()),
      JSON.stringify({ password: PASSWORD }),
    );
    expect(response.status).toBe(500);
    spy.mockRestore();
  });
});
