import type { Point } from '../../flight/flight-math';
import { clamp, ease, easeIn, easeOut, gait, mix, mixPoint, span, type Side } from '../../kit';
import {
  CLASH,
  FLURRY_LEAD,
  FOOT,
  HIT,
  KICK,
  SPIN,
  STICK_HIP,
  SWEEP,
  punchContact,
  punchHand,
  punchStart,
  type Exchange,
  type Fighter,
} from './bullettime-choreography';
import { GUARD, PIVOT, headOf, shoulderOf, type StickPose } from './bullettime-model';

/** A figure's placement for one frame: body origin on the floor in screen space, facing and spin. */
export interface Placement {
  readonly at: Point;
  /** Screen x direction of the body's forward axis; shrinks through zero while the figure spins. */
  readonly face: number;
  /** Rotation about the figure's middle, counter-clockwise on screen. */
  readonly rot: number;
  readonly pose: StickPose;
  readonly opacity: number;
  readonly visible: boolean;
}

export const add = (a: Point, x: number, y: number): Point => ({ x: a.x + x, y: a.y + y });
export function blendPose(a: StickPose, b: StickPose, t: number): StickPose {
  const k = clamp(t);
  if (k <= 0) return a;
  if (k >= 1) return b;
  return {
    hip: mixPoint(a.hip, b.hip, k),
    lean: mix(a.lean, b.lean, k),
    nod: mix(a.nod, b.nod, k),
    hands: [mixPoint(a.hands[0], b.hands[0], k), mixPoint(a.hands[1], b.hands[1], k)],
    feet: [mixPoint(a.feet[0], b.feet[0], k), mixPoint(a.feet[1], b.feet[1], k)],
    elbows: k < 0.5 ? a.elbows : b.elbows,
    knees: k < 0.5 ? a.knees : b.knees,
    tie: mix(a.tie, b.tie, k),
  };
}
/** Body point to screen, through the figure's facing, spin and scale. */
export function toScreen(
  f: Pick<Placement, 'at' | 'face' | 'rot'>,
  s: number,
  local: Point,
): Point {
  const x = local.x * f.face * s,
    y = (local.y - PIVOT) * s;
  const c = Math.cos(f.rot),
    n = Math.sin(f.rot);
  return { x: f.at.x + x * c - y * n, y: f.at.y - PIVOT * s - (x * n + y * c) };
}
/** Screen point to body space for an unrotated figure. */
export function toBody(f: Pick<Placement, 'at' | 'face'>, s: number, screen: Point): Point {
  return { x: (screen.x - f.at.x) / (f.face * s), y: (f.at.y - screen.y) / s };
}
/** Keeps a spinning figure's facing scale away from zero so it never collapses to nothing. */
export const keepFace = (face: number) =>
  Math.abs(face) < 0.06 ? 0.06 * (Math.sign(face) || 1) : face;

export const TUCK: StickPose = {
  ...GUARD,
  hip: { x: 0, y: 26 },
  lean: 0.55,
  hands: [
    { x: 9, y: 21 },
    { x: 10, y: 22.5 },
  ],
  feet: [
    { x: 6, y: 13.5 },
    { x: 7.5, y: 15 },
  ],
};
export const CROUCH: StickPose = {
  ...GUARD,
  hip: { x: 1, y: 19.5 },
  lean: 0.32,
  hands: [
    { x: 9, y: 30 },
    { x: 13, y: 33 },
  ],
  feet: [
    { x: -3.5, y: FOOT },
    { x: 5, y: FOOT },
  ],
};
/** Both forearms crossed in front of the chest. */
const CROSSED: StickPose = {
  ...GUARD,
  lean: -0.04,
  nod: 0.12,
  hands: [
    { x: 8.5, y: 40.5 },
    { x: 9.5, y: 42 },
  ],
  elbows: [-1, -1],
};
/** Low on one squatting leg, the other leg free to sweep and a hand down near the floor. */
const LOW: StickPose = {
  ...GUARD,
  hip: { x: -1.5, y: 9 },
  lean: 0.42,
  nod: -0.1,
  hands: [
    { x: 4, y: 4 },
    { x: 13, y: 22 },
  ],
  feet: [
    { x: -1.5, y: FOOT },
    { x: 4, y: FOOT },
  ],
  knees: [1, 1],
};
/** Ducked right down under a kick, hands guarding the head. */
const DUCK: StickPose = {
  ...GUARD,
  hip: { x: -1, y: 14.5 },
  lean: 0.62,
  nod: 0.35,
  hands: [
    { x: 9, y: 30 },
    { x: 12, y: 33 },
  ],
  feet: [
    { x: -5, y: FOOT },
    { x: 5.5, y: FOOT },
  ],
};
/** Flat on his back after a sweep, knees drawn up ready to kip up. */
const LYING: StickPose = {
  ...GUARD,
  hip: { x: 0, y: STICK_HIP },
  lean: 0,
  nod: -0.2,
  hands: [
    { x: -2, y: 36 },
    { x: 3, y: 34 },
  ],
  feet: [
    { x: 7, y: 14 },
    { x: 9, y: 16 },
  ],
};

