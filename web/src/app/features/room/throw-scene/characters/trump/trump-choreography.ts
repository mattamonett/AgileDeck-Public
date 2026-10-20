import { ease } from '../../kit';
import { seededRandom, type Point } from '../../flight/flight-math';
import { landingVariation, type TargetBounds } from '../../landing/landing-geometry';
import { laneRoute, lingeringProgress } from '../../flight/approach-flow';
export const TRUMP_DURATION = 5600;
export const TRUMP_PAT_MS = 2300;
export const TRUMP_SCALE = 0.8;
export const TRUMP_PHRASES = [
  'Yuge, nothing quite like it.',
  "Get outta here, you're fired",
  'Loser',
] as const;
export const trumpEase = ease;
export function trumpPhrase(id: string) {
  return TRUMP_PHRASES[Math.floor(seededRandom(id + ':trump')() * 3)] ?? TRUMP_PHRASES[0];
}
export interface TrumpPlan {
  readonly phrase: string;
  readonly pace: number;
  readonly pat: number;
  readonly force: number;
  readonly detour: number;
  readonly pause: number;
  readonly step: number;
  readonly inspect: number;
  readonly departure: number;
  readonly exit: number;
  readonly spot: Point;
}
export function trumpPlan(id: string): TrumpPlan {
  const r = seededRandom(id + ':trump-inspection');
  return {
    phrase: trumpPhrase(id),
    pace: 0.9 + r() * 0.2,
    pat: TRUMP_PAT_MS + r() * 180 - 90,
    force: 0.85 + r() * 0.3,
    detour: 12 + r() * 18,
    pause: 0.035 + r() * 0.045,
    step: 0.9 + r() * 0.2,
    inspect: 0.85 + r() * 0.3,
    departure: 3600 + r() * 160,
    exit: 0.9 + r() * 0.2,
    spot: landingVariation(id),
  };
}
export function trumpLandingPoint(
  p: TrumpPlan,
  b: TargetBounds,
  view: Point,
  source: Point,
  chosenFacing?: number,
): Point {
  const toward = source.x < b.left + b.width / 2 ? 1 : -1;
  let facing = chosenFacing ?? (p.spot.x < 0.32 ? -toward : toward);
  if (chosenFacing === undefined) {
    if (b.left < 64 && b.left + b.width + 64 < view.x) facing = -1;
    else if (b.left + b.width > view.x - 64 && b.left > 64) facing = 1;
  }
  return { x: facing > 0 ? b.left - 27 : b.left + b.width + 27, y: b.top + b.height - 37 };
}
export function trumpApproach(
  p: TrumpPlan,
  start: Point,
  end: Point,
  view: Point,
  progress: number,
  b: TargetBounds,
) {
  const t = lingeringProgress(progress, 0.6, 0.72, p.pause);
  const bend = Math.min(p.detour, Math.max(0, view.y - 46 - Math.max(start.y, end.y)));
  if (
    (start.x - b.left - b.width / 2) * (end.x - b.left - b.width / 2) < 0 &&
    Math.abs(end.x - start.x) > b.width + 40
  ) {
    const lane =
      b.top + b.height + 84 < view.y - 44 ? b.top + b.height + 84 : Math.max(84, b.top - 44);
    return laneRoute(start, end, lane, t);
  }
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t + Math.sin(t * Math.PI) * bend,
  };
}
export function trumpCardPose(ms: number, p: TrumpPlan, facing: number) {
  const age = ms - p.pat;
  if (age <= 0 || age >= 420) return { x: 0, y: 0, angle: 0, sx: 1 };
  const recoil = Math.sin((age / 420) * Math.PI * 2) * Math.exp(-age / 180) * p.force;
  return {
    x: facing * recoil * 2.8,
    y: Math.abs(recoil) * 0.6,
    angle: facing * recoil * 1.8,
    sx: 1 - Math.abs(recoil) * 0.008,
  };
}
export function trumpCardPoint(
  ms: number,
  raw: Point,
  p: TrumpPlan,
  b: TargetBounds,
  facing: number,
) {
  const pose = trumpCardPose(ms, p, facing);
  const a = (pose.angle * Math.PI) / 180;
  const x = (raw.x - b.left - b.width / 2) * pose.sx;
  const y = raw.y - b.top - b.height / 2;
  return {
    x: b.left + b.width / 2 + x * Math.cos(a) - y * Math.sin(a) + pose.x,
    y: b.top + b.height / 2 + x * Math.sin(a) + y * Math.cos(a) + pose.y,
  };
}
export function trumpContact(p: TrumpPlan, b: TargetBounds, facing: number) {
  return {
    x: facing > 0 ? b.left + b.width * 0.025 : b.left + b.width * 0.975,
    y: b.top + b.height * (0.53 + p.spot.y * 0.025),
  };
}
export function trumpHandPoint(
  ms: number,
  p: TrumpPlan,
  b: TargetBounds,
  end: Point,
  facing: number,
) {
  const rest = { x: end.x + facing * 16, y: end.y + 10 };
  const hit = trumpCardPoint(ms, trumpContact(p, b, facing), p, b, facing);
  const wind = { x: end.x + facing * 10, y: hit.y - 7 };
  if (ms < p.pat - 430) return rest;
  if (ms < p.pat - 170) {
    const t = trumpEase((ms - p.pat + 430) / 260);
    return { x: rest.x + (wind.x - rest.x) * t, y: rest.y + (wind.y - rest.y) * t };
  }
  if (ms < p.pat) {
    const t = trumpEase((ms - p.pat + 170) / 170);
    return { x: wind.x + (hit.x - wind.x) * t, y: wind.y + (hit.y - wind.y) * t };
  }
  const t = trumpEase((ms - p.pat - 130) / 340);
  return { x: hit.x + (rest.x - hit.x) * t, y: hit.y + (rest.y - hit.y) * t };
}
export function trumpExit(
  ms: number,
  p: TrumpPlan,
  b: TargetBounds,
  end: Point,
  view: Point,
  facing: number,
): Point {
  const t = trumpEase((ms - p.departure) / (1450 * p.exit));
  const exitX = facing > 0 ? view.x + 100 : -100;
  // The confident forward exit passes below the card instead of crossing its surface.
  const lane =
    b.top + b.height + 84 < view.y - 44 ? b.top + b.height + 84 : Math.max(84, b.top - 44);
  const down = trumpEase(t / 0.18);
  const x =
    t < 0.18
      ? end.x + facing * 8 * down
      : end.x + facing * 8 + (exitX - end.x - facing * 8) * trumpEase((t - 0.18) / 0.82);
  return { x, y: end.y + (lane - end.y) * down };
}
