import type { RoomMood } from '../room/mood';
import { isChristmasProjectile, isChristmasSeason } from '../seasons/christmas';
import { isHalloweenProjectile, isHalloweenSeason } from '../seasons/halloween';
import { isThanksgivingProjectile, isThanksgivingSeason } from '../seasons/thanksgiving';
import { VALID_INTERACTION_CHARACTERS } from './catalog';

/** Throwables a Friendly room hides: crude, violent, bloody or political ones. */
export const ROUGH_THROWABLES: ReadonlySet<string> = new Set<string>([
  '💩',
  '💊',
  '🍺',
  '💣',
  '🐒',
  '🕊️',
  '🦈',
  '🤼',
  '🪚',
  '☠️',
  '🧟',
  '🧛',
]);

export function isThrowableAllowedInMood(char: string, mood: RoomMood): boolean {
  return mood !== 'friendly' || !ROUGH_THROWABLES.has(char);
}

export function isInteractionCharacterAvailable(value: string, now = new Date()): boolean {
  return (
    VALID_INTERACTION_CHARACTERS.has(value) &&
    (!isHalloweenProjectile(value) || isHalloweenSeason(now)) &&
    (!isThanksgivingProjectile(value) || isThanksgivingSeason(now)) &&
    (!isChristmasProjectile(value) || isChristmasSeason(now))
  );
}
