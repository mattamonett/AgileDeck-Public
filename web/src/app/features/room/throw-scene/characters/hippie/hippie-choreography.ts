import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardFrames,
  chooseSide,
  clamp,
  ease,
  sidePoint,
  withSlow,
  NEUTRAL_CARD,
  type CardPose,
  type Side,
} from '../../kit';

export const HIPPIE_DURATION = 10400;
/** Model units from the sandal soles to the top of the hair; the actor stands about card height. */
export const HIPPIE_HEIGHT = 64;
/** How far the face turns from profile toward the viewer while she faces left or right. */
export const HIPPIE_BIAS = 0.6;
/** Daisy stem length from the grip to the flower centre, in model units. */
export const DAISY_STEM = 13;
/** Forward distance (model units) from her feet to the card edge while she tucks the daisy. */
export const HIPPIE_GAP = 8;
export const HIPPIE_GREETING = 'Peace, man ✌️';

/** A lazy, swaying stroll or a barefoot skip. */
export type HippieGait = 'stroll' | 'skip';
/** Leaves waving goodbye, or holding a peace sign up over her shoulder. */
export type HippieFarewell = 'wave' | 'peace';

export interface HippiePlan {
  readonly kind: '☮️';
  readonly side: Side;
  readonly pace: number;
  readonly gait: HippieGait;
  readonly bend: number;
  readonly phase: number;
  /** Canonical ms at which the approach ends at the stand point. */
  readonly travel: number;
  /** Route fractions where she slows to smell the daisy and where she flashes a peace sign. */
  readonly sniffAt: number;
  readonly peaceAt: number;
  /** How slow the sniff gets, as a fraction of walking speed; never a dead stop. */
  readonly sniffDepth: number;
  /** Head tilt while she sizes up the card. */
  readonly tilt: number;
  /** Flower centre on the card: across from the near edge, and down from the top. */
  readonly inset: number;
  readonly drop: number;
  /** Stem lean away from vertical toward the card centre, in radians. */
  readonly lean: number;
  /** How hard the tuck nudges the card, and how far she overreaches on tiptoe. */
  readonly push: number;
  readonly stretch: number;
  /** Mellow sway: number of swings, period, peak angle in degrees. */
  readonly swings: number;
  readonly period: number;
  readonly sway: number;
  readonly farewell: HippieFarewell;
  /** Vertical meander of the exit route in px, and its exit tempo. */
  readonly meander: number;
  readonly exit: number;
  readonly look: number;
  readonly reach: number;
  readonly tuck: number;
  readonly release: number;
  readonly swayStart: number;
  readonly swayEnd: number;
  readonly depart: number;
  readonly turned: number;
  readonly exitEnd: number;
  readonly fadeEnd: number;
}

export function hippiePlan(id: string): HippiePlan {
  const r = seededRandom(`${id}:hippie`);
  const side: Side = r() < 0.5 ? -1 : 1;
  const pace = 0.94 + r() * 0.12;
  const gait: HippieGait = r() < 0.5 ? 'stroll' : 'skip';
  const bend = r() * 2 - 1;
  const phase = r() * Math.PI * 2;
  const travel = gait === 'skip' ? 2050 + r() * 300 : 2350 + r() * 350;
  const early = 0.2 + r() * 0.16,
    late = 0.56 + r() * 0.14;
  const sniffFirst = r() < 0.5;
  const sniffAt = sniffFirst ? early : late;
  const peaceAt = sniffFirst ? late : early;
  const sniffDepth = 0.32 + r() * 0.2;
  const tilt = (0.12 + r() * 0.12) * (r() < 0.5 ? -1 : 1);
  const inset = 0.13 + r() * 0.08;
  const drop = 0.07 + r() * 0.05;
  const lean = 0.42 + r() * 0.2;
  const push = 0.75 + r() * 0.5;
  const stretch = 0.6 + r() * 0.4;
  const swings = r() < 0.5 ? 2 : 3;
  const period = 820 + r() * 180;
  const sway = 4.5 + r() * 2.5;
  const farewell: HippieFarewell = r() < 0.5 ? 'wave' : 'peace';
  const meander = (8 + r() * 14) * (r() < 0.5 ? -1 : 1);
  const exit = 1750 + r() * 350;
  const look = travel + 160 + r() * 120;
  const reach = look + 420 + r() * 120;
  const tuck = reach + 640 + 80 * stretch;
  const release = tuck + 220;
  const swayStart = release + 120;
  const swayEnd = swayStart + swings * period;
  const depart = swayEnd - 260;
  const turned = depart + 380;
  const exitEnd = turned + exit;
  const fadeEnd = exitEnd + 380;
  return {
    kind: '☮️',
    side,
    pace,
    gait,
    bend,
    phase,
    travel,
    sniffAt,
    peaceAt,
    sniffDepth,
    tilt,
    inset,
    drop,
    lean,
    push,
    stretch,
    swings,
    period,
    sway,
    farewell,
    meander,
    exit,
    look,
    reach,
    tuck,
    release,
    swayStart,
    swayEnd,
    depart,
    turned,
    exitEnd,
    fadeEnd,
  };
}

