import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import {
  encodeVisitorCookie,
  VISITOR_COOKIE_NAME,
} from '../../../src/platform/http/visitor-session';
import { setSiteConfig } from '../../../src/config/site-config';
import {
  encodeSiteAccessCookie,
  hasSiteAccess,
  isPasswordRequired,
  isSiteAccessCookieValid,
  isUnlockedFor,
  passwordMatches,
  SITE_ACCESS_COOKIE_NAME,
  SITE_ACCESS_MAX_AGE_MS,
} from '../../../src/modules/site/site-access';
import { TransportAdmission } from '../../../src/platform/transport-admission';

const PASSWORD = 'correct horse battery';

function protect(passwordProtects: 'nothing' | 'room-creation' | 'everything') {
  setSiteConfig({ access: { passwordProtects } });
}

afterEach(() => {
  setSiteConfig();
  process.env.SITE_PASSWORD = PASSWORD;
  delete process.env.COOKIE_SIGNING_SECRET;
  delete process.env.COOKIE_SIGNING_SECRET_PREVIOUS;
});
beforeEach(() => {
  process.env.SITE_PASSWORD = PASSWORD;
});
afterAll(() => {
  delete process.env.SITE_PASSWORD;
});

describe('site password rules', () => {
  it('applies to room creation in both modes and to everything only in everything mode', () => {
    expect(isPasswordRequired('room-creation')).toBe(false);
    expect(isPasswordRequired('everything')).toBe(false);
    protect('room-creation');
    expect(isPasswordRequired('room-creation')).toBe(true);
    expect(isPasswordRequired('everything')).toBe(false);
    protect('everything');
    expect(isPasswordRequired('room-creation')).toBe(true);
    expect(isPasswordRequired('everything')).toBe(true);
  });

  it('compares the password exactly and never matches without one', () => {
    expect(passwordMatches(PASSWORD)).toBe(true);
    expect(passwordMatches(`${PASSWORD} `)).toBe(false);
    expect(passwordMatches('short')).toBe(false);
    delete process.env.SITE_PASSWORD;
    expect(passwordMatches('')).toBe(false);
    expect(() => encodeSiteAccessCookie(randomUUID())).toThrow('SITE_PASSWORD is not set');
  });

  it('binds the access cookie to the browser ID, the password and an expiry', () => {
    const visitor = randomUUID();
    const now = 1_800_000_000_000;
    const value = encodeSiteAccessCookie(visitor, now);
    expect(isSiteAccessCookieValid(value, visitor, now)).toBe(true);
    expect(isSiteAccessCookieValid(value, randomUUID(), now)).toBe(false);
    expect(isSiteAccessCookieValid(value, null, now)).toBe(false);
    expect(isSiteAccessCookieValid(undefined, visitor, now)).toBe(false);
    expect(isSiteAccessCookieValid(value, visitor, now + SITE_ACCESS_MAX_AGE_MS)).toBe(false);
    const [version, expires, signature] = value.split('.');
    for (const tampered of [
      `${version}.${Number(expires) + 1}.${signature}`,
      `${version}.${expires}.${'A'.repeat(43)}`,
      `v2.${expires}.${signature}`,
      `${value}.extra`,
      `${version}.soon.${signature}`,
      `${version}..${signature}`,
      `${version}.${expires}`,
    ])
      expect(isSiteAccessCookieValid(tampered, visitor, now)).toBe(false);
    // Changing the password signs everyone out.
    process.env.SITE_PASSWORD = 'a different password';
    expect(isSiteAccessCookieValid(value, visitor, now)).toBe(false);
    delete process.env.SITE_PASSWORD;
    expect(isSiteAccessCookieValid(value, visitor, now)).toBe(false);
  });

  it('keeps cookies signed with the previous secret during a rotation', () => {
    const visitor = randomUUID();
    process.env.COOKIE_SIGNING_SECRET = 'a'.repeat(40);
    const value = encodeSiteAccessCookie(visitor);
    process.env.COOKIE_SIGNING_SECRET = 'b'.repeat(40);
    expect(isSiteAccessCookieValid(value, visitor)).toBe(false);
    process.env.COOKIE_SIGNING_SECRET_PREVIOUS = 'a'.repeat(40);
    expect(isSiteAccessCookieValid(value, visitor)).toBe(true);
  });

  it('reads the cookie from a Cookie header', () => {
    const visitor = randomUUID();
    const header = `${SITE_ACCESS_COOKIE_NAME}=${encodeSiteAccessCookie(visitor)}`;
    expect(hasSiteAccess(header, visitor)).toBe(true);
    expect(hasSiteAccess(undefined, visitor)).toBe(false);
    expect(hasSiteAccess(`${SITE_ACCESS_COOKIE_NAME}=%E0%A4%A`, visitor)).toBe(false);
    protect('everything');
    expect(isUnlockedFor('everything', header, visitor)).toBe(true);
    expect(isUnlockedFor('everything', undefined, visitor)).toBe(false);
    protect('room-creation');
    expect(isUnlockedFor('everything', undefined, visitor)).toBe(true);
    expect(isUnlockedFor('room-creation', undefined, visitor)).toBe(false);
  });

  it('refuses Engine.IO transports before allocation when it protects everything', async () => {
    protect('everything');
    const admission = new TransportAdmission((req, visitorId) =>
      isUnlockedFor('everything', req.headers.cookie, visitorId),
    );
    const server = createServer();
    const io = new Server(server, {
      allowRequest: (req, done) => {
        const error = admission.admit(req);
        done(error, error === null);
      },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing port');
      const url = `http://127.0.0.1:${address.port}/socket.io/?EIO=4&transport=polling`;
      const visitor = randomUUID();
      const visitorCookie = `${VISITOR_COOKIE_NAME}=${encodeVisitorCookie(visitor)}`;
      const locked = await fetch(url, { headers: { Cookie: visitorCookie } });
      expect(locked.status).toBe(403);
      await locked.text();
      expect(io.engine.clientsCount).toBe(0);
      const borrowed = await fetch(url, {
        headers: {
          Cookie: `${VISITOR_COOKIE_NAME}=${encodeVisitorCookie(randomUUID())}; ${SITE_ACCESS_COOKIE_NAME}=${encodeSiteAccessCookie(visitor)}`,
        },
      });
      expect(borrowed.status).toBe(403);
      await borrowed.text();
      const unlocked = await fetch(url, {
        headers: {
          Cookie: `${visitorCookie}; ${SITE_ACCESS_COOKIE_NAME}=${encodeSiteAccessCookie(visitor)}`,
        },
      });
      expect(unlocked.status).toBe(200);
      await unlocked.text();
      expect(io.engine.clientsCount).toBe(1);
    } finally {
      await new Promise<void>((resolve) => io.close(() => resolve()));
    }
  });
});
