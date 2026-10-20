import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardFit,
  cardFrames,
  chooseSide,
  clamp,
  ease,
  mix,
  pulse,
  sidePoint,
  span,
  NEUTRAL_CARD,
  type CardPose,
  type Side,
} from '../../kit';

export const GRAVY_DURATION = 12500;
export const GRAVY_SCALE = 1.2;
/** The floor beside the card, as a fraction of card height below its top. */
export const GRAVY_FLOOR_V = 1.08;
/** Feet-to-card gaps (px at full card size): back at arm's length to pour the long boat, then close in to mop. */
export const GRAVY_STEP_IN = 560;
export const GRAVY_POUR_GAP = 40;
export const GRAVY_WIPE_GAP = 5;
/** Card width over height, so distances on the card are judged in screen proportion. */
export const GRAVY_ASPECT = 84 / 122;
/** How close (in card heights) the roll must pass over gravy to lift it off. */
export const GRAVY_WIPE_REACH = 0.068;
/** Gravy runoff: time from the source being mopped to the tail leaving the card, drip spacing and drop fall. */
export const GRAVY_DRAIN = 600;
export const GRAVY_DRIP = 340;
export const GRAVY_DROP_FALL = 170;

export type GravyBeat = 'steady' | 'sniff';
export type GravyWipe = 'across' | 'down';
export type GravyExit = 'backAway' | 'nibble';

export interface GravyPlan {
  readonly kind: '🫗';
  readonly side: Side;
  readonly pace: number;
  /** Canonical ms at which the chef arrives at the pouring spot. */
  readonly travel: number;
  readonly bend: number;
  readonly march: boolean;
  readonly rhythm: number;
  readonly steps: number;
  readonly beat: GravyBeat;
  readonly beatAt: number;
  readonly beatDip: number;
  readonly pourHigh: number;
  /** Where the pour lands, in near-relative card coordinates (0 = edge nearest the chef). */
  readonly poolN: number;
  readonly poolV: number;
  readonly flood: boolean;
  readonly tipMax: number;
  readonly strokes: number;
  readonly wipe: GravyWipe;
  readonly streak: boolean;
  readonly exit: GravyExit;
  readonly bites: number;
  readonly exitRise: number;
  readonly phase: number;
  readonly raise: number;
  readonly pour: number;
  readonly flow: number;
  readonly fall: number;
  readonly contact: number;
  readonly tip: number;
  readonly right: number;
  readonly dry: number;
  readonly oops: number;
  readonly stepIn: number;
  readonly wipeStart: number;
  readonly strokeMs: number;
  readonly wipeEnd: number;
  readonly recovered: number;
  readonly departure: number;
  readonly exitEnd: number;
}

export function gravyPlan(id: string): GravyPlan {
  const r = seededRandom(`${id}:gravy-v2`);
  const side: Side = r() < 0.5 ? -1 : 1;
  const pace = 0.94 + r() * 0.12;
  const travel = 2050 + r() * 450;
  const bend = r() * 2 - 1;
  const march = r() < 0.5;
  const rhythm = 0.06 + r() * 0.08;
  const steps = (march ? 6 : 9) + r() * 2;
  const beat: GravyBeat = r() < 0.5 ? 'steady' : 'sniff';
  const beatAt = 0.36 + r() * 0.24;
  const beatDip = 0.3 + r() * 0.22;
  const pourHigh = r();
  const poolN = 0.25 + r() * 0.04;
  const poolV = 0.72 + r() * 0.03;
  const flood = r() < 0.5;
  const tipMax = flood ? 0.9 + r() * 0.1 : 0.62 + r() * 0.1;
  const strokes = 2 + Math.floor(r() * 3);
  const wipe: GravyWipe = r() < 0.5 ? 'across' : 'down';
  const streak = r() < 0.5;
  const exit: GravyExit = r() < 0.5 ? 'backAway' : 'nibble';
  const bites = r() < 0.5 ? 2 : 3;
  const exitRise = r() * 2 - 1;
  const phase = r() * Math.PI * 2;
  const raise = travel + 100 + r() * 120;
  const pour = raise + 480;
  const flow = pour + 200;
  const fall = 120 + 110 * pourHigh;
  const contact = flow + fall;
  const tip = contact + 380 + r() * 220;
  const right = tip + (flood ? 720 + r() * 160 : 380 + r() * 120);
  const dry = right + 170;
  const oops = dry + 160;
  const stepIn = oops + 520;
  const wipeStart = stepIn + GRAVY_STEP_IN + 140;
  const strokeMs = 420 + r() * 120;
  const wipeEnd = wipeStart + strokes * strokeMs;
  const recovered = wipeEnd + 720;
  const departure = wipeEnd + 560;
  const exitEnd = departure + 2300 + r() * 400;
  return {
    kind: '🫗',
    side,
    pace,
    travel,
    bend,
    march,
    rhythm,
    steps,
    beat,
    beatAt,
    beatDip,
    pourHigh,
    poolN,
    poolV,
    flood,
    tipMax,
    strokes,
    wipe,
    streak,
    exit,
    bites,
    exitRise,
    phase,
    raise,
    pour,
    flow,
    fall,
    contact,
    tip,
    right,
    dry,
    oops,
    stepIn,
    wipeStart,
    strokeMs,
    wipeEnd,
    recovered,
    departure,
    exitEnd,
  };
}

