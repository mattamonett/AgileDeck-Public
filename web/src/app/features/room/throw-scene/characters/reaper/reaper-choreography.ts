import { clamp, ease } from '../../kit';
import { seededRandom, type Point } from '../../flight/flight-math';
import { landingVariation, type TargetBounds } from '../../landing/landing-geometry';
import { lingeringProgress } from '../../flight/approach-flow';

export const REAPER_DURATION = 5600;
export const REAPER_SLICE_START = 800;
export const REAPER_SLICE_END = 1150;
export const reaperEase = ease;
export interface ReaperPlan {
  readonly pace: number;
  readonly strength: number;
  readonly detour: number;
  readonly pause: number;
  readonly collect: number;
  readonly departure: number;
  readonly withdraw: number;
  readonly spot: Point;
}
export function reaperPlan(id: string): ReaperPlan {
  const random = seededRandom(id + ':reaper-harvest');
  return {
    pace: 0.9 + random() * 0.2,
    strength: 0.85 + random() * 0.3,
    detour: (random() < 0.5 ? -1 : 1) * (22 + random() * 30),
    pause: 0.04 + random() * 0.05,
    collect: 0.85 + random() * 0.3,
    departure: random() * 220 - 110,
    withdraw: 18 + random() * 16,
    spot: landingVariation(id),
  };
}
export function reaperLandingPoint(plan: ReaperPlan, b: TargetBounds, viewport: Point): Point {
  let facing = plan.spot.x < 0.5 ? 1 : -1;
  if (b.left < 65 && b.left + b.width + 65 < viewport.x) facing = -1;
  else if (b.left + b.width > viewport.x - 65 && b.left > 65) facing = 1;
  return {
    x: facing > 0 ? b.left - 27 : b.left + b.width + 27,
    y: Math.max(66, Math.min(viewport.y - 46, b.top + b.height * (0.6 + plan.spot.y * 0.14))),
  };
}
/** A quiet mid-route float that barely advances, followed by a controlled glide into reach. */
export function reaperApproach(
  plan: ReaperPlan,
  start: Point,
  end: Point,
  viewport: Point,
  progress: number,
): Point {
  const t = lingeringProgress(progress, 0.52, 0.58, plan.pause);
  const s = 1 - t;
  const y = Math.max(66, Math.min(viewport.y - 46, (start.y + end.y) / 2 + plan.detour));
  return {
    x: s * s * start.x + (2 * s * t * (start.x + end.x)) / 2 + t * t * end.x,
    y: s * s * start.y + 2 * s * t * y + t * t * end.y,
  };
}
export function reaperStrikeAngle(ms: number, plan = reaperPlan('landing')) {
  if (ms < 500) return -0.45 + 1.45 * reaperEase(ms / 500);
  if (ms < REAPER_SLICE_START) return 1;
  if (ms < REAPER_SLICE_END)
    return 1 - (1.85 + (plan.strength - 1) * 0.4) * reaperEase((ms - 800) / 350);
  return -0.85 - (plan.strength - 1) * 0.4 + 0.4 * reaperEase((ms - 1500) / 500);
}
export function reaperCardPose(ms: number, plan: ReaperPlan, facing: number) {
  const cut = ms >= 800 && ms < 1400 ? Math.sin(clamp((ms - 800) / 600) * Math.PI) : 0;
  const draw = reaperEase((ms - 2050) / 700) * (1 - reaperEase((ms - 3250) / 650));
  return {
    x: -facing * (cut * 1.5 + draw * 0.8) * plan.strength,
    y: (cut * 2.3 - draw * 1.8) * plan.strength,
    sy: 1 - (cut * 0.026 + draw * 0.014) * plan.strength,
  };
}
export function reaperCardPoint(
  ms: number,
  point: Point,
  b: TargetBounds,
  plan: ReaperPlan,
  facing: number,
): Point {
  const pose = reaperCardPose(ms, plan, facing);
  const cy = b.top + b.height / 2;
  return { x: point.x + pose.x, y: cy + (point.y - cy) * pose.sy + pose.y };
}
export function reaperBladePoint(
  ms: number,
  end: Point,
  facing: number,
  plan = reaperPlan('landing'),
): Point {
  const angle = reaperStrikeAngle(ms, plan);
  return {
    x:
      end.x +
      facing *
        (12 * reaperEase(ms / 500) + 0.9 * (12 + 48 * Math.cos(angle) - 18 * Math.sin(angle))),
    y: end.y - 0.9 * (12 + 48 * Math.sin(angle) + 18 * Math.cos(angle)),
  };
}
/** Preserve a wound in the card's coordinates after the blade has passed. */
export function reaperWoundPoint(
  contact: number,
  ms: number,
  end: Point,
  b: TargetBounds,
  facing: number,
  plan: ReaperPlan,
): Point {
  const tip = reaperBladePoint(contact, end, facing, plan);
  const pose = reaperCardPose(contact, plan, facing);
  const cy = b.top + b.height / 2;
  return reaperCardPoint(
    ms,
    { x: tip.x - pose.x, y: cy + (tip.y - cy - pose.y) / pose.sy },
    b,
    plan,
    facing,
  );
}
