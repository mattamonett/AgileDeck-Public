import { isSeasonalThrowable } from '../../src/seasons/seasonal';

describe('seasonal throwables', () => {
  it('recognises every seasonal throwable', () => {
    expect(isSeasonalThrowable('🧛')).toBe(true);
    expect(isSeasonalThrowable('🦃')).toBe(true);
    expect(isSeasonalThrowable('🎅')).toBe(true);
    expect(isSeasonalThrowable('🍅')).toBe(false);
  });
});