/** One fighter's motion this frame: offset from his mark (forward and up, in model units), spin and pose. */
export interface Motion {
  readonly dx: number;
  readonly dy: number;
  readonly rot: number;
  /** Multiplies the facing: cos of a turn while spinning on the spot. */
  readonly spin: number;
  readonly pose: StickPose;
}
export interface MoveContext {
  readonly s: number;
  readonly mark: Point;
  /** Screen x direction this fighter faces. */
  readonly dir: Side;
  /** Model units between the two fighters' marks. */
  readonly gap: number;
  /** Guard with the idle bob. */
  readonly rest: StickPose;
  /** The opponent's live placement, for attacks aimed at him. Defenders never ask, so the two never recurse. */
  readonly opponent: (ms: number) => Placement;
  readonly opponentMark: Point;
}

const still = (pose: StickPose, dx = 0, dy = 0): Motion => ({ dx, dy, rot: 0, spin: 1, pose });
/** Where this fighter stands for a given offset, before any spin. */
function frame(c: MoveContext, dx: number, dy: number): Pick<Placement, 'at' | 'face'> {
  return { at: { x: c.mark.x + c.dir * dx * c.s, y: c.mark.y - dy * c.s }, face: c.dir };
}
/** A point on the opponent, in this fighter's body space at the given offset. */
function aimAt(
  c: MoveContext,
  dx: number,
  dy: number,
  ms: number,
  pick: (p: Placement) => Point,
): Point {
  const them = c.opponent(ms);
  return toBody(frame(c, dx, dy), c.s, toScreen(them, c.s, pick(them)));
}
const handOf = (i: 0 | 1) => (p: Placement) => p.pose.hands[i];
const footOf = (i: 0 | 1) => (p: Placement) => p.pose.feet[i];
/** Eases into a pose and back out over the edges of an exchange, so it starts and ends in guard. */
function framed(c: MoveContext, rel: number, len: number, pose: StickPose, edge = 90): StickPose {
  return blendPose(c.rest, pose, ease(rel / edge) * (1 - ease((rel - len + edge) / edge)));
}

export function exchangeMotion(e: Exchange, who: Fighter, ms: number, c: MoveContext): Motion {
  const rel = ms - e.at;
  const attack = e.by === who;
  switch (e.kind) {
    case 'clash':
      return clash(e, who, rel, ms, attack, c);
    case 'flurry':
      return attack ? flurry(e, rel, ms, c) : flurryBlocks(e, rel, c);
    case 'sweep':
      return attack ? sweep(e, rel, ms, c) : e.by === 'agent' ? hop(e, rel, c) : swept(e, rel, c);
    case 'spin':
      return attack ? spinKick(e, rel, ms, c) : duck(e, rel, c);
    case 'kick':
      return attack ? sideKick(e, rel, ms, c) : kickBlock(e, rel, c);
    case 'hit':
      return attack ? chinPunch(e, rel, ms, c) : takeHit(e, rel, c);
  }
}

// ---------- Clash ----------

/**
 * Both crouch, leap at each other and meet in mid-air with a flying kick against crossed arms. The agent
 * rebounds in a backflip whichever side of the blow he was on; the hero, with the card at his back, drops into a crouch.
 */
