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

export const SQUIRREL_DURATION = 12000;
export const SQUIRREL_SCALE = 1.1;

/** Acorn geometry in model units at size 1: axis +y, tip down, cap up. A lying acorn rests on its cap rim. */
export const ACORN_TIP = 4.6;
export const ACORN_CAP_AT = 0.85;
export const ACORN_CAP_H = 1.95;
export const ACORN_TOP = ACORN_CAP_AT + ACORN_CAP_H;
export const ACORN_R = 3.1;
export const ACORN_NUT: readonly (readonly [number, number])[] = [
  [0, -4.6],
  [0.95, -4.05],
  [1.9, -3.05],
  [2.55, -1.75],
  [2.85, -0.35],
  [2.78, 0.55],
  [2.5, 1.0],
];
/** Stashed acorns are a little larger than life so each push reads at card size. */
export const SMALL_ACORN = 1.2;
/** Root-space paw reach (model units) at the end of a stash push, when picking up, and when shoving the giant. */
export const PUSH_X = 16;
export const PICK_X = 15;
export const PAW_SHOVE_X = 15;
/** Gap between the stash stand and the parked giant acorn, and the mouth reach used to plan the arrival. */
export const PARK_GAP = 40;
export const MOUTH_REACH = 30;
/** How far the springing giant acorn knocks the squirrel back onto its rump. */
export const KNOCK = 12;
export const FALL = 220;
/** Fractions of each stash beat: sit up, pull an acorn from the cheek, set it down, push it under. */
export const STASH_OUT = 0.14;
export const STASH_OUT_END = 0.46;
export const STASH_PLACE = 0.66;
export const STASH_PUSH_END = 0.92;
/** Collection beat after arriving at an acorn: pinch it up, then stuff it into a cheek. */
export const PICK = 95;
export const STUFF = 165;
export const SLIP_FLIGHT = 360;

export type SquirrelSpill = 'back' | 'over' | 'fan';
export type SquirrelOrder = 'near' | 'far' | 'zigzag';

export interface SquirrelPlan {
  readonly kind: '🐿️';
  readonly side: Side;
  readonly pace: number;
  /** Canonical ms at which the approach ends at the arrival point. */
  readonly travel: number;
  readonly bend: number;
  /** Speed surge on each bound, as a fraction of the cruising speed. */
  readonly bound: number;
  readonly boundPhase: number;
  /** Normalized approach positions of the acted look-arounds; the body keeps travelling through each. */
  readonly looks: readonly number[];
  readonly lookDepth: number;
  readonly lookLength: number;
  /** Glances at the viewer while scurrying round the parked acorn. */
  readonly glance: boolean;
  readonly count: number;
  readonly stashBeat: number;
  readonly giant: number;
  /** Fraction of the giant acorn's length forced under the card before the teetering. */
  readonly wedge: number;
  readonly strain: number;
  readonly teeters: number;
  readonly overshove: number;
  /** Knocked over with its legs in the air, or sits down hard. */
  readonly flop: boolean;
  readonly spill: SquirrelSpill;
  /** Rest offset of each stashed acorn, in card widths out from the near edge (negative: across the card). */
  readonly rests: readonly number[];
  readonly hops: readonly number[];
  readonly spins: readonly number[];
  readonly orderKind: SquirrelOrder;
  /** Stash indices in collection order. */
  readonly order: readonly number[];
  /** +1 dashes away past the card, -1 back the way it came. */
  readonly exit: Side;
  readonly exitRise: number;
  readonly phase: number;
  readonly release: number;
  readonly around: number;
  readonly aroundEnd: number;
  readonly stashStart: number;
  readonly back: number;
  readonly shove: number;
  readonly contact: number;
  readonly wedged: number;
  readonly slip: number;
  readonly slam: number;
  readonly recover: number;
  readonly dashes: readonly number[];
  readonly picks: readonly number[];
  readonly regrab: number;
  readonly bite: number;
  readonly departure: number;
  readonly exitEnd: number;
}

