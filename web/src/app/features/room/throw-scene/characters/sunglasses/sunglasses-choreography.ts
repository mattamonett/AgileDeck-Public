import { ease } from '../../kit';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { evenPath, lingeringProgress } from '../../flight/approach-flow';

export const SUNGLASSES_DURATION = 5200;
export const SUNGLASSES_SCALE = 0.8;
export const shadesEase = ease;
export interface SunglassesPlan {
  readonly pace: number;
  readonly side: number;
  readonly bend: number;
  readonly pause: number;
  readonly hit: number;
  readonly force: number;
  readonly burn: number;
  readonly wind: number;
  readonly bilateral: boolean;
  readonly bronze: boolean;
  readonly phase: number;
}
export function sunglassesPlan(id: string): SunglassesPlan {
  const r = seededRandom(id + ':too-cool');
  return {
    pace: 0.92 + r() * 0.16,
    side: r() < 0.5 ? 1 : -1,
    bend: 35 + r() * 45,
    pause: 0.06 + r() * 0.055,
    hit: 560 + r() * 130,
    force: 0.9 + r() * 0.25,
    burn: 1500 + r() * 300,
    wind: 8 + r() * 15,
    bilateral: r() < 0.5,
    bronze: r() < 0.35,
    phase: r() * Math.PI * 2,
  };
}
export function sunglassesLandingPoint(b: TargetBounds): Point {
  return { x: b.left + b.width / 2, y: b.top + b.height * 0.28 };
}
function sunglassesArc(p: SunglassesPlan, start: Point, end: Point, view: Point, q: number): Point {
  const v = 1 - q,
    sky = Math.max(32, Math.min(start.y, end.y) - p.bend);
  return {
    x:
      v ** 3 * start.x +
      3 * v * v * q * Math.max(30, Math.min(view.x - 30, start.x + p.side * p.bend)) +
      3 * v * q * q * (end.x - p.side * 28) +
      q ** 3 * end.x,
    y: v ** 3 * start.y + 3 * v * v * q * sky + 3 * v * q * q * sky + q ** 3 * end.y,
  };
}
export function sunglassesApproach(
  p: SunglassesPlan,
  start: Point,
  end: Point,
  view: Point,
  t: number,
): Point {
  return evenPath(
    (q) => sunglassesArc(p, start, end, view, q),
    lingeringProgress(t, 0.64, 0.78, p.pause),
  );
}
export function sunglassesCardPose(p: SunglassesPlan, ms: number) {
  const age = ms - p.hit;
  if (age <= 0 || age >= 3600) return { x: 0, y: 0, angle: 0 };
  const kick = age < 500 ? Math.sin((age / 500) * Math.PI) * Math.exp(-age / 260) * p.force : 0;
  const heat = shadesEase(age / 350) * (1 - shadesEase((age - p.burn) / 900));
  return {
    x: p.side * kick * 5,
    y: kick * 5,
    angle: p.side * kick * 5 + Math.sin(age / 120 + p.phase) * heat * 0.45,
  };
}
export function sunglassesCardPoint(
  p: SunglassesPlan,
  ms: number,
  raw: Point,
  b: TargetBounds,
): Point {
  const pose = sunglassesCardPose(p, ms),
    a = (pose.angle * Math.PI) / 180;
  const x = raw.x - b.left - b.width / 2,
    y = raw.y - b.top - b.height / 2;
  return {
    x: b.left + b.width / 2 + x * Math.cos(a) - y * Math.sin(a) + pose.x,
    y: b.top + b.height / 2 + x * Math.sin(a) + y * Math.cos(a) + pose.y,
  };
}
export function sunglassesFrames(p: SunglassesPlan) {
  const frames: Keyframe[] = [];
  for (let ms = 0; ms <= SUNGLASSES_DURATION; ms += 20) {
    const q = sunglassesCardPose(p, ms);
    frames.push({
      offset: ms / SUNGLASSES_DURATION,
      translate: q.x || q.y ? `${q.x}px ${q.y}px` : '0 0',
      rotate: `${q.angle}deg`,
    });
  }
  return { frames, options: { duration: SUNGLASSES_DURATION * p.pace, easing: 'linear' } };
}
