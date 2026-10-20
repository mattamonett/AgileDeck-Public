import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardFrames,
  chooseSide,
  clamp,
  ease,
  mix,
  pulse,
  sideOf,
  sidePoint,
  span,
  NEUTRAL_CARD,
  type CardPose,
  type Side,
} from '../../kit';

export const SCARECROW_DURATION = 12000;
export const SCARECROW_SCALE = 0.9;
export const SCARECROW_CROW_SCALE = 0.75;
/** The scarecrow's floor sits a little below the card's bottom edge. */
export const SCARECROW_FLOOR_V = 1.04;
/** Fraction of each hop spent vaulting over the planted pole. */
export const SCARECROW_CONTACT = 0.28;
/** The last approach hop lands at this fraction of the travel time; the pole then brakes the body. */
export const SCARECROW_LANDING = 0.9;
export const SCARECROW_EXIT_HOPS = 4;
/** Duration of the in-place hop that turns the scarecrow round before a chase. */
export const SCARECROW_TURN_HOP = 300;

export type ScarecrowPerch = 'arm' | 'card';

export interface ScarecrowPlan {
  readonly kind: '🌽';
  readonly side: Side;
  readonly pace: number;
  /** Canonical ms at which the pole-hopping approach lands beside the card. */
  readonly travel: number;
  readonly bend: number;
  readonly hops: number;
  /** Long/short alternation of the hops (0 even, 1 strongly uneven). */
  readonly rhythm: number;
  /** Nods off in mid-approach: a low, slow hop, then a startled big one. */
  readonly nod: boolean;
  readonly nodAt: number;
  readonly hopHeight: number;
  /** Doze depth: 0 chin on chest, 1 head thrown back and snoring with its mouth open. */
  readonly doze: number;
  readonly snore: number;
  readonly crowFrom: number;
  readonly crowU: number;
  readonly crowHops: number;
  readonly caws: number;
  readonly startleDelay: number;
  readonly frenzy: number;
  readonly knockLift: number;
  /** Where the crow lands when it comes back wearing the hat. */
  readonly perch: ScarecrowPerch;
  readonly perchU: number;
  /** Chases the crow out of view; otherwise gives up and nods back off. */
  readonly chase: boolean;
  readonly exitRise: number;
  readonly phase: number;
  readonly arrive: number;
  readonly dozeAt: number;
  readonly crowEnter: number;
  readonly crowLand: number;
  readonly hopsEnd: number;
  readonly cawAt: readonly number[];
  readonly startle: number;
  readonly flush: number;
  readonly knock: number;
  readonly grab: number;
  readonly away: number;
  readonly back: number;
  readonly perchAt: number;
  readonly notice: number;
  readonly lunge: number;
  readonly nodOff: number;
  readonly crowLeave: number;
  readonly exitStart: number;
  readonly exitEnd: number;
  readonly recover: number;
}

