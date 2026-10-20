import { ease } from '../../kit';
import { seededRandom, type Point } from '../../flight/flight-math';
import { landingVariation, type TargetBounds } from '../../landing/landing-geometry';
import { laneRoute, lingeringProgress } from '../../flight/approach-flow';
export const BABY_DURATION = 7200;
export const BABY_SCALE = 0.9;
export const babyEase = ease;
export interface BabyPlan {
  readonly pace: number;
  readonly pause: number;
  readonly detour: number;
  readonly step: number;
  readonly pat: number;
  readonly discovery: number;
  readonly sobs: readonly number[];
  readonly force: number;
  readonly wipe: boolean;
  readonly departure: number;
  readonly exit: number;
  readonly spot: Point;
}
export function babyPlan(id: string): BabyPlan {
  const r = seededRandom(id + ':brent-diaper');
  const discovery = 1150 + r() * 160;
  const count = r() < 0.5 ? 3 : 4;
  const sobs = Array.from({ length: count }, (_, i) => discovery + 450 + i * (490 + r() * 90));
  return {
    pace: 0.92 + r() * 0.16,
    pause: 0.04 + r() * 0.06,
    detour: 12 + r() * 16,
    step: 0.9 + r() * 0.2,
    pat: 760 + r() * 100,
    discovery,
    sobs,
    force: 0.85 + r() * 0.3,
    wipe: r() < 0.5,
    departure: 4430 + r() * 160,
    exit: 0.9 + r() * 0.18,
    spot: landingVariation(id),
  };
}
export function babyLandingPoint(
  p: BabyPlan,
  b: TargetBounds,
  view: Point,
  source: Point,
  chosen?: number,
): Point {
  const toward = source.x < b.left + b.width / 2 ? 1 : -1;
  let facing = chosen ?? (p.spot.x < 0.35 ? -toward : toward);
  if (chosen === undefined) {
    if (b.left < 65 && b.left + b.width + 65 < view.x) facing = -1;
    else if (b.left + b.width > view.x - 65 && b.left > 65) facing = 1;
  }
  return { x: facing > 0 ? b.left - 23 : b.left + b.width + 23, y: b.top + b.height - 12 };
}
function approachProgress(p: BabyPlan, t: number) {
  return lingeringProgress(t, 0.55, 0.65, p.pause);
}
export function babyApproachFacing(
  p: BabyPlan,
  start: Point,
  end: Point,
  b: TargetBounds,
  t: number,
) {
  const contact = Math.sign(b.left + b.width / 2 - end.x) || 1,
    walk = Math.sign(end.x - start.x) || contact;
  const turn = babyEase((approachProgress(p, t) - 0.68) / 0.16);
  return walk + (contact - walk) * turn;
}
export function babyApproach(
  p: BabyPlan,
  start: Point,
  end: Point,
  view: Point,
  t: number,
  b: TargetBounds,
): Point {
  const q = approachProgress(p, t);
  if ((start.x - b.left - b.width / 2) * (end.x - b.left - b.width / 2) < 0) {
    const lane =
      b.top + b.height + 57 < view.y - 35 ? b.top + b.height + 57 : Math.max(75, b.top - 42);
    return laneRoute(start, end, lane, q);
  }
  return {
    x: start.x + (end.x - start.x) * q,
    y:
      start.y +
      (end.y - start.y) * q +
      Math.sin(q * Math.PI) *
        Math.min(p.detour, Math.max(0, view.y - 35 - Math.max(start.y, end.y))),
  };
}
export function babySob(p: BabyPlan, ms: number) {
  return p.sobs.reduce(
    (max, time) =>
      Math.max(max, ms <= time || ms >= time + 350 ? 0 : Math.sin((Math.PI * (ms - time)) / 350)),
    0,
  );
}
export function babyCardPose(p: BabyPlan, ms: number, facing: number) {
  const tap = ms <= p.pat || ms >= p.pat + 240 ? 0 : Math.sin((Math.PI * (ms - p.pat)) / 240);
  const wet = p.sobs.reduce(
    (max, time) =>
      Math.max(
        max,
        ms <= time + 500 || ms >= time + 740 ? 0 : Math.sin((Math.PI * (ms - time - 500)) / 240),
      ),
    0,
  );
  return { x: facing * tap * 0.8 * p.force, y: wet * 0.45 * p.force, angle: facing * tap * 0.5 };
}
export function babyCardPoint(
  p: BabyPlan,
  ms: number,
  point: Point,
  b: TargetBounds,
  facing: number,
): Point {
  const pose = babyCardPose(p, ms, facing),
    a = (pose.angle * Math.PI) / 180;
  const x = point.x - b.left - b.width / 2,
    y = point.y - b.top - b.height / 2;
  return {
    x: b.left + b.width / 2 + x * Math.cos(a) - y * Math.sin(a) + pose.x,
    y: b.top + b.height / 2 + x * Math.sin(a) + y * Math.cos(a) + pose.y,
  };
}