export const gravyFloor = (b: TargetBounds) => b.top + b.height * GRAVY_FLOOR_V;

/** Pouring spot beside the card; the chosen side is kept through reflow. */
export function gravyLandingPoint(
  p: GravyPlan,
  b: TargetBounds,
  view: Point,
  chosen?: number,
): Point {
  return sidePoint(
    chooseSide(p.side, b, view, chosen),
    b,
    view,
    GRAVY_POUR_GAP * cardFit(b),
    GRAVY_FLOOR_V,
  );
}
/** Mopping spot: a couple of steps closer than the pouring spot. */
export function gravyWipeStand(p: GravyPlan, b: TargetBounds, view: Point, side: Side): Point {
  const pour = gravyLandingPoint(p, b, view, side);
  return { x: pour.x + side * (GRAVY_POUR_GAP - GRAVY_WIPE_GAP) * cardFit(b), y: pour.y };
}
export function gravyExitPoint(p: GravyPlan, b: TargetBounds, view: Point, side: Side): Point {
  const stand = gravyWipeStand(p, b, view, side);
  return {
    x: side > 0 ? -130 : view.x + 130,
    y: Math.max(80, Math.min(view.y - 10, stand.y + p.exitRise * 40)),
  };
}

/**
 * Approach speed: eases out of the throw and into the stand, with a stride surge each step and one
 * acted slow-down (steadying the slosh or sniffing the gravy) that never stops the body.
 */
function approachSpeed(p: GravyPlan, t: number): number {
  const start = 0.32 + 0.68 * ease(t / 0.14);
  const stop = 1 - 0.9 * ease((t - 0.86) / 0.14);
  const beat = Math.sin(Math.PI * span(t, p.beatAt - 0.1, 0.2)) ** 2;
  const stride = 1 + p.rhythm * Math.sin(t * p.steps * Math.PI * 2 + p.phase);
  return start * stop * (1 - p.beatDip * beat) * stride;
}
const CELLS = 120;
function travelled(p: GravyPlan, t: number): number {
  const f = clamp(t) * CELLS,
    whole = Math.floor(f);
  let sum = 0;
  for (let i = 0; i < whole; i++)
    sum += (approachSpeed(p, i / CELLS) + approachSpeed(p, (i + 1) / CELLS)) / 2;
  if (whole < CELLS) {
    const part = f - whole;
    sum +=
      ((approachSpeed(p, whole / CELLS) + approachSpeed(p, (whole + part) / CELLS)) / 2) * part;
  }
  return sum / CELLS;
}
/** Fraction of the approach route's length covered at approach time fraction t. */
export function gravyProgress(p: GravyPlan, t: number): number {
  return travelled(p, t) / travelled(p, 1);
}
/** 0..1 strength of the acted approach beat. */
export const gravyBeat = (p: GravyPlan, t: number) =>
  Math.sin(Math.PI * span(t, p.beatAt - 0.1, 0.2)) ** 2;

