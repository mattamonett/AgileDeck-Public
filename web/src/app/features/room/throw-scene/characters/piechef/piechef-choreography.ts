import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardFit,
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

export const PIECHEF_DURATION = 10300;
export const PIECHEF_SCALE = 1.15;
/** Horizontal distance, in model units, from the chef's feet to the pie while it is pressed on the card. */
export const PIECHEF_REACH = 19;
/** The chef stands this far (in pixels at full card size) below the card, so drips have room to fall. */
export const PIECHEF_FLOOR_GAP = 14;

export type PiechefBeat = 'teeter' | 'sniff';
export type PiechefStumble = 'lurch' | 'hop' | 'stagger';
export type PiechefTinEnd = 'drop' | 'tuck';
export type PiechefRecovery = 'wipe' | 'toque' | 'shrug';
export type PiechefExit = 'hurry' | 'tiptoe';

export interface PiechefPlan {
  readonly kind: '🥷';
  readonly side: Side;
  readonly pace: number;
  /** Canonical ms at which the chef's feet arrive beside the card. */
  readonly travel: number;
  readonly bend: number;
  /** Acted beat on the way: the pie teeters, or the chef lifts it for a proud sniff. */
  readonly beat: PiechefBeat;
  readonly beatAt: number;
  readonly dip: number;
  readonly bounce: number;
  /** Leg index (0 near the camera when facing right) whose toe catches. */
  readonly tripFoot: 0 | 1;
  readonly stumble: PiechefStumble;
  readonly severity: number;
  /** Distance, in model units, still to go when the toe catches; the trip always happens near the card. */
  readonly tripDist: number;
  /** Contact on the card, measured from the chef's near edge (u) and from the top (v). */
  readonly splatU: number;
  readonly splatV: number;
  readonly strength: number;
  readonly hold: number;
  readonly peelTime: number;
  readonly tinEnd: PiechefTinEnd;
  readonly recovery: PiechefRecovery;
  readonly askew: number;
  readonly exit: PiechefExit;
  readonly exitRise: number;
  readonly runoff: number;
  readonly phase: number;
  readonly splat: number;
  readonly peel: number;
  readonly peelEnd: number;
  readonly look: number;
  readonly release: number;
  readonly recover: number;
  readonly recoverEnd: number;
  readonly settled: number;
  readonly departure: number;
  readonly exitEnd: number;
}

const GESTURE: Readonly<Record<PiechefRecovery, number>> = { wipe: 1150, toque: 950, shrug: 820 };

export function piechefPlan(id: string): PiechefPlan {
  const r = seededRandom(`${id}:piechef-v2`);
  const side: Side = r() < 0.5 ? -1 : 1;
  const pace = 0.94 + r() * 0.12;
  const travel = 2300 + r() * 500;
  const bend = r() * 2 - 1;
  const beat: PiechefBeat = r() < 0.5 ? 'teeter' : 'sniff';
  const beatAt = 0.3 + r() * 0.2;
  const dip = (beat === 'teeter' ? 0.4 : 0.28) + r() * 0.1;
  const bounce = 0.6 + r() * 0.8;
  const tripFoot: 0 | 1 = r() < 0.5 ? 0 : 1;
  const stumbles: readonly PiechefStumble[] = ['lurch', 'hop', 'stagger'];
  const stumble = stumbles[Math.floor(r() * 3)] ?? 'lurch';
  const severity = 0.8 + r() * 0.4;
  const tripDist = 38 + r() * 22;
  const splatU = 0.22 + r() * 0.12;
  const splatV = 0.75 + r() * 0.08;
  const strength = 0.85 + r() * 0.35;
  const hold = 260 + r() * 260;
  const peelTime = 420 + r() * 620;
  const tinEnd: PiechefTinEnd = r() < 0.5 ? 'drop' : 'tuck';
  const recoveries: readonly PiechefRecovery[] = ['wipe', 'toque', 'shrug'];
  const recovery = recoveries[Math.floor(r() * 3)] ?? 'shrug';
  const askew = (r() < 0.5 ? -1 : 1) * (0.16 + r() * 0.14);
  const exit: PiechefExit = r() < 0.5 ? 'hurry' : 'tiptoe';
  const exitRise = r() * 2 - 1;
  const runoff = 1150 + r() * 600;
  const phase = r() * Math.PI * 2;
  const splat = travel + 90 + r() * 80;
  const peel = splat + hold;
  const peelEnd = peel + peelTime;
  const look = peelEnd + 320;
  const release = look + 380;
  const recover = release + (tinEnd === 'drop' ? 420 : 380);
  const recoverEnd = recover + GESTURE[recovery];
  const settled = recovery === 'wipe' ? recoverEnd + 220 : peelEnd + 900;
  const departure = recoverEnd + 150;
  const exitEnd = departure + (exit === 'hurry' ? 1400 + r() * 200 : 2400 + r() * 300);
  return {
    kind: '🥷',
    side,
    pace,
    travel,
    bend,
    beat,
    beatAt,
    dip,
    bounce,
    tripFoot,
    stumble,
    severity,
    tripDist,
    splatU,
    splatV,
    strength,
    hold,
    peelTime,
    tinEnd,
    recovery,
    askew,
    exit,
    exitRise,
    runoff,
    phase,
    splat,
    peel,
    peelEnd,
    look,
    release,
    recover,
    recoverEnd,
    settled,
    departure,
    exitEnd,
  };
}

