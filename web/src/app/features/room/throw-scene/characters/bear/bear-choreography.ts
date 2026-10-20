import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardFit,
  cardFrames,
  chooseSide,
  clamp,
  ease,
  keepInView,
  mix,
  sidePoint,
  sideRoute,
  span,
  NEUTRAL_CARD,
  type CardPose,
  type Side,
} from '../../kit';

export const BEAR_DURATION = 13900;
export const BEAR_SCALE = 1.3;
/** Model units between the planted hind feet and the card's near edge. */
export const BEAR_GAP = 3;
/** Pie radius in model units; the paws hold it at its rim on each side of the body. */
export const BEAR_PIE_RADIUS = 6.5;

export type BearFind = 'card' | 'edge';
export type BearEnding = 'sit' | 'curl' | 'waddle';

/** A planned slowdown on the approach: the bear keeps walking while it noses the floor. */
export interface BearSniff {
  readonly at: number;
  readonly width: number;
  readonly depth: number;
}
/** A sticky paw press. `depth` is measured into the card from the bear's near edge. */
export interface BearPrint {
  readonly depth: number;
  readonly v: number;
  readonly at: number;
  /** 0 is the paw nearest the viewer, 1 the far paw. */
  readonly paw: 0 | 1;
  readonly turn: number;
  readonly force: number;
}

export interface BearPlan {
  readonly kind: '🐻';
  readonly side: Side;
  readonly pace: number;
  readonly travel: number;
  readonly bend: number;
  readonly meander: number;
  readonly waves: number;
  readonly surge: number;
  readonly sniffs: readonly BearSniff[];
  readonly find: BearFind;
  /** Pie centre: on the card face (depth into the card, v) or on the floor under the bottom edge. */
  readonly pieDepth: number;
  readonly pieV: number;
  readonly prints: readonly BearPrint[];
  readonly pressure: number;
  readonly bites: number;
  readonly chews: number;
  readonly biteAngles: readonly number[];
  readonly ending: BearEnding;
  readonly nods: number;
  readonly exitRise: number;
  readonly phase: number;
  readonly arrive: number;
  readonly rear: number;
  /** Edge find: front paws leave the card, hook the pie and drag it out. Equal to `grab` on the card. */
  readonly drop: number;
  readonly hook: number;
  readonly dragged: number;
  readonly grab: number;
  readonly lift: number;
  /** The pie comes free of the card (card find) or the floor (edge find). */
  readonly snap: number;
  readonly seated: number;
  readonly biteTimes: readonly number[];
  readonly swallow: number;
  readonly yawn: number;
  readonly droop: number;
  readonly doze: number;
  /** Resting pose reached, or the start of the sleepy walk off. */
  readonly settle: number;
  readonly exitEnd: number;
  readonly cleanup: number;
  readonly recovered: number;
}

const PRINT_MOVE = 230;

