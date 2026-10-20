import { HALLOWEEN_PROJECTILES, isHalloweenSeason } from '../../src/seasons/halloween';
import { isInteractionCharacterAvailable } from '../../src/throwables/moderation';

describe('October throwables', () => {
  it.each([
    ['2026-09-30T23:59:59.999Z', false],
    ['2026-10-01T00:00:00.000Z', true],
    ['2026-10-31T23:59:59.999Z', true],
    ['2026-11-01T00:00:00.000Z', false],
    ['2027-10-01T00:00:00.000Z', true],
    ['2026-09-30T20:00:00-07:00', true],
  ])('uses the recurring UTC window at %s', (date, active) => {
    expect(isHalloweenSeason(new Date(date))).toBe(active);
    for (const { char } of HALLOWEEN_PROJECTILES) {
      expect(isInteractionCharacterAvailable(char, new Date(date))).toBe(active);
    }
    expect(isInteractionCharacterAvailable('🧟', new Date(date))).toBe(true);
  });

  it('rejects unknown characters and invalid dates', () => {
    expect(isInteractionCharacterAvailable('unknown', new Date('2026-10-15'))).toBe(false);
    expect(isHalloweenSeason(new Date('invalid'))).toBe(false);
  });
});

it('uses the current server date when no date is supplied', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-15T12:00:00Z'));
  try {
    expect(isHalloweenSeason()).toBe(true);
    expect(isInteractionCharacterAvailable('🎃')).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});
