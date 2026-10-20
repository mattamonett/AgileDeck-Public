import { assertCookieSigningConfigured } from '../platform/http/visitor-session';
import { adminPassword, assertAdminPasswordConfigured } from './admin-password';

/** Settings the public HTTP and Socket.IO server reads from the environment. */
export interface ServerEnv {
  /** Browser origins allowed to call the API and open sockets. */
  readonly allowedOrigins: readonly string[];
  /** Whether cookies are marked Secure, which needs HTTPS. */
  readonly secureCookies: boolean;
  /** A port number or, as Node allows, a named pipe. */
  readonly port: string | number;
  /** Reported by the version check so browsers can notice a new release. */
  readonly buildTime: string;
  /** Whether ADMIN_PASSWORD turns on the admin page. */
  readonly adminEnabled: boolean;
}

const DEVELOPMENT_ORIGINS = ['http://localhost:4300', 'http://127.0.0.1:4300'];
const DEFAULT_PORT = 3000;

function listOrigins(value: string | undefined): string[] {
  return value
    ? value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : [];
}

/**
 * Reads and checks the server's environment. Production refuses to start
 * without a strong cookie signing secret or the site's public address, and any
 * environment refuses a too-short ADMIN_PASSWORD.
 */
export function readServerEnv(): ServerEnv {
  const env = process.env;
  assertCookieSigningConfigured();
  assertAdminPasswordConfigured();
  const production = env.NODE_ENV === 'production';
  const allowedOrigins = Array.from(
    new Set([...(production ? [] : DEVELOPMENT_ORIGINS), ...listOrigins(env.POKER_FRONTEND_URL)]),
  );
  if (allowedOrigins.length === 0) {
    throw new Error(
      'Set POKER_FRONTEND_URL to the public address of the site, for example https://poker.example.com.',
    );
  }
  // Secure cookies need HTTPS. COOKIE_SECURE overrides the guess from the site address.
  const secureCookies = env.COOKIE_SECURE
    ? env.COOKIE_SECURE !== 'false'
    : production && allowedOrigins.every((origin) => origin.startsWith('https://'));
  return {
    allowedOrigins,
    secureCookies,
    port: env.PORT || DEFAULT_PORT,
    buildTime: env.BUILD_TIME || 'Development',
    adminEnabled: adminPassword() !== null,
  };
}
