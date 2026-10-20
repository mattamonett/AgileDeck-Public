import { ease } from '../../kit';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { evenPath, lingeringProgress } from '../../flight/approach-flow';

export const HEART_SCALE = 0.85;
export const HEART_DEPTH = 172 - 3.1 * HEART_SCALE;
export const HEART_DURATION = 7400;
export const heartEase = ease;
export interface HeartPlan {
  readonly pace: number;
  readonly side: number;
  readonly travel: number;
  readonly hit: number;
  readonly rise: number;
  readonly bend: number;
  readonly pause: number;
  readonly beat: number;
  readonly phase: number;
  readonly split: number;
  readonly drop: number;
  readonly spread: number;
  readonly force: number;
  readonly spin: number;
  readonly bounce: number;
  readonly stubborn: boolean;
  readonly cleanup: number;
}
export function heartPlan(id: string): HeartPlan {
  const r = seededRandom(id + ':hopeful-heart'),
    travel = 1400 + r() * 300;
  const hit = travel + 250 + r() * 80,
    split = 290 + r() * 100;
  const drop = hit + split + 300 + r() * 160;
  return {
    pace: 0.94 + r() * 0.12,
    side: r() < 0.5 ? -1 : 1,
    travel,
    hit,
    rise: 55 + r() * 40,
    bend: 30 + r() * 30,
    pause: 0.055 + r() * 0.045,
    beat: 370 + r() * 100,
    phase: r() * Math.PI * 2,
    split,
    drop,
    spread: 22 + r() * 8,
    force: 0.85 + r() * 0.25,
    spin: 0.6 + r() * 0.3,
    bounce: 0.2 + r() * 0.06,
    stubborn: r() < 0.5,
    cleanup: drop + 2600 + r() * 180,
  };
}
export function heartContact(b: TargetBounds): Point {
  return { x: b.left + b.width / 2, y: b.top + b.height * 0.38 };
}
export function heartLandingPoint(b: TargetBounds): Point {
  const tip = heartContact(b);
  return { x: tip.x, y: tip.y - 19 * HEART_SCALE };
}
export function heartProgress(p: HeartPlan, ms: number) {
  // The hopeful hesitation is a shy, slow float toward the card, never a hang in mid-air.
  return lingeringProgress(ms / p.travel, 0.62, 0.8, p.pause);
}
function heartArc(p: HeartPlan, start: Point, end: Point, view: Point, t: number): Point {
  const q = 1 - t,
    sky = Math.max(35, Math.min(start.y, end.y) - p.rise);
  const c1 = Math.max(28, Math.min(view.x - 28, start.x + p.side * p.bend));
  const c2 = Math.max(24, Math.min(view.x - 24, end.x - p.side * 35));
  return {
    x: q ** 3 * start.x + 3 * q * q * t * c1 + 3 * q * t * t * c2 + t ** 3 * end.x,
    y: q ** 3 * start.y + 3 * q * q * t * sky + 3 * q * t * t * sky + t ** 3 * (end.y - 12),
  };
}
export function heartApproach(
  p: HeartPlan,
  start: Point,
  end: Point,
  view: Point,
  ms: number,
): Point {
  return evenPath((t) => heartArc(p, start, end, view, t), heartProgress(p, ms));
}
export function heartCardPose(p: HeartPlan, ms: number) {
  const age = ms - p.hit;
  if (age <= 0 || ms >= p.drop + 1700) return { x: 0, y: 0, angle: 0 };
  const bump =
    age > 0 && age < 420 ? Math.sin((age / 420) * Math.PI) * Math.exp(-age / 270) * p.force : 0;
  const droop = heartEase((age - p.split) / 400) * (1 - heartEase((ms - p.drop - 650) / 1050));
  return {
    x: p.side * bump * 2,
    y: bump * 4 + droop * 3 * p.force,
    angle: p.side * (bump * 2.2 + droop * 1.1),
  };
}
export function heartCardPoint(p: HeartPlan, ms: number, raw: Point, b: TargetBounds): Point {
  const pose = heartCardPose(p, ms),
    a = (pose.angle * Math.PI) / 180;
  const x = raw.x - b.left - b.width / 2,
    y = raw.y - b.top - b.height / 2;
  return {
    x: b.left + b.width / 2 + x * Math.cos(a) - y * Math.sin(a) + pose.x,
    y: b.top + b.height / 2 + x * Math.sin(a) + y * Math.cos(a) + pose.y,
  };
}
export function heartContactOrigin(p: HeartPlan, ms: number, b: TargetBounds): Point {
  const tip = heartCardPoint(p, ms, heartContact(b), b),
    a = (heartCardPose(p, ms).angle * Math.PI) / 180;
  return { x: tip.x + 19 * HEART_SCALE * Math.sin(a), y: tip.y - 19 * HEART_SCALE * Math.cos(a) };
}
export function heartSpread(p: HeartPlan, side: number, center: number, view: Point) {
  const room = side < 0 ? center - 26 : view.x - center - 26;
  return Math.max(6, Math.min(p.spread, room));
}
export function heartFrames(p: HeartPlan) {
  const frames: Keyframe[] = [];
  for (let ms = 0; ms <= HEART_DURATION; ms += 20) {
    const pose = heartCardPose(p, ms);
    frames.push({
      offset: ms / HEART_DURATION,
      translate: `${pose.x}px ${pose.y}px`,
      rotate: `${pose.angle}deg`,
    });
  }
  return { frames, options: { duration: HEART_DURATION * p.pace, easing: 'linear' } };
}
