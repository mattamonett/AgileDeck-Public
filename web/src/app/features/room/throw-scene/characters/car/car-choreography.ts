import { clamp, ease } from '../../kit';
import { seededRandom, type Point } from '../../flight/flight-math';
import { landingVariation, type TargetBounds } from '../../landing/landing-geometry';
import { carCourse } from './car-course';
export const CAR_DURATION = 6200;
export const DRIVER_HIT_MS = 650;
export const CAR_SCALE = 0.8;
export const carClamp = clamp;
export const carEase = ease;
export interface CarPlan {
  readonly seed: string;
  readonly pace: number;
  readonly hit: number;
  readonly force: number;
  readonly arc: number;
  readonly turns: number;
  readonly brake: number;
  readonly wheelSpeed: number;
  readonly slide: number;
  readonly slideDuration: number;
  readonly helmet: boolean;
  readonly coughs: number;
  readonly departure: number;
  readonly exit: number;
  readonly spot: Point;
}
export function carPlan(id: string): CarPlan {
  const random = seededRandom(id + ':car-catastrophe');
  const hit = DRIVER_HIT_MS + random() * 110 - 55;
  return {
    seed: id,
    pace: 0.9 + random() * 0.2,
    hit,
    force: 0.85 + random() * 0.3,
    arc: 35 + random() * 20,
    turns: random() < 0.5 ? 1 : 2,
    brake: 0.1 + random() * 0.05,
    wheelSpeed: 28 + random() * 14,
    slide: hit + 400 + random() * 100,
    slideDuration: 700 + random() * 150,
    helmet: random() < 0.5,
    coughs: random() < 0.5 ? 2 : 3,
    departure: 3400 + random() * 180,
    exit: 0.9 + random() * 0.2,
    spot: landingVariation(id),
  };
}
export function carLandingPoint(
  p: CarPlan,
  b: TargetBounds,
  view: Point,
  source: Point,
  chosenFacing?: number,
): Point {
  const toward = source.x < b.left + b.width / 2 ? 1 : -1;
  let facing = chosenFacing ?? (p.spot.x < 0.35 ? -toward : toward);
  if (chosenFacing === undefined) {
    if (b.left < 96 && b.left + b.width + 96 < view.x) facing = -1;
    else if (b.left + b.width > view.x - 96 && b.left > 96) facing = 1;
    if (view.y - b.top - b.height < 74 && b.top < 90) facing = toward;
  }
  return {
    x: facing > 0 ? b.left - 53 * CAR_SCALE : b.left + b.width + 53 * CAR_SCALE,
    y: b.top + b.height - 18,
  };
}
function carProgress(p: CarPlan, t: number) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const cutoff = 1 - p.brake;
  const u = carClamp(t / cutoff);
  const v = carClamp((t - cutoff) / p.brake);
  return t < cutoff ? 0.94 * (0.55 * u + 0.45 * u * u) : 0.94 + 0.06 * (0.65 * v + 0.35 * v * v);
}
export function carApproach(
  p: CarPlan,
  start: Point,
  end: Point,
  board: TargetBounds,
  facing: number,
  t: number,
  target: TargetBounds,
): Point {
  return carCourse(p.seed, p.spot, start, end, board, target, facing, carProgress(p, t)).point;
}
export function carDistance(
  p: CarPlan,
  start: Point,
  end: Point,
  board: TargetBounds,
  facing: number,
  t: number,
  target: TargetBounds,
) {
  return carCourse(p.seed, p.spot, start, end, board, target, facing, carProgress(p, t)).distance;
}
export function carCardPose(ms: number, p: CarPlan, facing: number) {
  let recoil = 0;
  for (const [hit, duration, strength] of [
    [0, 480, 1],
    [p.hit, 380, 0.48],
  ] as const) {
    const age = ms - hit;
    if (age >= 0 && age < duration)
      recoil = Math.sin((age / duration) * Math.PI * 2) * Math.exp(-age / 290) * strength;
  }
  if (recoil === 0) return { x: 0, y: 0, angle: 0, sx: 1 };
  return {
    x: facing * recoil * 11 * p.force,
    y: Math.abs(recoil) * 2 * p.force,
    angle: facing * recoil * 9 * p.force,
    sx: 1 - Math.abs(recoil) * 0.025,
  };
}
export function carCardPoint(
  ms: number,
  raw: Point,
  b: TargetBounds,
  p: CarPlan,
  facing: number,
): Point {
  const pose = carCardPose(ms, p, facing);
  const a = (pose.angle * Math.PI) / 180;
  const x = (raw.x - b.left - b.width / 2) * pose.sx;
  const y = raw.y - b.top - b.height / 2;
  return {
    x: b.left + b.width / 2 + x * Math.cos(a) - y * Math.sin(a) + pose.x,
    y: b.top + b.height / 2 + x * Math.sin(a) + y * Math.cos(a) + pose.y,
  };
}
export function carDriverPoint(p: CarPlan, b: TargetBounds, facing: number): Point {
  const inset = b.width * (0.05 + p.spot.x * 0.02);
  return {
    x: facing > 0 ? b.left + inset : b.left + b.width - inset,
    y: b.top + b.height * (0.3 + p.spot.y * 0.08),
  };
}
export function carExit(ms: number, p: CarPlan) {
  return carEase((ms - p.departure) / (1600 * p.exit));
}
export function carCough(ms: number, p: CarPlan) {
  let cough = 0;
  for (let i = 0; i < p.coughs; i++) {
    const age = ms - (p.departure - 650 + i * 220);
    if (age >= 0 && age < 180) cough = Math.max(cough, Math.sin((age / 180) * Math.PI));
  }
  return cough;
}
export function carGlassOrigin(
  p: CarPlan,
  end: Point,
  view: Point,
  facing: number,
  i: number,
): Point {
  const root = carRootPose(110, p, end, view, facing);
  const angle = 0.2 + carEase(110 / 150) * 0.8;
  const x = i < 4 ? -1 : 1;
  const y = ((i % 4) - 1.5) * 4;
  return {
    x: root.x + facing * CAR_SCALE * (10 + x * Math.cos(angle) - y * Math.sin(angle)),
    y: root.y - CAR_SCALE * (21 + x * Math.sin(angle) + y * Math.cos(angle)),
  };
}
export function carRootPose(ms: number, p: CarPlan, end: Point, view: Point, facing: number) {
  const recoil = carCardPose(ms, p, facing);
  const crush = carEase(ms / 150);
  const exit = carExit(ms, p);
  const exitX = facing > 0 ? -120 : view.x + 120;
  return {
    x: end.x + recoil.x + facing * crush * 4 + (exitX - end.x - facing * 4) * exit,
    y: end.y + recoil.y + Math.sin(exit * Math.PI) * (p.spot.y - 0.5) * 14,
    z: 160,
    exit,
  };
}
export function carHelmetOffset(angle: number, neck: number, facing: number): Point {
  const x = 9 * Math.cos(neck) - 6 * Math.sin(neck);
  const y = 8 + 9 * Math.sin(neck) + 6 * Math.cos(neck);
  return {
    x: facing * CAR_SCALE * (x * Math.cos(angle) - y * Math.sin(angle)),
    y: -CAR_SCALE * (x * Math.sin(angle) + y * Math.cos(angle)),
  };
}
export function carClimb(p: CarPlan) {
  return p.slide + p.slideDuration + 150;
}
export function carDriverPose(
  ms: number,
  p: CarPlan,
  b: TargetBounds,
  end: Point,
  view: Point,
  facing: number,
) {
  const root = carRootPose(ms, p, end, view, facing);
  const seat = { x: root.x - facing * 8 * CAR_SCALE, y: root.y - 21 * CAR_SCALE };
  const impactAngle = -p.turns * Math.PI * 2 - 0.35;
  if (ms <= 100 || ms >= carClimb(p) + 500)
    return {
      ...seat,
      z: root.z + facing * 4 * CAR_SCALE,
      angle: ms <= 100 ? -0.2 : -p.turns * Math.PI * 2 - 0.2,
      neck: 0,
    };
  const hit = carDriverPoint(p, b, facing);
  const offset = carHelmetOffset(impactAngle, 0, facing);
  if (ms < p.hit) {
    const t = carClamp((ms - 100) / (p.hit - 100));
    const launch = carRootPose(100, p, end, view, facing);
    const start = { x: launch.x - facing * 8 * CAR_SCALE, y: launch.y - 21 * CAR_SCALE };
    const to = { x: hit.x - offset.x, y: hit.y - offset.y };
    return {
      x: start.x + (to.x - start.x) * t,
      y: start.y + (to.y - start.y) * t - Math.sin(t * Math.PI) * p.arc,
      z: launch.z + facing * 4 * CAR_SCALE + (180 - launch.z - facing * 4 * CAR_SCALE) * t,
      angle: -0.2 + (impactAngle + 0.2) * t,
      neck: 0,
    };
  }
  const age = ms - p.hit;
  const climb = carClamp((ms - carClimb(p)) / 500);
  const slide = carEase((ms - p.slide) / p.slideDuration);
  const neck = climb > 0 ? 0 : Math.sin(age * 0.02) * 0.08 * Math.exp(-age / 350);
  const angle = impactAngle + Math.sin(carClamp(age / 400) * Math.PI) * 0.1 * Math.exp(-age / 350);
  const point = carCardPoint(
    ms,
    { x: hit.x, y: hit.y + (b.top + b.height - 28 - hit.y) * slide },
    b,
    p,
    facing,
  );
  const currentOffset = carHelmetOffset(angle, neck, facing);
  const start = { x: point.x - currentOffset.x, y: point.y - currentOffset.y };
  const t = carEase(climb);
  return {
    x: start.x + (seat.x - start.x) * t,
    y: start.y + (seat.y - start.y) * t - Math.sin(climb * Math.PI) * 23,
    z: 180 + (root.z + facing * 4 * CAR_SCALE - 180) * t,
    angle: angle + (-p.turns * Math.PI * 2 - 0.2 - angle) * t,
    neck,
  };
}