function lane(r: () => number, from: number, to: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 0.2 + r() * 0.6)) / n);
}

export function squirrelPlan(id: string): SquirrelPlan {
  const r = seededRandom(`${id}:squirrel-v2`);
  const side: Side = r() < 0.5 ? -1 : 1;
  const pace = 0.94 + r() * 0.12;
  const travel = 1250 + r() * 350;
  const bend = r() * 2 - 1;
  const bound = 0.16 + r() * 0.1;
  const boundPhase = r() * Math.PI * 2;
  const looks = r() < 0.5 ? [0.24 + r() * 0.1, 0.56 + r() * 0.12] : [0.32 + r() * 0.3];
  const lookDepth = 0.5 + r() * 0.12;
  const lookLength = 0.11 + r() * 0.04;
  const glance = r() < 0.5;
  const count = 3 + Math.min(2, Math.floor(r() * 3));
  const stashBeat = 420 + r() * 60;
  const giant = 2.6 + r() * 0.4;
  const wedge = 0.45 + r() * 0.45;
  const strain = r();
  const teeters = r() < 0.5 ? 1 : 2;
  const overshove = r();
  const flop = r() < 0.5;
  const spillRoll = r();
  const spill: SquirrelSpill = spillRoll < 1 / 3 ? 'back' : spillRoll < 2 / 3 ? 'over' : 'fan';
  const backCount = spill === 'back' ? count : spill === 'over' ? 0 : Math.ceil(count / 2);
  const values = [...lane(r, 0.3, 1.3, backCount), ...lane(r, -1.3, -0.15, count - backCount)];
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const a = values[i] ?? 0;
    values[i] = values[j] ?? 0;
    values[j] = a;
  }
  const rests = values;
  const hops = rests.map(() => 10 + r() * 14);
  const spins = rests.map(() => (r() < 0.5 ? -1 : 1) * (1 + Math.floor(r() * 2)));
  const orderRoll = r();
  const orderKind: SquirrelOrder =
    orderRoll < 1 / 3 ? 'near' : orderRoll < 2 / 3 ? 'far' : 'zigzag';
  const byDistance = rests
    .map((_, i) => i)
    .sort((a, b) => Math.abs((rests[a] ?? 0) - 0.5) - Math.abs((rests[b] ?? 0) - 0.5));
  const byValue = rests.map((_, i) => i).sort((a, b) => (rests[a] ?? 0) - (rests[b] ?? 0));
  const zigzag = byValue.map(
    (_, k) => (k % 2 ? byValue[byValue.length - 1 - (k >> 1)] : byValue[k >> 1]) ?? 0,
  );
  const order =
    orderKind === 'near' ? byDistance : orderKind === 'far' ? byDistance.slice().reverse() : zigzag;
  const exit: Side = r() < 0.5 ? -1 : 1;
  const exitRise = r() * 2 - 1;
  const phase = r() * Math.PI * 2;
  const release = travel + 240;
  const around = travel + 330;
  const aroundEnd = around + 360;
  const stashStart = aroundEnd + 40;
  const back = stashStart + count * stashBeat + 30;
  const shove = back + 680;
  const contact = shove + 280;
  const wedged = contact + 380 + 220 * strain;
  const slip = wedged + teeters * 240 + 200;
  const slam = slip + FALL;
  const recover = slip + 680;
  const dashes: number[] = [],
    picks: number[] = [];
  let t = recover,
    at = 0.5;
  for (const i of order) {
    const to = rests[i] ?? 0;
    dashes.push(t);
    t += 120 + 75 * Math.abs(to - at);
    picks.push(t);
    t += PICK + STUFF;
    at = to;
  }
  const regrab = t;
  const bite = regrab + 120 + 75 * Math.abs(at - 0.3) + 160;
  const departure = bite + 230;
  const exitEnd = departure + 1100 + r() * 300;
  return {
    kind: '🐿️',
    side,
    pace,
    travel,
    bend,
    bound,
    boundPhase,
    looks,
    lookDepth,
    lookLength,
    glance,
    count,
    stashBeat,
    giant,
    wedge,
    strain,
    teeters,
    overshove,
    flop,
    spill,
    rests,
    hops,
    spins,
    orderKind,
    order,
    exit,
    exitRise,
    phase,
    release,
    around,
    aroundEnd,
    stashStart,
    back,
    shove,
    contact,
    wedged,
    slip,
    slam,
    recover,
    dashes,
    picks,
    regrab,
    bite,
    departure,
    exitEnd,
  };
}

