import { Theme } from '@poker/shared';
import { setSiteConfig } from '../../../src/config/site-config';
import { seasonalThemeAvailability } from '../../../src/modules/rooms/room-appearance';

describe('seasonal theme availability', () => {
  afterEach(() => setSiteConfig());

  it('offers Harvest Table only in November', () => {
    expect(seasonalThemeAvailability(new Date('2026-11-20T12:00:00Z'))).toEqual({
      seasonalThemes: [Theme.HARVEST],
    });
    expect(seasonalThemeAvailability(new Date('2026-10-20T12:00:00Z'))).toEqual({
      seasonalThemes: [],
    });
  });

  it('leaves out a seasonal theme the operator removed', () => {
    setSiteConfig({ content: { themes: [Theme.GARDEN, Theme.SPACE] } });
    expect(seasonalThemeAvailability(new Date('2026-11-20T12:00:00Z'))).toEqual({
      seasonalThemes: [],
    });
  });
});
