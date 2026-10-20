import {
  isChristmasSeason,
  isHalloweenSeason,
  isThanksgivingSeason,
  isThrowableAllowed,
  type RoomMood,
} from '@poker/shared';
import { getSiteConfig } from '../../config/site-config';

/** Seasons only open when the operator allows throwing and seasonal throwables. */
function seasonalThrowablesOn(): boolean {
  const { throwables, seasonalThrowables } = getSiteConfig().content;
  return throwables && seasonalThrowables;
}

export function halloweenAvailability(now = new Date()) {
  return {
    halloweenAvailable: seasonalThrowablesOn() && isHalloweenSeason(now),
  };
}

export function thanksgivingAvailability(now = new Date()) {
  return {
    thanksgivingAvailable: seasonalThrowablesOn() && isThanksgivingSeason(now),
  };
}

export function christmasAvailability(now = new Date()) {
  return {
    christmasAvailable: seasonalThrowablesOn() && isChristmasSeason(now),
  };
}

/** The operator's settings, the room's mood and today's seasons all allow it. */
export function isAvailableInteraction(value: string, mood: RoomMood, now = new Date()): boolean {
  return isThrowableAllowed(value, mood, getSiteConfig().content, now);
}