export const squirrelStash = (p: SquirrelPlan, k: number) => p.stashStart + k * p.stashBeat;
export const squirrelPlaced = (p: SquirrelPlan, k: number) =>
  squirrelStash(p, k) + STASH_PLACE * p.stashBeat;

/** Feet rest on the card's bottom line, which serves as the floor beside it. */
export const squirrelFloor = (b: TargetBounds) => b.top + b.height;
/** The card's near bottom corner; `a` coordinates run from it into the card. */
export const squirrelEdge = (b: TargetBounds, side: Side) => (side > 0 ? b.left : b.left + b.width);

/** Card-relative layout of the stash, the giant acorn and the stand points, in pixels along the floor. */
export interface StashGeometry {
  readonly s: number;
  readonly w: number;
  readonly ks: number;
  readonly kg: number;
  readonly d0: number;
  readonly slot: number;
  readonly maxShift: number;
  readonly x0: number;
  readonly wedge: number;
  readonly peak: number;
  readonly stand: number;
  readonly arrive: number;
}

export function squirrelGeometry(p: SquirrelPlan, b: TargetBounds): StashGeometry {
  const s = SQUIRREL_SCALE * cardFit(b),
    w = b.width;
  const ks = SMALL_ACORN * s,
    kg = p.giant * s;
  const d0 = ACORN_TOP * ks + 0.5;
  const slot = (ACORN_TIP + ACORN_TOP) * ks + 0.8;
  // The deepest stashed acorn stays far enough from the pivot that the card never tips past ~21 degrees.
  const limit = w - Math.max(5.2 * ACORN_R * ks, ACORN_TIP * ks + 2);
  const maxShift = Math.max(0, limit - (d0 + (p.count - 1) * slot));
  const x0 = -ACORN_TIP * kg - 0.3;
  const over = (2 + 3 * p.overshove) * s;
  const peakTip = Math.min(p.wedge * (ACORN_TIP + ACORN_TOP) * kg + over, 0.5 + maxShift);
  const wedgeTip = Math.max(1.5, peakTip - over);
  const stand = d0 - PUSH_X * s;
  return {
    s,
    w,
    ks,
    kg,
    d0,
    slot,
    maxShift,
    x0,
    wedge: wedgeTip - ACORN_TIP * kg,
    peak: Math.max(wedgeTip, peakTip) - ACORN_TIP * kg,
    stand,
    arrive: stand - (PARK_GAP + MOUTH_REACH) * s,
  };
}

/** Arrival point: behind the spot where the giant acorn is parked, on the seeded side of the card. */
export function squirrelLandingPoint(
  p: SquirrelPlan,
  b: TargetBounds,
  view: Point,
  chosen?: number,
): Point {
  const side = chooseSide(p.side, b, view, chosen, 120);
  return sidePoint(side, b, view, -squirrelGeometry(p, b).arrive, 1);
}