function clash(
  e: Exchange,
  who: Fighter,
  rel: number,
  ms: number,
  attack: boolean,
  c: MoveContext,
): Motion {
  const prep = ease(rel / CLASH.leap);
  const leap = span(rel, CLASH.leap, CLASH.contact - CLASH.leap);
  const back = span(rel, CLASH.contact, CLASH.land - CLASH.contact);
  const land = span(rel, CLASH.land, CLASH.len - CLASH.land);
  const meet = Math.max(0, (c.gap - 26) / 2);
  const height = (attack ? 22 : 20) + 6 * e.lift;
  const flip =
    who === 'agent' && rel >= CLASH.contact && back < 1 ? c.dir * Math.PI * 2 * ease(back) : 0;
  const dx =
    rel < CLASH.leap
      ? -2 * prep
      : rel < CLASH.contact
        ? mix(-2, meet, easeOut(leap))
        : mix(meet, 0, ease(back));
  const dy =
    rel < CLASH.leap
      ? 0
      : rel < CLASH.contact
        ? height * Math.sin((Math.PI / 2) * leap)
        : height * (1 - back * back);
  if (!attack) {
    const air: StickPose = {
      ...CROSSED,
      hip: { x: 0, y: 24 },
      feet: [
        { x: -4, y: 8 },
        { x: 5, y: 10 },
      ],
    };
    const recoil: StickPose = {
      ...air,
      lean: -0.35,
      nod: -0.25,
      hands: [
        { x: 6, y: 44 },
        { x: 4, y: 47 },
      ],
    };
    let pose = blendPose(blendPose(c.rest, CROUCH, prep), air, ease(leap / 0.5));
    if (rel >= CLASH.contact) {
      const tumble = flip ? blendPose(recoil, TUCK, ease((back - 0.15) / 0.25)) : recoil;
      pose = blendPose(blendPose(air, tumble, ease(back / 0.25)), CROUCH, ease((back - 0.7) / 0.3));
    }
    if (rel >= CLASH.land) pose = blendPose(CROUCH, c.rest, ease(land));
    return { dx, dy, rot: flip, spin: 1, pose };
  }
  // A flying side kick: knee chambered on the way up, then the foot driven into the crossed arms at the apex.
  const chamber: StickPose = {
    ...GUARD,
    hip: { x: 0, y: 24 },
    lean: -0.5,
    nod: 0.2,
    hands: [
      { x: -12, y: 38 },
      { x: 4, y: 44 },
    ],
    feet: [
      { x: -8, y: 12 },
      { x: 7, y: 17 },
    ],
  };
  const extend = ease((leap - 0.55) / 0.45);
  const kick = (at: number): StickPose => {
    const target = aimAt(c, dx, dy, at, handOf(1));
    return { ...chamber, feet: [chamber.feet[0], mixPoint(chamber.feet[1], target, extend)] };
  };
  if (rel < CLASH.contact)
    return still(blendPose(blendPose(c.rest, CROUCH, prep), kick(ms), ease(leap / 0.45)), dx, dy);
  const struck = kick(e.at + CLASH.contact - 1);
  let pose = blendPose(
    blendPose(struck, flip ? TUCK : CROUCH, ease(back / 0.3)),
    CROUCH,
    ease((back - 0.75) / 0.25),
  );
  if (rel >= CLASH.land) pose = blendPose(CROUCH, c.rest, ease(land));
  return { dx, dy, rot: flip, spin: 1, pose };
}

// ---------- Flurry ----------

/** How far a flurry's attacker steps in and the defender is driven back, and the final shove. */
function flurryShift(e: Exchange, rel: number, attack: boolean): number {
  const lastHit = punchContact(e, e.count - 1);
  const settle = 1 - ease((rel - lastHit - 120) / (e.len - lastHit - 140));
  if (attack) return 2.5 * ease(rel / FLURRY_LEAD) * settle;
  const shove = easeOut((rel - lastHit) / 140) * (3 + 3 * e.lift);
  return (-1.2 * ease(rel / FLURRY_LEAD) - shove) * settle;
}

