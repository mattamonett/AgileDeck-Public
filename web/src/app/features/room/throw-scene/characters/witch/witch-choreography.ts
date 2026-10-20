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

export const WITCH_DURATION = 9800;
export const WITCH_SCALE = 1;
export const WITCH_DROPS = 4;
export const WITCH_DROP_GAP = 150;

export interface WitchPlan {
  readonly kind: '🧙';
  readonly side: Side;
  readonly pace: number;
  readonly travel: number;
  readonly bend: number;
  readonly loop: boolean;
  readonly pourU: number;
  readonly hops: number;
  readonly hopHeight: number;
  readonly tongue: boolean;
  readonly fizzle: boolean;
  readonly toss: boolean;
  readonly climb: boolean;
  readonly exitRise: number;
  readonly phase: number;
  readonly arrive: number;
  readonly uncork: number;
  readonly pop: number;
  readonly pour: number;
  readonly contact: number;
  readonly hopStart: number;
  readonly tongueAt: number;
  readonly cast: number;
  readonly hit: number;
  readonly restored: number;
  readonly tossAt: number;
  readonly departure: number;
  readonly exitEnd: number;
}

/** Time for a drop to fall from the flask to the card. */
export const WITCH_FALL = 360;

export function witchPlan(id: string): WitchPlan {
  const r = seededRandom(`${id}:witch-frog-v2`);
  const side: Side = r() < 0.5 ? -1 : 1;
  const pace = 0.94 + r() * 0.12;
  const travel = 1700 + r() * 400;
  const bend = r() * 2 - 1;
  const loop = r() < 0.5;
  const pourU = 0.3 + r() * 0.14;
  const hops = r() < 0.5 ? 2 : 3;
  const hopHeight = 10 + r() * 7;
  const tongue = r() < 0.5;
  const fizzle = r() < 0.5;
  const toss = r() < 0.5;
  const climb = r() < 0.5;
  const exitRise = r() * 2 - 1;
  const phase = r() * Math.PI * 2;
  const arrive = travel;
  const uncork = arrive + 300;
  const pop = uncork + 260;
  const pour = pop + 260;
  const contact = pour + WITCH_FALL;
  const hopStart = contact + 420;
  const tongueAt = hopStart + hops * 520;
  const cast = tongueAt + (tongue ? 520 : 0) + 160;
  const hit = cast + (fizzle ? 700 : 0) + 280;
  const restored = hit + 480;
  const tossAt = restored + 120;
  const departure = tossAt + 380;
  const exitEnd = departure + 1250 + r() * 200;
  return {
    kind: '🧙',
    side,
    pace,
    travel,
    bend,
    loop,
    pourU,
    hops,
    hopHeight,
    tongue,
    fizzle,
    toss,
    climb,
    exitRise,
    phase,
    arrive,
    uncork,
    pop,
    pour,
    contact,
    hopStart,
    tongueAt,
    cast,
    hit,
    restored,
    tossAt,
    departure,
    exitEnd,
  };
}

export function witchLandingPoint(
  p: WitchPlan,
  b: TargetBounds,
  view: Point,
  chosen?: number,
): Point {
  return sidePoint(chooseSide(p.side, b, view, chosen), b, view, 34, -0.15);
}

/** Card-local landing points of the drops: the first turns the card, the rest splash nearby. */
export function witchDropTarget(p: WitchPlan, i: number, side: Side): { u: number; v: number } {
  const u = p.pourU + (i % 2 ? 0.05 : -0.03) * (i ? 1 : 0);
  return { u: side > 0 ? u : 1 - u, v: 0.2 + i * 0.035 };
}

/** 0 card, 1 fully a frog. */
export function witchFrog(p: WitchPlan, ms: number): number {
  return ease((ms - p.contact) / 320) * (1 - ease((ms - p.hit) / 420));
}

export function witchHop(p: WitchPlan, ms: number, k: number) {
  const start = p.hopStart + k * 520;
  const crouch = pulse(ms, start, 140),
    air = span(ms, start + 110, 320),
    land = pulse(ms, start + 410, 120);
  return {
    crouch,
    air: air > 0 && air < 1 ? Math.sin(Math.PI * air) : 0,
    stretch: pulse(ms, start + 100, 140),
    land,
  };
}

export function witchCroak(p: WitchPlan, ms: number): number {
  let c = 0;
  for (let k = 0; k < p.hops; k++) c = Math.max(c, pulse(ms, p.hopStart + k * 520 + 430, 200));
  return Math.max(c, pulse(ms, p.contact + 160, 240));
}

