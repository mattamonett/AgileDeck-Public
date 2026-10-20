import { clamp, ease } from '../../kit';
import { seededRandom, type Point } from '../../flight/flight-math';
import { landingVariation, type TargetBounds } from '../../landing/landing-geometry';
import { lingeringProgress } from '../../flight/approach-flow';
export const NILL_DURATION = 6000;
export const NILL_SCALE = 0.8;
export const NILL_SLAP_MS = 650;
export const NILL_BACKHAND_MS = 1320;
export const nillEase = ease;
export interface NillPlan {
  readonly pace: number;
  readonly slap: number;
  readonly backhand: number;
  readonly force: number;
  readonly detour: number;
  readonly pause: number;
  readonly step: number;
  readonly tie: boolean;
  readonly departure: number;
  readonly glance: number;
  readonly exit: number;
  readonly spot: Point;
}
export function nillPlan(id: string): NillPlan {
  const random = seededRandom(id + ':nill-confrontation');
  const slap = 650 + random() * 70 - 35;
  return {
    pace: 0.9 + random() * 0.2,
    slap,
    backhand: slap + 620 + random() * 100,
    force: 0.85 + random() * 0.3,
    detour: random() * 20 - 10,
    pause: 0.035 + random() * 0.045,
    step: 0.9 + random() * 0.2,
    tie: random() < 0.5,
    departure: 3100 + random() * 180,
    glance: 0.04 + random() * 0.04,
    exit: 0.9 + random() * 0.2,
    spot: landingVariation(id),
  };
}
export function nillLandingPoint(
  plan: NillPlan,
  b: TargetBounds,
  viewport: Point,
  source: Point,
  chosenFacing?: number,
): Point {
  const toward = source.x < b.left + b.width / 2 ? 1 : -1;
  let facing = chosenFacing ?? (plan.spot.x < 0.33 ? -toward : toward);
  if (chosenFacing === undefined) {
    if (b.left < 66 && b.left + b.width + 66 < viewport.x) facing = -1;
    else if (b.left + b.width > viewport.x - 66 && b.left > 66) facing = 1;
  }
  const gap = 28 + plan.spot.y;
  return { x: facing > 0 ? b.left - gap : b.left + b.width + gap, y: b.top + b.height - 37 };
}
export function nillApproach(
  plan: NillPlan,
  start: Point,
  end: Point,
  viewport: Point,
  progress: number,
): Point {
  const t = lingeringProgress(progress, 0.72, 0.87, plan.pause);
  const detour =
    plan.detour > 0
      ? Math.min(plan.detour, Math.max(0, viewport.y - 42 - Math.max(start.y, end.y)))
      : Math.max(plan.detour, Math.min(0, 42 - Math.min(start.y, end.y)));
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t + Math.sin(t * Math.PI) * detour,
  };
}
export function nillCardPose(ms: number, plan: NillPlan, facing: number) {
  let recoil = 0;
  for (const [contact, force] of [
    [plan.slap, 1],
    [plan.backhand, -1.12],
  ]) {
    if (contact === undefined || force === undefined) continue;
    const age = ms - contact;
    if (age >= 0 && age < 360)
      recoil = Math.sin((age / 360) * Math.PI * 2) * Math.exp(-age / 260) * force;
  }
  if (recoil === 0) return { x: 0, y: 0, angle: 0, sx: 1 };
  return {
    x: facing * recoil * 7 * plan.force,
    y: Math.abs(recoil) * 1.3 * plan.force,
    angle: facing * recoil * 6.5 * plan.force,
    sx: 1 - Math.abs(recoil) * 0.02,
  };
}
export function nillCardPoint(
  ms: number,
  raw: Point,
  b: TargetBounds,
  plan: NillPlan,
  facing: number,
): Point {
  const pose = nillCardPose(ms, plan, facing);
  const a = (pose.angle * Math.PI) / 180;
  const dx = (raw.x - b.left - b.width / 2) * pose.sx;
  const dy = raw.y - b.top - b.height / 2;
  return {
    x: b.left + b.width / 2 + dx * Math.cos(a) - dy * Math.sin(a) + pose.x,
    y: b.top + b.height / 2 + dx * Math.sin(a) + dy * Math.cos(a) + pose.y,
  };
}
export function nillContact(
  plan: NillPlan,
  b: TargetBounds,
  facing: number,
  backhand: boolean,
): Point {
  const inset = b.width * (0.06 + plan.spot.x * 0.01);
  return {
    x: facing > 0 ? b.left + inset : b.left + b.width - inset,
    y: b.top + b.height * (0.56 + plan.spot.y * 0.03) + (backhand ? 3 : 0),
  };
}
export function nillHandPoint(
  ms: number,
  plan: NillPlan,
  b: TargetBounds,
  end: Point,
  facing: number,
): Point {
  const rest = { x: end.x + facing * 18 * NILL_SCALE, y: end.y + 12 * NILL_SCALE };
  for (const [contact, back] of [
    [plan.slap, false],
    [plan.backhand, true],
  ] as const) {
    if (ms < contact - 330 || ms > contact + 400) continue;
    const hit = nillCardPoint(ms, nillContact(plan, b, facing, back), b, plan, facing);
    const windup = {
      x: back ? hit.x + facing * 8 : end.x - facing * 6 * NILL_SCALE,
      y: end.y - 26 * NILL_SCALE,
    };
    if (ms < contact - 140) {
      const t = nillEase((ms - contact + 330) / 190);
      return { x: rest.x + (windup.x - rest.x) * t, y: rest.y + (windup.y - rest.y) * t };
    }
    if (ms < contact) {
      const t = nillEase((ms - contact + 140) / 140);
      return { x: windup.x + (hit.x - windup.x) * t, y: windup.y + (hit.y - windup.y) * t };
    }
    const settle = nillEase((ms - contact - 140) / 260);
    const over = Math.sin(clamp((ms - contact) / 140) * Math.PI) * 2 * plan.force * (back ? -1 : 1);
    return {
      x: hit.x + facing * over + (rest.x - hit.x) * settle,
      y: hit.y + (rest.y - hit.y) * settle,
    };
  }
  return rest;
}
export function nillBackhandWeight(ms: number, plan: NillPlan, facing: number) {
  const windup =
    10 *
    nillEase((ms - plan.backhand + 330) / 190) *
    (1 - nillEase((ms - plan.backhand + 140) / 140));
  const follow = Math.sin(clamp((ms - plan.backhand) / 400) * Math.PI) * 4;
  return facing * (windup + follow);
}
export function nillBodyLean(ms: number, plan: NillPlan, facing: number) {
  let lean = 0;
  for (const contact of [plan.slap, plan.backhand]) {
    const age = ms - contact;
    if (age >= -330 && age < 400)
      lean =
        -Math.sin(clamp((age + 330) / 330) * Math.PI) * 0.025 +
        Math.sin(clamp(age / 400) * Math.PI) * 0.025;
  }
  return facing * lean * plan.force;
}
export function nillExitProgress(ms: number, plan: NillPlan) {
  const t = clamp((ms - plan.departure - 220) / (1500 * plan.exit));
  if (t < 0.32) return nillEase(t / 0.32) * 0.28;
  if (t < 0.32 + plan.glance) return 0.28;
  return 0.28 + nillEase((t - 0.32 - plan.glance) / (0.68 - plan.glance)) * 0.72;
}