function flurry(e: Exchange, rel: number, ms: number, c: MoveContext): Motion {
  const dx = flurryShift(e, rel, true);
  const f = frame(c, dx, 0);
  const stance: StickPose = {
    ...GUARD,
    hip: { x: 0, y: 24.2 },
    lean: 0.2,
    hands: [
      { x: 6.5, y: 41 },
      { x: 10, y: 43.5 },
    ],
    feet: [
      { x: -6, y: FOOT },
      { x: 7, y: FOOT },
    ],
  };
  const hands: [Point, Point] = [stance.hands[0], stance.hands[1]];
  let lean = stance.lean;
  for (let i = 0; i < e.count; i++) {
    const t = rel - punchStart(e, i);
    if (t < 0 || t > e.beat * 1.4) continue;
    const out = ease(t / (e.beat * 0.55)) * (1 - ease((t - e.beat * 0.75) / (e.beat * 0.6)));
    if (out <= 0) continue;
    const h = punchHand(i);
    const them = c.opponent(ms);
    const block = toBody(f, c.s, toScreen(them, c.s, them.pose.hands[h]));
    hands[h] = mixPoint(hands[h], block, out);
    lean += (i === e.count - 1 ? 0.18 : 0.07) * out;
  }
  return still(framed(c, rel, e.len, { ...stance, lean, hands }), dx);
}

function flurryBlocks(e: Exchange, rel: number, c: MoveContext): Motion {
  const stance: StickPose = {
    ...GUARD,
    hip: { x: -0.5, y: 24.8 },
    lean: 0.02,
    feet: [
      { x: -5.5, y: FOOT },
      { x: 5, y: FOOT },
    ],
  };
  const hands: [Point, Point] = [stance.hands[0], stance.hands[1]];
  let lean = stance.lean,
    nod = 0;
  for (let i = 0; i < e.count; i++) {
    const t = rel - punchStart(e, i);
    if (t < -e.beat || t > e.beat * 1.6) continue;
    const up = ease((t + 15) / (e.beat * 0.5)) * (1 - ease((t - e.beat * 0.85) / (e.beat * 0.6)));
    if (up <= 0) continue;
    const h = punchHand(i);
    // Alternating high and middle parries.
    const parry = i % 2 === 0 ? { x: 10, y: 46.5 } : { x: 9.5, y: 40.5 };
    hands[h] = mixPoint(hands[h], parry, up);
    lean -= 0.05 * up;
    nod -= 0.06 * up;
  }
  const lastHit = punchContact(e, e.count - 1);
  const rock = Math.sin(Math.PI * clamp((rel - lastHit) / 320));
  return still(
    framed(c, rel, e.len, { ...stance, lean: lean - 0.2 * rock, nod: nod - 0.2 * rock, hands }),
    flurryShift(e, rel, false),
  );
}

// ---------- Sweep ----------

function sweep(e: Exchange, rel: number, ms: number, c: MoveContext): Motion {
  const drop = ease(rel / SWEEP.drop);
  const turn = span(rel, SWEEP.drop, SWEEP.contact - SWEEP.drop);
  const rise = ease((rel - SWEEP.contact - 40) / (SWEEP.rise - SWEEP.contact - 40));
  const dx = (0.5 + 1.5 * e.lift) * drop * (1 - rise);
  // The leg is tucked as he turns away, reaches out behind him and comes round flat along the floor.
  const ext = ease((turn - 0.12) / 0.4) * (1 - rise);
  const reachX = Math.min(24.5, c.gap - dx - 3);
  let foot: Point = { x: mix(5, reachX, ext), y: FOOT + 0.6 };
  if (e.by === 'hero') {
    const target = aimAt(c, dx, 0, Math.min(ms, e.at + SWEEP.contact), footOf(1));
    foot = mixPoint(foot, target, ease((turn - 0.7) / 0.3) * (1 - rise));
  }
  const low: StickPose = { ...LOW, feet: [LOW.feet[0], foot] };
  const pose = blendPose(blendPose(c.rest, low, drop), c.rest, rise);
  return {
    dx,
    dy: 0,
    rot: 0,
    spin: Math.cos(Math.PI * 2 * ease(turn)),
    pose: framed(c, rel, e.len, pose, 60),
  };
}

