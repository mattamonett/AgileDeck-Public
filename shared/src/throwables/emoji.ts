/** A throwable character and the words the emoji picker searches it by. */
export interface EmojiDefinition {
  char: string;
  tags: string;
  /** UTC release date as `YYYY-MM-DD`. The picker marks the throwable as new for {@link NEW_THROWABLE_DAYS} days after it. */
  addedOn?: string;
}

export const NEW_THROWABLE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const ADDED_ON_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The release date as a UTC midnight timestamp, or null when it is missing or not a real date. */
export function throwableAddedAt(definition: EmojiDefinition): number | null {
  const { addedOn } = definition;
  if (addedOn === undefined || !ADDED_ON_PATTERN.test(addedOn)) return null;
  const time = Date.parse(`${addedOn}T00:00:00Z`);
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== addedOn) return null;
  return time;
}

/** True from the release date until {@link NEW_THROWABLE_DAYS} days after it. */
export function isNewThrowable(definition: EmojiDefinition, now = new Date()): boolean {
  const addedAt = throwableAddedAt(definition);
  if (addedAt === null) return false;
  const elapsed = now.getTime() - addedAt;
  return elapsed >= 0 && elapsed < NEW_THROWABLE_DAYS * DAY_MS;
}