export function witchCardPose(p: WitchPlan, ms: number, facing: number): CardPose {
  if (ms < p.contact || ms >= p.restored + 400) return NEUTRAL_CARD;
  const splash = pulse(ms, p.contact, 260);
  let y = 0,
    x = 0,
    sx = 1 + 0.08 * splash,
    sy = 1 - 0.14 * splash,
    angle = Math.sin((ms - p.contact) / 30) * 1.5 * pulse(ms, p.contact + 100, 300);
  for (let k = 0; k < p.hops; k++) {
    const h = witchHop(p, ms, k),
      dir = k % 2 ? 1 : -1;
    y -= p.hopHeight * h.air;
    x += -facing * dir * 4 * h.air;
    sx += 0.07 * h.crouch + 0.06 * h.land - 0.06 * h.stretch;
    sy += -0.13 * h.crouch - 0.1 * h.land + 0.1 * h.stretch;
    angle += -facing * dir * 3 * h.air;
  }
  sy += 0.03 * witchCroak(p, ms);
  // The reverse spell lands with a twist and a settling wobble.
  const t = ms - p.hit;
  if (t > 0) {
    const decay = Math.exp(-t / 160);
    angle += 7 * Math.sin(t / 45) * decay;
    sx += 0.06 * Math.sin(t / 60) * decay;
    sy -= 0.06 * Math.sin(t / 60) * decay;
  }
  const settle = 1 - span(ms, p.restored, 400);
  return {
    x: x * settle,
    y: y * settle,
    angle: angle * settle,
    sx: 1 + (sx - 1) * settle,
    sy: 1 + (sy - 1) * settle,
  };
}

export function witchFrames(p: WitchPlan, facing: number) {
  return cardFrames(WITCH_DURATION, p.pace, (ms) => witchCardPose(p, ms, facing));
}

/** Broom flight to the hover point: a swoop, sometimes with a loop-the-loop on the way. */
export function witchFlight(
  p: WitchPlan,
  ms: number,
  start: Point,
  hover: Point,
  view: Point,
  side: Side,
  looping = true,
): Point {
  const t = clamp(ms / p.travel);
  // During the loop-the-loop, forward progress eases off so the loop itself carries her.
  const base = p.loop && looping ? withSlow(t, 0.35, 0.35, 0.15) : t;
  const u = ease(base) * 0.5 + base * 0.5;
  const lift = Math.min(110, Math.max(40, Math.min(start.y, hover.y) - 60));
  const c1 = keepInView(
    { x: start.x + (hover.x - start.x) * 0.25, y: start.y - lift + p.bend * 30 },
    view,
  );
  const c2 = keepInView({ x: hover.x - side * 90, y: hover.y + 30 * p.bend }, view);
  const path = alongCurve((k) => bezier(start, c1, c2, hover, k), u);
  if (!p.loop || !looping) {
    const zig = Math.sin(t * Math.PI * 3 + p.phase) * 10 * Math.sin(Math.PI * t);
    return keepInView({ x: path.x, y: path.y + zig }, view, 20, 40);
  }
  // A forward loop: up and over the top (briefly flying backwards), then down and on.
  const a = span(t, 0.35, 0.35) * Math.PI * 2;
  return keepInView(
    { x: path.x + side * Math.sin(a) * 40, y: path.y - (1 - Math.cos(a)) * 38 },
    view,
    20,
    40,
  );
}

export function witchExit(p: WitchPlan, ms: number, from: Point, view: Point, side: Side): Point {
  const t = ease((ms - p.departure) / (p.exitEnd - p.departure));
  const away = p.climb ? side : -side;
  const edge = away > 0 ? view.x + 120 : -120;
  if (p.climb)
    return bezier(
      from,
      { x: from.x - side * 20, y: from.y + 10 },
      { x: mix(from.x, edge, 0.5), y: from.y - 60 },
      { x: edge, y: Math.max(-120, from.y - 220 + p.exitRise * 60) },
      t * t * (2 - t),
    );
  const a = span(t, 0.1, 0.45) * Math.PI * 2,
    w = Math.sin(Math.PI * span(t, 0.1, 0.45));
  const base = bezier(
    from,
    { x: from.x + away * 40, y: from.y - 10 },
    { x: mix(from.x, edge, 0.6), y: from.y - 40 },
    { x: edge, y: from.y - 80 + p.exitRise * 60 },
    t,
  );
  return { x: base.x + away * Math.sin(a) * 28 * w, y: base.y - (1 - Math.cos(a)) * 26 * w };
}
