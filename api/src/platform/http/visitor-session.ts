import crypto from 'crypto';

const COOKIE_VERSION = 'v1';
export const VISITOR_COOKIE_NAME = 'agiledeck_visitor_id_v2';
export const LEGACY_VISITOR_COOKIE_NAMES = ['poker_visitor_id'];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// HMAC-SHA256 digests are 32 bytes, which base64url encodes as 43 characters.
const SIGNATURE_REGEX = /^[A-Za-z0-9_-]{43}$/;
const MIN_SECRET_LENGTH = 32;
const PLACEHOLDER_SECRET = 'replace-with-a-long-random-secret';

/** Production uses signed identities and strict origin checks. */
export function isStrictIdentityMode(): boolean {
  return process.env.NODE_ENV === 'production';
}

function readSecret(value: string | undefined): string | null {
  const secret = value?.trim();
  return secret ? secret : null;
}

function getCookieSigningSecret(): string | null {
  return readSecret(process.env.COOKIE_SIGNING_SECRET);
}

/** Accepted for verification only, so a rotation does not reset every visitor. */
function getPreviousCookieSigningSecret(): string | null {
  return readSecret(process.env.COOKIE_SIGNING_SECRET_PREVIOUS);
}

function isWeakSecret(secret: string): boolean {
  return secret.length < MIN_SECRET_LENGTH || secret === PLACEHOLDER_SECRET;
}

export function assertCookieSigningConfigured(): void {
  if (!isStrictIdentityMode()) return;
  const secret = getCookieSigningSecret();
  if (!secret) {
    throw new Error(
      'COOKIE_SIGNING_SECRET must be set in production, or COOKIE_SIGNING_SECRET_FILE to generate one',
    );
  }
  if (isWeakSecret(secret)) {
    throw new Error(
      `COOKIE_SIGNING_SECRET must be a random value of at least ${MIN_SECRET_LENGTH} characters, or empty under Docker Compose to generate one`,
    );
  }
  const previous = getPreviousCookieSigningSecret();
  if (previous && isWeakSecret(previous)) {
    throw new Error(
      `COOKIE_SIGNING_SECRET_PREVIOUS must be a random value of at least ${MIN_SECRET_LENGTH} characters`,
    );
  }
}

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

function signValue(visitorId: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${COOKIE_VERSION}.${visitorId}`)
    .digest('base64url');
}

function signatureMatches(visitorId: string, signature: string, secret: string): boolean {
  // The shape check guarantees equal byte lengths for timingSafeEqual.
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(signValue(visitorId, secret)));
}

// Development without COOKIE_SIGNING_SECRET still signs other cookies, per process.
const processSecret = crypto.randomBytes(32).toString('base64url');

function payloadSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

/**
 * Signs another cookie's payload with the cookie signing secret. Without one
 * (development only; production requires it) a per-process secret is used, so
 * such cookies stop working when the API restarts.
 */
export function signCookiePayload(payload: string): string {
  assertCookieSigningConfigured();
  return payloadSignature(payload, getCookieSigningSecret() ?? processSecret);
}

/** Constant-time check against the current and the previous signing secret. */
export function cookiePayloadSignatureMatches(payload: string, signature: string): boolean {
  if (!SIGNATURE_REGEX.test(signature)) return false;
  const current = getCookieSigningSecret();
  const secrets = current ? [current, getPreviousCookieSigningSecret()] : [processSecret];
  return secrets.some(
    (secret) =>
      secret !== null &&
      crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(payloadSignature(payload, secret)),
      ),
  );
}

export function encodeVisitorCookie(visitorId: string): string {
  const secret = getCookieSigningSecret();
  assertCookieSigningConfigured();
  if (!secret) return visitorId;

  return `${COOKIE_VERSION}.${visitorId}.${signValue(visitorId, secret)}`;
}

export function decodeVisitorCookie(rawValue: unknown): {
  visitorId: string | null;
  needsRefresh: boolean;
} {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return { visitorId: null, needsRefresh: false };
  }

  const value = rawValue.trim();
  const secret = getCookieSigningSecret();

  // Compatibility path for legacy unsigned cookies.
  if (isUuid(value)) {
    if (isStrictIdentityMode()) {
      return { visitorId: null, needsRefresh: false };
    }
    return { visitorId: value, needsRefresh: !!secret };
  }

  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== COOKIE_VERSION) {
    return { visitorId: null, needsRefresh: false };
  }

  const visitorId = parts[1];
  const signature = parts[2];
  if (!visitorId || !signature || !SIGNATURE_REGEX.test(signature)) {
    return { visitorId: null, needsRefresh: false };
  }
  if (!isUuid(visitorId) || !secret) {
    return { visitorId: null, needsRefresh: false };
  }

  if (signatureMatches(visitorId, signature, secret)) {
    return { visitorId, needsRefresh: false };
  }
  const previous = getPreviousCookieSigningSecret();
  if (previous && signatureMatches(visitorId, signature, previous)) {
    return { visitorId, needsRefresh: true };
  }
  return { visitorId: null, needsRefresh: false };
}
