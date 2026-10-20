import { clamp, ease } from '../../kit';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { rocketPoint, rocketRoute, type RocketRoute } from './rocket-flight';
import { evenParameter, lingeringProgress } from '../../flight/approach-flow';

export const ROCKET_SCALE = 0.85,
  ROCKET_DURATION = 9000,
  ROCKET_NOZZLE = -20,
  ROCKET_TIP = 30;
export const rocketEase = ease;
export interface RocketPlan {
  readonly route: RocketRoute;
  readonly pace: number;
  readonly side: number;
  readonly ignite: number;
  readonly travel: number;
  readonly hit: number;
  readonly pad: number;
  readonly pause: number;
  readonly spot: number;
  readonly force: number;
  readonly rise: number;
  readonly fires: readonly number[];
  readonly departure: number;
  readonly exit: number;
  readonly bend: number;
  readonly fault: boolean;
  readonly phase: number;
}
export function rocketPlan(id: string): RocketPlan {
  const r = seededRandom(id + ':little-engine'),
    route = rocketRoute(id),
    ignite = 260 + r() * 120;
  const travel = route.duration + 600,
    hit = ignite + travel,
    pad = hit + 700 + r() * 100;
  const count = 2 + Math.floor(r() * 2),
    spacing = 310 + r() * 40;
  const fires = Array.from({ length: count }, (_, i) => pad + 450 + i * spacing);
  return {
    route,
    pace: 0.94 + r() * 0.12,
    side: r() < 0.5 ? -1 : 1,
    ignite,
    travel,
    hit,
    pad,
    pause: 0.08 + r() * 0.06,
    spot: 0.24 + r() * 0.13,
    force: 0.85 + r() * 0.3,
    rise: 16 + r() * 12,
    fires,
    departure: pad + 450 + (count - 1) * spacing + 500,
    exit: 1800 + r() * 300,
    bend: 65 + r() * 50,
    fault: r() < 0.5,
    phase: r() * Math.PI * 2,
  };
}
export const rocketAim = (facing: number) => -facing * (Math.PI / 2 - 0.16);
export function rocketContact(p: RocketPlan, b: TargetBounds, facing: number): Point {
  return { x: b.left + b.width * (facing > 0 ? 0.12 : 0.88), y: b.top + b.height * p.spot };
}
export function rocketLandingPoint(
  p: RocketPlan,
  b: TargetBounds,
  view: Point,
  chosen?: number,
): Point {
  let facing = chosen ?? p.side;
  if (chosen === undefined) {
    if (b.left < 48) facing = -1;
    else if (b.left + b.width > view.x - 48) facing = 1;
  }
  const tip = rocketContact(p, b, facing),
    a = rocketAim(facing);
  return {
    x: tip.x + Math.sin(a) * ROCKET_TIP * ROCKET_SCALE,
    y: tip.y + Math.cos(a) * ROCKET_TIP * ROCKET_SCALE,
  };
}
function pulse(ms: number, born: number, duration: number) {
  const t = (ms - born) / duration;
  return t > 0 && t < 1 ? Math.sin(Math.PI * t) : 0;
}
export function rocketCardPose(p: RocketPlan, ms: number, facing: number) {
  const age = ms - p.hit,
    contact =
      age > 0 && age < 350
        ? Math.sin((age / 110) * Math.PI) *
          Math.exp(-age / 100) *
          (1 - rocketEase((age - 250) / 100))
        : 0;
  let push = pulse(ms, p.pad, 240) * 1.5;
  for (const born of p.fires) push += pulse(ms, born, 230) * (p.fault ? 3 : 4);
  push += pulse(ms, p.departure, 420) * 8;
  return {
    x: facing * contact * 5 * p.force,
    y: push * p.force,
    angle: facing * (contact * 2 + push * 0.17) * p.force,
    sy: 1 - push * 0.004 * p.force,
  };
}
export function rocketCardPoint(
  p: RocketPlan,
  ms: number,
  raw: Point,
  b: TargetBounds,
  facing: number,
): Point {
  const pose = rocketCardPose(p, ms, facing),
    a = (pose.angle * Math.PI) / 180;
  const x = raw.x - b.left - b.width / 2,
    y = (raw.y - b.top - b.height / 2) * pose.sy;
  return {
    x: b.left + b.width / 2 + x * Math.cos(a) - y * Math.sin(a) + pose.x,
    y: b.top + b.height / 2 + x * Math.sin(a) + y * Math.cos(a) + pose.y,
  };
}
export function rocketProgress(p: RocketPlan, t: number) {
  // The engine cuts for the hesitation, so the rocket coasts slowly instead of hanging still.
  return lingeringProgress(t, 0.57, 0.58, p.pause);
}
export function rocketThrust(p: RocketPlan, ms: number) {
  if (ms < p.ignite) return rocketEase(ms / p.ignite) * 0.16;
  if (ms < p.hit) {
    const t = (ms - p.ignite) / p.travel;
    return t > 0.57 && t < 0.57 + p.pause
      ? 0
      : (0.72 + 0.12 * Math.sin(ms / 53 + p.phase)) * (1 - rocketEase((t - 0.89) / 0.11));
  }
  if (ms < p.departure) {
    let power = 0;
    for (const at of p.fires) power = Math.max(power, pulse(ms, at, 230));
    return power;
  }
  const age = ms - p.departure;
  if (age > 420 + p.exit) return 0;
  const cough = p.fault ? pulse(age - 420, p.exit * 0.1, p.exit * 0.14) * 0.8 : 0;
  return (0.86 + 0.12 * Math.sin(ms / 47 + p.phase)) * (1 - cough);
}
export function rocketExitProgress(p: RocketPlan, t: number) {
  const u = clamp(t),
    q = u * u;
  return p.fault && u <= 0.12
    ? rocketEase(u / 0.12) * 0.12 ** 2
    : p.fault && u < 0.2
      ? 0.12 ** 2
      : p.fault
        ? 0.12 ** 2 + (1 - 0.12 ** 2) * ((u - 0.2) / 0.8) ** 2
        : q;
}
function spacePoint(
  p: RocketPlan,
  start: Point,
  end: Point,
  b: TargetBounds,
  view: Point,
  t: number,
): Point {
  const margin = 24,
    top = Math.max(48, Math.min(start.y - b.height / 2, b.top) - 45);
  const bottom = Math.min(view.y - 48, Math.max(start.y + b.height / 2, b.top + b.height) + 50);
  const shiftY = top - margin,
    route = {
      ...p.route,
      viewport: {
        x: Math.max(100, view.x - margin * 2),
        y: Math.max(100, bottom - top + margin * 2),
      },
    };
  const at = rocketPoint(
    { x: start.x - margin, y: start.y - shiftY },
    { x: end.x - margin, y: end.y - shiftY },
    route,
    t,
  );
  return { x: at.x + margin, y: at.y + shiftY };
}
export function rocketDeparture(p: RocketPlan, b: TargetBounds, facing: number, t: number): Point {
  const progress = rocketExitProgress(p, t);
  return {
    x: b.left + b.width / 2 + facing * Math.sin(progress * Math.PI) * p.bend,
    y:
      b.top +
      ROCKET_NOZZLE * ROCKET_SCALE -
      (b.top + ROCKET_NOZZLE * ROCKET_SCALE + 120) * progress,
  };
}
export function rocketPose(
  p: RocketPlan,
  ms: number,
  start: Point,
  b: TargetBounds,
  view: Point,
  facing: number,
) {
  const aim = rocketAim(facing),
    end = rocketLandingPoint(p, b, view, facing),
    card = rocketCardPose(p, ms, facing);
  let point: Point,
    angle = 0,
    bank = 0;
  if (ms < p.hit) {
    const t = clamp((ms - p.ignite) / p.travel),
      q = rocketProgress(p, t);
    // Fly the wavy route at an even pace so its turns never brake the rocket to a standstill.
    const route = (u: number) => spacePoint(p, start, end, b, view, u),
      u = evenParameter(route, q, 96);
    point = route(u);
    const a = route(Math.max(0, u - 0.001)),
      c = route(Math.min(1, u + 0.001));
    const heading =
      Math.hypot(c.x - a.x, c.y - a.y) > 0.00001 ? Math.atan2(a.x - c.x, a.y - c.y) : aim;
    const blend = rocketEase((q - 0.84) / 0.16),
      delta = Math.atan2(Math.sin(aim - heading), Math.cos(aim - heading));
    angle = (heading + delta * blend) * rocketEase(t / 0.09);
    bank = Math.sin(q * Math.PI) * 0.16;
  } else if (ms < p.hit + 350) {
    angle = aim - (card.angle * Math.PI) / 180;
    const tip = rocketCardPoint(p, ms, rocketContact(p, b, facing), b, facing);
    point = {
      x: tip.x + Math.sin(angle) * ROCKET_TIP * ROCKET_SCALE,
      y: tip.y + Math.cos(angle) * ROCKET_TIP * ROCKET_SCALE,
    };
  } else if (ms < p.pad) {
    const u = clamp((ms - p.hit - 350) / (p.pad - p.hit - 350)),
      q = rocketEase(u);
    const top = { x: b.left + b.width / 2, y: b.top + ROCKET_NOZZLE * ROCKET_SCALE };
    angle = aim * (1 - q);
    point = {
      x: end.x + (top.x - end.x) * q,
      y: end.y + (top.y - end.y) * q - Math.sin(u * Math.PI) * p.rise,
    };
  } else if (ms < p.departure + 420) {
    let cough = 0;
    for (const at of p.fires) cough += pulse(ms, at, 230);
    angle = (-card.angle * Math.PI) / 180 + facing * cough * (p.fault ? 0.14 : 0.055);
    const nozzle = rocketCardPoint(p, ms, { x: b.left + b.width / 2, y: b.top }, b, facing);
    point = {
      x: nozzle.x + Math.sin(angle) * ROCKET_NOZZLE * ROCKET_SCALE,
      y: nozzle.y + Math.cos(angle) * ROCKET_NOZZLE * ROCKET_SCALE,
    };
  } else {
    const t = clamp((ms - p.departure - 420) / p.exit),
      progress = rocketExitProgress(p, t);
    point = rocketDeparture(p, b, facing, t);
    const heading = Math.atan2(
      -facing * Math.PI * Math.cos(progress * Math.PI) * p.bend,
      b.top + ROCKET_NOZZLE * ROCKET_SCALE + 120,
    );
    angle = heading * rocketEase(t / 0.12);
    bank = facing * Math.sin(t * Math.PI) * 0.17;
  }
  return { point, angle, bank, power: rocketThrust(p, ms) };
}
export function rocketFrames(p: RocketPlan, facing: number) {
  const frames: Keyframe[] = [];
  for (let ms = 0; ms <= ROCKET_DURATION; ms += 20) {
    const q = rocketCardPose(p, ms, facing);
    frames.push({
      offset: ms / ROCKET_DURATION,
      translate: `${q.x}px ${q.y}px`,
      rotate: `${q.angle}deg`,
      scale: `1 ${q.sy}`,
    });
  }
  return { frames, options: { duration: ROCKET_DURATION * p.pace, easing: 'linear' } };
}
