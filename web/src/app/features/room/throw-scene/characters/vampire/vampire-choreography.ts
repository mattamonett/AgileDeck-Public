import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  alongCurve,
  bezier,
  cardFrames,
  chooseSide,
  clamp,
  ease,
  keepInView,
  mix,
  pulse,
  sidePoint,
  span,
  withSlow,
  NEUTRAL_CARD,
  type CardPose,
  type Side,
} from '../../kit';

export const VAMPIRE_DURATION = 8600;
export const VAMPIRE_SCALE = 0.9;
export type VampireExit = 'spiral' | 'dart' | 'swoop';

export interface VampirePlan {
  readonly kind: '🧛';
  readonly side: Side;
  readonly pace: number;
  readonly travel: number;
  readonly bend: number;
  readonly circle: boolean;
  readonly flap: number;
  readonly biteU: number;
  readonly crouch: number;
  readonly gulps: number;
  readonly strength: number;
  readonly wipe: boolean;
  readonly exit: VampireExit;
  readonly exitRise: number;
  readonly phase: number;
  readonly perch: number;
  readonly formed: number;
  readonly bite: number;
  readonly release: number;
  readonly snap: number;
  readonly backstep: number;
  readonly remist: number;
  readonly flight: number;
  readonly exitEnd: number;
}

export function vampirePlan(id: string): VampirePlan {
  const r = seededRandom(`${id}:vampire-bite-v2`);
  const side: Side = r() < 0.5 ? -1 : 1;
  const pace = 0.94 + r() * 0.12;
  const travel = 1750 + r() * 400;
  const bend = r() * 2 - 1;
  const circle = r() < 0.5;
  const flap = 0.9 + r() * 0.25;
  const biteU = 0.13 + r() * 0.08;
  const crouch = r() * 5;
  const gulps = r() < 0.5 ? 2 : 3;
  const strength = 0.85 + r() * 0.35;
  const wipe = r() < 0.5;
  const exits: readonly VampireExit[] = ['spiral', 'dart', 'swoop'];
  const exit = exits[Math.floor(r() * 3)] ?? 'dart';
  const exitRise = r() * 2 - 1;
  const phase = r() * Math.PI * 2;
  const perch = travel;
  const formed = perch + 480;
  const bite = formed + 420 + 130 + r() * 50;
  const release = bite + 120 + gulps * 360;
  const snap = release + 210;
  const backstep = release + 780;
  const remist = backstep + 320;
  const flight = remist + 440;
  const exitEnd = flight + 1250 + r() * 200;
  return {
    kind: '🧛',
    side,
    pace,
    travel,
    bend,
    circle,
    flap,
    biteU,
    crouch,
    gulps,
    strength,
    wipe,
    exit,
    exitRise,
    phase,
    perch,
    formed,
    bite,
    release,
    snap,
    backstep,
    remist,
    flight,
    exitEnd,
  };
}

/** Feet stand just outside the card's near edge; the trick refines this from the real fang tip. */
export function vampireLandingPoint(
  p: VampirePlan,
  b: TargetBounds,
  view: Point,
  chosen?: number,
): Point {
  return sidePoint(chooseSide(p.side, b, view, chosen), b, view, 18, 1.03);
}
export const vampireFloor = (b: TargetBounds) => b.top + b.height + 4;

/** Human form fraction: 0 bat, 1 vampire. */
export function vampireForm(p: VampirePlan, ms: number): number {
  if (ms < p.remist) return ease((ms - p.perch - 140) / 300);
  return 1 - ease((ms - p.remist) / 300);
}
export function vampireBatForm(p: VampirePlan, ms: number): number {
  if (ms < p.remist) return 1 - ease((ms - p.perch) / 260);
  return ease((ms - p.remist - 140) / 300);
}

/** Lunge envelope: anticipation pull-back, strike to contact, hold, then the pull-away. */
export function vampireLunge(p: VampirePlan, ms: number): { reach: number; recoil: number } {
  const strike = ease((ms - p.bite + 140) / 140);
  const away = ease((ms - p.release) / 260);
  return { reach: strike * (1 - away), recoil: pulse(ms, p.bite - 440, 300) };
}

/** Each gulp is a short throat pull that tugs the hanging card up against the fangs. */
export function vampireGulp(p: VampirePlan, ms: number): number {
  let g = 0;
  for (let i = 0; i < p.gulps; i++) g = Math.max(g, pulse(ms, p.bite + 120 + i * 360, 260));
  return g;
}

/**
 * The card hangs from the bite: it pivots and shrivels about the wound, so the wound stays under
 * the fangs, then swings free and re-inflates after the release.
 */
