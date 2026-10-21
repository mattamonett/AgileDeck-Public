import {
  isSeasonalTheme,
  isThemeInSeason,
  SeasonalThemeAvailabilitySchema,
  seasonalThemesInSeason,
} from '../../src/seasons/seasonal-themes';
import { Theme } from '../../src/themes';

describe('seasonal themes', () => {
  it('limits Harvest Table to November and keeps every other theme all year', () => {
    expect(isSeasonalTheme(Theme.HARVEST)).toBe(true);
    expect(isSeasonalTheme(Theme.GRAVEYARD)).toBe(false);
    expect(isThemeInSeason(Theme.HARVEST, new Date('2026-11-01T00:00:00Z'))).toBe(true);
    expect(isThemeInSeason(Theme.HARVEST, new Date('2026-11-30T23:59:59Z'))).toBe(true);
    expect(isThemeInSeason(Theme.HARVEST, new Date('2026-10-31T23:59:59Z'))).toBe(false);
    expect(isThemeInSeason(Theme.HARVEST, new Date('2026-12-01T00:00:00Z'))).toBe(false);
    expect(isThemeInSeason(Theme.SPACE, new Date('2026-03-15T12:00:00Z'))).toBe(true);
  });

  it('lists the seasonal themes open today', () => {
    expect(seasonalThemesInSeason(new Date('2026-11-20T12:00:00Z'))).toEqual([Theme.HARVEST]);
    expect(seasonalThemesInSeason(new Date('2026-03-15T12:00:00Z'))).toEqual([]);
  });

  it('checks against today by default', () => {
    jest.useFakeTimers({ now: new Date('2026-11-20T12:00:00Z') });
    try {
      expect(isThemeInSeason(Theme.HARVEST)).toBe(true);
      expect(seasonalThemesInSeason()).toEqual([Theme.HARVEST]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('parses the availability payload', () => {
    expect(SeasonalThemeAvailabilitySchema.safeParse({ seasonalThemes: ['harvest'] }).success).toBe(
      true,
    );
    expect(SeasonalThemeAvailabilitySchema.safeParse({ seasonalThemes: ['neon'] }).success).toBe(
      false,
    );
  });
});
