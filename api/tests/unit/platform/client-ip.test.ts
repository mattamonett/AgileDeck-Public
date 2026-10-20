import { getClientIp, httpClientKey } from '../../../src/platform/http/client-ip';

describe('trusted proxy client identity', () => {
  const original = process.env.TRUSTED_PROXY_IPS;
  beforeEach(() => {
    process.env.TRUSTED_PROXY_IPS = '172.30.0.0/24';
  });
  afterAll(() => {
    if (original === undefined) delete process.env.TRUSTED_PROXY_IPS;
    else process.env.TRUSTED_PROXY_IPS = original;
  });
  it('separates visitors forwarded by a trusted proxy', () => {
    const key = (ip: string) =>
      httpClientKey({
        socket: { remoteAddress: '::ffff:172.30.0.3' },
        headers: { 'x-forwarded-for': ip },
      });
    expect(key('203.0.113.1')).not.toBe(key('203.0.113.2'));
    expect(getClientIp('::ffff:172.30.0.3', { 'x-forwarded-for': '203.0.113.1' })).toBe(
      '203.0.113.1',
    );
  });
  it('ignores forwarding headers from untrusted peers', () => {
    expect(getClientIp('172.31.0.4', { 'x-forwarded-for': '203.0.113.1' })).toBe('172.31.0.4');
    expect(getClientIp('198.51.100.7', { 'x-forwarded-for': '203.0.113.1' })).toBe('198.51.100.7');
  });
  it('takes the right-most untrusted hop so callers cannot prepend a fake address', () => {
    expect(
      getClientIp('172.30.0.3', {
        'x-forwarded-for': '1.2.3.4, 203.0.113.9',
      }),
    ).toBe('203.0.113.9');
    process.env.TRUSTED_PROXY_IPS = '172.30.0.0/24, 10.0.0.5';
    expect(
      getClientIp('172.30.0.3', {
        'x-forwarded-for': '1.2.3.4, 203.0.113.9, 10.0.0.5',
      }),
    ).toBe('203.0.113.9');
  });
  it.each(['not-an-ip', '203.0.113.1, junk', ['203.0.113.1']])(
    'falls back to the peer for malformed headers: %s',
    (value) => {
      expect(getClientIp('172.30.0.3', { 'x-forwarded-for': value })).toBe('172.30.0.3');
    },
  );
  it('ignores Cloudflare-specific headers', () => {
    expect(getClientIp('172.30.0.3', { 'cf-connecting-ip': '203.0.113.1' })).toBe('172.30.0.3');
  });
  it('defaults to no proxy trust and supports IPv6 clients and proxies', () => {
    expect(getClientIp('172.30.0.3', { 'x-forwarded-for': '2001:db8::1' })).toBe('2001:db8::1');
    process.env.TRUSTED_PROXY_IPS = 'fd00::/8';
    expect(getClientIp('fd00::2', { 'x-forwarded-for': '203.0.113.5' })).toBe('203.0.113.5');
    process.env.TRUSTED_PROXY_IPS = 'nonsense, 300.1.1.1/8';
    expect(getClientIp('172.30.0.3', { 'x-forwarded-for': '203.0.113.1' })).toBe('172.30.0.3');
    delete process.env.TRUSTED_PROXY_IPS;
    expect(getClientIp('172.30.0.3', { 'x-forwarded-for': '203.0.113.1' })).toBe('172.30.0.3');
  });
});
