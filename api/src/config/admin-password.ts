/**
 * ADMIN_PASSWORD turns on the admin page at /admin. Unset or empty leaves it
 * off; a weak value stops the API at startup, because the password is the
 * only thing between the public internet and the admin page.
 */
export const ADMIN_PASSWORD_MIN_LENGTH = 16;
// Catches repeated or patterned values such as "abababababababab".
const MIN_DISTINCT_CHARACTERS = 8;
// Fragments of the passwords people reach for first; a random value never trips these.
const COMMON_FRAGMENTS = [
  'password',
  'passw0rd',
  'admin',
  'qwerty',
  'letmein',
  'welcome',
  'changeme',
  '123456',
  'abcdef',
  'agiledeck',
  'poker',
] as const;

/** Why the password is too weak to guard the admin page, or null when it is fine. */
function adminPasswordWeakness(password: string): string | null {
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH)
    return `must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters`;
  if (new Set(password).size < MIN_DISTINCT_CHARACTERS)
    return `must use at least ${MIN_DISTINCT_CHARACTERS} different characters`;
  const lower = password.toLowerCase();
  const fragment = COMMON_FRAGMENTS.find((common) => lower.includes(common));
  if (fragment) return `must not contain a common word or sequence such as "${fragment}"`;
  return null;
}

/** The configured admin password, or null when the admin page is off. */
export function adminPassword(): string | null {
  const password = process.env.ADMIN_PASSWORD;
  return password && adminPasswordWeakness(password) === null ? password : null;
}

/** Refuses to start with a password that is set but too weak to resist guessing. */
export function assertAdminPasswordConfigured(): void {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return;
  const weakness = adminPasswordWeakness(password);
  if (weakness)
    throw new Error(
      `ADMIN_PASSWORD ${weakness}. Use a random value such as the output of "openssl rand -base64 24", or leave it empty to turn the admin page off`,
    );
}
