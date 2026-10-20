import { ease } from '../../kit';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { evenParameter, lingeringProgress } from '../../flight/approach-flow';
export const UNICORN_DURATION = 9000;
export const UNICORN_SCALE = 0.8;
export const UNICORN_COLORS: readonly number[] = [
  0xff6d9b, 0xffaa65, 0xffe778, 0x7de6ad, 0x78cbff, 0xb69aff,
];
export const unicornEase = ease;
export interface UnicornPlan {
  readonly pace: number;
  readonly side: number;
  readonly form: number;
  readonly ride: number;
  readonly rise: number;
  readonly bend: number;
  readonly pause: number;
  readonly step: number;
  readonly magic: number;
  readonly pulses: number;
  readonly wink: boolean;
  readonly departure: number;
  readonly exit: number;
  readonly force: number;
  readonly phase: number;
}
export function unicornPlan(id: string): UnicornPlan {
  const r = seededRandom(id + ':rainbow-gift'),
    form = 580 + r() * 140,
    ride = 1850 + r() * 300,
    magic = form + ride + 650 + r() * 160;
  return {
    pace: 0.94 + r() * 0.12,
    side: r() < 0.5 ? 1 : -1,
    form,
    ride,
    rise: 65 + r() * 60,
    bend: 50 + r() * 30,
    pause: 0.035 + r() * 0.04,
    step: 0.9 + r() * 0.2,
    magic,
    pulses: 2 + Math.floor(r() * 2),
    wink: r() < 0.5,
    departure: magic + 1900 + r() * 180,
    exit: 1700 + r() * 220,
    force: 0.85 + r() * 0.25,
    phase: r() * Math.PI * 2,
  };
}
export const unicornArrival = (p: UnicornPlan) => p.form + p.ride;
export function unicornLandingPoint(b: TargetBounds): Point {
  return { x: b.left + b.width / 2, y: b.top };
}
export function unicornProgress(p: UnicornPlan, ms: number) {
  return lingeringProgress((ms - p.form) / p.ride, 0.6, 0.68, p.pause);
}
function bezier(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const q = 1 - t;
  return {
    x: q ** 3 * a.x + 3 * q * q * t * b.x + 3 * q * t * t * c.x + t ** 3 * d.x,
    y: q ** 3 * a.y + 3 * q * q * t * b.y + 3 * q * t * t * c.y + t ** 3 * d.y,
  };
}
export function unicornBridgePoint(
  p: UnicornPlan,
  start: Point,
  end: Point,
  view: Point,
  t: number,
): Point {
  const sky = Math.max(50, Math.min(start.y, end.y) - p.rise),
    toward = Math.sign(end.x - start.x) || p.side;
  const bend = p.side === toward ? Math.min(p.bend, Math.abs(end.x - start.x) * 0.34) : p.bend;
  const sweep = p.side === toward ? start.x + toward * bend : end.x - p.side * bend;
  const edgeLeft = Math.min(50, end.x - 8),
    edgeRight = Math.max(view.x - 50, end.x + 8);
  return bezier(
    start,
    { x: Math.max(50, Math.min(view.x - 50, sweep)), y: sky },
    { x: Math.max(edgeLeft, Math.min(edgeRight, end.x - p.side * bend)), y: end.y },
    end,
    t,
  );
}
/** The bridge parameter reached during the ride, travelling evenly along the arch's length. */
export function unicornRideParameter(
  p: UnicornPlan,
  start: Point,
  end: Point,
  view: Point,
  ms: number,
) {
  return evenParameter((t) => unicornBridgePoint(p, start, end, view, t), unicornProgress(p, ms));
}
export function unicornExitPoint(p: UnicornPlan, end: Point, view: Point, t: number): Point {
  const outside = { x: p.side > 0 ? view.x + 110 : -110, y: -90 };
  return bezier(
    end,
    { x: end.x + p.side * 70, y: end.y - 40 },
    { x: outside.x - p.side * 110, y: 30 },
    outside,
    t,
  );
}
export function unicornCardPose(p: UnicornPlan, ms: number) {
  const age = ms - unicornArrival(p),
    gift = ms - p.magic - 450;
  const landing = age > 0 && age < 400 ? Math.sin((age / 400) * Math.PI) * 2 * p.force : 0;
  const charge = unicornEase(gift / 260) * (1 - unicornEase((ms - p.departure + 240) / 450));
  const push = ms - p.departure;
  const spring = push > 0 && push < 300 ? Math.sin((push / 300) * Math.PI) * 2.5 * p.force : 0;
  const tapAge = ms - p.magic - 1450,
    tap =
      !p.wink && tapAge > 0 && tapAge < 220
        ? Math.sin((tapAge / 220) * Math.PI) * 1.5 * p.force
        : 0;
  const angle = charge * Math.sin(gift / 300 + p.phase) * 0.65;
  return { x: 0, y: landing - charge * 3 + spring + tap, angle };
}
export function unicornCardPoint(p: UnicornPlan, ms: number, raw: Point, b: TargetBounds): Point {
  const pose = unicornCardPose(p, ms),
    a = (pose.angle * Math.PI) / 180,
    x = raw.x - b.left - b.width / 2,
    y = raw.y - b.top - b.height / 2;
  return {
    x: b.left + b.width / 2 + x * Math.cos(a) - y * Math.sin(a),
    y: b.top + b.height / 2 + x * Math.sin(a) + y * Math.cos(a) + pose.y,
  };
}
export function unicornFrames(p: UnicornPlan) {
  const frames: Keyframe[] = [];
  for (let ms = 0; ms <= UNICORN_DURATION; ms += 20) {
    const q = unicornCardPose(p, ms);
    frames.push({
      offset: ms / UNICORN_DURATION,
      translate: q.y ? `0 ${q.y}px` : '0 0',
      rotate: `${q.angle}deg`,
    });
  }
  return { frames, options: { duration: UNICORN_DURATION * p.pace, easing: 'linear' } };
}
