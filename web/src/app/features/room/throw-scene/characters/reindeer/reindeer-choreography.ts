import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  bezier,
  cardFrames,
  chooseSide,
  clamp,
  ease,
  mix,
  pulse,
  sidePoint,
  sideRoute,
  span,
  NEUTRAL_CARD,
  type CardPose,
  type Side,
} from '../../kit';

export const REINDEER_DURATION = 10200;
export const REINDEER_SCALE = 0.85;
export type ReindeerApproach = 'bound' | 'cautious';
export type ReindeerLaunch = 'over' | 'back';
export type ReindeerGesture = 'hoof' | 'nose';
export type ReindeerExit = 'away' | 'past';

export interface ReindeerPlan {
  readonly kind: '🦌';
  readonly side: Side;
  readonly pace: number;
  /** Canonical ms at which the approach reaches the take-off spot beside the card. */
  readonly travel: number;
  readonly bend: number;
  readonly approach: ReindeerApproach;
  /** Bounding surges along the route and how strongly the speed swells with each. */
  readonly surges: number;
  readonly surge: number;
  /** Cautious approach: where along the route Dasher glances round while still walking. */
  readonly lookAt: number;
  /** Gathering crouch before the vault, from a stutter-step to a long bull-like wind-up. */
  readonly gather: number;
  /** Body position along the top edge, measured from the edge nearest Dasher. */
  readonly contactU: number;
  readonly bounces: number;
  readonly bounceDepth: number;
  readonly loadDepth: number;
  readonly hop: number;
  readonly launch: ReindeerLaunch;
  readonly loft: number;
  readonly skid: number;
  readonly gesture: ReindeerGesture;
  readonly flicks: number;
  readonly exit: ReindeerExit;
  readonly exitRise: number;
  readonly buck: boolean;
  readonly stride: number;
  readonly phase: number;
  readonly takeoff: number;
  readonly perch: number;
  readonly period: number;
  readonly spring: number;
  readonly land: number;
  readonly halt: number;
  readonly steady: number;
  readonly glance: number;
  readonly departure: number;
  readonly exitEnd: number;
}

export function reindeerPlan(id: string): ReindeerPlan {
  const r = seededRandom(`${id}:reindeer-v2`);
  const side: Side = r() < 0.5 ? -1 : 1;
  const pace = 0.94 + r() * 0.12;
  const travel = 1600 + r() * 500;
  const bend = r() * 2 - 1;
  const approach: ReindeerApproach = r() < 0.5 ? 'bound' : 'cautious';
  const surges = 3 + Math.floor(r() * 3);
  const surge = 0.22 + r() * 0.2;
  const lookAt = 0.3 + r() * 0.18;
  const gather = 140 + r() * 240;
  const contactU = 0.38 + r() * 0.24;
  const bounces = 1 + Math.floor(r() * 3);
  const bounceDepth = 0.06 + r() * 0.05;
  const loadDepth = 0.15 + r() * 0.06;
  const hop = 0.8 + r() * 0.4;
  const launch: ReindeerLaunch = r() < 0.5 ? 'over' : 'back';
  const loft = r();
  const skid = r();
  const gesture: ReindeerGesture = r() < 0.5 ? 'hoof' : 'nose';
  const flicks = r() < 0.5 ? 1 : 2;
  const exit: ReindeerExit = r() < 0.5 ? 'away' : 'past';
  const exitRise = r() * 2 - 1;
  const buck = r() < 0.5;
  const stride = 0.92 + r() * 0.16;
  const phase = r() * Math.PI * 2;
  const takeoff = travel + gather;
  const perch = takeoff + 440 + r() * 80;
  const period = 300 + r() * 70;
  const spring = perch + bounces * period + 240 + r() * 100;
  const land = spring + 640 + r() * 120;
  const halt = land + 420 + skid * 240;
  const steady = halt + 560 + r() * 160;
  const departure = steady + 1300 + r() * 300;
  const glance = departure - 600;
  const exitEnd = departure + 1300 + r() * 250;
  return {
    kind: '🦌',
    side,
    pace,
    travel,
    bend,
    approach,
    surges,
    surge,
    lookAt,
    gather,
    contactU,
    bounces,
    bounceDepth,
    loadDepth,
    hop,
    launch,
    loft,
    skid,
    gesture,
    flicks,
    exit,
    exitRise,
    buck,
    stride,
    phase,
    takeoff,
    perch,
    period,
    spring,
    land,
    halt,
    steady,
    glance,
    departure,
    exitEnd,
  };
}

export const reindeerFloor = (b: TargetBounds) => b.top + b.height * 1.04;

/** Take-off spot: hooves on the floor a short run-up from the card, on the chosen side. */
export function reindeerLandingPoint(
  p: ReindeerPlan,
  b: TargetBounds,
  view: Point,
  chosen?: number,
): Point {
  return sidePoint(chooseSide(p.side, b, view, chosen), b, view, 34, 1.04);
}

