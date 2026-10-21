import {
  resolveRoomMood,
  resolveRoomTheme,
  seasonalThemesInSeason,
  type RoomMood,
  type Theme,
} from '@poker/shared';
import { getSiteConfig } from '../../config/site-config';

/**
 * The mood column is free text in SQLite, and the operator may have removed a
 * mood since the room chose it. Either way the room reads as the site's default.
 */
export function parseRoomMood(value: string): RoomMood {
  return resolveRoomMood(value, getSiteConfig().content);
}

/** Themes follow the same rule as moods, and a seasonal theme also ends with its season. */
export function parseRoomTheme(value: string, now = new Date()): Theme {
  return resolveRoomTheme(value, getSiteConfig().content, now);
}

/** The seasonal themes this site offers that are in season today. */
export function seasonalThemeAvailability(now = new Date()) {
  const { themes } = getSiteConfig().content;
  return {
    seasonalThemes: seasonalThemesInSeason(now).filter((theme) => themes.includes(theme)),
  };
}
