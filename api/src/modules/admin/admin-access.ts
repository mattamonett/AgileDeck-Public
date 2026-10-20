import { adminPassword } from '../../config/admin-password';
import {
  encodeAccessToken,
  isAccessTokenValid,
  passwordsMatch,
} from '../../platform/http/signed-access-token';

/**
 * Entering ADMIN_PASSWORD sets a signed HttpOnly cookie bound to the visitor's
 * browser ID and to a hash of the password, so it cannot be moved to another
 * browser ID and changing the password signs every admin out.
 */
export const ADMIN_COOKIE_NAME = 'agiledeck_admin_v1';
export const ADMIN_COOKIE_PATH = '/api/admin';
export const ADMIN_SESSION_MAX_AGE_MS = 12 * 60 * 60_000;

/** The admin page answers only while ADMIN_PASSWORD is set. */
export function isAdminEnabled(): boolean {
  return adminPassword() !== null;
}

/** Constant-time comparison of hashes, so neither length nor content leaks. */
export function adminPasswordMatches(input: string): boolean {
  const password = adminPassword();
  return password !== null && passwordsMatch(input, password);
}

/** The cookie value that signs this browser ID in to the admin page. */
export function encodeAdminCookie(visitorId: string, now = Date.now()): string {
  const password = adminPassword();
  if (!password) throw new Error('ADMIN_PASSWORD is not set');
  return encodeAccessToken('admin-access', password, visitorId, ADMIN_SESSION_MAX_AGE_MS, now);
}

/** Whether this cookie value signs this browser ID in to the admin page now. */
export function isAdminCookieValid(
  rawValue: unknown,
  visitorId: string | null,
  now = Date.now(),
): boolean {
  return isAccessTokenValid(rawValue, 'admin-access', adminPassword(), visitorId, now);
}