/** Speed rhythm of the approach: uneven bounding surges, or a cautious tiptoe that builds into a gallop. */
export function reindeerApproachSpeed(p: ReindeerPlan, t: number): number {
  const brake = 1 - 0.7 * ease((t - 0.86) / 0.14);
  if (p.approach === 'bound') {
    const start = 0.6 + 0.4 * ease(t / 0.12);
    return start * (1 + p.surge * Math.cos(Math.PI * 2 * p.surges * t)) * brake;
  }
  const build = 0.42 + 1.25 * clamp(t) ** 1.6;
  // The glance round slows Dasher down without stopping him.
  const look = 1 - 0.4 * pulse(t, p.lookAt - 0.08, 0.16);
  return build * look * brake;
}

const SPEED_STEPS = 64;
/** Fraction of the route covered at approach time t, integrated from the speed rhythm. */
export function reindeerApproach(p: ReindeerPlan, t: number): number {
  const target = clamp(t);
  let total = 0,
    done = 0;
  for (let i = 0; i < SPEED_STEPS; i++) {
    const a = i / SPEED_STEPS,
      b = (i + 1) / SPEED_STEPS;
    const sa = reindeerApproachSpeed(p, a);
    const area = ((sa + reindeerApproachSpeed(p, b)) / 2) * (b - a);
    if (b <= target) done += area;
    else if (a < target) done += ((sa + reindeerApproachSpeed(p, target)) / 2) * (target - a);
    total += area;
  }
  return total > 0 ? done / total : target;
}

/** Point at arc-length fraction s along a curve, plus the curve's length; positions advance evenly. */
export function arcSample(
  curve: (u: number) => Point,
  s: number,
  samples = 32,
): { point: Point; length: number } {
  const points: Point[] = [];
  const lengths: number[] = [0];
  for (let i = 0; i <= samples; i++) {
    const at = curve(i / samples);
    const previous = points[i - 1];
    if (previous)
      lengths.push((lengths[i - 1] ?? 0) + Math.hypot(at.x - previous.x, at.y - previous.y));
    points.push(at);
  }
  const length = lengths[samples] ?? 0;
  const want = clamp(s) * length;
  let i = 0;
  while (i < samples - 1 && (lengths[i + 1] ?? 0) < want) i++;
  const a = lengths[i] ?? 0,
    b = lengths[i + 1] ?? a;
  const f = b > a ? (want - a) / (b - a) : 0;
  return { point: curve((i + f) / samples), length };
}

/** Where each phase of the routine happens on this layout; choices come from the plan only. */
export interface ReindeerStage {
  readonly stand: Point;
  readonly floor: number;
  /** Raw (unanimated) top-edge point under Dasher's body while he springs on the card. */
  readonly contact: Point;
  /** Whether the springboard sends him over the card (or the far side lacks room, so it flings him back). */
  readonly over: boolean;
  /** Direction of the flight and skid. */
  readonly dir: Side;
  readonly land: Point;
  readonly halt: Point;
  readonly exitDir: Side;
}

export function reindeerStage(
  p: ReindeerPlan,
  b: TargetBounds,
  view: Point,
  side: Side,
  scale: number,
): ReindeerStage {
  const stand = reindeerLandingPoint(p, b, view, side);
  const floor = stand.y;
  const fit = scale / REINDEER_SCALE;
  const raw = side > 0 ? p.contactU : 1 - p.contactU;
  const contact = { x: b.left + b.width * raw, y: b.top };
  const skid = (26 + 44 * p.skid) * fit;
  const keep = (x: number) => Math.max(30, Math.min(view.x - 30, x));
  const far = side > 0 ? b.left + b.width : b.left;
  // The hind hooves must clear the card's far edge before the body touches down.
  const overLand = far + side * (14 * scale + (16 + 14 * p.loft) * fit);
  const room = side > 0 ? overLand + skid + 40 < view.x : overLand - skid - 40 > 0;
  const over = p.launch === 'over' && room;
  const dir: Side = over ? side : side > 0 ? -1 : 1;
  const landX = over ? overLand : keep(stand.x - side * (18 + 14 * p.loft) * fit);
  const land = { x: landX, y: floor };
  const halt = { x: keep(landX + dir * skid), y: floor };
  const away = dir;
  const exitDir: Side = p.exit === 'away' ? away : away > 0 ? -1 : 1;
  return { stand, floor, contact, over, dir, land, halt, exitDir };
}

/** Approach route from just under the sender's card centre to the take-off spot. */
export function reindeerRoute(
  p: ReindeerPlan,
  start: Point,
  stand: Point,
  b: TargetBounds,
  view: Point,
  side: Side,
  scale: number,
) {
  const from = { x: start.x, y: start.y + 22 * scale };
  return (u: number) => sideRoute(from, stand, b, view, side, p.bend, u);
}

