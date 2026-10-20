import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardFrames,
  chooseSide,
  clamp,
  ease,
  pulse,
  sidePoint,
  span,
  NEUTRAL_CARD,
  type CardPose,
  type Side,
} from '../../kit';

export const GINGERBREAD_DURATION = 11900;
export const GINGERBREAD_SCALE = 0.95;
/** Approximate gap between the card edge and the stand point; the trick refines it from the real hook. */
export const GINGERBREAD_GAP = 16;

export type GingerbreadApproach = 'sneak' | 'skip';
export type GingerbreadTest = 'tap' | 'tug';
export type GingerbreadBow = 'sweep' | 'tip';
export type GingerbreadStow = 'back' | 'arm';
export type GingerbreadExit = 'out' | 'across';

export interface GingerbreadPlan {
  readonly kind: '🍪';
  readonly side: Side;
  readonly pace: number;
  /** Canonical ms at which the approach ends at the stand point. */
  readonly travel: number;
  readonly bend: number;
  readonly approach: GingerbreadApproach;
  /** Speed rhythm: amplitude, cycles over the approach and phase. */
  readonly rhythm: number;
  readonly rhythmRate: number;
  readonly rhythmPhase: number;
  /** Acted beat on the way (look round when sneaking, cane twirl when skipping), as a travel fraction. */
  readonly beatAt: number;
  readonly beatDepth: number;
  readonly test: GingerbreadTest;
  readonly taps: number;
  readonly strength: number;
  /** Where the crook bears on the top edge, measured in from the near corner. */
  readonly hookU: number;
  readonly swings: number;
  readonly amp: number;
  readonly period: number;
  readonly flips: number;
  /** +1 flips forward along the flight, -1 flips backward. */
  readonly flipDir: Side;
  readonly stick: boolean;
  readonly bow: GingerbreadBow;
  readonly stow: GingerbreadStow;
  readonly exit: GingerbreadExit;
  /** Cartwheel speed in px per ms at full card size. */
  readonly wheelSpeed: number;
  readonly landGap: number;
  readonly phase: number;
  readonly testStart: number;
  readonly testHit: number;
  readonly testEnd: number;
  readonly leap: number;
  readonly catchAt: number;
  readonly release: number;
  readonly land: number;
  readonly landEnd: number;
  readonly bowEnd: number;
  readonly stowAt: number;
  readonly stowEnd: number;
  readonly exitAt: number;
  readonly exitEnd: number;
}

export function gingerbreadPlan(id: string): GingerbreadPlan {
  const r = seededRandom(`${id}:gingerbread-v2`);
  const side: Side = r() < 0.5 ? -1 : 1;
  const pace = 0.94 + r() * 0.12;
  const approach: GingerbreadApproach = r() < 0.5 ? 'sneak' : 'skip';
  const travel = approach === 'sneak' ? 2050 + r() * 350 : 1650 + r() * 300;
  const bend = r() * 2 - 1;
  const rhythm = 0.12 + r() * 0.16;
  const rhythmRate = (approach === 'sneak' ? 3 : 4) + Math.floor(r() * 2);
  const rhythmPhase = r() * Math.PI * 2;
  const beatAt = 0.34 + r() * 0.26;
  const beatDepth = approach === 'sneak' ? 0.4 + r() * 0.12 : 0.22 + r() * 0.12;
  const test: GingerbreadTest = r() < 0.5 ? 'tap' : 'tug';
  const taps = r() < 0.5 ? 1 : 2;
  const strength = 0.85 + r() * 0.35;
  const hookU = 0.035 + r() * 0.05;
  const swings = r() < 0.5 ? 2 : 3;
  const amp = 0.42 + r() * 0.2;
  const period = 560 + r() * 110;
  const flips = r() < 0.5 ? 1 : 2;
  const flipDir: Side = r() < 0.5 ? -1 : 1;
  const stick = r() < 0.5;
  const bow: GingerbreadBow = r() < 0.5 ? 'sweep' : 'tip';
  const stow: GingerbreadStow = r() < 0.5 ? 'back' : 'arm';
  const exit: GingerbreadExit = r() < 0.5 ? 'out' : 'across';
  const wheelSpeed = 0.42 + r() * 0.2;
  const landGap = 24 + r() * 18;
  const phase = r() * Math.PI * 2;
  const testStart = travel + 140;
  const testHit = testStart + 320;
  const testEnd = testHit + (test === 'tap' ? 200 + (taps - 1) * 240 : 520) + 220;
  const leap = testEnd + 300;
  const catchAt = leap + 360;
  const release = catchAt + (swings - 0.25) * period;
  const land = release + (flips === 2 ? 720 : 580);
  const landEnd = land + (stick ? 440 : 960);
  const bowEnd = landEnd + (bow === 'sweep' ? 760 : 820);
  const stowAt = bowEnd + 60;
  const stowEnd = stowAt + 520;
  const exitAt = stowEnd + 120;
  const exitEnd = exitAt + 1750 + r() * 250;
  return {
    kind: '🍪',
    side,
    pace,
    travel,
    bend,
    approach,
    rhythm,
    rhythmRate,
    rhythmPhase,
    beatAt,
    beatDepth,
    test,
    taps,
    strength,
    hookU,
    swings,
    amp,
    period,
    flips,
    flipDir,
    stick,
    bow,
    stow,
    exit,
    wheelSpeed,
    landGap,
    phase,
    testStart,
    testHit,
    testEnd,
    leap,
    catchAt,
    release,
    land,
    landEnd,
    bowEnd,
    stowAt,
    stowEnd,
    exitAt,
    exitEnd,
  };
}

