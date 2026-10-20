import { ease } from '../../kit';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { evenPath, lingeringProgress } from '../../flight/approach-flow';
export const UFO_DURATION = 6400;
export const UFO_SCALE = 0.8;
export const ufoEase = ease;
export interface UfoPlan {
  readonly pace: number;
  readonly side: number;
  readonly lift: number;
  readonly hover: number;
  readonly scans: number;
  readonly fault: boolean;
  readonly faultAt: number;
  readonly release: number;
  readonly pause: number;
  readonly bend: number;
  readonly exit: number;
  readonly phase: number;
}
export function ufoPlan(id: string): UfoPlan {
  const r = seededRandom(id + ':saucer-tractor');
  return {
    pace: 0.92 + r() * 0.16,
    side: r() < 0.5 ? 1 : -1,
    lift: 22 + r() * 8,
    hover: 62 + r() * 14,
    scans: 2 + Math.floor(r() * 2),
    fault: r() < 0.45,
    faultAt: 2100 + r() * 200,
    release: 3450 + r() * 170,
    pause: 0.04 + r() * 0.045,
    bend: 28 + r() * 26,
    exit: 0.9 + r() * 0.15,
    phase: r(),
  };
}
export function ufoLandingPoint(p: UfoPlan, b: TargetBounds, view: Point): Point {
  return {
    x: Math.max(34, Math.min(view.x - 34, b.left + b.width / 2 + p.side * b.width * 0.12)),
    y: Math.max(30, b.top - p.hover),
  };
}
const progress = (p: UfoPlan, t: number) => lingeringProgress(t, 0.7, 0.82, p.pause);
function ufoArc(p: UfoPlan, start: Point, end: Point, view: Point, q: number): Point {
  const v = 1 - q,
    sky = Math.max(35, Math.min(start.y, end.y) - p.bend);
  // A hover point far below the sender descends through the arc instead of hooking back down from its top.
  const descent = sky + Math.max(0, end.y - start.y) * 0.5;
  return {
    x:
      v * v * v * start.x +
      3 * v * v * q * Math.max(34, Math.min(view.x - 34, start.x + p.side * p.bend)) +
      3 * v * q * q * (end.x - p.side * 24) +
      q * q * q * end.x,
    y: v * v * v * start.y + 3 * v * v * q * sky + 3 * v * q * q * descent + q * q * q * end.y,
  };
}
export function ufoApproach(p: UfoPlan, start: Point, end: Point, view: Point, t: number): Point {
  return evenPath((q) => ufoArc(p, start, end, view, q), progress(p, t));
}
export function ufoBeam(p: UfoPlan, ms: number) {
  return ufoEase((ms - 300) / 250) * (1 - ufoEase((ms - p.release - 650) / 220));
}
export function ufoFault(p: UfoPlan, ms: number) {
  return p.fault && ms > p.faultAt && ms < p.faultAt + 240
    ? Math.sin(((ms - p.faultAt) / 240) * Math.PI) ** 2
    : 0;
}
export function ufoCardPose(p: UfoPlan, ms: number, b: TargetBounds) {
  if (ms <= 650 || ms >= p.release + 950) return { x: 0, y: 0, angle: 0 };
  const lift = ufoEase((ms - 650) / 550) * (1 - ufoEase((ms - p.release) / 650));
  const orbit = ufoEase((ms - 1200) / 180) * (1 - ufoEase((ms - p.release) / 450));
  const a = ((ms - 1200) / (p.release - 1200)) * Math.PI * 2 * p.scans;
  const height = Math.min(p.lift, Math.max(0, b.top - (Math.max(30, b.top - p.hover) + 28)));
  const age = ms - p.release - 650,
    settle =
      height > 0 && age > 0 && age < 300
        ? Math.sin((age / 300) * Math.PI * 2) * (1 - ufoEase(age / 300)) * 2
        : 0;
  return {
    x: p.side * Math.sin(a) * 4 * orbit,
    y: -height * lift + ufoFault(p, ms) * 3 + settle,
    angle: p.side * Math.sin(a + 0.35) * 3 * orbit,
  };
}
export function ufoCardPoint(p: UfoPlan, ms: number, raw: Point, b: TargetBounds): Point {
  const pose = ufoCardPose(p, ms, b),
    a = (pose.angle * Math.PI) / 180,
    x = raw.x - b.left - b.width / 2,
    y = raw.y - b.top - b.height / 2;
  return {
    x: b.left + b.width / 2 + x * Math.cos(a) - y * Math.sin(a) + pose.x,
    y: b.top + b.height / 2 + x * Math.sin(a) + y * Math.cos(a) + pose.y,
  };
}
export function ufoRoot(p: UfoPlan, ms: number, end: Point, view: Point): Point {
  const hover = ufoEase(ms / 300) * (1 - ufoEase((ms - p.release - 870) / 230)),
    orbit = ufoEase((ms - 1200) / 180) * (1 - ufoEase((ms - p.release) / 450));
  const a = ((ms - 1200) / (p.release - 1200)) * Math.PI * 2 * p.scans;
  const departure = p.release + 1100,
    q = Math.max(0, Math.min(1, (ms - departure) / (1200 * p.exit))),
    boost = q * q * q;
  return {
    x: end.x + Math.sin(a) * 6 * orbit + boost * ((p.side > 0 ? view.x + 100 : -100) - end.x),
    y: end.y + Math.sin(ms / 300) * 1.5 * hover - (end.y + 90) * boost,
  };
}
export function ufoFrames(p: UfoPlan, b: TargetBounds) {
  const frames: Keyframe[] = [];
  for (let ms = 0; ms <= UFO_DURATION; ms += 20) {
    const q = ufoCardPose(p, ms, b);
    frames.push({
      offset: ms / UFO_DURATION,
      translate: q.x || q.y ? `${q.x}px ${q.y}px` : '0 0',
      rotate: `${q.angle}deg`,
    });
  }
  return { frames, options: { duration: UFO_DURATION * p.pace, easing: 'linear' } };
}
