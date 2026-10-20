import { clamp, ease } from '../../kit';
import { seededRandom, type Point } from '../../flight/flight-math';
import { landingVariation, type TargetBounds } from '../../landing/landing-geometry';
import { lingeringProgress } from '../../flight/approach-flow';

export const CAT_DURATION = 5400;
export const CAT_SWIPE_START = 1100;
export const CAT_SWIPE_STEP = 230;
export const catEase = ease;
export interface CatPlan {
  readonly pace: number;
  readonly strokes: number;
  readonly strength: number;
  readonly wiggle: number;
  readonly detour: number;
  readonly pause: number;
  readonly wipe: boolean;
  readonly licks: number;
  readonly exit: number;
  readonly glance: number;
  readonly spot: Point;
}
export function catPlan(id: string): CatPlan {
  const random = seededRandom(id + ':kitten-mischief');
  return {
    pace: 0.9 + random() * 0.2,
    strokes: random() < 0.5 ? 3 : 4,
    strength: 0.85 + random() * 0.3,
    wiggle: 1.5 + random() * 1.2,
    detour: (random() < 0.5 ? -1 : 1) * (18 + random() * 24),
    pause: 0.04 + random() * 0.06,
    wipe: random() < 0.5,
    licks: random() < 0.5 ? 2 : 3,
    exit: 0.9 + random() * 0.2,
    glance: 0.05 + random() * 0.05,
    spot: landingVariation(id),
  };
}
export function catLandingPoint(plan: CatPlan, b: TargetBounds, viewport: Point): Point {
  let facing = plan.spot.x < 0.5 ? 1 : -1;
  if (b.left < 82 && b.left + b.width + 82 < viewport.x) facing = -1;
  else if (b.left + b.width > viewport.x - 82 && b.left > 82) facing = 1;
  return {
    x: facing > 0 ? b.left - 36 : b.left + b.width + 36,
    y: Math.min(viewport.y - 30, b.top + b.height - 14),
  };
}
/** Slow to a watchful creep halfway through the stalk, then slink into springing distance. */
export function catApproach(
  plan: CatPlan,
  start: Point,
  end: Point,
  viewport: Point,
  progress: number,
): Point {
  const t = lingeringProgress(progress, 0.5, 0.55, plan.pause);
  const s = 1 - t;
  const y = Math.max(50, Math.min(viewport.y - 30, (start.y + end.y) / 2 + plan.detour));
  return {
    x: s * s * start.x + (2 * s * t * (start.x + end.x)) / 2 + t * t * end.x,
    y: s * s * start.y + 2 * s * t * y + t * t * end.y,
  };
}
export function catCardPose(ms: number, plan: CatPlan, facing: number) {
  let pull = 0;
  for (let i = 0; i < plan.strokes; i++) {
    const age = ms - CAT_SWIPE_START - i * CAT_SWIPE_STEP;
    if (age >= 50 && age <= 225) pull = Math.sin(((age - 50) / 175) * Math.PI);
  }
  const pounce = ms >= 950 && ms < 1100 ? Math.sin(((ms - 950) / 150) * Math.PI) : 0;
  return {
    x: facing * (pull * 1.6 + pounce * 1.3) * plan.strength,
    y: pull * 1.2 * plan.strength,
    angle: facing * (pull * 1.2 + pounce * 0.7) * plan.strength,
    sx: 1 - pull * 0.015 * plan.strength,
  };
}
export function catCardPoint(
  ms: number,
  point: Point,
  b: TargetBounds,
  plan: CatPlan,
  facing: number,
): Point {
  const pose = catCardPose(ms, plan, facing);
  const angle = (pose.angle * Math.PI) / 180;
  const dx = (point.x - b.left - b.width / 2) * pose.sx;
  const dy = point.y - b.top - b.height / 2;
  return {
    x: b.left + b.width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle) + pose.x,
    y: b.top + b.height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle) + pose.y,
  };
}
export function catClawBase(
  ms: number,
  stroke: number,
  b: TargetBounds,
  plan: CatPlan,
  facing: number,
): Point {
  const age = ms - CAT_SWIPE_START - stroke * CAT_SWIPE_STEP;
  const down = catEase((age - 50) / 110);
  const recover = catEase((age - 175) / 55);
  const retract = Math.sin(catEase((age - 160) / 70) * Math.PI);
  const inset = b.width * (0.065 + plan.spot.y * 0.02 + stroke * 0.014) - retract * 7;
  return {
    x: facing > 0 ? b.left + inset : b.left + b.width - inset,
    y:
      b.top +
      b.height -
      (24 + plan.spot.y * 2) +
      down * (16 + plan.strength * 2) -
      recover * (16 + plan.strength * 2),
  };
}
export function catClawPoint(
  ms: number,
  stroke: number,
  claw: number,
  b: TargetBounds,
  plan: CatPlan,
  facing: number,
): Point {
  const point = catCardPoint(ms, catClawBase(ms, stroke, b, plan, facing), b, plan, facing);
  // The held paw rotates its three toe positions into this screen-space separation.
  return { x: point.x + facing * (claw - 1) * 1.8, y: point.y };
}
export function catExitProgress(ms: number, plan: CatPlan) {
  const t = clamp((ms - 4050) / (1100 * plan.exit));
  if (t < 0.35) return catEase(t / 0.35) * 0.3;
  if (t < 0.35 + plan.glance) return 0.3;
  return 0.3 + catEase((t - 0.35 - plan.glance) / (0.65 - plan.glance)) * 0.7;
}
export function catWoundPoint(
  contact: number,
  ms: number,
  stroke: number,
  claw: number,
  b: TargetBounds,
  plan: CatPlan,
  facing: number,
): Point {
  const tip = catClawPoint(contact, stroke, claw, b, plan, facing);
  const pose = catCardPose(contact, plan, facing);
  const angle = (pose.angle * Math.PI) / 180;
  const dx = tip.x - b.left - b.width / 2 - pose.x;
  const dy = tip.y - b.top - b.height / 2 - pose.y;
  return catCardPoint(
    ms,
    {
      x: b.left + b.width / 2 + (dx * Math.cos(angle) + dy * Math.sin(angle)) / pose.sx,
      y: b.top + b.height / 2 - dx * Math.sin(angle) + dy * Math.cos(angle),
    },
    b,
    plan,
    facing,
  );
}