export function gingerbreadLandingPoint(
  p: GingerbreadPlan,
  b: TargetBounds,
  view: Point,
  chosen?: number,
): Point {
  return sidePoint(chooseSide(p.side, b, view, chosen), b, view, GINGERBREAD_GAP, 1.05);
}
export const gingerbreadFloor = (b: TargetBounds) => b.top + b.height * 1.05;

/** Contact instants of the cane test: each tap, or the start of the hooked tug. */
export const gingerbreadTapAt = (p: GingerbreadPlan, k: number) => p.testHit + k * 240;
/** The tug holds the near edge from the hit until this moment. */
export const gingerbreadTugEnd = (p: GingerbreadPlan) => p.testHit + 520;

/** Relative approach speed at travel fraction t: launch, rhythm, the acted beat and the braking. */
export function gingerbreadSpeed(p: GingerbreadPlan, t: number): number {
  const launch = 0.08 + 0.92 * ease(t / 0.12);
  const brake = ease((1 - t) / 0.14);
  const rhythm = 1 + p.rhythm * Math.sin(Math.PI * 2 * p.rhythmRate * t + p.rhythmPhase);
  const beat = 1 - p.beatDepth * pulse(t, p.beatAt, 0.18) ** 2;
  return launch * brake * rhythm * beat;
}
const STEPS = 160;
function integrate(p: GingerbreadPlan, t: number): number {
  const h = clamp(t) / STEPS;
  let sum = 0;
  for (let i = 0; i < STEPS; i++)
    sum += (gingerbreadSpeed(p, i * h) + gingerbreadSpeed(p, (i + 1) * h)) * 0.5 * h;
  return sum;
}
/** Fraction of the route's length covered at canonical ms; it never stalls between launch and braking. */
export function gingerbreadProgress(p: GingerbreadPlan, ms: number): number {
  if (ms >= p.travel) return 1;
  if (ms <= 0) return 0;
  return integrate(p, ms / p.travel) / integrate(p, 1);
}
/** Weight of the acted beat (0..1) at canonical ms. */
export const gingerbreadBeat = (p: GingerbreadPlan, ms: number) =>
  pulse(ms / p.travel, p.beatAt, 0.18);

/** Trapeze angle, positive swinging outward, away from the card. It starts inward with the leap's momentum. */
export function gingerbreadSwing(p: GingerbreadPlan, ms: number): number {
  if (ms < p.catchAt) return 0;
  const t = Math.min(ms, p.release) - p.catchAt;
  const build = 0.55 + 0.45 * ease(t / p.period);
  return -p.amp * build * Math.sin((Math.PI * 2 * t) / p.period);
}