/** The hero hops the agent's sweep, knees tucked, as the leg comes round under him. */
function hop(e: Exchange, rel: number, c: MoveContext): Motion {
  const jump = span(rel, 560, 330);
  const up = Math.sin(Math.PI * jump);
  const tucked: StickPose = {
    ...GUARD,
    hip: { x: 0, y: 25 },
    lean: 0.12,
    nod: 0.25,
    hands: [
      { x: -5, y: 47 },
      { x: 12, y: 42 },
    ],
    feet: [
      { x: -3, y: 11 },
      { x: 5, y: 12 },
    ],
  };
  const crouch = Math.sin(Math.PI * span(rel, 420, 180)) + Math.sin(Math.PI * span(rel, 850, 200));
  const pose = blendPose(
    blendPose(c.rest, CROUCH, 0.6 * crouch),
    tucked,
    ease(jump / 0.3) * (1 - ease((jump - 0.75) / 0.25)),
  );
  return still(framed(c, rel, e.len, pose), 0, (9 + 4 * e.lift) * up);
}

/** The agent's feet go from under him: he lands flat on his back, then kips straight back up. */
function swept(e: Exchange, rel: number, c: MoveContext): Motion {
  if (rel < SWEEP.contact)
    return still(
      framed(c, rel, e.len, {
        ...c.rest,
        lean: 0.12,
        hands: [
          { x: 8, y: 42 },
          { x: 12, y: 40 },
        ],
      }),
    );
  const fall = clamp((rel - SWEEP.contact) / (SWEEP.fall - SWEEP.contact));
  const kip = span(rel, SWEEP.kip, SWEEP.swept - SWEEP.kip - 160);
  const flat = (Math.PI / 2) * c.dir;
  const airborne: StickPose = {
    ...GUARD,
    lean: -0.3,
    nod: -0.4,
    hands: [
      { x: -6, y: 50 },
      { x: 8, y: 50 },
    ],
    feet: [
      { x: 12, y: 12 },
      { x: 14, y: 9 },
    ],
    tie: 0.8,
  };
  if (rel < SWEEP.kip) {
    const pose = blendPose(
      blendPose(c.rest, airborne, ease(fall / 0.4)),
      LYING,
      ease((fall - 0.6) / 0.4),
    );
    const lying = clamp((rel - SWEEP.fall) / (SWEEP.kip - SWEEP.fall));
    return {
      dx: -1.5 * fall,
      dy: -(PIVOT - 2.4) * easeIn(fall) - 0.6 * Math.sin(Math.PI * lying),
      rot: flat * ease(fall),
      spin: 1,
      pose,
    };
  }
  // The kip-up: legs whip over and he springs back onto his feet in a crouch.
  const pose = blendPose(
    blendPose(LYING, CROUCH, ease(kip / 0.7)),
    c.rest,
    ease((rel - SWEEP.swept + 200) / 200),
  );
  const dy = -(PIVOT - 2.4) * (1 - ease(kip)) + 5 * Math.sin(Math.PI * clamp(kip / 0.9));
  return { dx: -1.5 * (1 - ease(kip)), dy, rot: flat * (1 - ease(kip)), spin: 1, pose };
}

// ---------- Spinning kick ----------

