import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadCookieSigningSecretFile } from '../../../src/config/cookie-secret-file';

describe('generated cookie signing secret', () => {
  let directory: string;
  let file: string;

  const clearEnv = () => {
    delete process.env.COOKIE_SIGNING_SECRET;
    delete process.env.COOKIE_SIGNING_SECRET_FILE;
  };
  beforeEach(() => {
    clearEnv();
    directory = mkdtempSync(path.join(tmpdir(), 'cookie-secret-'));
    file = path.join(directory, 'cookie-signing-secret');
  });
  afterEach(() => {
    clearEnv();
    rmSync(directory, { recursive: true, force: true });
  });

  it('creates a private random secret on first start and reuses it afterwards', () => {
    process.env.COOKIE_SIGNING_SECRET_FILE = file;
    loadCookieSigningSecretFile();
    const generated = process.env.COOKIE_SIGNING_SECRET;
    expect(generated).toHaveLength(64);
    expect(readFileSync(file, 'utf8')).toBe(generated);
    expect(statSync(file).mode & 0o777).toBe(0o600);

    delete process.env.COOKIE_SIGNING_SECRET;
    loadCookieSigningSecretFile();
    expect(process.env.COOKIE_SIGNING_SECRET).toBe(generated);
  });

  it('leaves an explicit COOKIE_SIGNING_SECRET alone and writes nothing', () => {
    process.env.COOKIE_SIGNING_SECRET = 'explicit-secret-0123456789abcdefghij';
    process.env.COOKIE_SIGNING_SECRET_FILE = file;
    loadCookieSigningSecretFile();
    expect(process.env.COOKIE_SIGNING_SECRET).toBe('explicit-secret-0123456789abcdefghij');
    expect(() => statSync(file)).toThrow();
  });

  it('does nothing without a file setting', () => {
    loadCookieSigningSecretFile();
    expect(process.env.COOKIE_SIGNING_SECRET).toBeUndefined();
  });

  it('refuses a file that holds a short secret', () => {
    writeFileSync(file, 'short\n');
    process.env.COOKIE_SIGNING_SECRET_FILE = file;
    expect(() => loadCookieSigningSecretFile()).toThrow('delete it and restart');
  });
});
