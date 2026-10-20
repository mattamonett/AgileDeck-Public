import { z } from 'zod';
import { Theme } from '../themes';
import { isThanksgivingSeason } from './thanksgiving';

/**
 * Themes that can only be chosen in their season, keyed to the same calendar
 * check as that season's throwables. Every other theme is available all year.
 */
const THEME_SEASONS: Readonly<Partial<Record<Theme, (now: Date) => boolean>>> = {
  [Theme.HARVEST]: isThanksgivingSeason,
};

export function isSeasonalTheme(theme: Theme): boolean {
  return THEME_SEASONS[theme] !== undefined;
}

export function isThemeInSeason(theme: Theme, now = new Date()): boolean {
  return THEME_SEASONS[theme]?.(now) ?? true;
}

/** The seasonal themes that can be chosen right now. */
export function seasonalThemesInSeason(now = new Date()): Theme[] {
  return Object.values(Theme).filter(
    (theme) => isSeasonalTheme(theme) && isThemeInSeason(theme, now),
  );
}

export const SeasonalThemeAvailabilitySchema = z.object({
  seasonalThemes: z.array(z.enum(Theme)),
});
