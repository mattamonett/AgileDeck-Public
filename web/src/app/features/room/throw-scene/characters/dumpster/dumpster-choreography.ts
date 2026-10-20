import { clamp, easeIn, ease } from '../../kit';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';

export const DUMPSTER_DURATION = 9800,
  DUMPSTER_DEPTH = 205,
  DUMPSTER_TILT = 0.38;
/** Model units, sized so the body is a little wider than an 84px card. */
export const DUMPSTER_BODY = {
  width: 92,
  half: 22,
  back: -20,
  front: 20,
  foot: 12,
  rim: 2,
} as const;
export const DUMPSTER_LID = { thickness: 3, back: -21, front: 22, open: Math.PI * 1.22 } as const;
export const DUMPSTER_WHEEL = {
  radius: 4.2,
  y: -26.5,
  x: 36,
  front: 8,
  back: -16,
  thickness: 3,
} as const;
/** Half the width including the forklift sleeves. */
export const DUMPSTER_REACH = 52;
const top = DUMPSTER_BODY.half + DUMPSTER_BODY.rim + DUMPSTER_LID.thickness;
const wheelFront = DUMPSTER_WHEEL.front + DUMPSTER_WHEEL.thickness / 2;
const rim = Array.from(
  { length: 16 },
  (_, i) =>
    [
      Math.cos((i / 8) * Math.PI) * DUMPSTER_WHEEL.radius,
      Math.sin((i / 8) * Math.PI) * DUMPSTER_WHEEL.radius,
    ] as const,
);
/** Lowest point of the front tyres (their 16-sided rims) relative to the centre, per unit of model scale. */
export function dumpsterLowest(sx = 1, sy = 1, roll = 0) {
  let low = Infinity;
  for (const x of [-DUMPSTER_WHEEL.x, DUMPSTER_WHEEL.x])
    for (const [dx, dy] of rim) {
      const y =
        (DUMPSTER_WHEEL.y + dy) * Math.cos(DUMPSTER_TILT) - wheelFront * Math.sin(DUMPSTER_TILT);
      low = Math.min(low, (x + dx) * sx * Math.sin(roll) + y * sy * Math.cos(roll));
    }
  return low;
}
/** Highest and lowest points of the closed, tilted model relative to its centre. */
export const DUMPSTER_TOP =
  top * Math.cos(DUMPSTER_TILT) - DUMPSTER_LID.back * Math.sin(DUMPSTER_TILT);
export const DUMPSTER_LOWEST = dumpsterLowest();

export const dumpsterEase = ease;
const easeOut = (n: number) => 1 - (1 - clamp(n)) ** 2;
const bump = (age: number, length: number) =>
  age > 0 && age < length ? Math.sin((Math.PI * age) / length) : 0;

export type DumpsterTumble = 'flip' | 'spin' | 'wobble';
export type DumpsterPaletteName = 'red' | 'orange' | 'blue' | 'white' | 'purple';
export interface DumpsterPalette {
  readonly name: DumpsterPaletteName;
  readonly edge: number;
  readonly body: number;
  readonly mid: number;
  readonly core: number;
  readonly smoke: number;
}
export const DUMPSTER_PALETTES: Readonly<Record<DumpsterPaletteName, DumpsterPalette>> = {
  red: {
    name: 'red',
    edge: 0x5e0b06,
    body: 0xd8261b,
    mid: 0xff5a2a,
    core: 0xffc06a,
    smoke: 0x4a4444,
  },
  orange: {
    name: 'orange',
    edge: 0x6e2a04,
    body: 0xf06a12,
    mid: 0xffa630,
    core: 0xffe58a,
    smoke: 0x4d4844,
  },
  blue: {
    name: 'blue',
    edge: 0x0a2563,
    body: 0x2a6cf0,
    mid: 0x5fb4ff,
    core: 0xd8f4ff,
    smoke: 0x56627a,
  },
  white: {
    name: 'white',
    edge: 0x55627a,
    body: 0xc9d6ea,
    mid: 0xeef3ff,
    core: 0xffffff,
    smoke: 0x8f98a3,
  },
  purple: {
    name: 'purple',
    edge: 0x2a0a55,
    body: 0x8a2be2,
    mid: 0xc06bff,
    core: 0xf1d4ff,
    smoke: 0x5a4a72,
  },
};