/** Lip target in near-relative card coordinates, boat tilt (radians, spout down) and how fully the lip leads the arm. */
export function gravyLip(
  p: GravyPlan,
  ms: number,
): { n: number; v: number; tilt: number; hold: number } {
  const high = 0.12 + 0.07 * p.pourHigh;
  const ready = { n: p.poolN - 0.14, v: p.poolV - high - 0.02 };
  const pouring = { n: p.poolN - 0.07, v: p.poolV - high };
  const lurch = ease((ms - p.tip) / 220) * (1 - ease((ms - p.right) / 260));
  const dip = p.flood ? 1 : 0.6;
  const settle = ease((ms - p.pour) / (p.flow - p.pour + 120));
  const lift = ease((ms - p.right) / 300);
  const n = mix(ready.n, pouring.n, settle) + 0.02 * dip * lurch - 0.03 * lift;
  const v = mix(ready.v, pouring.v, settle) + 0.04 * dip * lurch - 0.05 * lift;
  let tilt = 0.18 * ease((ms - p.raise) / (p.pour - p.raise)) + 0.24 * settle;
  // The over-tip lurches past the stop and wobbles before he hauls it back upright.
  const wobble = Math.sin((ms - p.tip) / 55) * 0.08 * pulse(ms, p.tip + 120, 420);
  tilt += (p.tipMax - 0.42) * lurch + wobble * dip;
  tilt = mix(tilt, -0.2, ease((ms - p.right) / 260));
  const hold = ease((ms - p.raise) / (p.pour - p.raise));
  return { n, v, tilt, hold };
}

/** Width factor of the gravy leaving the lip: a careful thin pour, then the glug. */
export function gravyFlow(p: GravyPlan, ms: number): number {
  if (ms < p.flow || ms >= p.dry) return 0;
  const careful = 0.32 * ease((ms - p.flow) / 120);
  const gush =
    (p.flood ? 0.68 : 0.42) * ease((ms - p.tip - 60) / 160) * (1 - ease((ms - p.right) / 170));
  return careful * (1 - ease((ms - p.right) / 170)) + gush;
}
/** Gravy delivered to the card so far, 0..1 of a full flood. */
export function gravyPoured(p: GravyPlan, ms: number): number {
  const careful = 0.22 * ease((ms - p.contact) / (p.tip - p.contact + p.fall));
  const gush = (p.flood ? 0.78 : 0.43) * ease((ms - p.tip - p.fall) / (p.right - p.tip + 120));
  return careful + gush;
}
/** Radius of the pool around the landing point, in card heights. */
export function gravySpread(p: GravyPlan, ms: number): number {
  const full = p.flood ? 1 : 0.65,
    max = p.flood ? 0.15 : 0.11;
  return 0.025 + (max - 0.025) * (gravyPoured(p, ms) / full);
}

export interface GravyRegion {
  readonly n0: number;
  readonly n1: number;
  readonly v0: number;
  readonly v1: number;
}
/** The mopped area; it stays below the card's value. */
export function gravyRegion(p: GravyPlan): GravyRegion {
  return {
    n0: p.poolN - 0.16,
    n1: p.poolN + 0.14,
    v0: p.poolV - 0.085,
    v1: p.poolV + (p.flood ? 0.085 : 0.075),
  };
}

export interface CardSpot {
  readonly n: number;
  readonly v: number;
}
function strokeEnds(p: GravyPlan, k: number): readonly [CardSpot, CardSpot] {
  const r = gravyRegion(p),
    lane = (k + 0.5) / p.strokes;
  const forward = k % 2 === 0;
  if (p.wipe === 'across') {
    const v = mix(r.v0, r.v1, lane);
    const a = { n: r.n0, v },
      b = { n: r.n1, v };
    return forward ? [a, b] : [b, a];
  }
  const n = mix(r.n0, r.n1, lane);
  const a = { n, v: r.v0 },
    b = { n, v: r.v1 };
  return forward ? [a, b] : [b, a];
}
/** Where the roll presses on the card: back-and-forth rows or columns, shifting lane at each turn. */
export function gravyWipePoint(p: GravyPlan, ms: number): CardSpot {
  const f = clamp((ms - p.wipeStart) / (p.wipeEnd - p.wipeStart)) * p.strokes;
  const k = Math.min(p.strokes - 1, Math.floor(f)),
    within = f - k;
  const [a, b] = strokeEnds(p, k);
  const last = k === p.strokes - 1;
  const along = ease(last ? within : within / 0.8);
  if (last || within <= 0.8) return { n: mix(a.n, b.n, along), v: mix(a.v, b.v, along) };
  const [next] = strokeEnds(p, k + 1);
  const shift = ease((within - 0.8) / 0.2);
  return { n: mix(b.n, next.n, shift), v: mix(b.v, next.v, shift) };
}
/** Start of the final stroke, which leaves a smear when the cleanup is not quite perfect. */
export const gravyLastStroke = (p: GravyPlan) => p.wipeStart + (p.strokes - 1) * p.strokeMs;

