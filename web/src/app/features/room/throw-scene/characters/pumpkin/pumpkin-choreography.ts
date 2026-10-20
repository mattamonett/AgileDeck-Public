import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardFrames,
  chooseSide,
  ease,
  pulse,
  sidePoint,
  span,
  NEUTRAL_CARD,
  type CardPose,
  type Side,
} from '../../kit';

export const PUMPKIN_DURATION = 8400;
export const PUMPKIN_SCALE = 1.6;
export const PUMPKIN_RIBS = 10;

export interface PumpkinPlan {
  readonly kind: '🎃';
  readonly side: Side;
  readonly pace: number;
  readonly travel: number;
  readonly bend: number;
  readonly roll: boolean;
  readonly hops: number;
  readonly chews: number;
  readonly hunger: number;
  readonly burst: boolean;
  readonly exitRise: number;
  readonly phase: number;
  readonly settle: number;
  readonly open: number;
  readonly bite: number;
  readonly tear: number;
  readonly swallow: number;
  readonly ending: number;
  readonly pop: number;
  readonly exitEnd: number;
}

export function pumpkinPlan(id: string): PumpkinPlan {
  const r = seededRandom(`${id}:pumpkin-monster-v2`);
  const side: Side = r() < 0.5 ? -1 : 1;
  const pace = 0.94 + r() * 0.12;
  const travel = 1500 + r() * 400;
  const bend = r() * 2 - 1;
  const roll = r() < 0.5;
  const hops = 4 + Math.floor(r() * 3);
  const chews = r() < 0.5 ? 2 : 3;
  const hunger = 0.85 + r() * 0.35;
  const burst = r() < 0.5;
  const exitRise = r() * 2 - 1;
  const phase = r() * Math.PI * 2;
  const settle = travel + (roll ? 380 : 220);
  const open = settle + 160;
  const bite = open + 460 + r() * 80;
  const tear = bite + 140 + chews * 260;
  const swallow = tear + 380;
  const ending = swallow + 560;
  const pop = ending + (burst ? 650 : 320);
  const exitEnd = burst ? pop + 1500 : ending + 2200;
  return {
    kind: '🎃',
    side,
    pace,
    travel,
    bend,
    roll,
    hops,
    chews,
    hunger,
    burst,
    exitRise,
    phase,
    settle,
    open,
    bite,
    tear,
    swallow,
    ending,
    pop,
    exitEnd,
  };
}

export function pumpkinLandingPoint(
  p: PumpkinPlan,
  b: TargetBounds,
  view: Point,
  chosen?: number,
): Point {
  return sidePoint(chooseSide(p.side, b, view, chosen), b, view, 22, 1.05);
}
export const pumpkinFloor = (b: TargetBounds) => b.top + b.height * 1.05;

/** Heavy hops: each one crouches, launches, and lands with a squash. */
export function pumpkinHop(p: PumpkinPlan, ms: number) {
  if (p.roll || ms >= p.travel)
    return { height: 0, squash: pulse(ms, p.travel - 40, 200) * (p.roll ? 0 : 1) };
  const k = (ms / p.travel) * p.hops,
    within = k % 1;
  const air = within > 0.18 && within < 0.86 ? Math.sin(((within - 0.18) / 0.68) * Math.PI) : 0;
  const squash =
    within < 0.18
      ? Math.sin((within / 0.18) * Math.PI)
      : within > 0.86
        ? Math.sin(((within - 0.86) / 0.14) * Math.PI)
        : 0;
  return { height: air, squash };
}

export function pumpkinJaw(p: PumpkinPlan, ms: number): number {
  // Hungry snapping on the way, a huge gape, the slam on the card, chewing, and the tearing yank.
  let jaw = 0.2 * Math.abs(Math.sin(ms / 140)) * (1 - span(ms, p.travel - 200, 200));
  jaw = Math.max(jaw, ease((ms - p.open) / 380) * (1 - ease((ms - p.bite + 90) / 90)));
  for (let i = 0; i < p.chews; i++)
    jaw = Math.max(jaw, 0.35 * pulse(ms, p.bite + 140 + i * 260, 240));
  jaw = Math.max(jaw, 0.25 * pulse(ms, p.tear + 260, 200));
  return jaw;
}