export interface DumpsterPlan {
  readonly pace: number;
  readonly side: number;
  readonly exit: number;
  readonly phase: number;
  readonly travel: number;
  readonly loft: number;
  readonly tumble: DumpsterTumble;
  readonly skid: number;
  readonly bounce: number;
  readonly force: number;
  readonly settled: number;
  readonly puffs: readonly number[];
  readonly crack: number;
  readonly open: number;
  readonly backdraft: boolean;
  readonly lead: number;
  readonly stagger: number;
  readonly debris: number;
  readonly climbStart: number;
  readonly climb: number;
  readonly burnEnd: number;
  readonly fadeEnd: number;
  readonly flare: number | null;
  readonly wind: number;
  readonly shake: number;
  readonly sway: number;
  readonly lift: number;
  readonly palette: DumpsterPaletteName;
  readonly slam: number;
  readonly slamForce: number;
  readonly sputter: boolean;
  readonly roll: number;
  readonly exitEnd: number;
  readonly bump: boolean;
}
function pickPalette(n: number): DumpsterPaletteName {
  return n < 0.32 ? 'orange' : n < 0.58 ? 'red' : n < 0.74 ? 'blue' : n < 0.88 ? 'purple' : 'white';
}
export function dumpsterPlan(id: string): DumpsterPlan {
  const r = seededRandom(id + ':dumpster-fire');
  const pace = 0.93 + r() * 0.14,
    side = r() < 0.5 ? -1 : 1,
    exit = r() < 0.5 ? -1 : 1,
    phase = r() * Math.PI * 2;
  const travel = 1000 + r() * 300,
    loft = 60 + r() * 55,
    spin = r();
  const tumble: DumpsterTumble = spin < 0.4 ? 'flip' : spin < 0.7 ? 'spin' : 'wobble';
  const skidding = r() < 0.5,
    skid = 16 + r() * 14,
    bounce = 4 + r() * 5,
    force = 0.85 + r() * 0.3;
  const settled = travel + (skidding ? 520 : 600) + r() * 140;
  const count = 1 + Math.floor(r() * 3),
    rumble = 600 + r() * 300;
  const puffs = Array.from(
    { length: count },
    (_, i) => settled + rumble * (0.15 + (0.7 * (i + 0.3 + r() * 0.4)) / count),
  );
  const open = settled + rumble,
    backdraft = r() < 0.5,
    lead = r() < 0.5 ? -1 : 1,
    stagger = r() * 80;
  const climbStart = open + (backdraft ? 40 : 220),
    climb = backdraft ? 320 + r() * 160 : 650 + r() * 250;
  const burn = 1400 + r() * 500,
    burnEnd = climbStart + climb + burn,
    fadeEnd = burnEnd + 700 + r() * 200;
  const flaring = r() < 0.4,
    flareAt = climbStart + climb + burn * (0.3 + r() * 0.4);
  const slam = fadeEnd + 120 + r() * 140,
    sputter = r() < 0.35;
  const roll = slam + (sputter ? 900 : 480) + r() * 120,
    exitEnd = roll + 1300 + r() * 250;
  return {
    pace,
    side,
    exit,
    phase,
    travel,
    loft,
    tumble,
    skid: skidding ? skid : 0,
    bounce: skidding ? 0 : bounce,
    force,
    settled,
    puffs,
    crack: 0.12 + r() * 0.12,
    open,
    backdraft,
    lead,
    stagger,
    debris: backdraft ? 3 : 2,
    climbStart,
    climb,
    burnEnd,
    fadeEnd,
    flare: flaring ? flareAt : null,
    wind: (r() - 0.5) * 0.6,
    shake: 1.1 + r() * 1.1,
    sway: 1.1 + r() * 1.3,
    lift: 1.5 + r() * 1.8,
    palette: pickPalette(r()),
    slam,
    slamForce: 0.8 + r() * 0.4,
    sputter,
    roll,
    exitEnd,
    bump: r() < 0.4,
  };
}

