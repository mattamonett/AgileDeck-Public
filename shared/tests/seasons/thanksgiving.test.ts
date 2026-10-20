import { THANKSGIVING_PROJECTILES, isThanksgivingSeason } from '../../src/seasons/thanksgiving';
import { ALL_EMOJIS_WITH_TAGS } from '../../src/throwables/catalog';
import { isInteractionCharacterAvailable } from '../../src/throwables/moderation';

describe('Thanksgiving availability', () => {
  it.each([
    ['2026-10-31T23:59:59.999Z', false],
    ['2026-11-01T00:00:00Z', true],
    ['2026-11-30T23:59:59.999Z', true],
    ['2026-12-01T00:00:00Z', false],
    ['2027-11-15T12:00:00Z', true],
    ['2026-10-31T20:00:00-07:00', true],
  ])('uses the recurring November UTC window at %s', (date, active) => {
    for (const { char } of THANKSGIVING_PROJECTILES)
      expect(isInteractionCharacterAvailable(char, new Date(date))).toBe(active);
    expect(isThanksgivingSeason(new Date(date))).toBe(active);
    expect(isInteractionCharacterAvailable('🥧', new Date(date))).toBe(true);
  });
  it('keeps other seasons closed in November and rejects unknown characters', () => {
    const date = new Date('2026-11-15');
    expect(isInteractionCharacterAvailable('🎃', date)).toBe(false);
    expect(isInteractionCharacterAvailable('unknown', date)).toBe(false);
    expect(new Set(ALL_EMOJIS_WITH_TAGS.map(({ char }) => char)).size).toBe(
      ALL_EMOJIS_WITH_TAGS.length,
    );
  });
  it('defaults to the server clock', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-15'));
    try {
      expect(isThanksgivingSeason()).toBe(true);
      expect(isInteractionCharacterAvailable('🦃')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
