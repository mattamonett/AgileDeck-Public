import { randomUUID } from 'node:crypto';
import {
  encodeAccessToken,
  isAccessTokenValid,
  passwordsMatch,
} from '../../../src/platform/http/signed-access-token';

const PASSWORD = 'a long operator password';
const HOUR = 60 * 60_000;

describe('signed access tokens', () => {
  const visitor = randomUUID();

  it('compares passwords exactly', () => {
    expect(passwordsMatch(PASSWORD, PASSWORD)).toBe(true);
    expect(passwordsMatch(`${PASSWORD} `, PASSWORD)).toBe(false);
    expect(passwordsMatch('', PASSWORD)).toBe(false);
  });

  it('binds the purpose, browser ID, password and expiry', () => {
    const now = 1_000_000;
    const token = encodeAccessToken('admin-access', PASSWORD, visitor, HOUR, now);
    expect(isAccessTokenValid(token, 'admin-access', PASSWORD, visitor, now)).toBe(true);
    expect(isAccessTokenValid(token, 'site-access', PASSWORD, visitor, now)).toBe(false);
    expect(isAccessTokenValid(token, 'admin-access', PASSWORD, randomUUID(), now)).toBe(false);
    expect(isAccessTokenValid(token, 'admin-access', 'another password', visitor, now)).toBe(false);
    expect(isAccessTokenValid(token, 'admin-access', null, visitor, now)).toBe(false);
    expect(isAccessTokenValid(token, 'admin-access', PASSWORD, null, now)).toBe(false);
    expect(isAccessTokenValid(token, 'admin-access', PASSWORD, visitor, now + HOUR)).toBe(false);
  });

  it.each([undefined, 42, '', 'v1', 'v2.1.sig', 'v1.x.sig', 'v1.1.sig.extra'])(
    'refuses malformed values: %p',
    (value) => {
      expect(isAccessTokenValid(value, 'admin-access', PASSWORD, visitor, 0)).toBe(false);
    },
  );
});