export function dumpsterScale(b: TargetBounds) {
  return Math.max(0.6, Math.min(1.3, b.width / 84));
}
/** Centre of the resting dumpster: its closed lid just below the card, wheels on screen. */
export function dumpsterRest(b: TargetBounds, view: Point): Point {
  const s = dumpsterScale(b),
    half = DUMPSTER_REACH * s + 4;
  const x =
    view.x <= half * 2 ? view.x / 2 : Math.max(half, Math.min(view.x - half, b.left + b.width / 2));
  let y = b.top + b.height + 2 + DUMPSTER_TOP * s;
  const floor = y - DUMPSTER_LOWEST * s;
  if (floor > view.y - 3) y -= floor - (view.y - 3);
  return { x, y };
}
/** The floor line the wheels rest on. */
export function dumpsterFloor(b: TargetBounds, view: Point) {
  return dumpsterRest(b, view).y - DUMPSTER_LOWEST * dumpsterScale(b);
}
/** Where the arc comes down; a skid then carries it to rest. */
export function dumpsterTouchdown(p: DumpsterPlan, b: TargetBounds, view: Point): Point {
  const rest = dumpsterRest(b, view),
    s = dumpsterScale(b),
    half = DUMPSTER_REACH * s + 4;
  const x = Math.max(
    Math.min(half, rest.x),
    Math.min(Math.max(view.x - half, rest.x), rest.x - p.side * p.skid * s),
  );
  return { x, y: rest.y };
}
export const dumpsterLandingPoint = dumpsterRest;

