import { clamp } from '../kit';
import {
  isChristmasProjectile,
  type ChristmasProjectile,
  isThanksgivingProjectile,
  type ThanksgivingProjectile,
} from '@poker/shared';
import { isHalloweenProjectile, type HalloweenProjectile } from '@poker/shared';
import { seededRandom, type Point } from '../flight/flight-math';

export type LandingKind =
  | ChristmasProjectile
  | ThanksgivingProjectile
  | HalloweenProjectile
  | '🧟'
  | '🕊️'
  | '🪚'
  | '☠️'
  | '💊'
  | '🕶️'
  | '🦈'
  | '🦄'
  | '✋'
  | '🏎️'
  | '🇺🇸'
  | '📐'
  | '☮️'
  | '👻'
  | '🎺'
  | '🥋'
  | '🗑️'
  | '👶'
  | '🤼'
  | '🐐'
  | '👽'
  | '🛸'
  | '💣'
  | '💐'
  | '🥧'
  | '🎈'
  | '🎰'
  | '🎩'
  | '🐱'
  | '🐶'
  | '🦖'
  | '🚀'
  | '🍅'
  | '💰'
  | '❤️';
export function landingKind(emoji: string): LandingKind | null {
  if (isChristmasProjectile(emoji)) return emoji;
  if (isThanksgivingProjectile(emoji)) return emoji;
  if (isHalloweenProjectile(emoji)) return emoji;
  switch (emoji) {
    case '🧟':
    case '🕊️':
    case '🪚':
    case '☠️':
    case '💊':
    case '🕶️':
    case '🦈':
    case '🦄':
    case '✋':
    case '🏎️':
    case '🇺🇸':
    case '📐':
    case '☮️':
    case '👻':
    case '🎺':
    case '🥋':
    case '🗑️':
    case '👶':
    case '🤼':
    case '🐐':
    case '👽':
    case '🛸':
    case '💣':
    case '💐':
    case '🥧':
    case '🎈':
    case '🎰':
    case '🎩':
    case '🐱':
    case '🐶':
    case '🦖':
    case '🚀':
    case '🍅':
    case '💰':
    case '❤️':
      return emoji;
    default:
      return null;
  }
}
export interface TargetBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}
/** Sample once per network event, then retain the same relative spot during reflow. */
export function landingVariation(id: string): Point {
  const random = seededRandom(id + ':landing');
  return { x: random(), y: random() };
}

export function landingPoint(kind: LandingKind | null, b: TargetBounds, variation: Point): Point {
  const u = clamp(variation.x);
  const v = clamp(variation.y);
  const x = b.left + b.width * (0.12 + u * 0.76);
  switch (kind) {
    case '🕊️':
      return { x: b.left + b.width * (u < 0.5 ? 0.15 : 0.85), y: b.top };
    case '🪚':
    case '☠️': {
      // Keep the side and reachable slice location stable for the entire event.
      const gap = 22 + (u < 0.5 ? u * 2 : (u - 0.5) * 2) * 16;
      return {
        x: u < 0.5 ? b.left - gap : b.left + b.width + gap,
        y: b.top + b.height * (0.4 + v * 0.52),
      };
    }
    case '🏎️':
      return { x: u < 0.5 ? b.left - 42 : b.left + b.width + 42, y: b.top + b.height * 0.55 };
    case '🎅':
    case '🦌':
    case '🧝':
    case '⛄':
    case '🍪':
    case '🦃':
    case '🥷':
    case '🫗':
    case '🌽':
    case '🐻':
    case '🐿️':
    case '🤕':
    case '🧛':
    case '🪆':
    case '🧟':
    case '🦈':
    case '✋':
    case '🇺🇸':
    case '📐':
    case '👶':
    case '🤼':
    case '👽':
      return {
        x: u < 0.5 ? b.left - 27 : b.left + b.width + 27,
        y: b.top + b.height * 0.65,
      };
    case '🐐':
      return {
        x: u < 0.5 ? b.left - 27 : b.left + b.width + 27,
        y: b.top + b.height,
      };
    case '🎃':
    case '🦄':
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    case '🕷️':
    case '🧙':
      return { x: b.left + b.width / 2, y: Math.max(30, b.top - 45) };
    case '🛸':
      return { x, y: Math.max(28, b.top - 30 - v * 32) };
    case '🎈':
      return { x, y: Math.max(28, b.top - 24 - v * 28) };
    case '💐':
      return { x, y: b.top + b.height * (0.8 + v * 0.16) };
    case '🐶':
    case '🦖':
      return {
        x: b.left + b.width * (u < 0.5 ? 0.04 + u * 0.16 : 0.88 + (u - 0.5) * 0.16),
        y: b.top + b.height * (0.55 + v * 0.35),
      };
    case '🐱':
      return {
        x: b.left + b.width * (u < 0.5 ? 0.08 + u * 0.12 : 0.86 + (u - 0.5) * 0.12),
        y: b.top + b.height * (0.75 + v * 0.15),
      };
    case '💣':
      return { x, y: b.top + b.height * (0.55 + v * 0.36) };
    case '🎰':
    case '🎩':
      return { x, y: b.top + b.height * (0.7 + v * 0.2) };
    default:
      return { x, y: b.top + b.height * (0.22 + v * 0.6) };
  }
}
