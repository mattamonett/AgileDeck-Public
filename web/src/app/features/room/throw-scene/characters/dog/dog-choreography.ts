import { ease } from '../../kit';
import { seededRandom, type Point } from '../../flight/flight-math';
import { landingVariation, type TargetBounds } from '../../landing/landing-geometry';
import { lingeringProgress } from '../../flight/approach-flow';

export const DOG_DURATION = 4800;
export const dogEase = ease;
export interface DogPlan {
  readonly pace: number;
  readonly sniffs: number;
  readonly pressure: number;
  readonly lift: number;
  readonly wag: number;
  readonly detour: number;
  readonly pause: number;
  readonly hop: boolean;
  readonly exit: number;
  readonly spot: Point;
}
export function dogPlan(id: string): DogPlan {
  const random = seededRandom(id + ':puppy-marking');
  return {
    pace: 0.9 + random() * 0.2,
    sniffs: random() < 0.5 ? 2 : 3,
    pressure: 0.85 + random() * 0.3,
    lift: 0.9 + random() * 0.2,
    wag: 0.85 + random() * 0.3,
    detour: (random() < 0.5 ? -1 : 1) * (20 + random() * 25),
    pause: 0.04 + random() * 0.06,
    hop: random() < 0.5,
    exit: 0.85 + random() * 0.3,
    spot: landingVariation(id),
  };
}
export function dogLandingPoint(plan: DogPlan, b: TargetBounds, viewport: Point): Point {
  let facing = plan.spot.x < 0.5 ? 1 : -1;
  if (b.left < 90 && b.left + b.width + 90 < viewport.x) facing = -1;
  else if (b.left + b.width > viewport.x - 90 && b.left > 90) facing = 1;
  return {
    x: facing > 0 ? b.left - 42 : b.left + b.width + 42,
    y: Math.min(viewport.y - 28, b.top + b.height - 14),
  };
}
export function dogApproach(
  plan: DogPlan,
  start: Point,
  end: Point,
  viewport: Point,
  progress: number,
): Point {
  // The sniff beat slows the trot to a nose-down amble rather than freezing it.
  const t = lingeringProgress(progress, 0.44, 0.48, plan.pause);
  const s = 1 - t;
  const y = Math.max(48, Math.min(viewport.y - 28, (start.y + end.y) / 2 + plan.detour));
  return {
    x: s * s * start.x + (2 * s * t * (start.x + end.x)) / 2 + t * t * end.x,
    y: s * s * start.y + 2 * s * t * y + t * t * end.y,
  };
}
export function dogCardPose(ms: number, plan: DogPlan, facing: number) {
  const splash = dogEase((ms - 1800) / 160) * (1 - dogEase((ms - 2900) / 250));
  return {
    x: facing * splash * 0.8 * plan.pressure,
    y: Math.sin((ms - 1800) / 300) * splash * 0.25,
  };
}
export function dogSplashPoint(ms: number, plan: DogPlan, b: TargetBounds, facing: number): Point {
  const pose = dogCardPose(ms, plan, facing);
  return {
    x:
      b.left +
      b.width * (facing > 0 ? 0.07 + plan.spot.y * 0.05 : 0.93 - plan.spot.y * 0.05) +
      pose.x,
    y: b.top + b.height * (0.74 + plan.spot.y * 0.05) + pose.y,
  };
}
