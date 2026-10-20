import { CHRISTMAS_PROJECTILES, isChristmasSeason } from '../../src/seasons/christmas';
import { ALL_EMOJIS_WITH_TAGS } from '../../src/throwables/catalog';
import { isInteractionCharacterAvailable } from '../../src/throwables/moderation';

describe('Christmas availability', () => {
  it.each([
    ['2026-11-30T23:59:59.999Z', false],
    ['2026-12-01T00:00:00Z', true],
    ['2026-12-31T23:59:59.999Z', true],
    ['2027-01-01T00:00:00Z', false],
    ['2027-12-15T12:00:00Z', true],
    ['2026-11-30T20:00:00-07:00', true],
  ])('uses the recurring December UTC window at %s', (date, active) => {
    for (const { char } of CHRISTMAS_PROJECTILES)
      expect(isInteractionCharacterAvailable(char, new Date(date))).toBe(active);
    expect(isChristmasSeason(new Date(date))).toBe(active);
    expect(isInteractionCharacterAvailable('🥧', new Date(date))).toBe(true);
  });
  it('keeps other seasons closed in December and rejects unknown characters', () => {
    const date = new Date('2026-12-15');
    expect(isInteractionCharacterAvailable('🎃', date)).toBe(false);
    expect(isInteractionCharacterAvailable('🦃', date)).toBe(false);
    expect(isInteractionCharacterAvailable('unknown', date)).toBe(false);
    expect(new Set(ALL_EMOJIS_WITH_TAGS.map(({ char }) => char)).size).toBe(
      ALL_EMOJIS_WITH_TAGS.length,
    );
  });
  it('defaults to the server clock', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-12-15'));
    try {
      expect(isChristmasSeason()).toBe(true);
      expect(isInteractionCharacterAvailable('🎅')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