export function scarecrowPlan(id: string): ScarecrowPlan {
  const r = seededRandom(`${id}:scarecrow-v2`);
  const side: Side = r() < 0.5 ? -1 : 1;
  const pace = 0.94 + r() * 0.12;
  const travel = 1900 + r() * 400;
  const bend = r() * 2 - 1;
  const hops = 5 + Math.floor(r() * 3);
  const rhythm = r();
  const nod = r() < 0.5;
  const nodAt = 0.4 + r() * 0.2;
  const hopHeight = 0.8 + r() * 0.4;
  const doze = r();
  const snore = 1000 + r() * 400;
  const crowFrom = r() * 2 - 1;
  const crowU = 0.3 + r() * 0.4;
  const crowHops = Math.min(2, Math.floor(r() * 3));
  const caws = r() < 0.5 ? 1 : 2;
  const startleDelay = r() * 550;
  const frenzy = 0.85 + r() * 0.35;
  const knockLift = r();
  const knockLag = r() * 160;
  const grabDelay = r() * 450;
  const perch: ScarecrowPerch = r() < 0.5 ? 'arm' : 'card';
  const perchU = 0.32 + r() * 0.36;
  const chase = r() < 0.5;
  const lungeLag = r() * 150;
  const linger = r() * 200;
  const exitRise = r() * 2 - 1;
  const phase = r() * Math.PI * 2;
  const crowEnterLag = r() * 250;
  const arrive = travel;
  const dozeAt = arrive + 300;
  const crowEnter = travel - 200 + crowEnterLag;
  const crowLand = crowEnter + 850;
  const hopsEnd = crowLand + 280 + crowHops * 330;
  const cawAt = Array.from({ length: caws }, (_, i) => hopsEnd + 100 + i * 480);
  const startle = (cawAt[caws - 1] ?? hopsEnd) + 360 + startleDelay;
  const flush = startle + 110;
  const knock = startle + 320 + knockLag;
  const grab = knock + 420 + grabDelay;
  const away = grab + 800;
  const back = away + 250;
  const perchAt = back + 850;
  const notice = perchAt + 150;
  const lunge = perchAt + 420 + lungeLag;
  const nodOff = perchAt + 1000;
  const crowLeave = chase
    ? lunge + 110
    : perch === 'card'
      ? perchAt + 1300 + linger
      : SCARECROW_DURATION;
  const exitStart = chase ? lunge + 380 : SCARECROW_DURATION;
  const exitEnd = chase
    ? exitStart + SCARECROW_TURN_HOP + 1500
    : perch === 'card'
      ? crowLeave + 1000
      : nodOff + 900;
  const recover = Math.max(knock + 1100, perch === 'card' ? crowLeave + 700 : 0);
  return {
    kind: '🌽',
    side,
    pace,
    travel,
    bend,
    hops,
    rhythm,
    nod,
    nodAt,
    hopHeight,
    doze,
    snore,
    crowFrom,
    crowU,
    crowHops,
    caws,
    startleDelay,
    frenzy,
    knockLift,
    perch,
    perchU,
    chase,
    exitRise,
    phase,
    arrive,
    dozeAt,
    crowEnter,
    crowLand,
    hopsEnd,
    cawAt,
    startle,
    flush,
    knock,
    grab,
    away,
    back,
    perchAt,
    notice,
    lunge,
    nodOff,
    crowLeave,
    exitStart,
    exitEnd,
    recover,
  };
}

/** Approximate stand point used to choose and retain the side; the trick refines x from the real hand. */
export function scarecrowLandingPoint(
  p: ScarecrowPlan,
  b: TargetBounds,
  view: Point,
  chosen?: number,
): Point {
  return sidePoint(chooseSide(p.side, b, view, chosen), b, view, 24, SCARECROW_FLOOR_V);
}
export const scarecrowFloor = (b: TargetBounds) => b.top + b.height * SCARECROW_FLOOR_V;

/** Time warp of the approach: the nod beat slows the body down smoothly without ever stopping it. */
function nodWarp(p: ScarecrowPlan, t: number): number {
  const depth = p.nod ? 0.42 : 0,
    width = 0.14,
    a = p.nodAt - width / 2;
  const s = Math.max(0, Math.min(width, t - a));
  const slowed = s / 2 - (width / (4 * Math.PI)) * Math.sin((2 * Math.PI * s) / width);
  return (t - depth * slowed) / (1 - (depth * width) / 2);
}

/** Root progress along the approach route: continuous speed, braking only on the final planted pole. */
export function scarecrowProgress(p: ScarecrowPlan, t: number): number {
  const w = nodWarp(p, clamp(t));
  const brake = 1 - nodWarp(p, SCARECROW_LANDING);
  if (w <= 1 - brake) return w;
  // Hermite segment from slope 1 to rest: monotonic, so the root never backs up while braking.
  const s = (w - (1 - brake)) / brake;
  const h00 = 2 * s ** 3 - 3 * s ** 2 + 1,
    h10 = s ** 3 - 2 * s ** 2 + s,
    h01 = -2 * s ** 3 + 3 * s ** 2;
  return h00 * (1 - brake) + h10 * brake + h01;
}

export interface HopFrame {
  /** Root progress along the route. */
  readonly u: number;
  /** 0..1 arc of the current flight. */
  readonly lift: number;
  /** Planned relative height of the current hop. */
  readonly height: number;
  /** 1 while the pole tip is on the ground. */
  readonly planted: boolean;
  /** Vault progress over the planted pole (0..1), or flight progress while airborne. */
  readonly stage: number;
  /** Route progress of the previous planting (the first planting repeats itself). */
  readonly tipPrev: number;
  /** Route progress where the tip is planted, or where it took off. */
  readonly tipFrom: number;
  /** Route progress where the tip plants next. */
  readonly tipTo: number;
  /** Times (normalized) bounding the current contact or flight. */
  readonly from: number;
  readonly to: number;
  readonly hop: number;
}

