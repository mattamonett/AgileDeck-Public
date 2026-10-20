import { resolveRoomMood, resolveRoomTheme, type RoomMood, type Theme } from '@poker/shared';
import { getSiteConfig } from '../../config/site-config';

/**
 * The mood column is free text in SQLite, and the operator may have removed a
 * mood since the room chose it. Either way the room reads as the site's default.
 */
export function parseRoomMood(value: string): RoomMood {
  return resolveRoomMood(value, getSiteConfig().content);
}

/** Themes follow the same rule as moods. */
export function parseRoomTheme(value: string): Theme {
  return resolveRoomTheme(value, getSiteConfig().content);
}
