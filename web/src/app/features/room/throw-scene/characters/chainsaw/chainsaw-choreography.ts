import { clamp, ease } from '../../kit';
import { seededRandom, type Point } from '../../flight/flight-math';
import { landingPoint, landingVariation, type TargetBounds } from '../../landing/landing-geometry';
import { evenPath } from '../../flight/approach-flow';

export interface ChainsawPlan {
  readonly pace: number;
  readonly pressure: number;
  readonly stall: number;
  readonly pause: number;
  readonly detour: number;
  readonly exit: number;
  readonly spot: Point;
}
export function chainsawPlan(id: string): ChainsawPlan {
  const random = seededRandom(id + ':chainsaw-pressure');
  return {
    pace: 0.9 + random() * 0.2,
    pressure: 0.85 + random() * 0.3,
    stall: 0.3 + random() * 0.2,
    pause: 0.06 + random() * 0.06,
    detour: (random() < 0.5 ? -1 : 1) * (20 + random() * 25),
    exit: 0.85 + random() * 0.3,
    spot: landingVariation(id),
  };
}
export function sawProgress(ms: number, plan: ChainsawPlan): number {
  const t = clamp((ms - 1000) / 1600);
  if (t <= plan.stall) return t;
  if (t < plan.stall + plan.pause) return plan.stall;
  return (
    plan.stall + ((t - plan.stall - plan.pause) / (1 - plan.stall - plan.pause)) * (1 - plan.stall)
  );
}
export function chainsawLandingPoint(plan: ChainsawPlan, b: TargetBounds, viewport: Point): Point {
  const point = landingPoint('🪚', b, plan.spot);
  if (point.x < 48 && b.left + b.width + 48 < viewport.x) point.x = b.left + b.width + 27;
  else if (point.x > viewport.x - 48 && b.left > 48) point.x = b.left - 27;
  point.y = Math.max(70, Math.min(viewport.y - 48, point.y));
  return point;
}
export function chainsawApproach(
  plan: ChainsawPlan,
  start: Point,
  end: Point,
  facing: number,
  viewport: Point,
  progress: number,
): Point {
  const x = Math.max(42, Math.min(viewport.x - 42, end.x - facing * 55));
  const y = Math.max(70, Math.min(viewport.y - 48, end.y + plan.detour));
  // Pace by distance so the hook round to the cutting side never brakes him to a standstill.
  return evenPath((t) => {
    const s = 1 - t;
    return {
      x: s * s * start.x + 2 * s * t * x + t * t * end.x,
      y: s * s * start.y + 2 * s * t * y + t * t * end.y,
    };
  }, ease(progress));
}