export const piechefScale = (b: TargetBounds) => PIECHEF_SCALE * cardFit(b);
export const piechefFloor = (b: TargetBounds) => b.top + b.height + PIECHEF_FLOOR_GAP * cardFit(b);

/** Unanimated card point where the pie face lands; the chef's near edge depends on the side. */
export function piechefContact(p: PiechefPlan, b: TargetBounds, side: Side): Point {
  const u = side > 0 ? p.splatU : 1 - p.splatU;
  return { x: b.left + b.width * u, y: b.top + b.height * p.splatV };
}

/** Stand point: the feet sit where the pressed pie is at the chef's planned reach from the contact. */
export function piechefLandingPoint(
  p: PiechefPlan,
  b: TargetBounds,
  view: Point,
  chosen?: number,
): Point {
  const side = chooseSide(p.side, b, view, chosen);
  const gap = PIECHEF_REACH * piechefScale(b) - p.splatU * b.width;
  return sidePoint(side, b, view, gap, (piechefFloor(b) - b.top) / b.height);
}

const RAMP = 0.14,
  BEAT = 0.16,
  BRAKE = 0.88,
  SURGE_END = 0.96;
/** Integral of a half-sine bump of the given length starting at `at`. */
const bumpArea = (t: number, at: number, length: number) =>
  (length / Math.PI) * (1 - Math.cos(Math.PI * clamp((t - at) / length)));

/**
 * Relative walking speed: a gentle start, the acted beat (still travelling), the stumbling surge
 * after the toe catches at `trip`, and the brake into the card. It never drops to a standstill.
 */
export function piechefSpeed(p: PiechefPlan, t: number, trip: number): number {
  const u = clamp(t);
  const start = u < RAMP ? 0.5 * (1 - u / RAMP) ** 2 : 0;
  const brake = u > BRAKE ? 0.8 * ((u - BRAKE) / (1 - BRAKE)) ** 2 : 0;
  const surge = 0.45 * p.severity * pulse(u, trip, SURGE_END - trip);
  return 1 - start - p.dip * pulse(u, p.beatAt, BEAT) + surge - brake;
}
function travelled(p: PiechefPlan, t: number, trip: number): number {
  const u = clamp(t);
  const start = u < RAMP ? (0.5 * RAMP * (1 - (1 - u / RAMP) ** 3)) / 3 : (0.5 * RAMP) / 3;
  const brake = u > BRAKE ? (0.8 * (1 - BRAKE) * ((u - BRAKE) / (1 - BRAKE)) ** 3) / 3 : 0;
  const surge = 0.45 * p.severity * bumpArea(u, trip, SURGE_END - trip);
  return u - start - p.dip * bumpArea(u, p.beatAt, BEAT) + surge - brake;
}
/** Fraction of the route's length covered at normalized approach time t. */
export function piechefProgress(p: PiechefPlan, t: number, trip: number): number {
  return travelled(p, t, trip) / travelled(p, 1, trip);
}
/**
 * Normalized time at which the toe catches: when the planned stumble distance is all that is left
 * of a route `units` long (clamped so short and long routes both keep a readable stumble).
 */