interface HopSchedule {
  readonly starts: readonly number[];
  readonly end: number;
}
function schedule(count: number, rhythm: number, end: number): HopSchedule {
  const weights = Array.from({ length: count }, (_, k) => 1 + 0.35 * rhythm * (k % 2 ? -1 : 1));
  const total = weights.reduce((a, w) => a + w, 0);
  const starts: number[] = [];
  let at = 0;
  for (const w of weights) {
    starts.push(at);
    at += (w / total) * end;
  }
  return { starts, end };
}

/**
 * Generic pole hop: each hop vaults over the planted tip, then flies to the next planting. `progress`
 * maps normalized time to root progress; `final` keeps the tip planted at the route end after `end`.
 */
function hopFrame(
  t: number,
  count: number,
  rhythm: number,
  end: number,
  progress: (t: number) => number,
  heights: (k: number) => number,
  firstAtStart: boolean,
): HopFrame {
  const s = schedule(count, rhythm, end);
  const u = progress(t);
  const plantAt = (k: number) => {
    if (k >= count) return 1;
    if (k === 0 && firstAtStart) return progress(0);
    const a = s.starts[k] ?? s.end,
      b = s.starts[k + 1] ?? s.end;
    return progress(a + ((b - a) * SCARECROW_CONTACT) / 2);
  };
  if (t >= s.end) {
    const stage = s.end < 1 ? span(t, s.end, 1 - s.end) : 1;
    return {
      u,
      lift: 0,
      height: 0,
      planted: true,
      stage,
      tipPrev: plantAt(count - 1),
      tipFrom: plantAt(count),
      tipTo: plantAt(count),
      from: s.end,
      to: 1,
      hop: count,
    };
  }
  let k = 0;
  while (k + 1 < count && t >= (s.starts[k + 1] ?? s.end)) k++;
  const a = s.starts[k] ?? 0,
    b = s.starts[k + 1] ?? s.end;
  const contactEnd = a + (b - a) * SCARECROW_CONTACT;
  if (t < contactEnd) {
    return {
      u,
      lift: 0,
      height: heights(k),
      planted: true,
      stage: (t - a) / (contactEnd - a),
      tipPrev: plantAt(Math.max(0, k - 1)),
      tipFrom: plantAt(k),
      tipTo: plantAt(k + 1),
      from: a,
      to: contactEnd,
      hop: k,
    };
  }
  const f = (t - contactEnd) / (b - contactEnd);
  return {
    u,
    lift: Math.sin(Math.PI * f),
    height: heights(k),
    planted: false,
    stage: f,
    tipPrev: plantAt(Math.max(0, k - 1)),
    tipFrom: plantAt(k),
    tipTo: plantAt(k + 1),
    from: contactEnd,
    to: b,
    hop: k,
  };
}

/** Index of the approach hop whose flight is under way at the nod beat. */
export function scarecrowNodHop(p: ScarecrowPlan): number {
  const s = schedule(p.hops, p.rhythm, SCARECROW_LANDING);
  let k = 0;
  while (k + 1 < p.hops && p.nodAt >= (s.starts[k + 1] ?? 1)) k++;
  return k;
}

export function scarecrowApproach(p: ScarecrowPlan, t: number): HopFrame {
  const sleepy = scarecrowNodHop(p);
  return hopFrame(
    t,
    p.hops,
    p.rhythm,
    SCARECROW_LANDING,
    (x) => scarecrowProgress(p, x),
    (k) => {
      const alternate = 1 + 0.2 * p.rhythm * (k % 2 ? 1 : -1);
      const nodded = !p.nod ? 1 : k === sleepy ? 0.45 : k === sleepy + 1 ? 1.3 : 1;
      return p.hopHeight * alternate * nodded;
    },
    false,
  );
}

/** The chase: hops accelerating away after the crow, starting from the planted stand. */
export function scarecrowExitHops(p: ScarecrowPlan, ms: number): HopFrame {
  const start = p.exitStart + SCARECROW_TURN_HOP;
  const t = span(ms, start, p.exitEnd - start);
  return hopFrame(
    t,
    SCARECROW_EXIT_HOPS,
    p.rhythm * 0.5,
    1,
    (x) => x * x,
    (k) => 1 + 0.15 * (k % 2),
    true,
  );
}

export function scarecrowExitPoint(p: ScarecrowPlan, stand: Point, view: Point, side: Side): Point {
  return {
    x: side > 0 ? -110 : view.x + 110,
    y: Math.max(60, Math.min(view.y - 20, stand.y + p.exitRise * 40)),
  };
}