export function bearPlan(id: string): BearPlan {
  const r = seededRandom(`${id}:bear-v2`);
  const side: Side = r() < 0.5 ? -1 : 1;
  const pace = 0.94 + r() * 0.12;
  const travel = 2250 + r() * 400;
  const bend = r() * 2 - 1;
  const meander = (r() < 0.5 ? -1 : 1) * (5 + r() * 9);
  const waves = 1 + Math.floor(r() * 3);
  const surge = 0.05 + r() * 0.07;
  const sniffCount = r() < 0.5 ? 2 : 3;
  const sniffs = Array.from({ length: sniffCount }, (_, i) => ({
    at: 0.22 + (0.56 * (i + 0.25 + r() * 0.5)) / sniffCount,
    width: 0.07 + r() * 0.03,
    depth: 0.32 + r() * 0.16,
  }));
  const find: BearFind = r() < 0.5 ? 'card' : 'edge';
  const pieDepth = find === 'card' ? 0.25 + r() * 0.04 : 0.36 + r() * 0.06;
  const pieV = find === 'card' ? 0.82 + r() * 0.04 : 1;
  const count = 2 + Math.floor(r() * 3);
  const lead: 0 | 1 = r() < 0.5 ? 0 : 1;
  const pressure = 0.85 + r() * 0.35;
  const rear = travel + 300 + r() * 80;
  const gap = 270 + r() * 50;
  // Prints climb the near edge: the far paw reaches a little deeper so both stay visible.
  const top = find === 'card' ? 0.58 + r() * 0.03 : 0.62 + r() * 0.04;
  const bottom = find === 'card' ? 0.69 + r() * 0.03 : 0.86 + r() * 0.04;
  const prints: BearPrint[] = Array.from({ length: count }, (_, k) => {
    const paw: 0 | 1 = (k + lead) % 2 ? 1 : 0;
    return {
      depth: (paw ? 0.18 : 0.07) + r() * 0.04,
      v: mix(bottom, top, count > 1 ? k / (count - 1) : 0) + (r() - 0.5) * 0.02,
      at: rear + 400 + k * gap,
      paw,
      turn: (paw ? -0.25 : 0.15) + (r() - 0.5) * 0.3,
      force: 0.85 + r() * 0.3,
    };
  });
  const last = prints.at(-1)?.at ?? rear + 400;
  let drop: number, hook: number, dragged: number, grab: number, lift: number, snap: number;
  if (find === 'card') {
    grab = last + 380;
    drop = hook = dragged = grab;
    lift = grab + 170;
    snap = lift + 240;
  } else {
    drop = last + 220;
    hook = drop + 440;
    dragged = hook + 380;
    grab = dragged + 240;
    lift = grab + 140;
    snap = lift;
  }
  const seated = snap + 520;
  const bites = 2 + Math.floor(r() * 3);
  const chews = r() < 0.5 ? 2 : 3;
  const biteGap = 330 + chews * 100 + r() * 50;
  const first = seated + 200;
  const biteTimes = Array.from({ length: bites }, (_, k) => first + k * biteGap);
  // Notches come from the top of the rim, alternating outward from where the first bite lands.
  const lean = (r() - 0.5) * 0.5;
  const biteAngles = Array.from(
    { length: bites },
    (_, k) => Math.PI / 2 + lean + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 0.62,
  );
  const swallow = (biteTimes.at(-1) ?? first) + 600;
  const nods = r() < 0.5 ? 1 : 2;
  const roll = r();
  const ending: BearEnding = roll < 1 / 3 ? 'sit' : roll < 2 / 3 ? 'curl' : 'waddle';
  const yawn = swallow + 220;
  const droop = yawn + 760;
  const doze = droop + nods * 360 + 140;
  const settle = doze + (ending === 'curl' ? 780 : ending === 'sit' ? 360 : 460);
  const exitEnd = ending === 'waddle' ? settle + 2100 + r() * 250 : settle;
  const cleanup = ending === 'waddle' ? exitEnd : settle + 1250;
  const recovered = (find === 'card' ? snap : dragged) + 950;
  return {
    kind: '🐻',
    side,
    pace,
    travel,
    bend,
    meander,
    waves,
    surge,
    sniffs,
    find,
    pieDepth,
    pieV,
    prints,
    pressure,
    bites,
    chews,
    biteAngles,
    ending,
    nods,
    exitRise: r() * 2 - 1,
    phase: r() * Math.PI * 2,
    arrive: travel,
    rear,
    drop,
    hook,
    dragged,
    grab,
    lift,
    snap,
    seated,
    biteTimes,
    swallow,
    yawn,
    droop,
    doze,
    settle,
    exitEnd,
    cleanup,
    recovered,
  };
}

export const bearFloor = (b: TargetBounds) => b.top + b.height * 1.05;
export const bearScale = (b: TargetBounds) => BEAR_SCALE * cardFit(b);
export const PRINT_TRAVEL = PRINT_MOVE;

/** Stand point: the hind feet, a few model units short of the near edge, on the floor. */
export function bearLandingPoint(
  p: BearPlan,
  b: TargetBounds,
  view: Point,
  chosen?: number,
): Point {
  const side = chooseSide(p.side, b, view, chosen);
  return sidePoint(side, b, view, BEAR_GAP * bearScale(b), 1.05);
}

/** Card-normalized u for a depth measured from the bear's near edge. */
export const bearU = (side: Side, depth: number) => (side > 0 ? depth : 1 - depth);

