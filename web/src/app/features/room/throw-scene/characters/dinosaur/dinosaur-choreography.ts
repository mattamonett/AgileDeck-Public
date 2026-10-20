import { ease } from '../../kit';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { laneRoute, lingeringProgress } from '../../flight/approach-flow';

export const DINO_SCALE = 0.8;
export const DINO_DURATION = 10000;
export const dinoEase = ease;
export interface DinoPlan {
  readonly pace: number;
  readonly side: number;
  readonly travel: number;
  readonly jump: number;
  readonly rise: number;
  readonly pause: number;
  readonly bend: number;
  readonly gait: number;
  readonly lift: number;
  readonly roar: number;
  readonly pulses: number;
  readonly stomp: number;
  readonly foot: number;
  readonly force: number;
  readonly startled: boolean;
  readonly departure: number;
  readonly exit: number;
  readonly phase: number;
}
export function dinoPlan(id: string): DinoPlan {
  const r = seededRandom(id + ':little-t-rex'),
    travel = 1600 + r() * 260,
    jump = 520 + r() * 90;
  const roar = travel + jump + 420 + r() * 90,
    pulses = 2 + Math.floor(r() * 2);
  const stomp = roar + (pulses - 1) * 260 + 620;
  return {
    pace: 0.94 + r() * 0.12,
    side: r() < 0.5 ? -1 : 1,
    travel,
    jump,
    rise: 28 + r() * 20,
    pause: 0.04 + r() * 0.05,
    bend: 12 + r() * 18,
    gait: 26 + r() * 5,
    lift: 5 + r() * 2,
    roar,
    pulses,
    stomp,
    foot: r() < 0.5 ? 0 : 1,
    force: 0.88 + r() * 0.3,
    startled: r() < 0.5,
    departure: stomp + 1550 + r() * 140,
    exit: 2000 + r() * 280,
    phase: r() * Math.PI * 2,
  };
}
export const dinoArrival = (p: DinoPlan) => p.travel + p.jump;
export function dinoLandingPoint(
  p: DinoPlan,
  b: TargetBounds,
  view: Point,
  chosen?: number,
): Point {
  let facing = chosen ?? p.side;
  if (chosen === undefined) {
    if (b.left < 78 && b.left + b.width + 78 < view.x) facing = -1;
    else if (b.left + b.width > view.x - 78 && b.left > 78) facing = 1;
  }
  return { x: facing > 0 ? b.left - 45 : b.left + b.width + 45, y: b.top + b.height + 16 };
}
export function dinoProgress(p: DinoPlan, t: number) {
  return lingeringProgress(t, 0.7, 0.82, p.pause);
}
export function dinoApproach(
  p: DinoPlan,
  start: Point,
  end: Point,
  b: TargetBounds,
  view: Point,
  t: number,
): Point {
  const q = dinoProgress(p, t),
    across = (start.x - b.left - b.width / 2) * (end.x - b.left - b.width / 2) < 0;
  if (across) {
    return laneRoute(start, end, Math.min(view.y - 24, b.top + b.height + 58), q);
  }
  return {
    x: start.x + (end.x - start.x) * q,
    y:
      start.y +
      (end.y - start.y) * q +
      Math.sin(q * Math.PI) * Math.min(p.bend, Math.max(0, view.y - 24 - Math.max(start.y, end.y))),
  };
}
export function dinoApproachTurn(p: DinoPlan, start: Point, end: Point, facing: number, t: number) {
  const walk = Math.sign(end.x - start.x) || facing;
  return walk === facing ? 0 : Math.PI * (1 - dinoEase((dinoProgress(p, t) - 0.6) / 0.2));
}
export function dinoCardPose(p: DinoPlan, ms: number, facing: number) {
  let down = 0,
    air = 0;
  const landed = ms - dinoArrival(p);
  if (landed > 0 && landed < 380) down += Math.sin((landed / 380) * Math.PI) * 2.8 * p.force;
  for (let i = 0; i < p.pulses; i++) {
    const age = ms - p.roar - i * 260 - 180;
    if (age > 0 && age < 320) air += Math.sin((age / 320) * Math.PI) * (1 - age / 320) * p.force;
  }
  const age = ms - p.stomp;
  const stamp =
    age > 0 && age < 700 ? Math.sin((age / 140) * Math.PI) * Math.exp(-age / 160) * p.force : 0;
  down += stamp * 10;
  return {
    x: facing * air * 1.8,
    y: down,
    angle: facing * (air * 3 + stamp * 2),
    sy: 1 - Math.max(0, stamp) * 0.075,
  };
}
export function dinoCardPoint(
  p: DinoPlan,
  ms: number,
  raw: Point,
  b: TargetBounds,
  facing: number,
): Point {
  const pose = dinoCardPose(p, ms, facing),
    a = (pose.angle * Math.PI) / 180;
  const x = raw.x - b.left - b.width / 2,
    y = (raw.y - b.top - b.height / 2) * pose.sy;
  return {
    x: b.left + b.width / 2 + x * Math.cos(a) - y * Math.sin(a) + pose.x,
    y: b.top + b.height / 2 + x * Math.sin(a) + y * Math.cos(a) + pose.y,
  };
}
export function dinoTop(p: DinoPlan, ms: number, b: TargetBounds, facing: number): Point {
  return dinoCardPoint(p, ms, { x: b.left + b.width / 2, y: b.top }, b, facing);
}
export function dinoStompLift(p: DinoPlan, ms: number) {
  return dinoEase((ms - p.stomp + 400) / 220) * (1 - dinoEase((ms - p.stomp + 90) / 90));
}
export function dinoExit(p: DinoPlan, end: Point, view: Point, facing: number, t: number): Point {
  const q = dinoEase(t),
    x = Math.max(45, Math.min(view.x - 45, end.x - facing * 95));
  return { x: end.x + (x - end.x) * q, y: end.y + (view.y + 110 - end.y) * q };
}
export function dinoFrames(p: DinoPlan, facing: number) {
  const frames: Keyframe[] = [];
  for (let ms = 0; ms <= DINO_DURATION; ms += 20) {
    const q = dinoCardPose(p, ms, facing);
    frames.push({
      offset: ms / DINO_DURATION,
      translate: `${q.x}px ${q.y}px`,
      rotate: `${q.angle}deg`,
      scale: `1 ${q.sy}`,
    });
  }
  return { frames, options: { duration: DINO_DURATION * p.pace, easing: 'linear' } };
}
