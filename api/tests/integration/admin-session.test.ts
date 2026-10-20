import { createHash, randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { PrismaClient } from '@prisma/client';
import { AdminSessionStatusSchema } from '@poker/shared';
import type * as AdminRoutes from '../../src/modules/admin/admin.routes';
import type * as SiteConfig from '../../src/config/site-config';
import type * as Quotas from '../../src/platform/db/abuse-quota';
import type * as Telemetry from '../../src/modules/telemetry/rate-limit-telemetry';
import { adminCookieFrom, ADMIN_TEST_PASSWORD, visitorCookie } from '../helpers/admin-server';
import { MigratedDatabase } from '../helpers/migrated-database';

describe('admin password sign-in with SQLite budgets', () => {
  const database = new MigratedDatabase('poker-admin-session-');
  let db: PrismaClient;
  let routes: typeof AdminRoutes;
  let quotas: typeof Quotas;
  let siteConfig: typeof SiteConfig;
  let telemetry: typeof Telemetry;
  let server: HttpServer | undefined;
  let base = '';

  beforeAll(async () => {
    database.setUp();
    db = (await import('../../src/platform/db/prisma')).default;
    routes = await import('../../src/modules/admin/admin.routes');
    quotas = await import('../../src/platform/db/abuse-quota');
    siteConfig = await import('../../src/config/site-config');
    telemetry = await import('../../src/modules/telemetry/rate-limit-telemetry');
  }, 30_000);

  afterAll(async () => {
    delete process.env.ADMIN_PASSWORD;
    delete process.env.SITE_PASSWORD;
    siteConfig.setSiteConfig();
    await db?.$disconnect();
    database.tearDown();
  });

  beforeEach(async () => {
    process.env.ADMIN_PASSWORD = ADMIN_TEST_PASSWORD;
    siteConfig.setSiteConfig();
    await db.abuseQuota.deleteMany();
    const { siteAccessGate } = await import('../../src/modules/site/site-access.routes');
    const { originAllowList, originCors } = await import('../../src/platform/http/origin-policy');
    const { handleApiError } = await import('../../src/platform/http/hardening');
    server = createServer();
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing port');
    base = `http://127.0.0.1:${address.port}`;
    const isOriginAllowed = originAllowList([base]);
    // Production order: CORS, telemetry, cookies, the site password gate, then routers.
    const app = express();
    app.use(originCors(isOriginAllowed));
    app.use(telemetry.observeHttpRateLimits);
    app.use(cookieParser());
    app.use(siteAccessGate);
    app.use('/api/admin', routes.createAdminRouter(isOriginAllowed, true));
    app.get('/api/feedback', (_req, res) => {
      res.json({ ok: true });
    });
    app.use(handleApiError);
    server.on('request', app);
  });

  afterEach(async () => {
    server?.closeAllConnections();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  const signIn = (cookie: string | null, body: string, origin: string | null = base) =>
    fetch(`${base}/api/admin/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(origin === null ? {} : { Origin: origin }),
        ...(cookie === null ? {} : { Cookie: cookie }),
      },
      body,
    });
  const password = (value: string) => JSON.stringify({ password: value });
  const status = async (cookie: string) => {
    const response = await fetch(`${base}/api/admin/session`, { headers: { Cookie: cookie } });
    return AdminSessionStatusSchema.parse(await response.json());
  };
  const usage = (cookie: string) =>
    fetch(`${base}/api/admin/usage`, { headers: { Cookie: cookie } });

  it('answers 404 everywhere while ADMIN_PASSWORD is unset', async () => {
    delete process.env.ADMIN_PASSWORD;
    const cookie = await visitorCookie();
    expect((await fetch(`${base}/api/admin/session`)).status).toBe(404);
    expect((await signIn(cookie, password(ADMIN_TEST_PASSWORD))).status).toBe(404);
    expect((await usage(cookie)).status).toBe(404);
    expect((await fetch(`${base}/api/admin`)).status).toBe(404);
    expect(await db.abuseQuota.count()).toBe(0);
  });

  it('checks the Origin, browser ID and body before charging any budget', async () => {
    const cookie = await visitorCookie();
    expect((await signIn(cookie, password(ADMIN_TEST_PASSWORD), null)).status).toBe(403);
    expect(
      (await signIn(cookie, password(ADMIN_TEST_PASSWORD), 'https://evil.example')).status,
    ).toBe(403);
    expect((await signIn(null, password(ADMIN_TEST_PASSWORD))).status).toBe(401);
    expect((await signIn(cookie, '{')).status).toBe(400);
    expect((await signIn(cookie, password(''))).status).toBe(400);
    expect(await db.abuseQuota.count()).toBe(0);
  });

  it('signs in with the right password, charging budgets before comparing', async () => {
    const cookie = await visitorCookie();
    expect(await status(cookie)).toEqual({ signedIn: false });
    expect((await usage(cookie)).status).toBe(401);

    const wrong = await signIn(cookie, password('not the admin password'));
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get('set-cookie')).toBeNull();
    expect((await db.abuseQuota.findMany()).map((row) => row.count)).toEqual([1, 1]);

    const right = await signIn(cookie, password(ADMIN_TEST_PASSWORD));
    expect(right.status).toBe(200);
    expect(await right.json()).toEqual({ signedIn: true, environment: 'development' });
    const setCookie = right.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/^agiledeck_admin_v1=/);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('Path=/api/admin');
    expect(setCookie).toMatch(/Max-Age=43200/);
    const both = `${cookie}; ${adminCookieFrom(right)}`;
    expect(await status(both)).toEqual({ signedIn: true, environment: 'development' });
    expect((await usage(both)).status).toBe(200);

    // Already signed in: no further attempts are charged.
    const before = await db.abuseQuota.findMany();
    expect((await signIn(both, '{}')).status).toBe(200);
    expect(await db.abuseQuota.findMany()).toEqual(before);
  });

  it('binds the cookie to the browser ID and the current password', async () => {
    const cookie = await visitorCookie();
    const admin = adminCookieFrom(await signIn(cookie, password(ADMIN_TEST_PASSWORD)));
    expect((await usage(`${cookie}; ${admin}`)).status).toBe(200);
    expect((await usage(`${await visitorCookie(randomUUID())}; ${admin}`)).status).toBe(401);
    expect((await usage(admin)).status).toBe(401);
    process.env.ADMIN_PASSWORD = 'Rotated-operator-key-84Xw';
    expect((await usage(`${cookie}; ${admin}`)).status).toBe(401);
    expect(await status(`${cookie}; ${admin}`)).toEqual({ signedIn: false });
  });

  it('requires the site Origin for every admin write, before parsing', async () => {
    const cookie = await visitorCookie();
    const both = `${cookie}; ${adminCookieFrom(await signIn(cookie, password(ADMIN_TEST_PASSWORD)))}`;
    const write = (headers: Record<string, string>) =>
      fetch(`${base}/api/admin/feedback/${randomUUID()}`, {
        method: 'PATCH',
        headers: { Cookie: both, 'Content-Type': 'application/json', ...headers },
        body: '[',
      });
    expect((await write({})).status).toBe(403);
    expect((await write({ Origin: 'https://evil.example' })).status).toBe(403);
    expect((await write({ Origin: base })).status).toBe(400);
  });

  it('stays reachable when the site password protects everything', async () => {
    process.env.SITE_PASSWORD = 'site password';
    siteConfig.setSiteConfig({ access: { passwordProtects: 'everything' } });
    const cookie = await visitorCookie();
    expect((await fetch(`${base}/api/feedback`, { headers: { Cookie: cookie } })).status).toBe(401);
    const both = `${cookie}; ${adminCookieFrom(await signIn(cookie, password(ADMIN_TEST_PASSWORD)))}`;
    expect((await usage(both)).status).toBe(200);
    // Only the admin prefix itself passes the site gate.
    expect((await fetch(`${base}/api/administrator`, { headers: { Cookie: both } })).status).toBe(
      401,
    );
    // The admin cookie does not unlock the rest of the site.
    expect((await fetch(`${base}/api/feedback`, { headers: { Cookie: both } })).status).toBe(401);
  });

  it('signs out, from the site Origin only', async () => {
    const cookie = await visitorCookie();
    const both = `${cookie}; ${adminCookieFrom(await signIn(cookie, password(ADMIN_TEST_PASSWORD)))}`;
    const signOut = (origin: string | null) =>
      fetch(`${base}/api/admin/session`, {
        method: 'DELETE',
        headers: { Cookie: both, ...(origin === null ? {} : { Origin: origin }) },
      });
    expect((await signOut(null)).status).toBe(403);
    const out = await signOut(base);
    expect(out.status).toBe(200);
    expect(await out.json()).toEqual({ signedIn: false });
    const cleared = out.headers.get('set-cookie') ?? '';
    expect(cleared).toMatch(/^agiledeck_admin_v1=;/);
    expect(cleared).toContain('Path=/api/admin');
    expect(cleared).toContain('Expires=Thu, 01 Jan 1970');
  });

  it('limits attempts per network in a short window and records the rejection', async () => {
    const record = jest
      .spyOn(telemetry.rateLimitRecorder, 'record')
      .mockImplementation(() => undefined);
    for (let i = 0; i < routes.ADMIN_SIGN_IN_ATTEMPTS_PER_WINDOW; i++)
      expect((await signIn(await visitorCookie(), password('wrong guess'))).status).toBe(401);
    const visitor = randomUUID();
    const limited = await signIn(await visitorCookie(visitor), password(ADMIN_TEST_PASSWORD));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('set-cookie')).toBeNull();
    await new Promise((resolve) => setImmediate(resolve));
    expect(record).toHaveBeenCalledWith(visitor);
    record.mockRestore();
  });

  it('keeps a durable daily budget per network and site-wide, even for the right password', async () => {
    for (let i = 0; i < routes.ADMIN_SIGN_IN_ATTEMPTS_PER_NETWORK_DAY; i++)
      await quotas.claimDailyQuotas([
        {
          scope: 'admin-sign-in-network',
          identity: '127.0.0.1',
          limit: routes.ADMIN_SIGN_IN_ATTEMPTS_PER_NETWORK_DAY,
        },
      ]);
    const refused = await signIn(await visitorCookie(), password(ADMIN_TEST_PASSWORD));
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({
      message: 'Too many admin password attempts today. Please try again tomorrow.',
    });
    expect(refused.headers.get('set-cookie')).toBeNull();

    await db.abuseQuota.deleteMany();
    await db.abuseQuota.create({
      data: {
        key: `admin-sign-in-global:${createHash('sha256').update('all').digest('hex')}`,
        day: new Date().toISOString().slice(0, 10),
        count: routes.ADMIN_SIGN_IN_ATTEMPTS_PER_DAY,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    expect((await signIn(await visitorCookie(), password(ADMIN_TEST_PASSWORD))).status).toBe(429);
  });

  it('passes unexpected failures to the error handler', async () => {
    const spy = jest
      .spyOn(quotas, 'claimDailyQuotas')
      .mockRejectedValueOnce(new Error('database is gone'));
    const response = await signIn(await visitorCookie(), password(ADMIN_TEST_PASSWORD));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: 'Could not complete the admin request.' });
    spy.mockRestore();
  });
});
