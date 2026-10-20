import { readServerEnv } from '../../../src/config/env';

const SECRET = 'index-test-secret-0123456789abcdef';
const KEYS = [
  'NODE_ENV',
  'PORT',
  'BUILD_TIME',
  'COOKIE_SECURE',
  'COOKIE_SIGNING_SECRET',
  'POKER_FRONTEND_URL',
  'ADMIN_PASSWORD',
  'ALLOW_MISSING_SOCKET_ORIGIN',
  'TRUSTED_PROXY_IPS',
  'LOG_LEVEL',
  'LOG_FORMAT',
] as const;

describe('server environment', () => {
  const saved = new Map(KEYS.map((key) => [key, process.env[key]]));

  beforeEach(() => {
    for (const key of KEYS) delete process.env[key];
  });
  afterAll(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('allows the local web origins and default port in development', () => {
    expect(readServerEnv()).toEqual({
      allowedOrigins: ['http://localhost:4300', 'http://127.0.0.1:4300'],
      secureCookies: false,
      port: 3000,
      buildTime: 'Development',
      adminEnabled: false,
    });
  });

  it('reads the port, build time and extra origins', () => {
    process.env.PORT = '4000';
    process.env.BUILD_TIME = 'build-7';
    process.env.POKER_FRONTEND_URL = ' https://a.example , http://localhost:4300,';
    expect(readServerEnv()).toEqual({
      allowedOrigins: ['http://localhost:4300', 'http://127.0.0.1:4300', 'https://a.example'],
      secureCookies: false,
      port: '4000',
      buildTime: 'build-7',
      adminEnabled: false,
    });
  });

  it('fails fast in production without a cookie signing secret', () => {
    process.env.NODE_ENV = 'production';
    process.env.POKER_FRONTEND_URL = 'https://poker.example.com';
    expect(() => readServerEnv()).toThrow('COOKIE_SIGNING_SECRET');
  });

  it('fails fast in production without the site address', () => {
    process.env.NODE_ENV = 'production';
    process.env.COOKIE_SIGNING_SECRET = SECRET;
    expect(() => readServerEnv()).toThrow('POKER_FRONTEND_URL');
  });

  it('secures cookies in production when every origin uses HTTPS', () => {
    process.env.NODE_ENV = 'production';
    process.env.COOKIE_SIGNING_SECRET = SECRET;
    process.env.POKER_FRONTEND_URL = 'https://poker.example.com';
    expect(readServerEnv()).toMatchObject({
      allowedOrigins: ['https://poker.example.com'],
      secureCookies: true,
    });

    process.env.POKER_FRONTEND_URL = 'https://a.example,http://b.example';
    expect(readServerEnv().secureCookies).toBe(false);
  });

  it('lets COOKIE_SECURE override the guess', () => {
    process.env.COOKIE_SECURE = 'true';
    expect(readServerEnv().secureCookies).toBe(true);

    process.env.NODE_ENV = 'production';
    process.env.COOKIE_SIGNING_SECRET = SECRET;
    process.env.POKER_FRONTEND_URL = 'https://poker.example.com';
    process.env.COOKIE_SECURE = 'false';
    expect(readServerEnv().secureCookies).toBe(false);
  });

  it('turns the admin page on only with a long enough ADMIN_PASSWORD', () => {
    process.env.ADMIN_PASSWORD = '';
    expect(readServerEnv().adminEnabled).toBe(false);
    process.env.ADMIN_PASSWORD = 'a'.repeat(11);
    expect(() => readServerEnv()).toThrow('ADMIN_PASSWORD must be at least 12 characters');
    process.env.ADMIN_PASSWORD = 'a'.repeat(12);
    expect(readServerEnv().adminEnabled).toBe(true);
  });

  it('refuses true/false settings it cannot read', () => {
    process.env.COOKIE_SECURE = '0';
    expect(() => readServerEnv()).toThrow('COOKIE_SECURE must be true or false');
    delete process.env.COOKIE_SECURE;
    process.env.ALLOW_MISSING_SOCKET_ORIGIN = 'yes';
    expect(() => readServerEnv()).toThrow('ALLOW_MISSING_SOCKET_ORIGIN must be true or false');
    process.env.ALLOW_MISSING_SOCKET_ORIGIN = 'true';
    expect(() => readServerEnv()).not.toThrow();
  });

  it('refuses trusted proxies that are not addresses or ranges', () => {
    process.env.TRUSTED_PROXY_IPS = '172.30.0.10, 10.0.0.0/8';
    expect(() => readServerEnv()).not.toThrow();
    process.env.TRUSTED_PROXY_IPS = '172.30.0.10,proxy.local,10.0.0.0/33';
    expect(() => readServerEnv()).toThrow('fix proxy.local, 10.0.0.0/33');
  });

  it('refuses an unknown log level or format', () => {
    process.env.LOG_LEVEL = 'debug';
    process.env.LOG_FORMAT = 'json';
    expect(() => readServerEnv()).not.toThrow();
    process.env.LOG_LEVEL = 'verbose';
    expect(() => readServerEnv()).toThrow('LOG_LEVEL must be one of error, warn, info, debug');
    process.env.LOG_LEVEL = 'info';
    process.env.LOG_FORMAT = 'xml';
    expect(() => readServerEnv()).toThrow('LOG_FORMAT must be one of text, json');
  });
});
