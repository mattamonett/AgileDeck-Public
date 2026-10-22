import { CHRISTMAS_PROJECTILES } from '../../src/seasons/christmas';
import { HALLOWEEN_PROJECTILES } from '../../src/seasons/halloween';
import { isSeasonalThrowable } from '../../src/seasons/seasonal';
import { THANKSGIVING_PROJECTILES } from '../../src/seasons/thanksgiving';
import {
  ALL_EMOJIS_WITH_TAGS,
  BASIC_THROWABLE_EMOJIS,
  TOP_PROJECTILES,
  VEGAS_PROJECTILES,
} from '../../src/throwables/catalog';
import { throwableAddedAt, type EmojiDefinition } from '../../src/throwables/emoji';

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

  it.each<[string, readonly EmojiDefinition[]]>([
    ['year-round', ALL_EMOJIS_WITH_TAGS.filter(({ char }) => !isSeasonalThrowable(char))],
    ['Christmas', CHRISTMAS_PROJECTILES],
    ['Thanksgiving', THANKSGIVING_PROJECTILES],
    ['Halloween', HALLOWEEN_PROJECTILES],
  ])('adds %s throwables at the end of their list, oldest first', (_list, entries) => {
    const dated = entries.filter((entry) => entry.addedOn !== undefined);
    expect(dated.filter((entry) => throwableAddedAt(entry) === null)).toEqual([]);

    const firstDated = entries.findIndex((entry) => entry.addedOn !== undefined);
    const tail = firstDated === -1 ? [] : entries.slice(firstDated);
    expect(tail).toEqual(dated);
    const releaseDates = dated.map((entry) => entry.addedOn);
    expect(releaseDates).toEqual([...releaseDates].sort());
  });
});
