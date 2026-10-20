import { isChristmasProjectile } from './christmas';
import { isHalloweenProjectile } from './halloween';
import { isThanksgivingProjectile } from './thanksgiving';

/** Halloween, Thanksgiving and Christmas throwables, which only appear in season. */
export function isSeasonalThrowable(char: string): boolean {
  return (
    isHalloweenProjectile(char) || isThanksgivingProjectile(char) || isChristmasProjectile(char)
  );
}