const cardDistance = (a: CardSpot, b: CardSpot) =>
  Math.hypot((a.n - b.n) * GRAVY_ASPECT, a.v - b.v);
/** First moment the roll passes over a spot. */
export function gravyWipedAt(p: GravyPlan, spot: CardSpot): number {
  for (let ms = p.wipeStart; ms <= p.wipeEnd; ms += 6)
    if (cardDistance(gravyWipePoint(p, ms), spot) < GRAVY_WIPE_REACH) return ms;
  return Infinity;
}

export interface GravySpot extends CardSpot {
  /** Radius in card heights. */
  readonly r: number;
  readonly at: number;
  readonly wiped: number;
  readonly flung: boolean;
}
/** Overlapping blobs that make up the pool, each appearing as the spread reaches it, plus flung splashes. */
export function gravySpots(p: GravyPlan): readonly GravySpot[] {
  const rnd = seededRandom(`${p.phase}:gravy-pool`);
  const region = gravyRegion(p);
  const max = gravySpread(p, Infinity);
  const spots: GravySpot[] = [];
  const place = (n: number, v: number, r: number, flung: boolean, at?: number) => {
    const spot = {
      n: Math.max(region.n0 + 0.025, Math.min(region.n1 - 0.025, n)),
      v: Math.max(region.v0 + 0.015, Math.min(region.v1 - 0.015, v)),
    };
    const reach = cardDistance(spot, { n: p.poolN, v: p.poolV });
    let born = at ?? p.right + 400;
    if (at === undefined)
      for (let ms = p.contact; ms < p.right + 400; ms += 4)
        if (gravySpread(p, ms) >= reach) {
          born = ms;
          break;
        }
    spots.push({ ...spot, r, at: born, wiped: gravyWipedAt(p, spot), flung });
  };
  place(p.poolN, p.poolV, 0.05, false);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + rnd() * 0.5,
      d = (0.4 + rnd() * 0.6) * (max - 0.028);
    place(
      p.poolN + (Math.cos(a) * d) / GRAVY_ASPECT,
      p.poolV + Math.sin(a) * d * 0.8,
      0.028 + rnd() * 0.02,
      false,
    );
  }
  for (let i = 0; i < 3; i++) {
    const a = -0.6 + i * 0.9 + rnd() * 0.3;
    place(
      p.poolN + (Math.cos(a) * max * 0.95) / GRAVY_ASPECT,
      p.poolV + Math.sin(a) * max * 0.6,
      0.016,
      true,
      p.tip + p.fall + 150 + i * 45,
    );
  }
  return spots;
}

export interface GravyRunoff {
  readonly n: number;
  readonly top: number;
  readonly born: number;
  readonly run: number;
  readonly wiped: number;
  readonly width: number;
}
/** Narrow rivulets running from the pool down to the card's bottom edge. */
export function gravyRunoffs(p: GravyPlan): readonly GravyRunoff[] {
  const list = [
    { n: p.poolN - 0.03, born: p.contact + 380, run: 900, width: 1.2 },
    { n: p.poolN - 0.11, born: p.tip + p.fall + 120, run: 620, width: 2 },
  ];
  if (p.flood) list.push({ n: p.poolN + 0.09, born: p.tip + p.fall + 260, run: 700, width: 1.7 });
  return list.map((r) => ({ ...r, top: p.poolV, wiped: gravyWipedAt(p, { n: r.n, v: p.poolV }) }));
}
export const gravyRunHead = (r: GravyRunoff, ms: number) =>
  r.top + (1 - r.top) * clamp((ms - r.born) / r.run) ** 2;
