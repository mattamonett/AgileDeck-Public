import cookie from 'cookie';
import { ApiPath } from '@poker/shared';
import { DAY_MS } from '../../platform/time';
import { getSiteConfig } from '../../config/site-config';
import {
  encodeAccessToken,
  isAccessTokenValid,
  passwordsMatch,
} from '../../platform/http/signed-access-token';

/**
 * The site password (SITE_PASSWORD, never in site.json or the browser) unlocks
 * room creation or the whole site, per access.passwordProtects. Entering it
 * sets a signed HttpOnly cookie bound to the visitor's browser ID and to a hash
 * of the password, so changing the password locks every browser out again.
 */
export const SITE_ACCESS_COOKIE_NAME = 'agiledeck_site_access_v1';
export const SITE_ACCESS_MAX_AGE_MS = 30 * DAY_MS;

/** Paths a visitor can reach before entering the password when it protects everything. */
export const OPEN_API_PATHS: ReadonlySet<string> = new Set([
  '/',
  ApiPath.INIT,
  ApiPath.VERSION,
  ApiPath.SITE_CONFIG,
  ApiPath.ACCESS,
]);

export type SiteAccessScope = 'room-creation' | 'everything';

function sitePassword(): string | null {
  const password = process.env.SITE_PASSWORD;
  return password ? password : null;
}

/** True when the configured protection covers this scope. */
export function isPasswordRequired(scope: SiteAccessScope): boolean {
  const protects = getSiteConfig().access.passwordProtects;
  if (protects === 'nothing') return false;
  return scope === 'room-creation' || protects === 'everything';
}

/** Constant-time comparison of hashes, so neither length nor content leaks. */
export function passwordMatches(input: string): boolean {
  const password = sitePassword();
  return password !== null && passwordsMatch(input, password);
}

/** The cookie value that unlocks the site for this browser ID. */
export function encodeSiteAccessCookie(visitorId: string, now = Date.now()): string {
  const password = sitePassword();
  if (!password) throw new Error('SITE_PASSWORD is not set');
  return encodeAccessToken('site-access', password, visitorId, SITE_ACCESS_MAX_AGE_MS, now);
}

/** Whether this cookie value unlocks the site for this browser ID now. */
export function isSiteAccessCookieValid(
  rawValue: unknown,
  visitorId: string | null,
  now = Date.now(),
): boolean {
  return isAccessTokenValid(rawValue, 'site-access', sitePassword(), visitorId, now);
}

/** For callers that hold a raw Cookie header, such as Engine.IO and sockets. */
export function hasSiteAccess(cookieHeader: string | undefined, visitorId: string | null): boolean {
  try {
    return isSiteAccessCookieValid(
      cookie.parse(cookieHeader ?? '')[SITE_ACCESS_COOKIE_NAME],
      visitorId,
    );
  } catch {
    return false;
  }
}

/** True when the visitor may go on: no password applies, or they entered it. */
export function isUnlockedFor(
  scope: SiteAccessScope,
  cookieHeader: string | undefined,
  visitorId: string | null,
): boolean {
  return !isPasswordRequired(scope) || hasSiteAccess(cookieHeader, visitorId);
}