/** Exit route: off-screen away from the card, or doubling back beneath it. */
export function reindeerExitRoute(p: ReindeerPlan, s: ReindeerStage, b: TargetBounds, view: Point) {
  const from = s.halt,
    dir = s.exitDir;
  const edge = dir > 0 ? view.x + 110 : -110;
  const endY = Math.max(60, Math.min(view.y - 20, from.y + p.exitRise * 36));
  if (p.exit === 'past') {
    const low = Math.min(view.y - 24, s.floor + 28);
    const far = dir > 0 ? b.left + b.width : b.left;
    return (u: number) =>
      bezier(
        from,
        { x: from.x + dir * 50, y: low },
        { x: far + dir * 70, y: low },
        { x: edge, y: endY },
        u,
      );
  }
  return (u: number) =>
    bezier(
      from,
      { x: from.x + dir * 70, y: from.y },
      { x: mix(from.x, edge, 0.55), y: mix(from.y, endY, 0.4) },
      { x: edge, y: endY },
      u,
    );
}

/** Exit progress: a sheepish start that opens into a full gallop. */
export function reindeerExitProgress(p: ReindeerPlan, ms: number): number {
  const t = span(ms, p.departure, p.exitEnd - p.departure);
  return t * t * (1.6 - 0.6 * t);
}

export const reindeerLandAt = (p: ReindeerPlan, k: number) => p.perch + k * p.period;
export const reindeerPushAt = (p: ReindeerPlan, k: number) =>
  k < p.bounces ? reindeerLandAt(p, k) + p.period * 0.5 : p.spring;

/** Which springboard contact or hop Dasher is in: hop t runs 0..1 between push-off and the next landing. */
export function reindeerBounce(
  p: ReindeerPlan,
  ms: number,
): { readonly k: number; readonly hop: number } {
  for (let k = 0; k <= p.bounces; k++) {
    if (ms < reindeerPushAt(p, k)) return { k, hop: -1 };
    if (k < p.bounces && ms < reindeerLandAt(p, k + 1)) {
      const from = reindeerPushAt(p, k);
      return { k, hop: (ms - from) / (reindeerLandAt(p, k + 1) - from) };
    }
  }
  return { k: p.bounces, hop: -1 };
}

/** A released springboard oscillates and dies away. */
const rebound = (c: number, t: number) => c * Math.exp(-t / 170) * Math.cos(t / 52);

/**
 * How far the hooves press the card's top edge down, as a fraction of its height. Each landing
 * loads it, the last landing winds it deeper, and every push-off releases it into a spring-back
 * that overshoots upward before the next landing.
 */
export function reindeerPress(p: ReindeerPlan, ms: number): number {
  if (ms < p.perch) return 0;
  let carried = 0;
  for (let k = 0; k <= p.bounces; k++) {
    const land = reindeerLandAt(p, k),
      push = reindeerPushAt(p, k),
      last = k === p.bounces;
    const pressed = (t: number) => {
      const impact = mix(
        carried,
        p.bounceDepth * (k === 0 ? 1.15 : 1),
        1 - (1 - clamp((t - land) / 90)) ** 3,
      );
      if (!last) return impact;
      return impact + (p.loadDepth - p.bounceDepth) * ease((t - land - 60) / (push - land - 110));
    };
    if (ms < push) return pressed(ms);
    const released = pressed(push);
    if (last) {
      const t = ms - push;
      return rebound(released, t) * (1 - span(t, 650, 250));
    }
    const next = reindeerLandAt(p, k + 1);
    if (ms < next) return rebound(released, ms - push);
    carried = rebound(released, next - push);
  }
  return 0;
}

/**
 * Springboard response: the card squashes about its bottom edge under the hooves, tilts toward the
 * side they press, and whips back toward Dasher's start side as he launches, then settles.
 */
export function reindeerCardPose(
  p: ReindeerPlan,
  ms: number,
  facing: number,
  b: TargetBounds,
): CardPose {
  if (ms < p.perch || ms >= p.spring + 900) return NEUTRAL_CARD;
  const side = facing < 0 ? -1 : 1;
  const c = reindeerPress(p, ms);
  const raw = side > 0 ? p.contactU : 1 - p.contactU;
  let angle = (raw - 0.5) * 40 * c;
  if (ms >= p.spring) {
    const t = ms - p.spring;
    angle +=
      -side *
      4.5 *
      (p.loadDepth / 0.18) *
      Math.sin(t / 55) *
      Math.exp(-t / 190) *
      (1 - span(t, 650, 250));
  }
  const sy = 1 - c,
    sx = 1 + 0.35 * c;
  const a = (angle * Math.PI) / 180,
    d = (b.height / 2) * sy;
  // Translate so the bottom edge stays planted while the top edge gives way.
  return { x: d * Math.sin(a), y: b.height / 2 - d * Math.cos(a), angle, sx, sy };
}

export function reindeerFrames(p: ReindeerPlan, facing: number, b: TargetBounds) {
  return cardFrames(REINDEER_DURATION, p.pace, (ms) => reindeerCardPose(p, ms, facing, b));
}