export interface DumpsterPose {
  readonly x: number;
  readonly y: number;
  readonly roll: number;
  readonly spin: number;
  readonly s: number;
  readonly sx: number;
  readonly sy: number;
  readonly lids: readonly [number, number];
  readonly wheel: number;
  readonly visible: boolean;
}
function arc(p: DumpsterPlan, ms: number, start: Point, b: TargetBounds, view: Point) {
  const t = clamp(ms / p.travel),
    end = dumpsterTouchdown(p, b, view),
    s = dumpsterScale(b);
  const room = Math.max(0, Math.min(end.x - 30, view.x - 30 - end.x));
  const c1 = start.x + (end.x - start.x) * 0.35,
    c2 = end.x - p.side * Math.min(room, 70),
    v = 1 - t;
  const x = v ** 3 * start.x + 3 * v * v * t * c1 + 3 * v * t * t * c2 + t ** 3 * end.x;
  // A heavy lob: it hangs near the crest and drops onto its wheels.
  const ceiling = 40 * s + 12,
    loft = Math.max(0, Math.min(p.loft, Math.min(start.y, end.y) - ceiling));
  const y = start.y + (end.y - start.y) * t - 4 * loft * t * v;
  return { x, y: Math.max(Math.min(ceiling, start.y, end.y), y), t };
}
function lidAngle(p: DumpsterPlan, ms: number, half: number): number {
  const landing =
    0.18 * bump(ms - p.travel, 180) + (p.bounce ? 0.07 * bump(ms - p.travel - 410, 150) : 0);
  if (ms < p.travel) {
    const t = ms / p.travel,
      settle = 1 - dumpsterEase((t - 0.8) / 0.2);
    const rate = p.tumble === 'flip' ? 60 : 45;
    return (
      (p.tumble === 'flip' ? 0.1 : 0.14) * Math.abs(Math.sin(ms / rate + p.phase + half)) * settle
    );
  }
  const crack = p.crack * dumpsterEase((ms - p.settled) / ((p.open - p.settled) * 0.6));
  const burps = p.puffs.reduce((sum, at) => sum + 0.14 * bump(ms - at + 60, 240), 0);
  const start = p.open + (half === p.lead ? 0 : p.stagger),
    length = p.backdraft ? 150 : 460;
  const opening = p.backdraft
    ? easeOut((ms - start) / length)
    : dumpsterEase((ms - start) / length);
  const settle =
    ms > start + length
      ? (p.backdraft ? 0.16 : 0.09) *
        Math.sin(((ms - start - length) / 70) * Math.PI) *
        Math.exp(-(ms - start - length) / 120)
      : 0;
  const raised = crack + burps;
  const angle = raised + (DUMPSTER_LID.open - raised) * opening + settle;
  if (ms < p.slam) return angle + landing;
  const held =
    DUMPSTER_LID.open +
    (p.backdraft ? 0.16 : 0.09) *
      Math.sin(((p.slam - start - length) / 70) * Math.PI) *
      Math.exp(-(p.slam - start - length) / 120);
  const hit = p.slam + 200,
    closing = held * (1 - easeIn((ms - p.slam) / 200));
  const rebound =
    0.07 *
    p.slamForce *
    Math.abs(Math.sin((Math.PI * (ms - hit)) / 110)) *
    Math.exp(-(ms - hit) / 90) *
    (ms > hit ? 1 : 0);
  const pop = p.sputter ? sputterLid(ms - p.slam - 330) : 0;
  const jiggle = p.bump ? 0.1 * bump(dumpsterExitProgress(p, ms) - 0.45, 0.1) : 0;
  return closing + rebound + pop + jiggle;
}
function sputterLid(age: number) {
  if (age <= 0 || age >= 300) return 0;
  const u = age / 300;
  return 0.42 * (u < 0.4 ? easeOut(u / 0.4) : 1 - easeIn((u - 0.4) / 0.6));
}
export function dumpsterExitProgress(p: DumpsterPlan, ms: number) {
  return clamp((ms - p.roll) / (p.exitEnd - p.roll));
}
export function dumpsterSlamHit(p: DumpsterPlan) {
  return p.slam + 200;
}
export function dumpsterSputterHit(p: DumpsterPlan) {
  return p.slam + 630;
}
export function dumpsterPose(
  p: DumpsterPlan,
  ms: number,
  start: Point,
  b: TargetBounds,
  view: Point,
): DumpsterPose {
  const s = dumpsterScale(b),
    rest = dumpsterRest(b, view),
    lids: [number, number] = [lidAngle(p, ms, -1), lidAngle(p, ms, 1)];
  const r = DUMPSTER_WHEEL.radius * s;
  if (ms < p.travel) {
    const q = arc(p, ms, start, b, view),
      grow = 0.55 + 0.45 * dumpsterEase(q.t / 0.3);
    const roll =
      p.tumble === 'flip'
        ? -p.side * Math.PI * 2 * q.t
        : p.tumble === 'wobble'
          ? p.side * 0.3 * Math.sin(Math.PI * 2 * q.t) * (1 - q.t)
          : 0;
    return {
      x: q.x,
      y: q.y,
      roll,
      spin: p.tumble === 'spin' ? p.side * Math.PI * 2 * q.t : 0,
      s: s * grow,
      sx: 1,
      sy: 1,
      lids,
      wheel: 0,
      visible: true,
    };
  }
  const age = ms - p.travel,
    touchdown = dumpsterTouchdown(p, b, view),
    skid = rest.x - touchdown.x;
  const slide = p.skid ? easeOut(age / 400) : 1;
  const squash = p.force * 0.14 * bump(age, 200) + (p.bounce ? 0.06 * bump(age - 410, 140) : 0);
  const hop = p.bounce
    ? p.bounce * s * 4 * clamp((age - 170) / 240) * (1 - clamp((age - 170) / 240))
    : 0;
  const rumble =
    dumpsterEase((ms - p.settled) / 200) *
    (1 - dumpsterEase((ms - p.burnEnd) / 400)) *
    (1 - 0.45 * dumpsterEase((ms - p.open) / 200));
  const exit = dumpsterExitProgress(p, ms),
    dist =
      p.exit > 0 ? view.x - rest.x + DUMPSTER_REACH * s + 12 : rest.x + DUMPSTER_REACH * s + 12;
  const travelled = dist * exit ** 1.9;
  const sy = 1 - squash,
    floor = rest.y - DUMPSTER_LOWEST * s;
  const x =
    touchdown.x +
    skid * slide +
    p.exit * travelled +
    Math.sin(ms / 29 + p.phase) * 0.9 * s * rumble;
  const bumpHop = p.bump ? 3 * s * bump(exit - 0.45, 0.1) : 0;
  const lean =
    -Math.sign(skid) * 0.07 * bump(age, 400) +
    p.exit * 0.045 * (1 - exit) * dumpsterEase(exit / 0.15) +
    Math.sin(ms / 41 + p.phase) * 0.018 * rumble;
  return {
    x,
    y: floor + dumpsterLowest(1 + squash * 0.6, sy, lean) * s - hop - bumpHop,
    roll: lean,
    spin: 0,
    s,
    sx: 1 + squash * 0.6,
    sy,
    lids,
    wheel: -(skid * slide + p.exit * travelled) / r,
    visible: ms < p.exitEnd + 40,
  };
}