function spinKick(e: Exchange, rel: number, ms: number, c: MoveContext): Motion {
  const jump = span(rel, SPIN.jump, SPIN.land - SPIN.jump);
  const dx =
    (3 + 2 * e.lift) *
    Math.sin((Math.PI / 2) * Math.min(1, jump * 1.4)) *
    (1 - ease((rel - SPIN.land) / 260));
  const dy = (10 + 5 * e.lift) * Math.sin(Math.PI * jump);
  // Aimed where the defender's head was before he ducked.
  const head = toScreen({ at: c.opponentMark, face: -c.dir, rot: 0 }, c.s, headOf(GUARD));
  const target = toBody(frame(c, dx, dy), c.s, head);
  const extend = ease((jump - 0.5) / 0.35) * (1 - ease((jump - 0.93) / 0.07));
  const air: StickPose = {
    ...GUARD,
    hip: { x: 0, y: 24.5 },
    lean: -0.38,
    nod: 0.1,
    hands: [
      { x: -10, y: 42 },
      { x: 4, y: 47 },
    ],
    feet: [{ x: -2.5, y: 10 }, mixPoint({ x: 6, y: 15 }, target, extend)],
  };
  let pose = blendPose(blendPose(c.rest, CROUCH, ease(rel / SPIN.jump)), air, ease(jump / 0.3));
  if (rel >= SPIN.land - 60)
    pose = blendPose(
      blendPose(air, CROUCH, ease((rel - SPIN.land + 60) / 120)),
      c.rest,
      ease((rel - SPIN.land - 60) / 200),
    );
  return { dx, dy, rot: 0, spin: Math.cos(Math.PI * 2 * ease(jump / 0.9)), pose };
}

function duck(e: Exchange, rel: number, c: MoveContext): Motion {
  const down = ease((rel - 200) / 170) * (1 - ease((rel - 700) / 180));
  return still(framed(c, rel, e.len, blendPose(c.rest, DUCK, down)), -1.5 * down);
}

// ---------- Side kick ----------

function sideKick(e: Exchange, rel: number, ms: number, c: MoveContext): Motion {
  const chamber = ease(rel / KICK.chamber);
  const extend =
    ease((rel - KICK.chamber) / (KICK.contact - KICK.chamber)) *
    (1 - ease((rel - KICK.retract) / 140));
  const down = ease((rel - KICK.retract - 100) / 200);
  const dx =
    (2.5 + 1.5 * e.lift) *
    Math.sin((Math.PI / 2) * chamber) *
    (1 - ease((rel - KICK.retract) / 300));
  const target = aimAt(c, dx, 0, ms, handOf(1));
  const kick: StickPose = {
    ...GUARD,
    hip: { x: -1, y: 25 },
    lean: -0.34,
    nod: 0.12,
    hands: [
      { x: -10, y: 41 },
      { x: 6, y: 42 },
    ],
    feet: [{ x: -3, y: FOOT }, mixPoint({ x: 6, y: 15 }, target, extend)],
  };
  return still(
    framed(c, rel, e.len, blendPose(blendPose(c.rest, kick, chamber), c.rest, down)),
    dx,
  );
}

function kickBlock(e: Exchange, rel: number, c: MoveContext): Motion {
  const guard = ease((rel - 110) / 150) * (1 - ease((rel - KICK.retract - 80) / 200));
  const slide =
    easeOut((rel - KICK.contact) / 200) *
    (1 - ease((rel - KICK.contact - 260) / (e.len - KICK.contact - 280)));
  const pose = blendPose(
    c.rest,
    {
      ...CROSSED,
      lean: -0.04 - 0.18 * slide,
      feet: [
        { x: -6, y: FOOT },
        { x: 4.5, y: FOOT },
      ],
    },
    guard,
  );
  return still(framed(c, rel, e.len, pose), -(4 + 3 * e.lift) * slide);
}

// ---------- A hit on the chin ----------

function chinPunch(e: Exchange, rel: number, ms: number, c: MoveContext): Motion {
  const dx = 3 * ease(rel / 160) * (1 - ease((rel - 420) / 300));
  const out = ease((rel - 100) / (HIT.contact - 100)) * (1 - ease((rel - HIT.contact - 90) / 200));
  const chin = aimAt(c, dx, 0, Math.min(ms, e.at + HIT.contact), (p) => headOf(p.pose));
  const punch: StickPose = {
    ...GUARD,
    hip: { x: 0.5, y: 24.5 },
    lean: 0.22 + 0.12 * out,
    hands: [{ x: 5, y: 39 }, mixPoint({ x: 9, y: 44 }, chin, out)],
    feet: [
      { x: -6, y: FOOT },
      { x: 6.5, y: FOOT },
    ],
  };
  return still(framed(c, rel, e.len, punch), dx);
}