/** Radius of the lying acorn's cross-section at axial position y (model units, size 1). */
export function acornRadius(y: number): number {
  let r = 0;
  if (y >= ACORN_CAP_AT && y <= ACORN_TOP)
    r = ACORN_R * Math.sqrt(Math.max(0, 1 - ((y - ACORN_CAP_AT) / ACORN_CAP_H) ** 2));
  for (let i = 1; i < ACORN_NUT.length; i++) {
    const [r0, y0] = ACORN_NUT[i - 1] ?? [0, 0],
      [r1, y1] = ACORN_NUT[i] ?? [0, 0];
    if (y >= y0 && y <= y1) r = Math.max(r, mix(r0, r1, (y - y0) / Math.max(1e-6, y1 - y0)));
  }
  return r;
}

/** Card angle (degrees) needed to clear a lying acorn whose cap faces the squirrel, centred at `a`. */
export function acornLift(a: number, k: number, w: number): number {
  let best = 0;
  for (let i = 0; i <= 16; i++) {
    const y = mix(-ACORN_TIP, ACORN_TOP, i / 16);
    const at = a - y * k;
    if (at < 0 || at >= w) continue;
    const top = (ACORN_R + acornRadius(y)) * k;
    best = Math.max(best, Math.atan2(top, w - at));
  }
  return (best * 180) / Math.PI;
}

/** Total pushes made so far, continuous while an acorn is being pushed. */
export function squirrelPushes(p: SquirrelPlan, ms: number): number {
  let n = 0;
  for (let k = 0; k < p.count; k++)
    n += ease(span(ms, squirrelPlaced(p, k), (STASH_PUSH_END - STASH_PLACE) * p.stashBeat));
  return n;
}

/** Giant acorn centre while it is forced under the card: the strained shove, teetering, then the final heave. */
export function squirrelGiantA(p: SquirrelPlan, g: StashGeometry, ms: number): number {
  if (ms < p.wedged) {
    const u = span(ms, p.contact, p.wedged - p.contact);
    return mix(g.x0, g.wedge, 0.5 * ease(u) + 0.5 * u);
  }
  if (ms < p.slip - 200) {
    let back = 0;
    for (let k = 0; k < p.teeters; k++)
      back += (3 + k * 1.5) * g.s * pulse(ms, p.wedged + k * 240, 240);
    return g.wedge - back;
  }
  return mix(g.wedge, g.peak, ease(span(ms, p.slip - 200, 200)));
}

/** The giant's tip pushes the whole stash deeper; acorns never spring back out on their own. */
function rowShift(p: SquirrelPlan, g: StashGeometry, ms: number): number {
  if (ms < p.contact) return 0;
  const tip = (a: number) => a + ACORN_TIP * g.kg;
  const envelope =
    ms < p.wedged
      ? tip(squirrelGiantA(p, g, ms))
      : ms < p.slip
        ? Math.max(tip(g.wedge), tip(squirrelGiantA(p, g, ms)))
        : tip(g.peak);
  return Math.max(0, Math.min(g.maxShift, envelope - 0.5));
}

/** Centre of stashed acorn i under the card (valid once it has been set down). */
export function squirrelRowA(p: SquirrelPlan, g: StashGeometry, i: number, ms: number): number {
  const t = Math.min(ms, p.slip);
  return g.d0 + (squirrelPushes(p, t) - 1 - i) * g.slot + rowShift(p, g, t);
}

function support(p: SquirrelPlan, g: StashGeometry, ms: number, giant: boolean): number {
  let best = 0;
  for (let i = 0; i < p.count; i++)
    if (ms >= squirrelPlaced(p, i))
      best = Math.max(best, acornLift(squirrelRowA(p, g, i, ms), g.ks, g.w));
  if (giant && ms >= p.contact)
    best = Math.max(best, acornLift(ms < p.slip ? squirrelGiantA(p, g, ms) : g.peak, g.kg, g.w));
  return best;
}

/** Card angle when the giant acorn springs out and the card starts to fall. */
export const squirrelSlipAngle = (p: SquirrelPlan, g: StashGeometry) => support(p, g, p.slip, true);