/** The actor stands a little shorter than the card, so she has to stretch to reach its top corner. */
export const hippieScale = (b: TargetBounds) => b.height / (HIPPIE_HEIGHT + 11);
/** She stands on the card's bottom edge line. */
export const hippieFloor = (b: TargetBounds) => b.top + b.height;

export function hippieLandingPoint(
  p: HippiePlan,
  b: TargetBounds,
  view: Point,
  chosen?: number,
): Point {
  const side = chooseSide(p.side, b, view, chosen);
  const forward = HIPPIE_GAP * Math.cos(HIPPIE_BIAS) * hippieScale(b);
  return sidePoint(side, b, view, forward, 1);
}

/**
 * Fraction of the route covered: eased in and out, with a sniff that slows the walk to a drift
 * without stopping it, and a gentle surge on each skip.
 */
export function hippieProgress(p: HippiePlan, ms: number): number {
  const t = clamp(ms / p.travel);
  const slow = withSlow(t, p.sniffAt - 0.08, 0.2, p.sniffDepth);
  // Ease the ends only; the slow beat keeps its own shape between them.
  const u =
    slow < 0.12
      ? (slow * slow) / 0.24 / 0.88
      : slow > 0.88
        ? 1 - ((1 - slow) * (1 - slow)) / 0.24 / 0.88
        : (slow - 0.06) / 0.88;
  return clamp(u);
}

/** Strength (0..1) of the sniff and the peace flash during the approach. */
export function hippieSniff(p: HippiePlan, ms: number): number {
  const t = ms / p.travel;
  return t >= 1 ? 0 : Math.sin(Math.PI * clamp((t - p.sniffAt + 0.1) / 0.22)) ** 2;
}
export function hippieFlash(p: HippiePlan, ms: number): number {
  const t = ms / p.travel;
  return t >= 1 ? 0 : Math.sin(Math.PI * clamp((t - p.peaceAt + 0.1) / 0.24));
}

/** The mellow rock, -1..1: eases in, swings `swings` times and settles home at `swayEnd`. */
export function hippieRock(p: HippiePlan, ms: number): number {
  const t = ms - p.swayStart,
    length = p.swayEnd - p.swayStart;
  if (t <= 0 || t >= length) return 0;
  const envelope = ease(t / 300) * (1 - ease((t - length + p.period * 0.7) / (p.period * 0.7)));
  return Math.sin((Math.PI * 2 * t) / p.period) * envelope;
}

/** Card angle in degrees: a nudge away from the tucking hand, then the slow, mellow rock. */
export function hippieCardAngle(p: HippiePlan, ms: number, side: Side): number {
  const nudge = p.push * 2.2 * Math.sin(Math.PI * clamp((ms - p.tuck) / 380));
  return side * (nudge + hippieRock(p, ms) * p.sway);
}

/** The card rocks about its bottom centre, as if swaying along to the music. */
export function hippieCardPose(p: HippiePlan, ms: number, side: Side, b: TargetBounds): CardPose {
  const angle = hippieCardAngle(p, ms, side);
  if (Math.abs(angle) < 1e-9) return NEUTRAL_CARD;
  const a = (angle * Math.PI) / 180,
    dy = b.height / 2;
  return { x: dy * Math.sin(a), y: dy * (1 - Math.cos(a)), angle, sx: 1, sy: 1 };
}

export function hippieFrames(p: HippiePlan, facing: number, b: TargetBounds) {
  const side: Side = facing < 0 ? -1 : 1;
  return cardFrames(HIPPIE_DURATION, p.pace, (ms) => hippieCardPose(p, ms, side, b));
}

/** Where the daisy's flower centre rests on the unrotated card, near its top corner. */
export function daisyFlower(p: HippiePlan, b: TargetBounds, side: Side): Point {
  const u = side > 0 ? p.inset : 1 - p.inset;
  return { x: b.left + b.width * u, y: b.top + b.height * p.drop };
}
/** The stem end below the flower, leaning out over the near edge where her hand holds it. */
export function daisyGrip(p: HippiePlan, b: TargetBounds, side: Side): Point {
  const head = daisyFlower(p, b, side),
    length = DAISY_STEM * hippieScale(b);
  return { x: head.x - side * Math.sin(p.lean) * length, y: head.y + Math.cos(p.lean) * length };
}

/** Off-screen exit away from the card, meandering a little up or down the table. */
export function hippieExitPoint(p: HippiePlan, b: TargetBounds, view: Point, side: Side): Point {
  const floor = hippieFloor(b);
  return {
    x: side > 0 ? -120 : view.x + 120,
    y: Math.max(80, Math.min(view.y - 20, floor + p.meander)),
  };
}
