/** A saved preference, or null when none is saved or storage is unavailable. */
export function readLocalPreference(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Saves a preference when storage allows; without storage it still applies for this visit. */
export function writeLocalPreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage is blocked or full; the in-memory value is still used.
  }
}
