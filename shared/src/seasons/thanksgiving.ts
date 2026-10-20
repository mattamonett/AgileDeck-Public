import { z } from 'zod';
import type { EmojiDefinition } from '../throwables/emoji';

export const THANKSGIVING_PROJECTILES = [
  {
    char: '🦃',
    tags: 'wild turkey strut feather peck thanksgiving november limited',
  },
  {
    char: '🥷',
    tags: 'clumsy pie chef baker pumpkin cream thanksgiving november limited',
  },
  {
    char: '🫗',
    tags: 'gravy boat captain chef roll spill thanksgiving november limited',
  },
  {
    char: '🌽',
    tags: 'sleepy scarecrow crow hat straw thanksgiving november limited',
  },
  {
    char: '🐻',
    tags: 'hungry bear pie pawprint sleep thanksgiving november limited',
  },
  {
    char: '🐿️',
    tags: 'acorn hoarder squirrel stash spill thanksgiving november limited',
  },
] as const satisfies readonly EmojiDefinition[];

export type ThanksgivingProjectile = (typeof THANKSGIVING_PROJECTILES)[number]['char'];

export function isThanksgivingProjectile(value: string): value is ThanksgivingProjectile {
  return THANKSGIVING_PROJECTILES.some(({ char }) => char === value);
}

/** Recurs each November, using the same UTC boundary as Halloween. */
export function isThanksgivingSeason(now = new Date()): boolean {
  return now.getUTCMonth() === 10;
}

export const ThanksgivingAvailabilitySchema = z.object({
  thanksgivingAvailable: z.boolean(),
});