/** Card pose: cringe from the gaping mouth, yanked into the bite, shaken by chewing, torn free. */
export function pumpkinCardPose(
  p: PumpkinPlan,
  ms: number,
  facing: number,
  b: TargetBounds,
  bite: Point,
): CardPose {
  if (ms < p.open || ms >= p.exitEnd) return NEUTRAL_CARD;
  const cringe = pulse(ms, p.open, p.bite - p.open) * (ms < p.bite ? 1 : 0);
  const y = 0;
  let x = facing * 2.5 * cringe,
    angle = facing * 2 * cringe,
    sx = 1,
    sy = 1;
  // While held in the jaws the card hangs from the bite point, which moves with the pumpkin's pull,
  // so the teeth stay on the edge.
  if (ms >= p.bite && ms < p.tear + 250) {
    const yank = ease((ms - p.bite) / 120) - ease((ms - p.tear) / 250);
    angle = -facing * (6 * yank + 2 * pumpkinChew(p, ms)) * p.hunger;
    const hold = holdAt(b, bite, angle);
    return { x: hold.x + pumpkinPull(p, ms, facing), y: hold.y, angle, sx, sy };
  }
  if (ms >= p.tear + 250) {
    const t = ms - p.tear - 250;
    const decay = Math.exp(-t / 200);
    angle += -facing * 4 * Math.cos(t / 60) * decay;
    sx += 0.04 * Math.sin(t / 50) * decay;
  }
  // The ending hits the card too: a blast, or the spat-out chunk.
  const blast = p.burst ? pulse(ms, p.pop, 320) : pulse(ms, p.ending + 380, 220);
  x += facing * 6 * blast;
  angle += facing * 7 * blast;
  sy -= 0.05 * blast;
  const settle = 1 - span(ms, p.exitEnd - 400, 400);
  return {
    x: x * settle,
    y: y * settle,
    angle: angle * settle,
    sx: 1 + (sx - 1) * settle,
    sy: 1 + (sy - 1) * settle,
  };
}
export function pumpkinChew(p: PumpkinPlan, ms: number): number {
  let chew = 0;
  for (let i = 0; i < p.chews; i++) chew += pulse(ms, p.bite + 140 + i * 260, 240);
  return chew;
}
/** Horizontal pull on the bitten edge: drawn in by the bite, then a hard yank as it tears. */
export function pumpkinPull(p: PumpkinPlan, ms: number, facing: number): number {
  if (ms < p.bite || ms >= p.tear + 250) return 0;
  const yank = ease((ms - p.bite) / 120) * (1 - ease((ms - p.tear) / 250));
  return -facing * (3 * yank + 5 * Math.sin(Math.PI * span(ms, p.tear, 250))) * p.hunger;
}
function holdAt(b: TargetBounds, bite: Point, angle: number): Point {
  const a = (angle * Math.PI) / 180,
    cx = b.left + b.width / 2,
    cy = b.top + b.height / 2;
  const dx = bite.x - cx,
    dy = bite.y - cy;
  return {
    x: dx - (dx * Math.cos(a) - dy * Math.sin(a)),
    y: dy - (dx * Math.sin(a) + dy * Math.cos(a)),
  };
}

export function pumpkinFrames(p: PumpkinPlan, facing: number, b: TargetBounds, bite: Point) {
  return cardFrames(PUMPKIN_DURATION, p.pace, (ms) => pumpkinCardPose(p, ms, facing, b, bite));
}

export function pumpkinExitPoint(p: PumpkinPlan, b: TargetBounds, view: Point, side: Side): Point {
  const stand = pumpkinLandingPoint(p, b, view, side);
  return {
    x: side > 0 ? -80 : view.x + 80,
    y: Math.max(60, Math.min(view.y - 20, stand.y + p.exitRise * 40)),
  };
}
