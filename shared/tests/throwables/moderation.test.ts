import { ALL_EMOJIS_WITH_TAGS } from '../../src/throwables/catalog';
import { ROUGH_THROWABLES, isThrowableAllowedInMood } from '../../src/throwables/moderation';

describe('throwable moderation', () => {
  it('hides only catalog throwables marked rough, and only in Friendly rooms', () => {
    const catalog = new Set<string>(ALL_EMOJIS_WITH_TAGS.map((e) => e.char));
    for (const char of ROUGH_THROWABLES) {
      expect(catalog.has(char)).toBe(true);
      expect(isThrowableAllowedInMood(char, 'friendly')).toBe(false);
      expect(isThrowableAllowedInMood(char, 'playful')).toBe(true);
      expect(isThrowableAllowedInMood(char, 'spicy')).toBe(true);
    }
    expect(isThrowableAllowedInMood('📄', 'friendly')).toBe(true);
    expect(isThrowableAllowedInMood('🍅', 'friendly')).toBe(true);
  });
});
