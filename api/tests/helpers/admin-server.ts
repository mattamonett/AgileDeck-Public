import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import cookieParser from 'cookie-parser';
import express from 'express';

export const ADMIN_TEST_PASSWORD = 'Kq7-test-operator-Vz29';

export interface AdminTestServer {
  readonly base: string;
  /** The Cookie header of a browser signed in to the admin page. */
  readonly cookie: string;
  /** An admin API request from the signed-in browser on the site's own origin. */
  request(
    url: string,
    method?: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<Response>;
  close(): Promise<void>;
}

/** The Cookie header for a fresh browser ID. */
export async function visitorCookie(visitorId = randomUUID()): Promise<string> {
  const { encodeVisitorCookie, VISITOR_COOKIE_NAME } =
    await import('../../src/platform/http/visitor-session');
  return `${VISITOR_COOKIE_NAME}=${encodeVisitorCookie(visitorId)}`;
}

/** The `name=value` part of the admin cookie set by a sign-in response. */
export function adminCookieFrom(response: Response): string {
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('agiledeck_admin_v1='));
  const pair = cookie?.split(';')[0];
  if (!pair) throw new Error('Expected the admin cookie.');
  return pair;
}

/**
 * The admin router behind CORS, cookie parsing and the site password gate, in
 * production order, on a loopback port. Import it only after the database is
 * set up. Each server has its own in-memory rate limits.
 */
export async function startAdminTestServer(): Promise<AdminTestServer> {
  process.env.ADMIN_PASSWORD = ADMIN_TEST_PASSWORD;
  const { createAdminRouter } = await import('../../src/modules/admin/admin.routes');
  const { siteAccessGate } = await import('../../src/modules/site/site-access.routes');
  const { originAllowList, originCors } = await import('../../src/platform/http/origin-policy');
  const { handleApiError } = await import('../../src/platform/http/hardening');
  const server: Server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected local TCP listener.');
  const base = `http://127.0.0.1:${address.port}`;
  const isOriginAllowed = originAllowList([base]);
  const app = express();
  app.use(originCors(isOriginAllowed));
  app.use(cookieParser());
  app.use(siteAccessGate);
  app.use('/api/admin', createAdminRouter(isOriginAllowed, false));
  app.use(handleApiError);
  server.on('request', app);

  const visitor = await visitorCookie();
  const signIn = await fetch(base + '/api/admin/session', {
    method: 'POST',
    headers: { Origin: base, Cookie: visitor, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_TEST_PASSWORD }),
  });
  if (signIn.status !== 200) throw new Error(`Admin sign-in failed with ${signIn.status}.`);
  const cookie = `${visitor}; ${adminCookieFrom(signIn)}`;

  return {
    base,
    cookie,
    request: (url, method = 'GET', body, headers = {}) =>
      fetch(base + '/api/admin' + url, {
        method,
        headers: {
          Cookie: cookie,
          Origin: base,
          'Content-Type': 'application/json',
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