/**
 * Walking speed through the approach: eased out of the sender, a gentle waddle surge, slower
 * (never stopped) while it noses the floor, and a soft brake into the stand point.
 */
function bearSpeed(p: BearPlan, t: number): number {
  const start = mix(0.45, 1, ease(t / 0.12));
  const brake = 1 - 0.92 * ease((t - 0.86) / 0.14);
  let sniff = 1;
  for (const s of p.sniffs) {
    const d = Math.abs(t - s.at) / s.width;
    if (d < 1) sniff -= s.depth * 0.5 * (1 + Math.cos(Math.PI * d));
  }
  return start * brake * sniff * (1 + p.surge * Math.sin(t * Math.PI * 2 * 7 + p.phase));
}
const SPEED_STEPS = 96;
/** Fraction of the route distance covered at normalized approach time t. */
function bearProgress(p: BearPlan, t: number): number {
  const target = clamp(t);
  let total = 0,
    covered = 0;
  for (let i = 0; i < SPEED_STEPS; i++) {
    const a = i / SPEED_STEPS,
      b = (i + 1) / SPEED_STEPS;
    const area = ((bearSpeed(p, a) + bearSpeed(p, b)) / 2) * (b - a);
    total += area;
    if (b <= target) covered += area;
    else if (a < target) covered += ((bearSpeed(p, a) + bearSpeed(p, target)) / 2) * (target - a);
  }
  return total > 0 ? covered / total : target;
}
/** How strongly the bear is nosing the floor at normalized approach time t (0..1). */
export function bearSniffing(p: BearPlan, t: number): number {
  let s = 0;
  for (const sniff of p.sniffs) {
    const d = Math.abs(t - sniff.at) / (sniff.width * 1.15);
    if (d < 1) s = Math.max(s, 0.5 * (1 + Math.cos(Math.PI * d)));
  }
  return s;
}

const ROUTE_STEPS = 48;
/** Route length table, so the bear advances by distance rather than by bezier parameter. */
function routeTable(
  start: Point,
  end: Point,
  b: TargetBounds,
  view: Point,
  side: Side,
  bend: number,
): number[] {
  const lengths = [0];
  let previous = sideRoute(start, end, b, view, side, bend, 0);
  for (let i = 1; i <= ROUTE_STEPS; i++) {
    const at = sideRoute(start, end, b, view, side, bend, i / ROUTE_STEPS);
    lengths.push((lengths[i - 1] ?? 0) + Math.hypot(at.x - previous.x, at.y - previous.y));
    previous = at;
  }
  return lengths;
}
function routeAt(lengths: readonly number[], f: number): number {
  const total = lengths[ROUTE_STEPS] ?? 0,
    want = clamp(f) * total;
  let i = 0;
  while (i < ROUTE_STEPS - 1 && (lengths[i + 1] ?? 0) < want) i++;
  const a = lengths[i] ?? 0,
    c = lengths[i + 1] ?? a;
  return (i + (c > a ? (want - a) / (c - a) : 0)) / ROUTE_STEPS;
}

export interface BearRouteSample {
  readonly point: Point;
  /** Distance walked so far in screen pixels. */
  readonly walked: number;
  readonly heading: Point;
}
/** Where the bear is on its approach: arc-length paced, with a scent-following meander. */
export function bearRoute(
  p: BearPlan,
  ms: number,
  start: Point,
  stand: Point,
  b: TargetBounds,
  view: Point,
  side: Side,
): BearRouteSample {
  const lengths = routeTable(start, stand, b, view, side, p.bend);
  const total = lengths[ROUTE_STEPS] ?? 0;
  const at = (f: number): Point => {
    const u = routeAt(lengths, f);
    const c = sideRoute(start, stand, b, view, side, p.bend, u);
    const ahead = sideRoute(start, stand, b, view, side, p.bend, Math.min(1, u + 0.01));
    const back = sideRoute(start, stand, b, view, side, p.bend, Math.max(0, u - 0.01));
    const dx = ahead.x - back.x,
      dy = ahead.y - back.y,
      length = Math.hypot(dx, dy) || 1;
    const sway = p.meander * Math.sin(Math.PI * f * p.waves) * Math.sin(Math.PI * f);
    return keepInView(
      { x: c.x - (dy / length) * sway, y: c.y + (dx / length) * sway },
      view,
      16,
      40,
    );
  };
  const f = bearProgress(p, ms / p.travel);
  const point = at(f),
    next = at(Math.min(1, f + 0.004)),
    prev = at(Math.max(0, f - 0.004));
  return { point, walked: total * f, heading: { x: next.x - prev.x, y: next.y - prev.y } };
}

