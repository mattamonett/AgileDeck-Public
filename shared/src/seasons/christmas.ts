import { z } from 'zod';
import type { EmojiDefinition } from '../throwables/emoji';

export const CHRISTMAS_PROJECTILES = [
  { char: '🎅', tags: 'special delivery santa sack gift christmas december limited' },
  { char: '🦌', tags: 'rudy rooftop rookie reindeer antlers christmas december limited' },
  { char: '🧝', tags: 'tinsel gift wrapper elf ribbon bow christmas december limited' },
  { char: '⛄', tags: 'flurry snow sculptor snowman snow christmas december limited' },
  { char: '🍪', tags: 'ginger snap gingerbread cookie candy cane christmas december limited' },
] as const satisfies readonly EmojiDefinition[];

export type ChristmasProjectile = (typeof CHRISTMAS_PROJECTILES)[number]['char'];

export function isChristmasProjectile(value: string): value is ChristmasProjectile {
  return CHRISTMAS_PROJECTILES.some(({ char }) => char === value);
}

/** Recurs from December 1 00:00 UTC until January 1 00:00 UTC (exclusive). */
export function isChristmasSeason(now = new Date()): boolean {
  return now.getUTCMonth() === 11;
}

export const ChristmasAvailabilitySchema = z.object({
  christmasAvailable: z.boolean(),
});
