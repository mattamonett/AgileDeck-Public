/** Rooms without an explicit theme use the default garden look. */
export function isGardenTheme(theme: string | null | undefined): boolean {
  return !theme || theme === 'default';
}
