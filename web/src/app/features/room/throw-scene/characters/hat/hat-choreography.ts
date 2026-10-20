import { clamp, ease } from '../../kit';
import { seededRandom, type Point } from '../../flight/flight-math';
import { landingVariation, type TargetBounds } from '../../landing/landing-geometry';

export const HAT_DURATION = 5200;
export const HAT_SCALE = 0.8;
export const HAT_DEPTH = 28;
export const hatEase = ease;
export interface HatPlan {
  readonly pace: number;
  readonly detour: number;
  readonly wiggle: number;
  readonly peekPause: number;
  readonly strength: number;
  readonly wave: boolean;
  readonly flop: boolean;
  readonly bow: number;
  readonly vanish: number;
  readonly spot: Point;
}
export function hatPlan(id: string): HatPlan {
  const random = seededRandom(id + ':rabbit-reveal');
  return {
    pace: 0.9 + random() * 0.2,
    detour: (random() < 0.5 ? -1 : 1) * (25 + random() * 25),
    wiggle: 0.06 + random() * 0.04,
    peekPause: 120 + random() * 140,
    strength: 0.85 + random() * 0.3,
    wave: random() < 0.5,
    flop: random() < 0.5,
    bow: 0.25 + random() * 0.15,
    vanish: 3800 + random() * 200,
    spot: landingVariation(id),
  };
}
export function hatLandingPoint(plan: HatPlan, b: TargetBounds): Point {
  return { x: b.left + b.width * (0.4 + plan.spot.x * 0.2), y: b.top - HAT_DEPTH * HAT_SCALE };
}
export function hatApproach(
  plan: HatPlan,
  start: Point,
  end: Point,
  viewport: Point,
  progress: number,
): Point {
  const t = hatEase(progress);
  const s = 1 - t;
  const control = Math.max(
    50,
    Math.min(viewport.y - 40, Math.min(start.y, end.y) - Math.abs(plan.detour)),
  );
  const firstX = start.x + (end.x - start.x) * 0.35;
  const lastX = Math.max(26, Math.min(viewport.x - 26, end.x + plan.detour * 1.2));
  const lastY = Math.max(50, end.y - Math.abs(plan.detour) * 0.5);
  return {
    x: s ** 3 * start.x + 3 * s * s * t * firstX + 3 * s * t * t * lastX + t ** 3 * end.x,
    y: s ** 3 * start.y + 3 * s * s * t * control + 3 * s * t * t * lastY + t ** 3 * end.y,
  };
}
export function hatRabbitRise(ms: number, plan: HatPlan) {
  const pop = 950 + plan.peekPause;
  const peek = hatEase((ms - 550) / 400);
  const reveal = hatEase((ms - pop) / 250);
  const retreat = hatEase((ms - pop - 1300) / 400);
  return (
    -60 + peek * 25 + reveal * 35 + Math.sin(reveal * Math.PI) * 5 * plan.strength - retreat * 60
  );
}
export function hatCardPose(ms: number, plan: HatPlan) {
  const pop = 950 + plan.peekPause;
  const landing = ms < 280 ? Math.sin(clamp(ms / 280) * Math.PI) : 0;
  const reveal = ms >= pop && ms < pop + 350 ? Math.sin(((ms - pop) / 350) * Math.PI) : 0;
  const weight = hatEase((ms - pop) / 250) * (1 - hatEase((ms - pop - 1300) / 400));
  return {
    y: (landing * 1.5 + reveal * 1.8 + weight * 0.5) * plan.strength,
    sy: 1 - (reveal * 0.014 + weight * 0.006) * plan.strength,
  };
}
export function hatStagePoint(ms: number, plan: HatPlan, b: TargetBounds, end: Point): Point {
  const pose = hatCardPose(ms, plan);
  return { x: end.x, y: end.y + pose.y + (b.height * (1 - pose.sy)) / 2 };
}
