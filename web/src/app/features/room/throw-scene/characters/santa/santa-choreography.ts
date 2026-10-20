import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardFit,
  cardFrames,
  chooseSide,
  clamp,
  ease,
  easeOut,
  sidePoint,
  NEUTRAL_CARD,
  type CardPose,
  type Side,
} from '../../kit';

export const SANTA_DURATION = 11600;
export const SANTA_SCALE = 1.25;
/** How far Santa's face turns from profile toward the viewer while he faces left or right. */
export const SANTA_BIAS = 0.55;
/** Present box in model units; the closed box is exactly as tall as the gap under the card. */
export const GIFT_W = 15;
export const GIFT_H = 11;
export const GIFT_D = 12;
export const LID_H = 3;
export const GIFT_CLOSED = GIFT_H + LID_H;
/** Forward distance (model units) from Santa's feet to the wedged present, and the final push. */
export const GIFT_REACH = 18;
export const GIFT_SLIDE = 4.5;
/** Forward distance from Santa's feet to where the folded sleigh lands. */
export const SLEIGH_DROP = 17;

export type SantaGesture = 'wave' | 'tip';

export interface SantaPlan {
  readonly kind: '🎅';
  readonly side: Side;
  readonly pace: number;
  /** Canonical ms at which the approach ends at the stand point. */
  readonly travel: number;
  readonly bend: number;
  /** Quick little scurry, or a rolling shuffle. */
  readonly scurry: boolean;
  /** Fraction of the approach at which he hitches the sack higher, still walking. */
  readonly hitchAt: number;
  readonly hitch: number;
  readonly phase: number;
  /** Paper and ribbon colours of the present. */
  readonly wrap: number;
  /** Shakes the present by his ear before placing it, or just admires it. */
  readonly shake: boolean;
  /** Contact position from the near bottom corner, as a fraction of the card width. */
  readonly inset: number;
  /** Lid rise under the corner in px at full card size. */
  readonly lift: number;
  readonly bounces: number;
  readonly spring: number;
  /** Tugs the ribbon tail, or taps the lid, to release the spring. */
  readonly pull: boolean;
  readonly laughs: number;
  readonly gesture: SantaGesture;
  readonly kicks: number;
  /** The sleigh takes off into the sky, or glides away along the floor. */
  readonly flies: boolean;
  readonly exitRise: number;
  readonly reach: number;
  readonly emerge: number;
  readonly out: number;
  readonly show: number;
  readonly place: number;
  readonly wedge: number;
  readonly tap: number;
  readonly pop: number;
  readonly peak: number;
  readonly bounceEnd: number;
  readonly sink: number;
  readonly settled: number;
  readonly sleighReach: number;
  readonly sleighOut: number;
  readonly toss: number;
  readonly landed: number;
  readonly unfold: number;
  readonly unfolded: number;
  readonly board: number;
  readonly push: number;
  readonly glide: number;
  readonly seated: number;
  readonly gestureAt: number;
  readonly bubbleOut: number;
  readonly exitEnd: number;
}

export function santaPlan(id: string): SantaPlan {
  const r = seededRandom(`${id}:santa-v2`);
  const side: Side = r() < 0.5 ? -1 : 1;
  const pace = 0.94 + r() * 0.12;
  const scurry = r() < 0.5;
  const travel = scurry ? 1750 + r() * 250 : 2000 + r() * 300;
  const bend = r() * 2 - 1;
  const hitchAt = 0.32 + r() * 0.3;
  const hitch = 0.7 + r() * 0.45;
  const phase = r() * Math.PI * 2;
  const wrap = Math.floor(r() * 3);
  const shake = r() < 0.5;
  const inset = 0.05 + r() * 0.11;
  const lift = 12 + r() * 8;
  const bounces = r() < 0.5 ? 2 : 3;
  const spring = 0.6 + r() * 0.4;
  const pull = r() < 0.5;
  const laughs = r() < 0.5 ? 2 : 3;
  const gesture: SantaGesture = r() < 0.5 ? 'wave' : 'tip';
  const kicks = r() < 0.5 ? 1 : 2;
  const flies = r() < 0.5;
  const exitRise = r() * 2 - 1;
  const reach = travel + 80;
  const emerge = reach + 200;
  const out = reach + 560;
  const show = out + (shake ? 440 : 180);
  const place = show + 480;
  const wedge = place + 280;
  const tap = wedge + 160 + r() * 100;
  const pop = tap + (pull ? 230 : 160);
  const peak = pop + 100;
  const bounceEnd = peak + bounces * 230;
  const sink = bounceEnd + 380 + r() * 260;
  const settled = sink + 440;
  const sleighReach = settled + 80;
  const sleighOut = sleighReach + 520;
  const toss = sleighOut + 220;
  const landed = toss + 340;
  const unfold = landed + 80;
  const unfolded = unfold + 520;
  const board = unfolded + 320;
  const push = board + 40;
  const glide = push + kicks * 320;
  const seated = glide + 380;
  const gestureAt = seated + 60;
  const bubbleOut = gestureAt + 700;
  const exitEnd = glide + (flies ? 1650 : 1450) + r() * 200;
  return {
    kind: '🎅',
    side,
    pace,
    travel,
    bend,
    scurry,
    hitchAt,
    hitch,
    phase,
    wrap,
    shake,
    inset,
    lift,
    bounces,
    spring,
    pull,
    laughs,
    gesture,
    kicks,
    flies,
    exitRise,
    reach,
    emerge,
    out,
    show,
    place,
    wedge,
    tap,
    pop,
    peak,
    bounceEnd,
    sink,
    settled,
    sleighReach,
    sleighOut,
    toss,
    landed,
    unfold,
    unfolded,
    board,
    push,
    glide,
    seated,
    gestureAt,
    bubbleOut,
    exitEnd,
  };
}