export function piechefTripT(p: PiechefPlan, units: number): number {
  const left = Math.max(0.12, Math.min(0.24, p.tripDist / Math.max(1, units)));
  let trip = 0.8;
  for (let i = 0; i < 6; i++) {
    const miss = 1 - left - piechefProgress(p, trip, trip);
    trip = Math.max(
      0.7,
      Math.min(
        0.9,
        trip + (miss * travelled(p, 1, trip)) / Math.max(0.2, piechefSpeed(p, trip, trip)),
      ),
    );
  }
  return trip;
}

/** Tin peel: a sticky start that gives way suddenly on slow peels, a single yank on quick ones. */
export function piechefPeel(p: PiechefPlan, ms: number): number {
  const t = span(ms, p.peel, p.peelTime);
  const sticky = clamp((p.peelTime - 420) / 620);
  return clamp(t ** (1 + 1.6 * sticky));
}

/** Rubs of the mitt across the splat during the awkward wipe; 0 outside the wipe. */
export function piechefRub(p: PiechefPlan, ms: number): number {
  if (p.recovery !== 'wipe') return 0;
  const t = span(ms, p.recover + 250, GESTURE.wipe - 450);
  return t > 0 && t < 1 ? Math.sin(t * Math.PI * 5) : 0;
}

/**
 * The card takes the pie in the face: knocked back and away from the chef, held while he presses,
 * tugged toward him by the sticky tin, then wobbles free. A wipe jostles it once more.
 */
export function piechefCardPose(p: PiechefPlan, ms: number, facing: number): CardPose {
  if (ms < p.splat || ms >= p.settled) return NEUTRAL_CARD;
  const f = facing < 0 ? -1 : 1,
    k = p.strength;
  const impact = pulse(ms, p.splat, 240);
  const press = ease((ms - p.splat) / 120) * (1 - ease((ms - p.peel) / 200));
  const tug = pulse(ms, p.peel, p.peelTime) * piechefPeel(p, ms) ** 0.5;
  const y = 1.5 * impact * k,
    sx = 1 - 0.05 * impact * k - 0.015 * press;
  let x = f * (4 * impact + 1.5 * press) * k - f * 3.2 * tug,
    angle = -f * (3.5 * impact + 1 * press) * k + f * 2.2 * tug,
    sy = 1 - 0.035 * impact * k - 0.01 * press;
  const free = ms - p.peelEnd;
  if (free > 0) {
    const decay = Math.exp(-free / 180);
    x += f * 2.4 * Math.sin(free / 60) * decay;
    angle -= f * 3 * Math.sin(free / 55) * decay;
    sy += 0.02 * Math.sin(free / 50) * decay;
  }
  const rub = piechefRub(p, ms);
  x += f * 1.4 * rub;
  angle -= f * 0.8 * rub;
  const settle = 1 - span(ms, p.settled - 200, 200);
  return {
    x: x * settle,
    y: y * settle,
    angle: angle * settle,
    sx: 1 + (sx - 1) * settle,
    sy: 1 + (sy - 1) * settle,
  };
}

export function piechefFrames(p: PiechefPlan, facing: number) {
  return cardFrames(PIECHEF_DURATION, p.pace, (ms) => piechefCardPose(p, ms, facing));
}

/** Leaves away from the card, off the near viewport edge. */
export function piechefExitPoint(p: PiechefPlan, b: TargetBounds, view: Point, side: Side): Point {
  const stand = piechefLandingPoint(p, b, view, side);
  return {
    x: side > 0 ? -110 : view.x + 110,
    y: Math.max(60, Math.min(view.y - 20, stand.y + p.exitRise * 40)),
  };
}

/** A turn on the spot, then a scurry that builds speed, or a creeping tiptoe that breaks into a dash. */
export function piechefExitProgress(p: PiechefPlan, ms: number): number {
  const t = span(ms, p.departure + 220, p.exitEnd - p.departure - 220);
  if (p.exit === 'hurry') return t * t * (1.6 - 0.6 * t);
  if (t < 0.45) return (0.12 * t) / 0.45;
  const d = t - 0.45;
  return 0.12 + (0.12 / 0.45) * d + ((1 - 0.12 - (0.12 / 0.45) * 0.55) / 0.3025) * d * d;
}
