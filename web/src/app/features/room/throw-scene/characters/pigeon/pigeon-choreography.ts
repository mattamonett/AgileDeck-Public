import { clamp, ease } from '../../kit';
import { seededRandom, type Point } from '../../flight/flight-math';
import { landingVariation, type TargetBounds } from '../../landing/landing-geometry';
import { evenParameter, lengthFraction, lingeringProgress } from '../../flight/approach-flow';

export const PIGEON_DURATION = 6000;
export const PIGEON_BURSTS = [450, 1080, 1710, 2340] as const;
export const PIGEON_BURST_LENGTH = 160;
export const PIGEON_SCALE = 0.8;
export const pigeonEase = ease;
export interface PigeonPlan {
  readonly pace: number;
  readonly detour: number;
  readonly pause: number;
  readonly pressure: number;
  readonly flap: number;
  readonly flight: number;
  readonly bursts: readonly number[];
  readonly departure: number;
  readonly exit: number;
  readonly spot: Point;
}
export function pigeonPlan(id: string): PigeonPlan {
  const random = seededRandom(id + ':pigeon-insult');
  return {
    pace: 0.9 + random() * 0.2,
    detour: 60 + random() * 50,
    pause: 0.04 + random() * 0.05,
    pressure: 0.85 + random() * 0.3,
    flap: 0.85 + random() * 0.3,
    flight: 300 + random() * 80,
    bursts: PIGEON_BURSTS.map((start) => start + random() * 70 - 35),
    departure: 3600 + random() * 180,
    exit: 0.9 + random() * 0.2,
    spot: landingVariation(id),
  };
}
export function pigeonLandingPoint(
  plan: PigeonPlan,
  b: TargetBounds,
  viewport = {
    x: typeof window === 'undefined' ? 1024 : window.innerWidth,
    y: typeof window === 'undefined' ? 768 : window.innerHeight,
  },
): Point {
  let facing = plan.spot.x < 0.5 ? -1 : 1;
  if (b.left < 45 && b.left + b.width + 45 < viewport.x) facing = 1;
  else if (b.left + b.width > viewport.x - 45 && b.left > 45) facing = -1;
  return { x: b.left + b.width * (facing < 0 ? 0.15 : 0.85), y: b.top - 1 };
}
export function pigeonFacing(end: Point, b: TargetBounds) {
  return end.x < b.left + b.width / 2 ? -1 : 1;
}
export function pigeonBurstActive(ms: number, plan = pigeonPlan('landing')) {
  return plan.bursts.some((start) => ms >= start && ms < start + PIGEON_BURST_LENGTH);
}
export function pigeonKick(ms: number, plan: PigeonPlan) {
  for (const start of plan.bursts)
    if (ms >= start && ms < start + PIGEON_BURST_LENGTH)
      return Math.sin(((ms - start) / PIGEON_BURST_LENGTH) * Math.PI) * plan.pressure;
  return 0;
}
/** Climbing take-off that levels out at the peak (`u` 0..1), then the dive onto the card (`u` 1..2). */
function pigeonRoute(
  plan: PigeonPlan,
  start: Point,
  end: Point,
  viewport: Point,
  u: number,
): Point {
  const peak = Math.max(60, Math.min(start.y, end.y) - plan.detour);
  const climb = { x: start.x + (end.x - start.x) * 0.16, y: peak };
  if (u <= 1) {
    const s = 1 - u;
    return {
      x: s * s * start.x + 2 * s * u * start.x + u * u * climb.x,
      y: s * s * start.y + 2 * s * u * peak + u * u * peak,
    };
  }
  const t = u - 1;
  const s = 1 - t;
  const side = plan.spot.x < 0.5 ? -1 : 1;
  const over = Math.max(30, Math.min(viewport.x - 30, end.x + side * plan.detour * 0.5));
  return {
    x:
      s ** 3 * climb.x +
      3 * s * s * t * (climb.x + (end.x - climb.x) * 0.6) +
      3 * s * t * t * over +
      t ** 3 * end.x,
    y: s ** 3 * peak + 3 * s * s * t * peak + 3 * s * t * t * (end.y - 35) + t ** 3 * end.y,
  };
}
export function pigeonApproach(
  plan: PigeonPlan,
  start: Point,
  end: Point,
  viewport: Point,
  progress: number,
): Point {
  const route = (u: number) => pigeonRoute(plan, start, end, viewport, u * 2);
  const peak = lengthFraction(route, 0.5, 64);
  // Hovering at the peak is a slow, flapping drift into the dive rather than a frozen hang.
  // A long climb reaches the peak later, so the dive is not left crawling.
  const hover = Math.max(0.3, Math.min(0.6, peak));
  return route(evenParameter(route, lingeringProgress(progress, hover, peak, plan.pause), 64));
}
export function pigeonDeparture(
  ms: number,
  plan: PigeonPlan,
  end: Point,
  viewport: Point,
  facing: number,
): Point {
  const t = pigeonEase((ms - plan.departure) / (1400 * plan.exit));
  const s = 1 - t;
  const edge = facing < 0 ? -90 : viewport.x + 90;
  return {
    x:
      s ** 3 * end.x + 3 * s * s * t * (end.x + facing * 45) + 3 * s * t * t * edge + t ** 3 * edge,
    y: s ** 3 * end.y + 3 * s * s * t * (end.y - plan.detour) + 3 * s * t * t * -40 + t ** 3 * -95,
  };
}
export function pigeonImpactPoint(
  b: TargetBounds,
  plan: PigeonPlan,
  burst: number,
  facing: number,
): Point {
  const inset = 0.19 + plan.spot.y * 0.035 + burst * 0.008;
  return {
    x: b.left + b.width * (facing < 0 ? inset : 1 - inset),
    y: b.top + b.height * (0.17 + plan.spot.y * 0.04 + burst * 0.06),
  };
}
export function pigeonCardPose(ms: number, plan: PigeonPlan, facing: number) {
  let hit = 0;
  for (const burst of plan.bursts) {
    const age = ms - burst - plan.flight;
    if (age >= 0 && age < 220) hit = Math.sin((age / 220) * Math.PI);
  }
  if (hit === 0) return { x: 0, y: 0, angle: 0 };
  return {
    x: facing * hit * 0.8 * plan.pressure,
    y: hit * 0.8 * plan.pressure,
    angle: facing * hit * 0.7 * plan.pressure,
  };
}
export function pigeonCardPoint(
  ms: number,
  point: Point,
  b: TargetBounds,
  plan: PigeonPlan,
  facing: number,
): Point {
  const pose = pigeonCardPose(ms, plan, facing);
  const angle = (pose.angle * Math.PI) / 180;
  const dx = point.x - b.left - b.width / 2;
  const dy = point.y - b.top - b.height / 2;
  return {
    x: b.left + b.width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle) + pose.x,
    y: b.top + b.height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle) + pose.y,
  };
}
export function pigeonRumpPoint(
  ms: number,
  plan: PigeonPlan,
  end: Point,
  facing: number,
  b: TargetBounds,
): Point {
  const stage = pigeonCardPoint(ms, end, b, plan, facing);
  const angle = (pigeonCardPose(ms, plan, facing).angle * Math.PI) / 180;
  const dx = -facing * 14 * PIGEON_SCALE;
  const dy = -(7 - pigeonKick(ms, plan) * 2.5) * PIGEON_SCALE;
  return {
    x: stage.x + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: stage.y + dx * Math.sin(angle) + dy * Math.cos(angle),
  };
}
export function pigeonPacketPoint(
  ms: number,
  release: number,
  plan: PigeonPlan,
  b: TargetBounds,
  end: Point,
  burst: number,
  facing: number,
): Point {
  const age = clamp((ms - release) / plan.flight);
  const origin = pigeonRumpPoint(release, plan, end, facing, b);
  const impact = pigeonCardPoint(ms, pigeonImpactPoint(b, plan, burst, facing), b, plan, facing);
  return {
    x:
      origin.x + (impact.x - origin.x) * age + facing * Math.sin(age * Math.PI) * 3 * plan.pressure,
    y: origin.y + (impact.y - origin.y) * age * age,
  };
}
