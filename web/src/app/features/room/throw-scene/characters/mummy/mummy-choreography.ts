import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardFrames,
  chooseSide,
  clamp,
  ease,
  mix,
  pulse,
  sidePoint,
  sideRoute,
  span,
  withSlow,
  NEUTRAL_CARD,
  type CardPose,
  type Side,
} from '../../kit';

export const MUMMY_DURATION = 10600;
export const MUMMY_SCALE = 0.95;
/** Card bands, top to bottom, leaving an eye slit and the value readable. */
export const MUMMY_BANDS = [0.08, 0.17, 0.355, 0.665, 0.785, 0.9] as const;
export const MUMMY_EYE_V = 0.262;
export const MUMMY_BAND_WIDTH = 0.072;

export interface MummyPlan {
  readonly kind: '🤕';
  readonly side: Side;
  readonly pace: number;
  readonly travel: number;
  readonly bend: number;
  readonly stumble: boolean;
  readonly pauseAt: number;
  readonly drag: Side;
  readonly bands: number;
  readonly wrap: number;
  readonly squeeze: number;
  readonly glance: Side;
  readonly blinks: number;
  readonly yank: number;
  readonly rewind: boolean;
  readonly turns: number;
  readonly lookBack: boolean;
  readonly exitRise: number;
  readonly phase: number;
  readonly arrive: number;
  readonly grab: number;
  readonly wrapStart: number;
  readonly wrapEnd: number;
  readonly stare: number;
  readonly yankAt: number;
  readonly peelEnd: number;
  readonly rewindEnd: number;
  readonly departure: number;
  readonly exitEnd: number;
}

export function mummyPlan(id: string): MummyPlan {
  const r = seededRandom(`${id}:mummy-wrap-v2`);
  const side: Side = r() < 0.5 ? -1 : 1;
  const pace = 0.94 + r() * 0.12;
  const travel = 1750 + r() * 350;
  const bend = r() * 2 - 1;
  const stumble = r() < 0.5;
  const pauseAt = 0.35 + r() * 0.22;
  const drag: Side = r() < 0.5 ? -1 : 1;
  // The fifth band is skipped on short wraps so the eye slit and value both stay readable.
  const bands = r() < 0.5 ? 5 : 6;
  const wrap = 280 + r() * 60;
  const squeeze = 0.85 + r() * 0.35;
  const glance: Side = r() < 0.5 ? -1 : 1;
  const blinks = r() < 0.5 ? 1 : 2;
  const yank = 0.85 + r() * 0.35;
  const rewind = r() < 0.5;
  const turns = 1 + Math.round(r());
  const lookBack = r() < 0.5;
  const exitRise = r() * 2 - 1;
  const phase = r() * Math.PI * 2;
  const arrive = travel;
  const grab = arrive + 250;
  const wrapStart = grab + 380;
  const wrapEnd = wrapStart + bands * wrap;
  const stare = wrapEnd + 140;
  const yankAt = stare + 820 + blinks * 220;
  const peelEnd = yankAt + 240 + bands * 115 + 160;
  const rewindEnd = peelEnd + (rewind ? 520 + turns * 260 : 320);
  const departure = rewindEnd + (lookBack ? 480 : 120);
  const exitEnd = departure + 1500 + r() * 200;
  return {
    kind: '🤕',
    side,
    pace,
    travel,
    bend,
    stumble,
    pauseAt,
    drag,
    bands,
    wrap,
    squeeze,
    glance,
    blinks,
    yank,
    rewind,
    turns,
    lookBack,
    exitRise,
    phase,
    arrive,
    grab,
    wrapStart,
    wrapEnd,
    stare,
    yankAt,
    peelEnd,
    rewindEnd,
    departure,
    exitEnd,
  };
}

/** Bands actually used by this plan, top to bottom. */
export function mummyBands(p: MummyPlan): readonly number[] {
  return p.bands === 6 ? MUMMY_BANDS : MUMMY_BANDS.filter((_, i) => i !== 4);
}

/** Stand point: feet a little below the card, on the chosen side. */
export function mummyLandingPoint(
  p: MummyPlan,
  b: TargetBounds,
  view: Point,
  chosen?: number,
): Point {
  const side = chooseSide(p.side, b, view, chosen);
  return sidePoint(side, b, view, 26, 1.06);
}

/** Front pass across the card, then the hidden pass behind it. */
export function mummyBandGrowth(p: MummyPlan, ms: number, k: number): number {
  const start = p.wrapStart + k * p.wrap;
  const laid = ease((ms - start) / (p.wrap * 0.62));
  const peel = mummyPeel(p, ms, k);
  return laid * (1 - peel);
}
export function mummyPeelStart(p: MummyPlan, k: number): number {
  // The last band laid is the first one torn away.
  return p.yankAt + 240 + (p.bands - 1 - k) * 115;
}
export function mummyPeel(p: MummyPlan, ms: number, k: number): number {
  return ease((ms - mummyPeelStart(p, k)) / 160);
}
export const mummyCinch = (p: MummyPlan, k: number) => p.wrapStart + k * p.wrap + p.wrap * 0.62;