/** Sleepy walk off: away from the card, out of the viewport at full size. */
export function bearExitPoint(p: BearPlan, b: TargetBounds, view: Point, side: Side): Point {
  const stand = bearLandingPoint(p, b, view, side);
  return {
    x: side > 0 ? -120 : view.x + 120,
    y: Math.max(60, Math.min(view.y - 20, stand.y + p.exitRise * 40)),
  };
}
export function bearExitProgress(p: BearPlan, ms: number): number {
  const t = span(ms, p.settle, p.exitEnd - p.settle);
  // A slow, drowsy start that settles into a steady waddle.
  return t < 0.25 ? 2 * t * t : 0.125 + (t - 0.25) * (0.875 / 0.75);
}

/** Damped spring response to an impulse at `at`, zero before it. */
const knock = (ms: number, at: number, period: number, decay: number) =>
  ms < at ? 0 : Math.sin((ms - at) / period) * Math.exp(-(ms - at) / decay);

/**
 * Card response: it gives under the weight of the paws, dips at every sticky press, is dragged
 * toward the bear as the pie is peeled off it (or lifted as the pie slides out from under its
 * edge), then springs back to rest.
 */
export function bearCardPose(p: BearPlan, ms: number, facing: number): CardPose {
  const first = p.prints[0]?.at ?? p.grab;
  if (ms < first || ms >= p.recovered) return NEUTRAL_CARD;
  const side = facing < 0 ? -1 : 1;
  const off = p.find === 'card' ? p.snap : p.drop + 120;
  const leaning = ease((ms - first) / 160) * (1 - ease((ms - off) / 240));
  let x = 0,
    y = 1.1 * leaning * p.pressure,
    angle = -side * 0.7 * leaning * p.pressure,
    sx = 1,
    sy = 1;
  for (const print of p.prints) {
    const k = knock(ms, print.at, 48, 95) * p.pressure * print.force;
    y += 2.8 * k;
    angle -= side * 1.6 * k;
    sy -= 0.014 * k;
  }
  if (p.find === 'card') {
    y += 1.5 * knock(ms, p.grab, 50, 100) * p.pressure;
    // Sticky pie: the card is drawn toward the bear until the pie pops free, then wobbles back.
    const stretch = ms < p.snap ? ease((ms - p.lift) / (p.snap - p.lift)) : 0;
    const release =
      ms >= p.snap ? Math.cos((ms - p.snap) / 42) * Math.exp(-(ms - p.snap) / 130) : 0;
    const pull = (stretch + release) * p.pressure;
    x -= side * 3.4 * pull;
    angle += side * 2.4 * pull;
    sx += 0.012 * pull;
  } else {
    // The pie's rim rides under the bottom edge and lifts it, then the card drops back.
    const ride = Math.sin(Math.PI * span(ms, p.hook + 40, p.dragged - p.hook - 40));
    y -= 2.6 * ride * p.pressure;
    angle += side * 1.8 * ride * p.pressure;
    const drop = knock(ms, p.dragged, 45, 100) * p.pressure;
    y += 2 * drop;
    sy -= 0.02 * drop;
  }
  const settle = 1 - span(ms, p.recovered - 240, 240);
  return {
    x: x * settle,
    y: y * settle,
    angle: angle * settle,
    sx: 1 + (sx - 1) * settle,
    sy: 1 + (sy - 1) * settle,
  };
}

export function bearFrames(p: BearPlan, facing: number) {
  return cardFrames(BEAR_DURATION, p.pace, (ms) => bearCardPose(p, ms, facing));
}

/** How many bites have been taken by `ms`. */
export function bearBitesTaken(p: BearPlan, ms: number): number {
  return p.biteTimes.filter((t) => t <= ms).length;
}
