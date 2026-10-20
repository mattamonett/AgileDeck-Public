import crypto from 'crypto';
import fs from 'fs';
import { logger } from '../platform/logger';

const GENERATED_SECRET_BYTES = 48;
const MIN_SECRET_LENGTH = 32;

function isAlreadyExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}

function readOrCreateSecret(file: string): string {
  try {
    // 'wx' fails when the file exists, so a secret is never replaced once written.
    fs.writeFileSync(file, crypto.randomBytes(GENERATED_SECRET_BYTES).toString('base64url'), {
      flag: 'wx',
      mode: 0o600,
    });
    logger.log(`Generated a cookie signing secret in ${file}.`);
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
  }
  const secret = fs.readFileSync(file, 'utf8').trim();
  if (secret.length < MIN_SECRET_LENGTH)
    throw new Error(`${file} does not hold a usable cookie signing secret; delete it and restart`);
  return secret;
}

/**
 * Without COOKIE_SIGNING_SECRET, Compose points COOKIE_SIGNING_SECRET_FILE at
 * the data volume. The first start writes a random secret there and later
 * starts read it back, so self-hosters need no manual step, visitor cookies
 * survive restarts, and the secret travels with every volume backup.
 */
export function loadCookieSigningSecretFile(): void {
  if (process.env.COOKIE_SIGNING_SECRET?.trim()) return;
  const file = process.env.COOKIE_SIGNING_SECRET_FILE?.trim();
  if (!file) return;
  process.env.COOKIE_SIGNING_SECRET = readOrCreateSecret(file);
}