export function vampireCardPose(
  p: VampirePlan,
  ms: number,
  facing: number,
  b: TargetBounds,
  bite: Point,
): CardPose {
  if (ms < p.formed + 200 || ms >= p.release + 1000) return NEUTRAL_CARD;
  // The card cringes away as the vampire looms and its hand takes hold.
  const cringe = pulse(ms, p.formed + 200, p.bite - p.formed - 200) * (ms < p.bite ? 1 : 0);
  let angle = facing * 1.6 * cringe,
    x = facing * 2 * cringe,
    y = 0,
    sx = 1,
    sy = 1;
  if (ms >= p.bite && ms < p.release) {
    const t = ms - p.bite,
      drained = ease(t / (p.release - p.bite));
    const jolt = pulse(ms, p.bite, 160);
    const gulp = vampireGulp(p, ms);
    angle =
      -facing * (3.2 * ease(t / 240) + 1.2 * gulp) * p.strength +
      facing * 2.5 * jolt +
      Math.sin(t / 34) * 0.4 * (1 - drained);
    sx = 1 - 0.09 * drained * p.strength - 0.015 * gulp;
    sy = 1 - 0.05 * drained * p.strength;
    // Hold the wound under the fangs: translate so the pivot point stays put, plus the gulp tug.
    const pivot = pivotHold(b, bite, angle, sx, sy);
    x = pivot.x;
    y = pivot.y - 1.6 * gulp * p.strength;
    return { x, y, angle, sx, sy };
  }
  if (ms >= p.release) {
    const t = ms - p.release,
      decay = Math.exp(-t / 240);
    const from = vampireCardPose(p, p.release - 1, facing, b, bite);
    const swing = Math.cos(t / 70) * decay;
    angle = from.angle * swing;
    x = from.x * decay;
    y = from.y * decay;
    sx = 1 + (from.sx - 1) * decay + 0.03 * Math.sin(t / 60) * decay * (1 - decay);
    sy = 1 + (from.sy - 1) * decay;
  }
  return { x, y, angle, sx, sy };
}
function pivotHold(b: TargetBounds, bite: Point, angle: number, sx: number, sy: number): Point {
  const a = (angle * Math.PI) / 180,
    cx = b.left + b.width / 2,
    cy = b.top + b.height / 2;
  const dx = (bite.x - cx) * sx,
    dy = (bite.y - cy) * sy;
  return {
    x: bite.x - cx - (dx * Math.cos(a) - dy * Math.sin(a)),
    y: bite.y - cy - (dx * Math.sin(a) + dy * Math.cos(a)),
  };
}

export function vampireFrames(p: VampirePlan, facing: number, b: TargetBounds, bite: Point) {
  return cardFrames(VAMPIRE_DURATION, p.pace, (ms) => vampireCardPose(p, ms, facing, b, bite));
}

/** Bat flight: a fluttering curve that can loop once over the card before dropping to the perch. */
export function vampireFlight(
  p: VampirePlan,
  ms: number,
  start: Point,
  perch: Point,
  b: TargetBounds,
  view: Point,
  side: Side,
): Point {
  const t = clamp(ms / p.travel);
  // While circling, forward progress eases off so the loop itself carries the bat.
  const forward = p.circle ? withSlow(t, 0.45, 0.4, 0.5) : t;
  const u = ease(forward) * 0.35 + forward * 0.65;
  const lift = Math.min(90, Math.max(30, Math.min(start.y, perch.y) - 70));
  const c1 = keepInView(
    { x: start.x + (perch.x - start.x) * 0.3, y: start.y - lift - p.bend * 40 },
    view,
  );
  const c2 = keepInView({ x: perch.x - side * 70, y: perch.y - lift * 0.8 }, view);
  const base = alongCurve((k) => bezier(start, c1, c2, perch, k), u);
  const flutter = Math.sin(ms / (95 / p.flap) + p.phase) * 3 * Math.sin(Math.PI * t);
  if (!p.circle) return keepInView({ x: base.x, y: base.y + flutter }, view, 16, 40);
  // One loop above the card before the drop, faded in and out so the path stays continuous.
  const loop = span(t, 0.45, 0.4),
    weight = Math.sin(Math.PI * loop);
  const a = loop * Math.PI * 2;
  const radius = Math.min(b.width * 0.7, 46);
  return keepInView(
    {
      x: base.x + side * Math.sin(a) * radius * weight,
      y: base.y - (1 - Math.cos(a)) * radius * 0.6 * weight + flutter,
    },
    view,
    16,
    40,
  );
}

export function vampireExitPoint(
  p: VampirePlan,
  ms: number,
  from: Point,
  view: Point,
  side: Side,
): Point {
  const t = ease((ms - p.flight) / (p.exitEnd - p.flight));
  const away = -side;
  const edge = away > 0 ? view.x + 90 : -90;
  if (p.exit === 'spiral') {
    const end = { x: edge, y: Math.max(-90, from.y - 260) };
    const a = t * Math.PI * 2.2,
      r = 36 * Math.sin(Math.PI * t);
    return {
      x: mix(from.x, end.x, t * t) + Math.cos(a) * r - r,
      y: mix(from.y, end.y, t) - Math.sin(a) * r,
    };
  }
  if (p.exit === 'swoop') {
    const low = Math.min(view.y - 30, from.y + 60);
    return bezier(
      from,
      { x: from.x + away * 40, y: low },
      { x: mix(from.x, edge, 0.6), y: low },
      { x: edge, y: from.y - 120 + p.exitRise * 40 },
      t,
    );
  }
  return bezier(
    from,
    { x: from.x + away * 30, y: from.y - 30 },
    { x: mix(from.x, edge, 0.5), y: from.y - 20 + p.exitRise * 50 },
    { x: edge, y: from.y - 60 + p.exitRise * 70 },
    t,
  );
}
