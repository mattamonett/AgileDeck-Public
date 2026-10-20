/**
 * ADMIN_PASSWORD turns on the admin page at /admin. Unset or empty leaves it
 * off; a value shorter than the minimum stops the API at startup, because the
 * password is the only thing between the public internet and the admin page.
 */
export const ADMIN_PASSWORD_MIN_LENGTH = 12;

/** The configured admin password, or null when the admin page is off. */
export function adminPassword(): string | null {
  const password = process.env.ADMIN_PASSWORD;
  return password && password.length >= ADMIN_PASSWORD_MIN_LENGTH ? password : null;
}

/** Refuses to start with a password that is set but too short to resist guessing. */
export function assertAdminPasswordConfigured(): void {
  const password = process.env.ADMIN_PASSWORD;
  if (password && password.length < ADMIN_PASSWORD_MIN_LENGTH)
    throw new Error(
      `ADMIN_PASSWORD must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters, or empty to turn the admin page off`,
    );
}
