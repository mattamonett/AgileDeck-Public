export const NAME_TAKEN_MESSAGE =
  'Someone in this room already uses that name. Choose a different name.';
export const NAME_TAKEN_JOIN_MESSAGE =
  'Someone in this room already uses that name. Choose a different name to join.';

/** Display names that differ only by case or spacing would let one member pass as another. */
export function roomNameKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '');
}
