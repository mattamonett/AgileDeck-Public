import { ease } from '../../kit';
import { seededRandom, type Point } from '../../flight/flight-math';
import { landingVariation, type TargetBounds } from '../../landing/landing-geometry';
import { laneRoute, lingeringProgress } from '../../flight/approach-flow';
export const GOAT_DURATION = 8000;
export const GOAT_SCALE = 0.8;
export const goatEase = ease;
export interface GoatPlan {
  readonly pace: number;
  readonly leader: number;
  readonly hits: readonly [number, number];
  readonly force: number;
  readonly pause: number;
  readonly bend: number;
  readonly step: number;
  readonly stamp: boolean;
  readonly departure: number;
  readonly exit: number;
  readonly spot: Point;
  readonly order: readonly [number, number, number];
}
export function goatPlan(id: string): GoatPlan {
  const r = seededRandom(id + ':goat-king'),
    leader = 900 + r() * 100;
  const orders: readonly (readonly [number, number, number])[] = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  return {
    pace: 0.94 + r() * 0.12,
    leader,
    hits: [leader + 1150 + r() * 100, leader + 2650 + r() * 100],
    force: 0.85 + r() * 0.3,
    pause: 0.035 + r() * 0.04,
    bend: 12 + r() * 20,
    step: 0.9 + r() * 0.2,
    stamp: r() < 0.5,
    departure: leader + 4100 + r() * 100,
    exit: 0.9 + r() * 0.15,
    spot: landingVariation(id),
    order: orders[Math.floor(r() * 6)] ?? [0, 1, 2],
  };
}
export function goatLandingPoint(
  p: GoatPlan,
  b: TargetBounds,
  view: Point,
  source: Point,
  chosen?: number,
): Point {
  const toward = source.x < b.left + b.width / 2 ? 1 : -1;
  let facing = chosen ?? (p.spot.x < 0.38 ? -toward : toward);
  if (chosen === undefined) {
    if (b.left < 115 && b.left + b.width + 115 < view.x) facing = -1;
    else if (b.left + b.width > view.x - 115 && b.left > 115) facing = 1;
  }
  return { x: facing > 0 ? b.left - 31 : b.left + b.width + 31, y: b.top + b.height };
}
const progress = (p: GoatPlan, t: number) => lingeringProgress(t, 0.7, 0.82, p.pause);
export function goatApproach(
  p: GoatPlan,
  start: Point,
  end: Point,
  view: Point,
  t: number,
  b: TargetBounds,
): Point {
  const q = progress(p, t),
    lane = b.top + b.height + 58 < view.y - 30 ? b.top + b.height + 58 : Math.max(80, b.top - 20);
  if ((start.x - b.left - b.width / 2) * (end.x - b.left - b.width / 2) < 0)
    return laneRoute(start, end, lane, q);
  return {
    x: start.x + (end.x - start.x) * q,
    y:
      start.y +
      (end.y - start.y) * q +
      Math.sin(q * Math.PI) * Math.min(p.bend, Math.max(0, view.y - 30 - Math.max(start.y, end.y))),
  };
}
export function goatApproachFacing(
  p: GoatPlan,
  start: Point,
  end: Point,
  b: TargetBounds,
  t: number,
) {
  const contact = Math.sign(b.left + b.width / 2 - end.x) || 1,
    walk = Math.sign(end.x - start.x) || contact;
  return walk + (contact - walk) * goatEase((progress(p, t) - 0.6) / 0.2);
}
export function goatCardPose(p: GoatPlan, ms: number, facing: number) {
  let down = 0,
    angle = 0;
  for (const [i, land] of [p.leader, p.hits[0] + 400, p.hits[1] + 400].entries()) {
    const age = ms - land;
    if (age > 0 && age < 560) {
      const q = age < 90 ? goatEase(age / 90) : 1 - goatEase((age - 90) / 470);
      down += q * 6 * p.force;
      angle += facing * q * (i % 2 ? -2.8 : 2.8) * p.force;
    }
  }
  if (p.stamp) {
    const age = ms - (p.hits[1] + 1070);
    if (age > 0 && age < 340) {
      const q = age < 70 ? goatEase(age / 70) : 1 - goatEase((age - 70) / 270);
      down += q * 3 * p.force;
      angle -= facing * q * 1.6;
    }
  }
  return { x: 0, y: down, angle, sx: 1, sy: 1 - down * 0.002 };
}
export function goatCardPoint(
  p: GoatPlan,
  ms: number,
  raw: Point,
  b: TargetBounds,
  facing: number,
): Point {
  const pose = goatCardPose(p, ms, facing),
    a = (pose.angle * Math.PI) / 180,
    x = raw.x - b.left - b.width / 2,
    y = (raw.y - b.top - b.height / 2) * pose.sy;
  return {
    x: b.left + b.width / 2 + x * Math.cos(a) - y * Math.sin(a),
    y: b.top + b.height / 2 + x * Math.sin(a) + y * Math.cos(a) + pose.y,
  };
}
export function goatFrames(p: GoatPlan, facing: number) {
  const frames: Keyframe[] = [];
  for (let ms = 0; ms <= GOAT_DURATION; ms += 20) {
    const q = goatCardPose(p, ms, facing);
    frames.push({
      offset: ms / GOAT_DURATION,
      translate: `0px ${q.y}px`,
      rotate: `${q.angle}deg`,
      scale: `1 ${q.sy}`,
    });
  }
  return { frames, options: { duration: GOAT_DURATION * p.pace, easing: 'linear' } };
}