export const gravyRunTail = (r: GravyRunoff, ms: number) =>
  ms < r.wiped ? r.top : r.top + (1 - r.top) * clamp((ms - r.wiped) / GRAVY_DRAIN) ** 1.5;
/** Release times of the drops that fall from a rivulet's end while it still flows. */
export function gravyDrops(r: GravyRunoff): readonly number[] {
  const drops: number[] = [];
  for (
    let at = r.born + r.run + 160;
    at < r.wiped + GRAVY_DRAIN && drops.length < 12;
    at += GRAVY_DRIP
  )
    drops.push(at);
  return drops;
}

/** Remaining weight on the card: what was poured, less what has been mopped up. */
function load(p: GravyPlan, ms: number): number {
  const mopped = ease((ms - p.wipeStart) / (p.wipeEnd - p.wipeStart));
  return gravyPoured(p, ms) * (1 - mopped);
}

/**
 * Card response: it sags toward the heavy, flooded corner, is dragged and twisted by each pressed
 * stroke of the roll, then wobbles back to rest.
 */
export function gravyCardPose(p: GravyPlan, ms: number, facing: number): CardPose {
  if (ms < p.contact || ms >= p.recovered) return NEUTRAL_CARD;
  const weight = load(p, ms);
  let angle = -facing * 3.4 * weight,
    y = 2.6 * weight,
    x = 0,
    sx = 1,
    sy = 1;
  const thud =
    0.4 * pulse(ms, p.contact, 160) + (p.flood ? 1 : 0.6) * pulse(ms, p.tip + p.fall, 240);
  y += 1.8 * thud;
  sy -= 0.02 * thud;
  const press = ease((ms - p.wipeStart) / 100) * (1 - ease((ms - p.wipeEnd + 100) / 100));
  if (press > 0) {
    const a = gravyWipePoint(p, ms - 12),
      b = gravyWipePoint(p, ms + 12);
    const dx = facing * (b.n - a.n) * GRAVY_ASPECT,
      dy = b.v - a.v,
      speed = Math.hypot(dx, dy);
    const drag = Math.min(1, speed / 0.02) * press;
    const fx = speed > 1e-6 ? dx / speed : 0,
      fy = speed > 1e-6 ? dy / speed : 0;
    const at = gravyWipePoint(p, ms);
    const rx = (facing > 0 ? at.n - 0.5 : 0.5 - at.n) * GRAVY_ASPECT,
      ry = at.v - 0.5;
    x += 2.2 * fx * drag;
    y += 1.4 * fy * drag + 0.6 * press;
    angle += 9 * (rx * fy - ry * fx) * drag;
    sx -= 0.012 * press;
    sy -= 0.012 * press;
  }
  const released = ms - p.wipeEnd;
  if (released > 0) angle += facing * 1.4 * Math.sin(released / 70) * Math.exp(-released / 170);
  const settle = 1 - span(ms, p.recovered - 260, 260);
  return {
    x: x * settle,
    y: y * settle,
    angle: angle * settle,
    sx: 1 + (sx - 1) * settle,
    sy: 1 + (sy - 1) * settle,
  };
}

export function gravyFrames(p: GravyPlan, facing: number) {
  return cardFrames(GRAVY_DURATION, p.pace, (ms) => gravyCardPose(p, ms, facing));
}

/** Exit: distance fraction toward the exit point, and how far the chef has turned away from the card. */
export function gravyExitProgress(p: GravyPlan, ms: number): { d: number; turn: number } {
  const t = span(ms, p.departure, p.exitEnd - p.departure);
  if (p.exit === 'nibble') return { d: t * t * (1.6 - 0.6 * t), turn: ease(t / 0.16) };
  // Two sheepish steps backward still facing the card, then a turn and a hurried walk off.
  const back = 0.1 * ease(t / 0.3);
  const w = span(t, 0.3, 0.7);
  return { d: back + 0.9 * w * w * (1.6 - 0.6 * w), turn: ease((t - 0.26) / 0.16) };
}
export const gravyBiteAt = (p: GravyPlan, k: number) => p.departure + 450 + k * 420;