/** Rotates the card about a pivot (relative to its centre) and adds a translation. */
function about(pivot: Point, angle: number, x: number, y: number): CardPose {
  const a = (angle * Math.PI) / 180;
  return {
    x: pivot.x - (pivot.x * Math.cos(a) - pivot.y * Math.sin(a)) + x,
    y: pivot.y - (pivot.x * Math.sin(a) + pivot.y * Math.cos(a)) + y,
    angle,
    sx: 1,
    sy: 1,
  };
}

/**
 * The card answers the cane: a tap knocks it away, a tug draws it in, and his weight on the hooked
 * corner leans it toward him about its bottom near corner, swaying with the swing; it springs back
 * when he lets go.
 */
export function gingerbreadCardPose(
  p: GingerbreadPlan,
  ms: number,
  facing: number,
  b: TargetBounds,
): CardPose {
  const side = facing < 0 ? -1 : 1;
  if (ms < p.testHit || ms >= p.release + 900) return NEUTRAL_CARD;
  const heel = { x: -side * b.width * 0.5, y: b.height * 0.5 };
  if (ms < p.catchAt) {
    if (p.test === 'tap') {
      let knock = 0;
      for (let k = 0; k < p.taps; k++) knock += pulse(ms, gingerbreadTapAt(p, k), 200);
      const far = { x: side * b.width * 0.5, y: b.height * 0.5 };
      return about(far, side * 1.8 * knock * p.strength, side * 1.2 * knock * p.strength, 0);
    }
    const tug = (pulse(ms, p.testHit + 60, 190) + pulse(ms, p.testHit + 290, 190)) * p.strength;
    return about(heel, -side * 1.3 * tug, -side * 2.2 * tug, 0);
  }
  if (ms < p.release) {
    const weight = ease((ms - p.catchAt) / 140);
    const jolt = pulse(ms, p.catchAt, 220);
    const sway = gingerbreadSwing(p, ms) / p.amp;
    const lean = (2.5 * weight + 1.6 * sway * weight + 1.2 * jolt) * p.strength;
    return about(heel, -side * lean, 0, (1.2 * weight + 1.5 * jolt) * p.strength);
  }
  // Let go: the card springs back past upright and settles.
  const t = ms - p.release;
  const from = gingerbreadCardPose(p, p.release - 1, facing, b);
  const spring = Math.cos(t / 75) * Math.exp(-t / 190) * (1 - span(t, 700, 200));
  return about(heel, from.angle * spring, 0, 1.2 * p.strength * spring);
}

export function gingerbreadFrames(p: GingerbreadPlan, facing: number, b: TargetBounds) {
  return cardFrames(GINGERBREAD_DURATION, p.pace, (ms) => gingerbreadCardPose(p, ms, facing, b));
}

/** Where the crook bears on the card: the top edge, just in from the near corner. */
export function gingerbreadHookPoint(p: GingerbreadPlan, b: TargetBounds, side: Side): Point {
  return { x: b.left + (side > 0 ? p.hookU : 1 - p.hookU) * b.width, y: b.top };
}

/** The flight lands outward from the stand point, inside the viewport. */
export function gingerbreadLandPoint(
  p: GingerbreadPlan,
  stand: Point,
  b: TargetBounds,
  view: Point,
  side: Side,
  fit: number,
): Point {
  const x = stand.x - side * p.landGap * fit;
  return { x: Math.max(24, Math.min(view.x - 24, x)), y: gingerbreadFloor(b) };
}

/** Cartwheels leave outward or back across the front of the card, to the far edge of the view. */
export function gingerbreadExitDirection(p: GingerbreadPlan, side: Side): Side {
  return p.exit === 'out' ? (side > 0 ? -1 : 1) : side;
}
export function gingerbreadExitX(p: GingerbreadPlan, view: Point, side: Side): number {
  return gingerbreadExitDirection(p, side) > 0 ? view.x + 90 : -90;
}

/** Distance cartwheeled at canonical ms: a quick wind-up, then a steady roll that clears the view in time. */
export function gingerbreadWheelDistance(
  p: GingerbreadPlan,
  ms: number,
  total: number,
  fit: number,
): number {
  const ramp = 360;
  const tau = Math.max(0, ms - p.exitAt);
  const speed = Math.max(p.wheelSpeed * fit, total / (p.exitEnd - p.exitAt - ramp));
  return tau < ramp ? (speed * tau * tau) / (2 * ramp) : speed * (tau - ramp / 2);
}
