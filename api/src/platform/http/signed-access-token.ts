import { createHash, timingSafeEqual } from 'node:crypto';
import { cookiePayloadSignatureMatches, signCookiePayload } from './visitor-session';

/**
 * Access cookies granted by entering a password. The signed payload binds the
 * purpose, the visitor's browser ID, an expiry and a hash of the current
 * password, so a cookie cannot move to another browser ID or another purpose,
 * and changing the password signs everyone out.
 */
const TOKEN_VERSION = 'v1';
const EXPIRY_PATTERN = /^\d{1,15}$/;

export type AccessTokenPurpose = 'site-access' | 'admin-access';

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Constant-time comparison of hashes, so neither length nor content leaks. */
export function passwordsMatch(input: string, password: string): boolean {
  return timingSafeEqual(sha256(input), sha256(password));
}

function tokenPayload(
  purpose: AccessTokenPurpose,
  password: string,
  visitorId: string,
  expiresAt: string,
): string {
  const passwordHash = sha256(password).toString('hex');
  return `${purpose}.${TOKEN_VERSION}.${visitorId}.${expiresAt}.${passwordHash}`;
}

/** The cookie value granting `purpose` to this browser ID until `maxAgeMs` from now. */
export function encodeAccessToken(
  purpose: AccessTokenPurpose,
  password: string,
  visitorId: string,
  maxAgeMs: number,
  now = Date.now(),
): string {
  const expiresAt = String(now + maxAgeMs);
  const signature = signCookiePayload(tokenPayload(purpose, password, visitorId, expiresAt));
  return `${TOKEN_VERSION}.${expiresAt}.${signature}`;
}

/** Whether this cookie value grants `purpose` to this browser ID under this password now. */
export function isAccessTokenValid(
  rawValue: unknown,
  purpose: AccessTokenPurpose,
  password: string | null,
  visitorId: string | null,
  now = Date.now(),
): boolean {
  if (!password || !visitorId || typeof rawValue !== 'string') return false;
  const [version, expiresAt, signature, ...rest] = rawValue.split('.');
  if (
    version !== TOKEN_VERSION ||
    !expiresAt ||
    !signature ||
    rest.length > 0 ||
    !EXPIRY_PATTERN.test(expiresAt) ||
    Number(expiresAt) <= now
  )
    return false;
  return cookiePayloadSignatureMatches(
    tokenPayload(purpose, password, visitorId, expiresAt),
    signature,
  );
}
