import { z } from 'zod';
import type { EmojiDefinition } from '../throwables/emoji';

export const HALLOWEEN_PROJECTILES = [
  { char: '🤕', tags: 'mummy bandage wrap halloween october limited' },
  { char: '🧛', tags: 'vampire bat bite blood halloween october limited' },
  { char: '🧙', tags: 'witch broom potion frog halloween october limited' },
  {
    char: '🪆',
    tags: 'possessed doll haunted levitate halloween october limited',
  },
  {
    char: '🕷️',
    tags: 'giant spider web silk cocoon halloween october limited',
  },
  {
    char: '🎃',
    tags: 'pumpkin monster seeds pulp bite halloween october limited',
  },
] as const satisfies readonly EmojiDefinition[];

export type HalloweenProjectile = (typeof HALLOWEEN_PROJECTILES)[number]['char'];

export function isHalloweenProjectile(value: string): value is HalloweenProjectile {
  return HALLOWEEN_PROJECTILES.some(({ char }) => char === value);
}

/** Recurs every year from October 1 00:00 UTC through October 31 23:59:59 UTC. */
export function isHalloweenSeason(now = new Date()): boolean {
  return now.getUTCMonth() === 9;
}

export const HalloweenAvailabilitySchema = z.object({
  halloweenAvailable: z.boolean(),
});
