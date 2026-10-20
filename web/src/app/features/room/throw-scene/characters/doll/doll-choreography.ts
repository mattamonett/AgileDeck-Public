import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardFrames,
  chooseSide,
  ease,
  mix,
  pulse,
  sidePoint,
  span,
  withSlow,
  NEUTRAL_CARD,
  type CardPose,
  type Side,
} from '../../kit';

export const DOLL_DURATION = 11200;
export const DOLL_SCALE = 1.05;
/** Child-sized bloody handprints, placed around the value and never over it. */
export const DOLL_PRINTS = [
  { u: 0.2, v: 0.2, a: -0.4 },
  { u: 0.8, v: 0.3, a: 0.35 },
  { u: 0.22, v: 0.8, a: 0.2 },
  { u: 0.79, v: 0.76, a: -0.25 },
] as const;

export interface DollPlan {
  readonly kind: '🪆';
  readonly side: Side;
  readonly pace: number;
  readonly travel: number;
  readonly bend: number;
  readonly crab: boolean;
  readonly freezes: readonly number[];
  readonly fullSpin: boolean;
  readonly lift: number;
  readonly fury: number;
  readonly prints: number;
  readonly order: readonly number[];
  readonly collapse: boolean;
  readonly exitRise: number;
  readonly phase: number;
  readonly arrive: number;
  readonly spin: number;
  readonly arms: number;
  readonly haunt: number;
  readonly drop: number;
  readonly stare: number;
  readonly exit: number;
  readonly exitEnd: number;
}

export function dollPlan(id: string): DollPlan {
  const r = seededRandom(`${id}:possessed-doll-v2`);
  const side: Side = r() < 0.5 ? -1 : 1;
  const pace = 0.94 + r() * 0.12;
  const travel = 2100 + r() * 350;
  const bend = r() * 2 - 1;
  const crab = r() < 0.5;
  const count = r() < 0.5 ? 2 : 3;
  const freezes = Array.from(
    { length: count },
    (_, i) => 0.2 + (0.6 * (i + 0.3 + r() * 0.4)) / count,
  );
  const fullSpin = r() < 0.5;
  const lift = 10 + r() * 8;
  const fury = 0.85 + r() * 0.35;
  const prints = r() < 0.5 ? 3 : 4;
  const order = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(r() * (i + 1)),
      a = order[i],
      b = order[j];
    if (a !== undefined && b !== undefined) {
      order[i] = b;
      order[j] = a;
    }
  }
  const collapse = r() < 0.5;
  const exitRise = r() * 2 - 1;
  const phase = r() * Math.PI * 2;
  const arrive = travel + (crab ? 380 : 0);
  const spin = arrive + 320;
  const arms = spin + 950;
  const haunt = arms + 260;
  const drop = haunt + 520 + prints * 340 + 380;
  const stare = drop + 420;
  const exit = stare + 1150;
  const exitEnd = exit + (collapse ? 2300 : 1700);
  return {
    kind: '🪆',
    side,
    pace,
    travel,
    bend,
    crab,
    freezes,
    fullSpin,
    lift,
    fury,
    prints,
    order,
    collapse,
    exitRise,
    phase,
    arrive,
    spin,
    arms,
    haunt,
    drop,
    stare,
    exit,
    exitEnd,
  };
}

export function dollLandingPoint(
  p: DollPlan,
  b: TargetBounds,
  view: Point,
  chosen?: number,
): Point {
  return sidePoint(chooseSide(p.side, b, view, chosen), b, view, 24, 1.05);
}
export const dollFloor = (b: TargetBounds) => b.top + b.height * 1.05;

/** Progress that drops to an uncanny creep at each freeze (the head snaps round), then lurches on. */
export function dollProgress(p: DollPlan, t: number): number {
  let u = Math.max(0, Math.min(1, t));
  for (const f of p.freezes) u = withSlow(u, f, 0.1, 0.5);
  return ease(u) * 0.3 + u * 0.7;
}
export function dollFrozen(p: DollPlan, t: number): number {
  let f = 0;
  for (const at of p.freezes) f = Math.max(f, pulse(t, at, 0.1));
  return f;
}

