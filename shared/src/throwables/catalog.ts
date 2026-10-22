import { CHRISTMAS_PROJECTILES } from '../seasons/christmas';
import { HALLOWEEN_PROJECTILES } from '../seasons/halloween';
import { THANKSGIVING_PROJECTILES } from '../seasons/thanksgiving';
import type { EmojiDefinition } from './emoji';

export const BASIC_THROWABLE_EMOJIS = [
  '👍',
  '❤️',
  '😂',
  '🎉',
  '😮',
  '🤔',
  '🔥',
  '☕',
] as const satisfies readonly string[];
export const TOP_PROJECTILES = ['🐶', '👽', '🐒', '🚀', '🦈'] as const satisfies readonly string[];
export const VEGAS_PROJECTILES = [
  '🎰',
  '💎',
  '🍒',
  '💰',
  '🎲',
] as const satisfies readonly string[];

/**
 * Every throwable the picker lists, in picker order. Add new throwables at the end of this
 * list (seasonal ones at the end of their season's list) with an `addedOn` date so the
 * picker shows them as new.
 */
export const ALL_EMOJIS_WITH_TAGS = [
  ...CHRISTMAS_PROJECTILES,
  ...THANKSGIVING_PROJECTILES,
  ...HALLOWEEN_PROJECTILES,
  { char: '🍅', tags: 'tomato food throw red' },
  { char: '💐', tags: 'flower gift love' },
  { char: '🍺', tags: 'beer drink alcohol party' },
  { char: '🥧', tags: 'pie food dessert' },
  { char: '💩', tags: 'poop piece dirt' },
  { char: '📄', tags: 'paper document note' },
  { char: '🚀', tags: 'rocket space fly' },
  { char: '💊', tags: 'laxative medicine pill diarrhea poop' },
  { char: '⭐', tags: 'star gold shine' },
  { char: '🔥', tags: 'fire hot flame' },
  { char: '💎', tags: 'diamond gem jewel' },
  { char: '🌈', tags: 'rainbow color sky' },
  { char: '🎈', tags: 'balloon party celebrate' },
  { char: '🍕', tags: 'pizza food cheese' },
  { char: '🍦', tags: 'ice cream food cold' },
  { char: '🍩', tags: 'donut food sweet' },
  { char: '🥑', tags: 'avocado food green' },
  { char: '🐱', tags: 'cat animal pet' },
  { char: '🐶', tags: 'dog animal pet' },
  { char: '🦄', tags: 'unicorn animal magic' },
  { char: '🦖', tags: 'dino animal dinosaur' },
  { char: '⚽', tags: 'soccer ball sport' },
  { char: '🎮', tags: 'game play console' },
  { char: '💡', tags: 'light idea bulb' },
  { char: '🔔', tags: 'bell alert sound' },
  { char: '❤️', tags: 'heart love red' },
  { char: '⚡', tags: 'thunder bolt flash' },
  { char: '🍀', tags: 'luck leaf green' },
  { char: '✨', tags: 'sparkles magic shine' },
  { char: '🎁', tags: 'gift present box' },
  { char: '🎂', tags: 'cake birthday food' },
  { char: '💣', tags: 'bomb explode weapon' },
  { char: '🧤', tags: 'gloves hand' },
  { char: '🎩', tags: 'hat fashion' },
  { char: '🌮', tags: 'taco food mex' },
  { char: '🕶️', tags: 'sunglasses glasses shades cool explode shatter' },
  { char: '🐒', tags: 'monkey animal poop throw splat' },
  { char: '🦈', tags: 'shark fish ocean swim bite attack' },
  {
    char: '🏎️',
    tags: 'racing car race driver crash wreck damage vehicle fast',
  },
  {
    char: '📐',
    tags: 'architect architecture whiteboard diagram control flow draw marker',
  },
  { char: '👶', tags: 'baby brent crawl cry crying tears diaper' },
  {
    char: '☮️',
    tags: 'hippie peace sign love daisy flower groovy sway tie dye',
  },
  {
    char: '👻',
    tags: 'ghost boo spooky scare scared haunt sheet run away',
  },
  {
    char: '🎺',
    tags: 'mellomary mello mary harlequin jester marching band mellophone brass horn music',
  },
  {
    char: '🥋',
    tags: 'slow mo showdown bullet time stick man men stickman kung fu karate fight agent tie dodge whoa',
  },
  {
    char: '🗑️',
    tags: 'dumpster fire trash garbage bin rubbish burn flames',
  },
  {
    char: '🤼',
    tags: 'the heel wrestler wrestling tackle tag orange jeans',
  },
  { char: '🐐', tags: 'goat herd animal horns king hill climb fight' },
  {
    char: '🪚',
    tags: 'chainsaw maniac saw hockey mask apron blood horror',
  },
  { char: '☠️', tags: 'grim reaper death skull sickle scythe blood slice' },
  { char: '🧟', tags: 'zombie undead monster bite grab blood flesh stumble' },
  { char: '🕊️', tags: 'po pigeon bird grey gray fly dive poop' },
  { char: '👽', tags: 'alien space probe extraterrestrial' },
  { char: '🛸', tags: 'ufo space alien' },
  { char: '🎰', tags: 'slot machine casino vegas' },
  { char: '🍒', tags: 'cherry fruit slot casino' },
  { char: '💰', tags: 'money bag casino jackpot' },
  { char: '🎲', tags: 'dice game casino vegas' },
] as const satisfies readonly EmojiDefinition[];

export const VALID_INTERACTION_CHARACTERS: ReadonlySet<string> = new Set<string>([
  ...BASIC_THROWABLE_EMOJIS,
  ...ALL_EMOJIS_WITH_TAGS.map((e) => e.char),
]);

/** Throwables that have been removed. Site settings may still name them, so they are accepted there and ignored. */
export const RETIRED_THROWABLES: ReadonlySet<string> = new Set<string>(['✋', '🇺🇸']);
