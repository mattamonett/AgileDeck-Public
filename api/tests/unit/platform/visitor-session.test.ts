import {
  assertCookieSigningConfigured,
  decodeVisitorCookie,
  encodeVisitorCookie,
} from '../../../src/platform/http/visitor-session';

describe('session cookie helpers', () => {
  const visitorId = '123e4567-e89b-42d3-a456-426614174000';

  const strongSecret = 'session-test-secret-0123456789abcdef';
  const rotatedSecret = 'session-test-rotated-0123456789abcdef';

  // Start each test without the caller's secrets or environment, such as a deploy shell's.
  const clearSessionEnv = () => {
    delete process.env.COOKIE_SIGNING_SECRET;
    delete process.env.COOKIE_SIGNING_SECRET_PREVIOUS;
    delete process.env.NODE_ENV;
    delete process.env.APP_ENV;
  };
  beforeEach(clearSessionEnv);
  afterEach(clearSessionEnv);

  it('accepts legacy unsigned visitor cookies', () => {
    expect(decodeVisitorCookie(visitorId)).toEqual({
      visitorId,
      needsRefresh: false,
    });
  });

  it('rejects legacy unsigned visitor cookies in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.COOKIE_SIGNING_SECRET = 'top-secret';

    expect(decodeVisitorCookie(visitorId)).toEqual({
      visitorId: null,
      needsRefresh: false,
    });
  });

  it('requires a signing secret in production', () => {
    process.env.NODE_ENV = 'production';

    expect(() => assertCookieSigningConfigured()).toThrow('COOKIE_SIGNING_SECRET');
    expect(() => encodeVisitorCookie(visitorId)).toThrow('COOKIE_SIGNING_SECRET');
  });

  it('marks legacy cookies for refresh when a signing secret is configured', () => {
    process.env.COOKIE_SIGNING_SECRET = 'top-secret';

    expect(decodeVisitorCookie(visitorId)).toEqual({
      visitorId,
      needsRefresh: true,
    });
  });

  it('round-trips signed visitor cookies', () => {
    process.env.COOKIE_SIGNING_SECRET = 'top-secret';

    const encoded = encodeVisitorCookie(visitorId);

    expect(decodeVisitorCookie(encoded)).toEqual({
      visitorId,
      needsRefresh: false,
    });
  });

  it('rejects tampered signed visitor cookies', () => {
    process.env.COOKIE_SIGNING_SECRET = 'top-secret';

    const encoded = encodeVisitorCookie(visitorId);
    const tampered = encoded.replace(visitorId, '123e4567-e89b-42d3-a456-426614174001');

    expect(decodeVisitorCookie(tampered)).toEqual({
      visitorId: null,
      needsRefresh: false,
    });
  });

  it('rejects a signature with multi-byte characters without throwing', () => {
    process.env.COOKIE_SIGNING_SECRET = strongSecret;
    const [version, id, signature] = encodeVisitorCookie(visitorId).split('.');
    if (!signature) throw new Error('Missing signature');
    // Same string length as a real signature, but more bytes once encoded.
    const forged = `${version}.${id}.${'é'.repeat(signature.length)}`;

    expect(() => decodeVisitorCookie(forged)).not.toThrow();
    expect(decodeVisitorCookie(forged).visitorId).toBeNull();
  });

  it('accepts the previous secret during rotation and asks for a refresh', () => {
    process.env.COOKIE_SIGNING_SECRET = strongSecret;
    const issuedBeforeRotation = encodeVisitorCookie(visitorId);
    process.env.COOKIE_SIGNING_SECRET = rotatedSecret;
    process.env.COOKIE_SIGNING_SECRET_PREVIOUS = strongSecret;

    expect(decodeVisitorCookie(issuedBeforeRotation)).toEqual({
      visitorId,
      needsRefresh: true,
    });
    delete process.env.COOKIE_SIGNING_SECRET_PREVIOUS;
    expect(decodeVisitorCookie(issuedBeforeRotation).visitorId).toBeNull();
  });

  it.each(['short-secret', 'replace-with-a-long-random-secret'])(
    'rejects a weak production signing secret (%s)',
    (secret) => {
      process.env.NODE_ENV = 'production';
      process.env.COOKIE_SIGNING_SECRET = secret;

      expect(() => assertCookieSigningConfigured()).toThrow('COOKIE_SIGNING_SECRET');
    },
  );
});
