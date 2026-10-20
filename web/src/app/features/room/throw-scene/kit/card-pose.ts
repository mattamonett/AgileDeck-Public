import type { Point } from '../flight/flight-math';
import type { TargetBounds } from '../landing/landing-geometry';

/** Cosmetic card pose using the independent translate/rotate/scale properties, about the card centre. */
export interface CardPose {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly sx: number;
  readonly sy: number;
}
export const NEUTRAL_CARD: CardPose = { x: 0, y: 0, angle: 0, sx: 1, sy: 1 };

export function cardPoint(q: CardPose, raw: Point, b: TargetBounds): Point {
  const a = (q.angle * Math.PI) / 180;
  const x = (raw.x - b.left - b.width / 2) * q.sx,
    y = (raw.y - b.top - b.height / 2) * q.sy;
  return {
    x: b.left + b.width / 2 + x * Math.cos(a) - y * Math.sin(a) + q.x,
    y: b.top + b.height / 2 + x * Math.sin(a) + y * Math.cos(a) + q.y,
  };
}
/** A point on the live card from normalized coordinates (u across, v down). */
export function onCard(q: CardPose, u: number, v: number, b: TargetBounds): Point {
  return cardPoint(q, { x: b.left + b.width * u, y: b.top + b.height * v }, b);
}
/** Three.js z rotation that matches the card's screen rotation. */
export const cardTurn = (q: CardPose) => (-q.angle * Math.PI) / 180;

export function cardFrames(duration: number, pace: number, pose: (ms: number) => CardPose) {
  const frames: Keyframe[] = [];
  for (let ms = 0; ms <= duration; ms += 20) {
    const q = ms + 20 > duration ? NEUTRAL_CARD : pose(ms);
    frames.push({
      offset: ms / duration,
      translate: `${q.x}px ${q.y}px`,
      rotate: `${q.angle}deg`,
      scale: `${q.sx} ${q.sy}`,
    });
  }
  const last = frames.at(-1);
  if (last?.offset !== 1)
    frames.push({ offset: 1, translate: '0px 0px', rotate: '0deg', scale: '1 1' });
  return { frames, options: { duration: duration * pace, easing: 'linear' } };
}

/** Fits actors to the current card size so contact geometry reads on both card sizes. */
export const cardFit = (b: TargetBounds) => Math.max(0.72, Math.min(1, b.height / 122));