/** Fire strength in the dumpster's mouth, including the backdraft fireball overshoot. */
export function dumpsterMouthFire(p: DumpsterPlan, ms: number) {
  const age = ms - p.open,
    fade = p.fadeEnd - p.burnEnd;
  const rise = p.backdraft
    ? easeOut(age / 90) * (1 + (age > 90 ? 0.7 * Math.exp(-(age - 90) / 160) : 0))
    : dumpsterEase((age - 120) / 450);
  const lick = p.sputter ? 0.35 * bump(ms - p.slam - 360, 240) : 0;
  return Math.max(lick, rise * (1 - dumpsterEase((ms - p.burnEnd - fade * 0.35) / (fade * 0.65))));
}
/** How far up the card the fire has climbed (0 bottom, above 1 licking over the top). */
export function dumpsterFront(p: DumpsterPlan, ms: number) {
  const climb = 1.15 * dumpsterEase((ms - p.climbStart) / p.climb);
  return climb * (1 - dumpsterEase((ms - p.burnEnd) / ((p.fadeEnd - p.burnEnd) * 0.85)));
}
export function dumpsterCardFire(p: DumpsterPlan, ms: number) {
  const on =
    dumpsterEase((ms - p.climbStart) / (p.climb * 0.6)) *
    (1 - dumpsterEase((ms - p.burnEnd) / (p.fadeEnd - p.burnEnd)));
  return on * (1 + (p.flare === null ? 0 : 0.35 * bump(ms - p.flare, 450)));
}
export function dumpsterCardPose(p: DumpsterPlan, ms: number) {
  const fire = dumpsterCardFire(p, ms),
    jolt = bump(ms - p.travel, 380) * Math.exp(-(ms - p.travel) / 220) * p.force;
  const kick = (p.backdraft ? 1 : 0.35) * bump(ms - p.open - 40, 300);
  const slam =
    p.slamForce * bump(ms - dumpsterSlamHit(p), 260) +
    (p.sputter ? 0.5 * bump(ms - dumpsterSputterHit(p), 220) : 0);
  const flare = p.flare === null ? 0 : bump(ms - p.flare, 300);
  const x =
    fire * p.shake * (0.6 * Math.sin(ms / 37 + p.phase) + 0.4 * Math.sin(ms / 23 + p.phase * 2));
  const y =
    -3.2 * jolt -
    4 * kick -
    2.4 * slam -
    2 * flare -
    fire * p.lift +
    fire * 0.5 * Math.sin(ms / 29 + p.phase);
  const angle =
    p.side * 1.6 * jolt -
    p.side * 2 * kick +
    fire * p.sway * Math.sin(ms / 47 + p.phase * 3) +
    p.side * 1.2 * flare;
  return { x, y, angle };
}
export function dumpsterCardPoint(p: DumpsterPlan, ms: number, raw: Point, b: TargetBounds): Point {
  const q = dumpsterCardPose(p, ms),
    a = (q.angle * Math.PI) / 180;
  const x = raw.x - b.left - b.width / 2,
    y = raw.y - b.top - b.height / 2;
  return {
    x: b.left + b.width / 2 + x * Math.cos(a) - y * Math.sin(a) + q.x,
    y: b.top + b.height / 2 + x * Math.sin(a) + y * Math.cos(a) + q.y,
  };
}
export function dumpsterFrames(p: DumpsterPlan) {
  const frames: Keyframe[] = [];
  for (let ms = 0; ms <= DUMPSTER_DURATION; ms += 20) {
    const q = dumpsterCardPose(p, ms),
      zero = Math.abs(q.x) < 1e-6 && Math.abs(q.y) < 1e-6;
    frames.push({
      offset: ms / DUMPSTER_DURATION,
      translate: zero ? '0px 0px' : `${q.x}px ${q.y}px`,
      rotate: `${Math.abs(q.angle) < 1e-6 ? 0 : q.angle}deg`,
    });
  }
  return { frames, options: { duration: DUMPSTER_DURATION * p.pace, easing: 'linear' } };
}