/** The hero's head snaps back, he spins away with the blow, then wipes his mouth with the back of his hand. */
function takeHit(e: Exchange, rel: number, c: MoveContext): Motion {
  const snap = ease((rel - HIT.contact) / 80);
  const turn = span(rel, HIT.spin, HIT.spun - HIT.spin);
  const wipe = span(rel, HIT.spun + 100, HIT.wipe - HIT.spun - 100);
  const away =
    easeOut((rel - HIT.contact) / 380) * (1 - ease((rel - HIT.wipe) / (e.len - HIT.wipe - 40)));
  let pose = blendPose(
    c.rest,
    {
      ...c.rest,
      lean: -0.32,
      nod: -0.55,
      hands: [
        { x: -2, y: 46 },
        { x: 4, y: 48 },
      ],
    },
    snap,
  );
  pose = blendPose(
    pose,
    {
      ...c.rest,
      lean: 0.1,
      hands: [
        { x: 3, y: 38 },
        { x: 5, y: 41 },
      ],
    },
    ease(turn / 0.5),
  );
  if (rel > HIT.spun) {
    const mouth = headOf(c.rest);
    const hand = mixPoint(add(mouth, 6, -2.5), add(mouth, -3, -2.5), ease(wipe));
    const wiping: StickPose = {
      ...c.rest,
      lean: 0.04,
      nod: 0.18,
      hands: [c.rest.hands[0], hand],
      elbows: [-1, -1],
    };
    pose = blendPose(
      pose,
      blendPose(wiping, c.rest, ease((rel - HIT.wipe) / 200)),
      ease((rel - HIT.spun) / 120),
    );
  }
  return {
    dx: -(4 + 2 * e.lift) * away,
    dy: 0,
    rot: 0,
    spin: Math.cos(Math.PI * 2 * ease(turn)),
    pose: framed(c, rel, e.len, pose),
  };
}

/** A running stride with pumping arms; `swing` scales the arms for a stiff walk. */
export function runPose(
  walked: number,
  stride: number,
  lift: number,
  lean: number,
  swing: number,
): StickPose {
  const cycle = (walked / stride) * Math.PI * 2;
  const foot = (offset: number) => {
    const g = gait(walked, stride, offset, lift);
    return { x: g.x, y: FOOT + g.y };
  };
  const hip = { x: 0, y: STICK_HIP - 1.2 + 1.1 * Math.abs(Math.sin(cycle)) };
  const sh = shoulderOf({ ...GUARD, hip, lean });
  const arm = Math.sin(cycle) * swing;
  return {
    ...GUARD,
    hip,
    lean,
    hands: [
      add(sh, 7 * arm - 1, -9 + 2 * Math.abs(arm)),
      add(sh, -7 * arm + 1, -9 + 2 * Math.abs(arm)),
    ],
    feet: [foot(0), foot(0.5)],
    elbows: [-1, -1],
  };
}
export const SLIDE: StickPose = {
  ...GUARD,
  hip: { x: -3, y: 14 },
  lean: -0.3,
  nod: 0.18,
  hands: [
    { x: -13, y: 14 },
    { x: 8, y: 31 },
  ],
  feet: [
    { x: -7, y: FOOT },
    { x: 12, y: FOOT },
  ],
};
/** An agent standing to attention with his arms at his sides. */
export const ATTENTION: StickPose = {
  ...GUARD,
  lean: 0,
  hip: { x: 0, y: STICK_HIP },
  hands: [
    { x: -1.5, y: 27 },
    { x: 2, y: 27 },
  ],
  feet: [
    { x: -2.5, y: FOOT },
    { x: 2.5, y: FOOT },
  ],
  elbows: [1, -1],
};
export const AGENT_GUARD: StickPose = { ...GUARD, lean: 0.04 };
export const AFTER_KNOCK: StickPose = {
  ...GUARD,
  hip: { x: 0, y: 24 },
  lean: -0.5,
  nod: -0.4,
  hands: [
    { x: -9, y: 50 },
    { x: 12, y: 49 },
  ],
  feet: [
    { x: 9, y: 9 },
    { x: 4, y: 4 },
  ],
  elbows: [1, -1],
  tie: 0.9,
};