/** Where the crow stands along the card's top edge during its first visit. */
export function scarecrowCrowU(p: ScarecrowPlan, ms: number, facing: number): number {
  const side = sideOf(facing);
  let u = p.crowU;
  for (let k = 0; k < p.crowHops; k++) {
    const next = Math.max(0.15, Math.min(0.85, p.crowU - side * 0.1 * (k + 1)));
    u = mix(u, next, ease((ms - crowHopAt(p, k)) / 240));
  }
  return u;
}
export const crowHopAt = (p: ScarecrowPlan, k: number) => p.crowLand + 280 + k * 330;
/** The crow's taunting hop-turn on the card after it returns. */
export const crowTauntAt = (p: ScarecrowPlan) => p.perchAt + 380;
export function crowCaws(p: ScarecrowPlan): readonly number[] {
  return [...p.cawAt, p.perchAt + (p.perch === 'card' ? 800 : 600)];
}

/** A weight landing on the card: quick dip, small oscillation, settles. */
function dip(t: number): number {
  if (t <= 0) return 0;
  return (1 - Math.exp(-t / 25)) * Math.exp(-t / 170) * Math.cos(t / 55);
}
/** The flailing hand's knock: a shove that wobbles out. */
function knocked(t: number): number {
  if (t <= 0) return 0;
  return (1 - Math.exp(-t / 30)) * Math.exp(-t / 280) * Math.cos(t / 95);
}

/**
 * Card response: it dips under the crow's feet and sags while it is perched, kicks as the crow
 * launches, is shoved and wobbles when a flailing hand knocks its near edge, and repeats the perch
 * response if the hatted crow comes back to it.
 */
export function scarecrowCardPose(p: ScarecrowPlan, ms: number, facing: number): CardPose {
  if (ms < p.crowLand || ms >= p.recover) return NEUTRAL_CARD;
  const side = sideOf(facing);
  let x = 0,
    y = 0,
    angle = 0,
    sx = 1,
    sy = 1;
  const weigh = (land: number, leave: number, u: number, strength: number) => {
    const lever = (u - 0.5) * 2;
    const sag = ease((ms - land) / 120) * (1 - ease((ms - leave) / 90));
    const impact = dip(ms - land) * strength;
    const launch = pulse(ms, leave - 30, 110) - 0.8 * dip(ms - leave - 80);
    y += 2.4 * impact + 0.8 * sag + 1.6 * launch;
    angle += lever * (3 * impact + 1.1 * sag + 1.8 * launch) + Math.sign(lever) * 0.4 * impact;
    sy -= 0.012 * impact + 0.005 * sag;
  };
  const first = scarecrowCrowU(p, ms, side);
  weigh(p.crowLand, p.flush, first, 1);
  for (let k = 0; k < p.crowHops; k++) {
    const landed = crowHopAt(p, k) + 240;
    y += 0.7 * dip(ms - landed) - 0.4 * pulse(ms, crowHopAt(p, k) - 20, 90);
    angle += (first - 0.5) * 2 * 1.2 * dip(ms - landed);
  }
  for (const at of p.cawAt) angle += 0.35 * Math.sin((ms - at) / 30) * pulse(ms, at, 220);
  // A flailing hand knocks the near edge low down: the bottom swings away and the card slides off.
  const k = knocked(ms - p.knock);
  x += side * 5.5 * k;
  angle -= side * 6 * k;
  sx -= 0.035 * pulse(ms, p.knock, 120);
  if (p.perch === 'card') {
    weigh(p.perchAt, p.crowLeave, p.perchU, 1.2);
    const taunt = crowTauntAt(p);
    y += 0.8 * dip(ms - taunt - 220) - 0.5 * pulse(ms, taunt - 20, 90);
    const caw = p.perchAt + 800;
    angle += 0.4 * Math.sin((ms - caw) / 30) * pulse(ms, caw, 220);
  }
  const settle = 1 - span(ms, p.recover - 350, 350);
  return {
    x: x * settle,
    y: y * settle,
    angle: angle * settle,
    sx: 1 + (sx - 1) * settle,
    sy: 1 + (sy - 1) * settle,
  };
}

export function scarecrowFrames(p: ScarecrowPlan, facing: number) {
  return cardFrames(SCARECROW_DURATION, p.pace, (ms) => scarecrowCardPose(p, ms, facing));
}

/** Snore emissions: each window emits one puff per breath; returns the latest births per slot. */
export function scarecrowSnoreWindows(p: ScarecrowPlan): readonly (readonly [number, number])[] {
  const windows: (readonly [number, number])[] = [[p.dozeAt + 500, p.startle - 340]];
  if (!p.chase) windows.push([p.nodOff + 450, SCARECROW_DURATION - 600]);
  return windows;
}