export function dollPrintAt(p: DollPlan, k: number): number {
  return p.haunt + 520 + k * 340;
}

/** Twitchy target angles that change in snaps, as if something else were moving the card. */
function contortion(p: DollPlan, ms: number): { angle: number; squeeze: number } {
  const step = Math.floor((ms - p.haunt) / 130);
  const r = seededRandom(`${p.phase}:${step}`);
  const r2 = seededRandom(`${p.phase}:${step - 1}`);
  const within = ease(((ms - p.haunt) % 130) / 45);
  const growth = span(ms, p.haunt + 200, p.drop - p.haunt - 200);
  const a = (r() * 2 - 1) * 9,
    b = (r2() * 2 - 1) * 9;
  return {
    angle: mix(b, a, within) * growth * p.fury,
    squeeze: (r() - 0.5) * 0.12 * growth * p.fury,
  };
}

export function dollCardPose(p: DollPlan, ms: number, facing: number): CardPose {
  if (ms < p.haunt || ms >= p.drop + 600) return NEUTRAL_CARD;
  let y = 0,
    x = 0,
    angle = 0,
    sx = 1,
    sy = 1;
  if (ms < p.drop) {
    const rise = ease((ms - p.haunt) / 500);
    const tremble = Math.sin(ms / 23 + p.phase) * (0.6 + 1.4 * span(ms, p.haunt, p.drop - p.haunt));
    y = -p.lift * rise - 4 * span(ms, p.drop - 500, 400) + tremble * 0.5;
    x = tremble * 0.4;
    const c = contortion(p, ms);
    angle = c.angle;
    sx = 1 - c.squeeze;
    sy = 1 + c.squeeze * 0.8;
    for (let k = 0; k < p.prints; k++) {
      const hit = pulse(ms, dollPrintAt(p, k), 140);
      y += 3 * hit;
      x += (DOLL_PRINTS[p.order[k] ?? 0]?.u ?? 0.5) > 0.5 ? -2.5 * hit : 2.5 * hit;
    }
    // The last moment before it lets go: a violent twist toward the doll.
    angle += -facing * 10 * pulse(ms, p.drop - 300, 260) * p.fury;
    return { x, y, angle, sx, sy };
  }
  // Dropped: falls back with a thud, squashes and settles.
  const t = ms - p.drop;
  const from = dollCardPose(p, p.drop - 1, facing);
  const fall = 1 - ease(t / 110);
  const thud = pulse(ms, p.drop + 100, 180);
  return {
    x: from.x * fall,
    y: from.y * fall + 1.5 * thud,
    angle: from.angle * fall + 1.5 * Math.sin(t / 50) * Math.exp(-t / 150) * (1 - fall),
    sx: 1 + (from.sx - 1) * fall + 0.06 * thud,
    sy: 1 + (from.sy - 1) * fall - 0.1 * thud,
  };
}

export function dollFrames(p: DollPlan, facing: number) {
  return cardFrames(DOLL_DURATION, p.pace, (ms) => dollCardPose(p, ms, facing));
}

/** Head rotation about its vertical axis: creaking, ticking increments. */
export function dollHeadSpin(p: DollPlan, ms: number): number {
  const t = span(ms, p.spin, 900);
  const ticks = 9;
  const stepped = (Math.floor(t * ticks) + ease(((t * ticks) % 1) / 0.35)) / ticks;
  if (p.fullSpin) return Math.PI * 2 * Math.min(1, stepped);
  // Half turn, hold the stare backwards, then snap forward.
  return Math.PI * Math.min(1, stepped * 1.6) * (1 - ease((ms - p.spin - 760) / 90));
}

export function dollExitPoint(p: DollPlan, b: TargetBounds, view: Point, side: Side): Point {
  const stand = dollLandingPoint(p, b, view, side);
  return {
    x: side > 0 ? -70 : view.x + 70,
    y: Math.max(60, Math.min(view.y - 20, stand.y + p.exitRise * 40)),
  };
}