/** The falling card squeezes each stashed acorn out as its edge comes down onto it. */
export function squirrelLaunch(p: SquirrelPlan, g: StashGeometry, i: number): number {
  const top = squirrelSlipAngle(p, g);
  if (top <= 0) return p.slip;
  const own = acornLift(squirrelRowA(p, g, i, p.slip), g.ks, g.w);
  return p.slip + FALL * Math.sqrt(clamp(1 - own / top));
}

/** Rotation about the card's far bottom corner, so the near edge lifts while the far corner stays on the floor. */
function pivot(deg: number, b: TargetBounds, side: Side): CardPose {
  const a = (side * deg * Math.PI) / 180,
    dx = (side * b.width) / 2,
    dy = b.height / 2;
  return {
    x: dx - (dx * Math.cos(a) - dy * Math.sin(a)),
    y: dy - (dx * Math.sin(a) + dy * Math.cos(a)),
    angle: side * deg,
    sx: 1,
    sy: 1,
  };
}

/** Lifted by the acorns' real positions under it, then dropped flat with a small rebound when the giant springs out. */
export function squirrelCardPose(
  p: SquirrelPlan,
  ms: number,
  facing: number,
  b: TargetBounds,
): CardPose {
  const side: Side = facing < 0 ? -1 : 1;
  if (ms >= p.slam + 450) return NEUTRAL_CARD;
  const g = squirrelGeometry(p, b);
  if (ms < p.slip) {
    const deg = support(p, g, ms, true);
    return deg > 0 ? pivot(deg, b, side) : NEUTRAL_CARD;
  }
  const top = squirrelSlipAngle(p, g);
  if (ms < p.slam) {
    const u = (ms - p.slip) / FALL;
    return pivot(top * (1 - u * u), b, side);
  }
  const v = ms - p.slam;
  return pivot(top * 0.1 * Math.abs(Math.sin((Math.PI * v) / 150)) * Math.exp(-v / 110), b, side);
}

export function squirrelFrames(p: SquirrelPlan, facing: number, b: TargetBounds) {
  return cardFrames(SQUIRREL_DURATION, p.pace, (ms) => squirrelCardPose(p, ms, facing, b));
}

const progressTables = new WeakMap<SquirrelPlan, Float64Array>();
/** Approach speed: springs off, bounds along, slows (never stops) for each look-around, then brakes at arrival. */
export function squirrelSpeed(p: SquirrelPlan, t: number): number {
  let v = (0.35 + 0.65 * ease(t / 0.12)) * (1 - 0.96 * ease((t - 0.86) / 0.14));
  for (const at of p.looks)
    v *= 1 - (1 - p.lookDepth) * Math.sin(Math.PI * span(t, at, p.lookLength)) ** 2;
  return v;
}
/** Normalized distance along the approach at normalized time t. */
export function squirrelProgress(p: SquirrelPlan, t: number): number {
  let table = progressTables.get(p);
  if (!table) {
    const steps = 400;
    table = new Float64Array(steps + 1);
    for (let i = 1; i <= steps; i++)
      table[i] =
        (table[i - 1] ?? 0) + (squirrelSpeed(p, (i - 1) / steps) + squirrelSpeed(p, i / steps)) / 2;
    const total = table[steps] ?? 1;
    for (let i = 0; i <= steps; i++) table[i] = (table[i] ?? 0) / total;
    progressTables.set(p, table);
  }
  const f = clamp(t) * (table.length - 1),
    i = Math.min(table.length - 2, Math.floor(f));
  return mix(table[i] ?? 0, table[i + 1] ?? 1, f - i);
}

/** Exit target off-screen; `face` is the exit direction along the floor away from (-1) or past (+1) the card. */
export function squirrelExitPoint(
  p: SquirrelPlan,
  b: TargetBounds,
  view: Point,
  side: Side,
): Point {
  const world = side * p.exit;
  return {
    x: world > 0 ? view.x + 90 : -90,
    y: Math.max(60, Math.min(view.y - 20, squirrelFloor(b) + p.exitRise * 40)),
  };
}
