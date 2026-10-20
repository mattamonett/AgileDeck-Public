import { invalidTrustedProxyEntries } from '../platform/http/client-ip';
import { assertCookieSigningConfigured } from '../platform/http/visitor-session';
import { LOG_FORMATS, LOG_LEVELS } from '../platform/logger';
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

/** A true/false setting, or null when unset. Anything else is a typo worth stopping for. */
function readFlag(name: 'COOKIE_SECURE' | 'ALLOW_MISSING_SOCKET_ORIGIN'): boolean | null {
  const value = process.env[name]?.trim();
  if (!value) return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false, or empty for the default`);
}

function assertChoice(name: 'LOG_LEVEL' | 'LOG_FORMAT', choices: readonly string[]): void {
  const value = process.env[name]?.trim();
  if (value && !choices.includes(value))
    throw new Error(`${name} must be one of ${choices.join(', ')}, or empty for the default`);
}

function assertTrustedProxiesValid(): void {
  const invalid = invalidTrustedProxyEntries();
  if (invalid.length > 0)
    throw new Error(
      `TRUSTED_PROXY_IPS entries must be IP addresses or CIDR ranges; fix ${invalid.join(', ')}`,
    );
}

/**
 * Reads and checks the server's environment. Production refuses to start
 * without a strong cookie signing secret or the site's public address, and any
 * environment refuses a too-short ADMIN_PASSWORD or a setting it cannot parse.
 */
export function readServerEnv(): ServerEnv {
  const env = process.env;
  assertCookieSigningConfigured();
  assertAdminPasswordConfigured();
  assertTrustedProxiesValid();
  assertChoice('LOG_LEVEL', LOG_LEVELS);
  assertChoice('LOG_FORMAT', LOG_FORMATS);
  // Checked here so a typo stops startup; the origin policy reads it per connection.
  readFlag('ALLOW_MISSING_SOCKET_ORIGIN');
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
  const secureCookies =
    readFlag('COOKIE_SECURE') ??
    (production && allowedOrigins.every((origin) => origin.startsWith('https://')));
  return {
    allowedOrigins,
    secureCookies,
    port: env.PORT || DEFAULT_PORT,
    buildTime: env.BUILD_TIME || 'Development',
    adminEnabled: adminPassword() !== null,
  };
}
