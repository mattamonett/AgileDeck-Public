import {
  ALL_EMOJIS_WITH_TAGS,
  BASIC_THROWABLE_EMOJIS,
  TOP_PROJECTILES,
  VEGAS_PROJECTILES,
} from '../../src/throwables/catalog';

describe('throwable catalog', () => {
  it('defines available emojis and top projectiles', () => {
    expect(BASIC_THROWABLE_EMOJIS.length).toBeGreaterThan(0);
    expect(
      BASIC_THROWABLE_EMOJIS.every((emoji) => typeof emoji === 'string' && emoji.length > 0),
    ).toBe(true);

    const emojiSet = new Set(ALL_EMOJIS_WITH_TAGS.map((entry) => entry.char));
    expect(TOP_PROJECTILES.length).toBeGreaterThan(0);
    expect(TOP_PROJECTILES.every((emoji) => emojiSet.has(emoji))).toBe(true);
    expect(VEGAS_PROJECTILES).toEqual(['🎰', '💎', '🍒', '💰', '🎲']);
    expect(VEGAS_PROJECTILES.every((emoji) => emojiSet.has(emoji))).toBe(true);
  });

  it('associates tags with every emoji', () => {
    expect(ALL_EMOJIS_WITH_TAGS.length).toBeGreaterThan(0);
    for (const entry of ALL_EMOJIS_WITH_TAGS) {
      expect(typeof entry.char).toBe('string');
      expect(entry.char.length).toBeGreaterThan(0);
      expect(typeof entry.tags).toBe('string');
      expect(entry.tags.trim().split(/\s+/).length).toBeGreaterThan(1);
    }
  });
});
