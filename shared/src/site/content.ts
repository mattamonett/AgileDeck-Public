import { RoomMoodSchema, type RoomMood } from '../room/mood';
import { isSeasonalThrowable } from '../seasons/seasonal';
import { Theme } from '../themes';
import { VALID_INTERACTION_CHARACTERS } from '../throwables/catalog';
import {
  isInteractionCharacterAvailable,
  isThrowableAllowedInMood,
} from '../throwables/moderation';

/**
 * The operator's `content` settings from config/site.json. Both the full and
 * the public site config satisfy this, so the API and the browser apply the
 * same rules.
 */
export interface ContentSettings {
  readonly moods: readonly RoomMood[];
  readonly defaultMood: RoomMood;
  readonly throwables: boolean;
  readonly blockedThrowables: readonly string[];
  readonly seasonalThrowables: boolean;
  readonly themes: readonly Theme[];
  readonly defaultTheme: Theme;
}

const THEME_IDS: ReadonlySet<string> = new Set<string>(Object.values(Theme));

function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && THEME_IDS.has(value);
}

export function isMoodAllowed(mood: RoomMood, content: ContentSettings): boolean {
  return content.moods.includes(mood);
}

/**
 * A stored mood the operator no longer allows (or one that is not a mood at
 * all) reads as the site's default mood, so a room never shows a choice its
 * settings panel cannot offer.
 */
export function resolveRoomMood(value: unknown, content: ContentSettings): RoomMood {
  const parsed = RoomMoodSchema.safeParse(value);
  return parsed.success && isMoodAllowed(parsed.data, content) ? parsed.data : content.defaultMood;
}

export function isThemeAllowed(theme: Theme, content: ContentSettings): boolean {
  return content.themes.includes(theme);
}

/** Same rule as moods: an unknown or no longer allowed theme reads as the default. */
export function resolveRoomTheme(value: unknown, content: ContentSettings): Theme {
  return isTheme(value) && isThemeAllowed(value, content) ? value : content.defaultTheme;
}

/**
 * Whether the operator's settings and the room's mood allow this throwable,
 * ignoring the calendar. Browsers combine this with the server's view of which
 * seasons are open; the server uses {@link isThrowableAllowed}.
 */
export function isThrowablePermitted(
  char: string,
  mood: RoomMood,
  content: ContentSettings,
): boolean {
  return (
    content.throwables &&
    VALID_INTERACTION_CHARACTERS.has(char) &&
    !content.blockedThrowables.includes(char) &&
    (content.seasonalThrowables || !isSeasonalThrowable(char)) &&
    isThrowableAllowedInMood(char, mood)
  );
}

/** The full rule: operator settings, room mood, and seasonal availability today. */
export function isThrowableAllowed(
  char: string,
  mood: RoomMood,
  content: ContentSettings,
  now = new Date(),
): boolean {
  return isThrowablePermitted(char, mood, content) && isInteractionCharacterAvailable(char, now);
}