/** Where the ribbon from the mummy's hand meets the card: the near edge at the current band. */
export function mummyFeed(p: MummyPlan, ms: number): { k: number; v: number; behind: number } {
  const bands = mummyBands(p);
  const raw = (ms - p.wrapStart) / p.wrap;
  const k = Math.max(0, Math.min(bands.length - 1, Math.floor(raw)));
  const within = clamp(raw - k);
  const behind = within > 0.62 && k < bands.length - 1 ? ease((within - 0.62) / 0.38) : 0;
  const v = mix(bands[k] ?? 0.5, bands[k + 1] ?? bands[k] ?? 0.5, behind);
  return { k, v, behind };
}

/** Constriction accumulates with every cinched band and springs loose as bands are torn off. */
export function mummyCardPose(p: MummyPlan, ms: number, facing: number): CardPose {
  if (ms < p.wrapStart || ms >= p.peelEnd + 900) return NEUTRAL_CARD;
  let sx = 1,
    sy = 1,
    x = 0,
    angle = 0;
  for (let k = 0; k < p.bands; k++) {
    const cinch = mummyCinch(p, k);
    const held = ease((ms - cinch + 60) / 160) * (1 - mummyPeel(p, ms, k));
    const snap = pulse(ms, cinch - 50, 260);
    sx -= (0.014 * held + 0.04 * snap) * p.squeeze;
    sy += (0.006 * held + 0.012 * snap) * p.squeeze;
    x -= facing * 2.4 * snap * p.squeeze;
    angle -= facing * 1.5 * snap * p.squeeze;
    const tear = pulse(ms, mummyPeelStart(p, k), 220);
    angle += (k % 2 ? 1 : -1) * facing * 3.2 * tear * p.yank;
    x -= facing * 2 * tear * p.yank;
  }
  // The trapped card twitches once while the eyes look around.
  angle += Math.sin(ms / 38 + p.phase) * 0.45 * pulse(ms, p.stare + 300, 260);
  // Taking up the slack drags the card toward the mummy before the first tear.
  x -= facing * 4 * pulse(ms, p.yankAt, 300) * p.yank;
  const release = ms - p.peelEnd;
  if (release > 0 && release < 900) {
    const decay = Math.exp(-release / 220);
    sx += 0.05 * Math.sin(release / 55) * decay;
    sy -= 0.02 * Math.sin(release / 55) * decay;
    angle += facing * 2.5 * Math.sin(release / 70) * decay;
  }
  const settle = 1 - span(ms, p.peelEnd + 700, 200);
  return {
    x: x * settle,
    y: 0,
    angle: angle * settle,
    sx: 1 + (sx - 1) * settle,
    sy: 1 + (sy - 1) * settle,
  };
}

export function mummyFrames(p: MummyPlan, facing: number) {
  return cardFrames(MUMMY_DURATION, p.pace, (ms) => mummyCardPose(p, ms, facing));
}

/** Uneven shamble: lurching steps, a stumble or a slow listening creep, and a heavy brake. */
export function mummyTravel(p: MummyPlan, t: number): number {
  // The stumble or the listening beat slows the shamble without ever stopping it.
  const paused = withSlow(t, p.pauseAt, p.stumble ? 0.1 : 0.16, p.stumble ? 0.45 : 0.32);
  const lurch = Math.sin(paused * Math.PI * 9) * Math.sin(paused * Math.PI) * 0.012;
  return clamp(ease(paused) * 0.25 + paused * 0.75 + lurch);
}

export function mummyRoutePoint(
  p: MummyPlan,
  ms: number,
  start: Point,
  b: TargetBounds,
  view: Point,
  side: Side,
): Point {
  const end = mummyLandingPoint(p, b, view, side);
  return sideRoute(start, end, b, view, side, p.bend, mummyTravel(p, ms / p.travel));
}

/** Exit target: off-screen on the side away from the card. */
export function mummyExitPoint(p: MummyPlan, b: TargetBounds, view: Point, side: Side): Point {
  const end = mummyLandingPoint(p, b, view, side);
  return {
    x: side > 0 ? -80 : view.x + 80,
    y: Math.max(60, Math.min(view.y - 20, end.y + p.exitRise * 50)),
  };
}

export function mummyExitProgress(p: MummyPlan, ms: number): number {
  const t = span(ms, p.departure, p.exitEnd - p.departure);
  // Starts as a heavy turn and lurch, then hurries off.
  return t * t * (1.6 - 0.6 * t);
}