/** Santa and the present stand on this floor: the closed present fits exactly under the card. */
export const santaScale = (b: TargetBounds) => SANTA_SCALE * cardFit(b);
export const santaFloor = (b: TargetBounds) => b.top + b.height + GIFT_CLOSED * santaScale(b);

/** Screen x of the lid contact on the card's bottom edge, at rest. */
export function santaContactX(p: SantaPlan, b: TargetBounds, side: Side): number {
  return side > 0 ? b.left + b.width * p.inset : b.left + b.width * (1 - p.inset);
}

/**
 * Stand point: Santa's feet sit exactly one present-reach behind the contact, so the present he
 * sets down and pushes forward ends up under the chosen corner.
 */
export function santaLandingPoint(
  p: SantaPlan,
  b: TargetBounds,
  view: Point,
  chosen?: number,
): Point {
  const side = chooseSide(p.side, b, view, chosen);
  const forward = GIFT_REACH * Math.cos(SANTA_BIAS) * santaScale(b);
  const gap = forward - b.width * p.inset;
  return sidePoint(side, b, view, gap, (santaFloor(b) - b.top) / b.height);
}

/** Speed shape of the approach: starts and ends at rest, steps surge, and the hitch only slows him. */
function approachSpeed(p: SantaPlan, t: number): number {
  const start = ease(t / 0.14),
    stop = ease((1 - t) / 0.14);
  const cadence = p.scurry ? 7 : 5;
  const rhythm = 1 + (p.scurry ? 0.18 : 0.13) * Math.sin(Math.PI * 2 * cadence * t + p.phase);
  const dip = 1 - 0.42 * p.hitch * Math.sin(Math.PI * clamp((t - p.hitchAt + 0.08) / 0.16)) ** 2;
  return Math.max(0.0001, start * stop) * rhythm * dip;
}
const STEPS = 120;
/** Fraction of the route's length covered after `ms`; integrates the speed shape exactly per plan. */
export function santaProgress(p: SantaPlan, ms: number): number {
  const t = clamp(ms / p.travel);
  let total = 0,
    covered = 0;
  for (let i = 0; i < STEPS; i++) {
    const a = i / STEPS,
      c = (i + 1) / STEPS;
    const v = (approachSpeed(p, a) + approachSpeed(p, c)) / 2 / STEPS;
    total += v;
    if (c <= t) covered += v;
    else if (a < t) covered += v * ((t - a) * STEPS);
  }
  return t >= 1 ? 1 : covered / total;
}
/** Hitch beat strength at a moment of the approach (0..1). */
export function santaHitch(p: SantaPlan, ms: number): number {
  const t = ms / p.travel;
  return Math.sin(Math.PI * clamp((t - p.hitchAt + 0.08) / 0.16)) * (t < 1 ? 1 : 0);
}

/** Lid rise in px: the spring pops, bobs under the card's weight, balances, then sinks home. */
export function santaLift(p: SantaPlan, ms: number, b: TargetBounds): number {
  if (ms < p.pop || ms >= p.settled) return 0;
  const lift = p.lift * cardFit(b),
    over = 0.35 * p.spring;
  if (ms < p.peak) return lift * (1 + over) * easeOut((ms - p.pop) / (p.peak - p.pop));
  const t = ms - p.peak,
    period = (p.bounceEnd - p.peak) / p.bounces;
  const bob =
    over * Math.cos((Math.PI * 2 * t) / period) * Math.exp(-t / ((p.bounceEnd - p.peak) * 0.45));
  const sway = 0.035 * Math.sin(t / 95 + p.phase) * clamp((ms - p.bounceEnd) / 200);
  const held = lift * (1 + bob + sway);
  return held * (1 - ease((ms - p.sink) / (p.settled - p.sink)));
}

/** Rotation (deg) and pivot translation that lift the contact point by `lift` about the far corner. */
export function santaCardPose(p: SantaPlan, ms: number, facing: number, b: TargetBounds): CardPose {
  const lift = santaLift(p, ms, b);
  if (lift <= 0) return NEUTRAL_CARD;
  const side: Side = facing < 0 ? -1 : 1;
  const pivot = { x: side > 0 ? b.left + b.width : b.left, y: b.top + b.height };
  const reachX = santaContactX(p, b, side) - pivot.x;
  const a = side * Math.asin(Math.min(0.6, lift / Math.abs(reachX)));
  const cx = b.left + b.width / 2,
    cy = b.top + b.height / 2;
  const dx = pivot.x - cx,
    dy = pivot.y - cy;
  return {
    x: dx - (dx * Math.cos(a) - dy * Math.sin(a)),
    y: dy - (dx * Math.sin(a) + dy * Math.cos(a)),
    angle: (a * 180) / Math.PI,
    sx: 1,
    sy: 1,
  };
}

export function santaFrames(p: SantaPlan, facing: number, b: TargetBounds) {
  return cardFrames(SANTA_DURATION, p.pace, (ms) => santaCardPose(p, ms, facing, b));
}

/** Off-screen exit away from the card; a flying sleigh also climbs. */
export function santaExitPoint(p: SantaPlan, b: TargetBounds, view: Point, side: Side): Point {
  const floor = santaFloor(b);
  const rise = p.flies ? 150 + 90 * p.exitRise : 0;
  return { x: side > 0 ? -170 : view.x + 170, y: Math.max(-60, floor - rise) };
}
