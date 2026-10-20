import { ease } from '../../kit';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';

export const TOMATO_DURATION = 7600,
  TOMATO_SCALE = 0.9,
  TOMATO_RADIUS = 14,
  TOMATO_DEPTH = 172;
export const tomatoEase = ease;
export interface TomatoPlan {
  readonly pace: number;
  readonly side: number;
  readonly travel: number;
  readonly loft: number;
  readonly turns: number;
  readonly spot: number;
  readonly force: number;
  readonly phase: number;
  readonly peelDelay: number;
  readonly sticky: boolean;
  readonly cleanup: number;
  readonly runoff: number;
}
export function tomatoPlan(id: string): TomatoPlan {
  const r = seededRandom(id + ':heckle');
  return {
    pace: 0.93 + r() * 0.14,
    side: r() < 0.5 ? -1 : 1,
    travel: 1100 + r() * 350,
    loft: 28 + r() * 26,
    turns: 1 + Math.floor(r() * 2),
    spot: 0.19 + r() * 0.16,
    force: 0.85 + r() * 0.3,
    phase: r() * Math.PI * 2,
    peelDelay: 800 + r() * 600,
    sticky: r() < 0.5,
    cleanup: 6100 + r() * 300,
    runoff: 1200 + r() * 600,
  };
}
export function tomatoContact(p: TomatoPlan, b: TargetBounds): Point {
  return { x: b.left + b.width * (p.side > 0 ? 0.24 : 0.76), y: b.top + b.height * p.spot };
}
export function tomatoCardPose(p: TomatoPlan, ms: number) {
  const age = ms - p.travel,
    pulse =
      age > 0
        ? Math.sin((age / 105) * Math.PI) *
          Math.exp(-age / 170) *
          (1 - tomatoEase((age - 550) / 150))
        : 0;
  return {
    x: p.side * pulse * 5 * p.force,
    y: pulse * 2 * p.force,
    angle: p.side * pulse * 2.8 * p.force,
    sx: 1 + pulse * 0.025 * p.force,
  };
}
export function tomatoCardPoint(p: TomatoPlan, ms: number, raw: Point, b: TargetBounds): Point {
  const q = tomatoCardPose(p, ms),
    a = (q.angle * Math.PI) / 180;
  const x = (raw.x - b.left - b.width / 2) * q.sx,
    y = raw.y - b.top - b.height / 2;
  return {
    x: b.left + b.width / 2 + x * Math.cos(a) - y * Math.sin(a) + q.x,
    y: b.top + b.height / 2 + x * Math.sin(a) + y * Math.cos(a) + q.y,
  };
}
export function tomatoApproach(
  p: TomatoPlan,
  ms: number,
  start: Point,
  b: TargetBounds,
  view: Point,
) {
  const t = Math.max(0, Math.min(1, ms / p.travel)),
    end = tomatoContact(p, b);
  // A weighty lob accelerates out of the crest and curls into the chosen side.
  const q = 0.35 * t + 0.65 * t * t,
    room = Math.max(0, Math.min(end.x - 20, view.x - 20 - end.x));
  const c1 = start.x + (end.x - start.x) * 0.3,
    c2 = end.x - p.side * Math.min(room, 45);
  const loft = Math.min(p.loft, Math.max(0, Math.min(start.y, end.y) - 64));
  return {
    x:
      (1 - q) ** 3 * start.x +
      3 * (1 - q) ** 2 * q * c1 +
      3 * (1 - q) * q * q * c2 +
      q ** 3 * end.x,
    y: start.y + (end.y - start.y) * q - Math.sin(Math.PI * t) * loft,
    spin: p.side * p.turns * Math.PI * 2 * (1 - tomatoEase(t)),
    depth: TOMATO_DEPTH + TOMATO_RADIUS * TOMATO_SCALE + 30 * Math.sin(Math.PI * t),
  };
}
export function tomatoCompression(p: TomatoPlan, ms: number) {
  const q = tomatoEase((ms - p.travel) / 120);
  return { x: 1 + q * 0.35, y: 0.87 * (1 - q * 0.15), z: 1 - q * 0.82 };
}
export function tomatoFrames(p: TomatoPlan) {
  const frames: Keyframe[] = [];
  for (let ms = 0; ms <= TOMATO_DURATION; ms += 20) {
    const q = tomatoCardPose(p, ms);
    frames.push({
      offset: ms / TOMATO_DURATION,
      translate: `${q.x}px ${q.y}px`,
      rotate: `${q.angle}deg`,
      scale: `${q.sx} 1`,
    });
  }
  return { frames, options: { duration: TOMATO_DURATION * p.pace, easing: 'linear' } };
}
