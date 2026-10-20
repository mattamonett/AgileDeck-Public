import { ease } from '../../kit';
import { seededRandom, type Point } from '../../flight/flight-math';
import { landingVariation, type TargetBounds } from '../../landing/landing-geometry';
import { laneRoute, lingeringProgress } from '../../flight/approach-flow';
export const WRESTLER_DURATION = 6200;
export const WRESTLER_CONTACT_MS = 900;
export const WRESTLER_SCALE = 0.8;
export const wrestlerEase = ease;
export interface WrestlerPlan {
  readonly pace: number;
  readonly hit: number;
  readonly force: number;
  readonly pause: number;
  readonly detour: number;
  readonly step: number;
  readonly wave: boolean;
  readonly departure: number;
  readonly exit: number;
  readonly spot: Point;
}
export function wrestlerPlan(id: string): WrestlerPlan {
  const r = seededRandom(id + ':heel-shoulder');
  const hit = 900 + r() * 100 - 50;
  return {
    pace: 0.92 + r() * 0.16,
    hit,
    force: 0.85 + r() * 0.3,
    pause: 0.025 + r() * 0.035,
    detour: 12 + r() * 20,
    step: 0.9 + r() * 0.2,
    wave: r() < 0.5,
    departure: hit + 2850 + r() * 120,
    exit: 0.9 + r() * 0.16,
    spot: landingVariation(id),
  };
}
export function wrestlerLandingPoint(
  p: WrestlerPlan,
  b: TargetBounds,
  view: Point,
  source: Point,
  chosen?: number,
): Point {
  const toward = source.x < b.left + b.width / 2 ? 1 : -1;
  let facing = chosen ?? (p.spot.x < 0.35 ? -toward : toward);
  if (chosen === undefined) {
    if (b.left < 80 && b.left + b.width + 80 < view.x) facing = -1;
    else if (b.left + b.width > view.x - 80 && b.left > 80) facing = 1;
  }
  return { x: facing > 0 ? b.left - 43 : b.left + b.width + 43, y: b.top + b.height - 45 };
}
const approach = (p: WrestlerPlan, t: number) => lingeringProgress(t, 0.72, 0.84, p.pause);
export function wrestlerApproach(
  p: WrestlerPlan,
  start: Point,
  end: Point,
  view: Point,
  t: number,
  b: TargetBounds,
): Point {
  const u = approach(p, t);
  if ((start.x - b.left - b.width / 2) * (end.x - b.left - b.width / 2) < 0) {
    const lane =
      b.top + b.height + 78 < view.y - 45 ? b.top + b.height + 78 : Math.max(100, b.top - 52);
    return laneRoute(start, end, lane, u);
  }
  return {
    x: start.x + (end.x - start.x) * u,
    y:
      start.y +
      (end.y - start.y) * u +
      Math.sin(u * Math.PI) *
        Math.min(p.detour, Math.max(0, view.y - 45 - Math.max(start.y, end.y))),
  };
}
export function wrestlerApproachFacing(
  p: WrestlerPlan,
  start: Point,
  end: Point,
  b: TargetBounds,
  t: number,
) {
  const contact = Math.sign(b.left + b.width / 2 - end.x) || 1,
    walk = Math.sign(end.x - start.x) || contact,
    q = wrestlerEase((approach(p, t) - 0.62) / 0.2);
  return walk + (contact - walk) * q;
}
export function wrestlerCardPose(p: WrestlerPlan, ms: number, facing: number) {
  const age = ms - p.hit;
  if (age <= 0 || age >= 700) return { x: 0, y: 0, angle: 0, sx: 1, sy: 1 };
  const press = age < 100 ? wrestlerEase(age / 100) : 1 - wrestlerEase((age - 100) / 260);
  const bounce =
    age < 180
      ? 0
      : Math.sin(Math.min(1, (age - 180) / 520) * Math.PI * 2) *
        (1 - wrestlerEase((age - 180) / 520));
  return {
    x: facing * (press * 12 + bounce * 4) * p.force,
    y: press * 2 * p.force,
    angle: facing * (press * 7 + bounce * 3) * p.force,
    sx: 1 - press * 0.07 * p.force,
    sy: 1 + press * 0.025 * p.force,
  };
}
export function wrestlerCardPoint(
  p: WrestlerPlan,
  ms: number,
  raw: Point,
  b: TargetBounds,
  facing: number,
): Point {
  const pose = wrestlerCardPose(p, ms, facing),
    a = (pose.angle * Math.PI) / 180,
    x = (raw.x - b.left - b.width / 2) * pose.sx,
    y = (raw.y - b.top - b.height / 2) * pose.sy;
  return {
    x: b.left + b.width / 2 + x * Math.cos(a) - y * Math.sin(a) + pose.x,
    y: b.top + b.height / 2 + x * Math.sin(a) + y * Math.cos(a) + pose.y,
  };
}
export function wrestlerContact(p: WrestlerPlan, b: TargetBounds, facing: number): Point {
  return {
    x: facing > 0 ? b.left + 0.5 : b.left + b.width - 0.5,
    y: b.top + b.height * (0.69 + p.spot.y * 0.015),
  };
}
export function wrestlerLean(p: WrestlerPlan, ms: number, facing: number) {
  const wind = wrestlerEase((ms - 180) / 360),
    charge = wrestlerEase((ms - p.hit + 260) / 260),
    recover = wrestlerEase((ms - p.hit - 180) / 650);
  return -facing * (wind * 0.08 + charge * 0.57) * (1 - recover);
}
/** The sleeve's native leading point is (27, 11, 7) before torso rotation. */
export function wrestlerRoot(
  p: WrestlerPlan,
  ms: number,
  b: TargetBounds,
  end: Point,
  facing: number,
): Point {
  const lean = wrestlerLean(p, ms, facing),
    wind = wrestlerEase((ms - 180) / 360),
    charge = wrestlerEase((ms - p.hit + 260) / 260);
  const a = lean,
    x = facing * 27 * Math.cos(a) - 11 * Math.sin(a),
    y = facing * 27 * Math.sin(a) + 11 * Math.cos(a);
  const hit = wrestlerCardPoint(p, ms, wrestlerContact(p, b, facing), b, facing);
  const contact = { x: hit.x - x * WRESTLER_SCALE, y: hit.y + y * WRESTLER_SCALE };
  const recover = wrestlerEase((ms - p.hit - 180) / 650);
  const load = { x: end.x - facing * 6 * wind, y: end.y + 4 * wind };
  return {
    x: (load.x + (contact.x - load.x) * charge) * (1 - recover) + end.x * recover,
    y: (load.y + (contact.y - load.y) * charge) * (1 - recover) + end.y * recover,
  };
}
export function wrestlerFeet(
  p: WrestlerPlan,
  ms: number,
  end: Point,
  facing: number,
  side: number,
): Point {
  const stepStart = p.hit + 300 + (side === facing ? 0 : 380),
    q = wrestlerEase((ms - stepStart) / 380);
  return {
    x: end.x + facing * 14 * (1 - q) + side * 10 * WRESTLER_SCALE,
    y: end.y + 54 * WRESTLER_SCALE - Math.sin(q * Math.PI) * 5,
  };
}
export function wrestlerFrames(p: WrestlerPlan, facing: number) {
  const frames: Keyframe[] = [];
  for (let ms = 0; ms <= WRESTLER_DURATION; ms += 20) {
    const q = wrestlerCardPose(p, ms, facing);
    frames.push({
      offset: ms / WRESTLER_DURATION,
      translate: `${q.x}px ${q.y}px`,
      rotate: `${q.angle}deg`,
      scale: `${q.sx} ${q.sy}`,
    });
  }
  return { frames, options: { duration: WRESTLER_DURATION * p.pace, easing: 'linear' } };
}
