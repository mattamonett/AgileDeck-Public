import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
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

/** The card is always this many model units tall, so the fight's geometry is the same on every card size. */
export const CARD_UNITS = 76;
/** Stick-man proportions in model units: hip height when standing, torso, neck, head radius and limbs. */
export const STICK_HIP = 26;
export const TORSO = 19;
export const NECK = 1.6;
export const HEAD_R = 4.8;
export const UPPER_ARM = 10;
export const FOREARM = 9.5;
export const THIGH = 13.6;
export const SHIN = 13.4;
/** Ankle height above the sole: the round foot cap's radius. */
export const FOOT = 1.3;
/** The hero stands just in front of the card's near edge; the agent squares off this far outside it. */
export const HERO_IN = -2;
export const AGENT_GAP = 30;
/** The agent leans into the big punch and stretches the arm almost straight. */
export const PUNCH_LEAN = 0.45;
export const PUNCH_REACH = 0.86 * (UPPER_ARM + FOREARM);

export const BULLET_WHOA = 'Whoa.';
export const BULLET_NO_CARD = 'There is no card.';

/** The hero arrives with a flip (over the card when thrown from its far side) or a knee slide. */
export type HeroEntry = 'flip' | 'slide';
/** The agent strides in from the screen edge, or materialises out of falling code. */
export type AgentEntry = 'stride' | 'glitch';
/** A spinning kick, or a short palm strike, sends the agent flying. */
export type Finisher = 'kick' | 'palm';
/** The hero flies straight up out of view, or strolls off. */
export type HeroExit = 'fly' | 'stroll';
/** Which thought bubbles show: both, or just one of them. */
export type Bubbles = 'both' | 'whoa' | 'card';

export type Fighter = 'hero' | 'agent';
/**
 * One exchange of the subway-style fight before the bullet-time punch:
 * - clash: both leap at each other; a flying kick meets crossed arms in mid-air and both rebound, the kicker in a backflip.
 * - flurry: a blur of alternating punches, every one parried, the last one shoving the defender back.
 * - sweep: a low spinning leg sweep. The hero hops over the agent's; the hero's takes the agent off his feet and he kips up.
 * - spin: a jumping spinning kick at head height that the defender ducks under.
 * - kick: a chambered side kick blocked on crossed forearms, sliding the defender back.
 * - hit: the agent lands one on the hero's chin; he spins away and wipes his mouth.
 */
export type MoveKind = 'clash' | 'flurry' | 'sweep' | 'spin' | 'kick' | 'hit';
export interface Exchange {
  readonly kind: MoveKind;
  /** Who attacks. */
  readonly by: Fighter;
  readonly at: number;
  readonly len: number;
  /** Punches in a flurry and the ms between them. */
  readonly count: number;
  readonly beat: number;
  /** 0..1 how big the jumps, steps and recoils are. */
  readonly lift: number;
}
/** A blow landing: the attacker's hand or foot meets the defender's hand, foot or head. */
export interface Contact {
  readonly at: number;
  readonly by: Fighter;
  readonly limb: 'hand' | 'foot';
  readonly index: 0 | 1;
  readonly target: 'hand' | 'foot' | 'head';
  readonly targetIndex: 0 | 1;
}

/** Fixed beat timings within each exchange, in canonical ms from its start. */
export const CLASH = { leap: 260, contact: 560, land: 980, len: 1200 } as const;
export const FLURRY_LEAD = 160;
export const FLURRY_TAIL = 380;
export const SWEEP = {
  drop: 200,
  contact: 760,
  rise: 1000,
  fall: 980,
  kip: 1160,
  len: 1080,
  swept: 1600,
} as const;
export const SPIN = { jump: 180, land: 640, len: 920 } as const;
export const KICK = { chamber: 220, contact: 340, retract: 440, len: 840 } as const;
export const HIT = { contact: 230, spin: 330, spun: 700, wipe: 1150, len: 1420 } as const;

/** Start of punch `i` in a flurry and the moment its fist meets the block. */
export const punchStart = (e: Exchange, i: number) => FLURRY_LEAD + i * e.beat;
export const punchContact = (e: Exchange, i: number) => punchStart(e, i) + 0.62 * e.beat;
/** Which hand throws (and which blocks) punch `i`: front hand first, then alternating. */
export const punchHand = (i: number): 0 | 1 => (i % 2 === 0 ? 1 : 0);

export function exchangeContacts(e: Exchange): Contact[] {
  const hit = (
    at: number,
    limb: Contact['limb'],
    index: 0 | 1,
    target: Contact['target'],
    targetIndex: 0 | 1,
  ): Contact => ({
    at: e.at + at,
    by: e.by,
    limb,
    index,
    target,
    targetIndex,
  });
  switch (e.kind) {
    case 'clash':
      return [hit(CLASH.contact, 'foot', 1, 'hand', 1)];
    case 'flurry':
      return Array.from({ length: e.count }, (_, i) =>
        hit(punchContact(e, i), 'hand', punchHand(i), 'hand', punchHand(i)),
      );
    case 'sweep':
      return e.by === 'hero' ? [hit(SWEEP.contact, 'foot', 1, 'foot', 1)] : [];
    case 'kick':
      return [hit(KICK.contact, 'foot', 1, 'hand', 1)];
    case 'hit':
      return [hit(HIT.contact, 'hand', 1, 'head', 0)];
    case 'spin':
      return [];
  }
}

function exchangeLength(kind: MoveKind, by: Fighter, count: number, beat: number): number {
  switch (kind) {
    case 'clash':
      return CLASH.len;
    case 'flurry':
      return FLURRY_LEAD + count * beat + FLURRY_TAIL;
    case 'sweep':
      return by === 'hero' ? SWEEP.swept : SWEEP.len;
    case 'spin':
      return SPIN.len;
    case 'kick':
      return KICK.len;
    case 'hit':
      return HIT.len;
  }
}

/** The clash first, then a flurry, a sweep and a kick in a seeded order, sometimes with a hit on the hero or a second flurry. */
function fightCard(r: () => number, start: number): Exchange[] {
  const who = (): Fighter => (r() < 0.5 ? 'hero' : 'agent');
  const flurryBy = who();
  const moves: [MoveKind, Fighter][] = [
    ['flurry', flurryBy],
    ['sweep', who()],
    [r() < 0.5 ? 'spin' : 'kick', who()],
  ];
  const extra = r();
  if (extra < 0.25) moves.push(['hit', 'agent']);
  else if (extra < 0.45) moves.push(['flurry', flurryBy === 'hero' ? 'agent' : 'hero']);
  for (let i = moves.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [moves[i], moves[j]] = [moves[j] as [MoveKind, Fighter], moves[i] as [MoveKind, Fighter]];
  }
  moves.unshift(['clash', who()]);
  let at = start;
  return moves.map(([kind, by]) => {
    const count = kind === 'flurry' ? 3 + Math.floor(r() * 4) : 0;
    const beat = kind === 'flurry' ? 125 + r() * 25 : 0;
    const len = exchangeLength(kind, by, count, beat);
    const e: Exchange = { kind, by, at, len, count, beat, lift: r() };
    at += len + 90 + r() * 100;
    return e;
  });
}

export interface BulletTimePlan {
  readonly kind: '🥋';
  readonly side: Side;
  readonly pace: number;
  readonly bend: number;
  // ---------- Approach ----------
  readonly entry: HeroEntry;
  /** Canonical ms at which the hero lands at his stand point. */
  readonly travel: number;
  /** Fraction of the approach spent running before the flip or the slide. */
  readonly run: number;
  /** Flip apex above the floor (or above the card top when he flips over it), in model units. */
  readonly loft: number;
  readonly turns: number;
  readonly agentEntry: AgentEntry;
  readonly agentStart: number;
  readonly agentIn: number;
  // ---------- Action ----------
  readonly beckonAt: number;
  readonly beckons: number;
  readonly beckonEnd: number;
  /** The fight's exchanges in order, then the agent winds up the big punch. */
  readonly exchanges: readonly Exchange[];
  readonly windup: number;
  readonly swing: number;
  /** The moment the slow punch lands on the card. */
  readonly hit: number;
  /** How far back the hero bends, in radians from upright. */
  readonly arch: number;
  /** Windmilling arm speed during the slow motion, in turns per second of canonical time. */
  readonly windmill: number;
  /** Contact on the card: across from its near edge, and height above its bottom edge in model units. */
  readonly contactU: number;
  readonly contactH: number;
  // ---------- Card response ----------
  readonly tilt: number;
  readonly hold: number;
  readonly code: number;
  // ---------- Departure ----------
  readonly finisher: Finisher;
  readonly upright: number;
  readonly fin: number;
  readonly strike: number;
  /** The agent's flight: distance and height in model units, tumble turns and how long until he has dissolved. */
  readonly knock: number;
  readonly lift: number;
  readonly tumble: number;
  readonly flight: number;
  readonly dustAt: number;
  readonly claps: number;
  readonly dustEnd: number;
  readonly exit: HeroExit;
  readonly exitAt: number;
  readonly exitLen: number;
  readonly exitEnd: number;
  readonly bubbles: Bubbles;
  readonly end: number;
}

export function bulletTimePlan(id: string): BulletTimePlan {
  const r = seededRandom(`${id}:bullettime`);
  const side: Side = r() < 0.5 ? -1 : 1;
  const pace = 0.94 + r() * 0.12;
  const bend = r() * 2 - 1;
  const entry: HeroEntry = r() < 0.5 ? 'flip' : 'slide';
  const travel = entry === 'flip' ? 1800 + r() * 350 : 1950 + r() * 350;
  const run = entry === 'flip' ? 0.56 + r() * 0.08 : 0.7 + r() * 0.08;
  const loft = 18 + r() * 14;
  const turns = r() < 0.7 ? 1 : 2;
  const agentEntry: AgentEntry = r() < 0.5 ? 'stride' : 'glitch';
  const agentIn = travel + 450 + r() * 250;
  const agentStart = agentEntry === 'stride' ? agentIn - 1500 - r() * 300 : agentIn - 900;

  const beckonAt = agentIn + 200 + r() * 150;
  const beckons = r() < 0.5 ? 1 : 2;
  const beckonEnd = beckonAt + 200 + beckons * 330;
  const exchanges = fightCard(r, beckonEnd + 160);
  const last = exchanges.at(-1);
  const windup = (last ? last.at + last.len : beckonEnd) + 200 + r() * 100;
  const swing = windup + 340 + r() * 120;
  const hit = swing + 1250 + r() * 400;
  const arch = 0.85 + r() * 0.2;
  const windmill = 0.55 + r() * 0.4;
  const contactU = 0.15 + r() * 0.1;
  const contactH = 40 + r() * 3;

  const tilt = 5 + r() * 4;
  const hold = 260 + r() * 160;
  const code = 750 + r() * 350;

  const finisher: Finisher = r() < 0.5 ? 'kick' : 'palm';
  const upright = hit + 480 + r() * 80;
  const fin = upright + 140 + r() * 160;
  const strike = fin + (finisher === 'kick' ? 440 : 300);
  const knock = 46 + r() * 30;
  const lift = 14 + r() * 22;
  const tumble = 0.6 + r() * 0.7;
  const flight = 950 + r() * 300;
  const dustAt = strike + 420 + r() * 120;
  const claps = r() < 0.5 ? 2 : 3;
  const dustEnd = dustAt + claps * 190 + 120;
  const exit: HeroExit = r() < 0.55 ? 'fly' : 'stroll';
  const exitAt = dustEnd + 120 + r() * 160;
  const exitLen = exit === 'fly' ? 950 + r() * 250 : 1600 + r() * 300;
  const exitEnd = exitAt + exitLen;
  const pick = r();
  const bubbles: Bubbles = pick < 0.5 ? 'both' : pick < 0.75 ? 'whoa' : 'card';
  const end = Math.max(exitEnd, strike + flight) + 200;
  return {
    kind: '🥋',
    side,
    pace,
    bend,
    entry,
    travel,
    run,
    loft,
    turns,
    agentEntry,
    agentStart,
    agentIn,
    beckonAt,
    beckons,
    beckonEnd,
    exchanges,
    windup,
    swing,
    hit,
    arch,
    windmill,
    contactU,
    contactH,
    tilt,
    hold,
    code,
    finisher,
    upright,
    fin,
    strike,
    knock,
    lift,
    tumble,
    flight,
    dustAt,
    claps,
    dustEnd,
    exit,
    exitAt,
    exitLen,
    exitEnd,
    bubbles,
    end,
  };
}

/** Pixels per model unit. */
export const bulletScale = (b: TargetBounds) => b.height / CARD_UNITS;
/** Both fighters stand on the card's bottom edge line. */
export const bulletFloor = (b: TargetBounds) => b.top + b.height;
/** The card edge the fight happens beside. */
export const nearEdge = (b: TargetBounds, side: Side) => (side > 0 ? b.left : b.left + b.width);

/** The agent squares off outside the card; the throw's contact point is where he stands. */
export function bulletLandingPoint(
  p: BulletTimePlan,
  b: TargetBounds,
  view: Point,
  chosen?: number,
): Point {
  const side = chooseSide(p.side, b, view, chosen, 90);
  return sidePoint(side, b, view, AGENT_GAP * bulletScale(b), 1);
}
export function heroStand(b: TargetBounds, side: Side): Point {
  return { x: nearEdge(b, side) + side * HERO_IN * bulletScale(b), y: bulletFloor(b) };
}
/** Where the punch lands on the unrotated card. */
export function contactPoint(p: BulletTimePlan, b: TargetBounds, side: Side): Point {
  return {
    x: nearEdge(b, side) + side * p.contactU * b.width,
    y: bulletFloor(b) - p.contactH * bulletScale(b),
  };
}
/** The agent's hip height in the lunge, so his shoulder is level with the contact point. */
export const lungeHip = (p: BulletTimePlan) => p.contactH - TORSO * Math.cos(PUNCH_LEAN);
/** Screen x of the agent's hip in the lunge, close enough that his straightening arm reaches the contact. */
export function lungeX(p: BulletTimePlan, b: TargetBounds, side: Side): number {
  return (
    contactPoint(p, b, side).x -
    side * (PUNCH_REACH + TORSO * Math.sin(PUNCH_LEAN)) * bulletScale(b)
  );
}

/**
 * The slow punch's progress along its path: fast off the shoulder, crawling through bullet time and
 * snapping back to full speed for the last stretch into the card.
 */
export function punchProgress(p: BulletTimePlan, ms: number): number {
  const t = clamp((ms - p.swing) / (p.hit - p.swing));
  return t + (0.86 * Math.sin(2 * Math.PI * t)) / (2 * Math.PI);
}

// ---------- The card's response ----------

/** 0..1 how far the card has been knocked back by the punch, before it springs back. */
export function bulletKnock(p: BulletTimePlan, ms: number): number {
  return easeOut((ms - p.hit) / 110) * (1 - ease((ms - p.hit - p.hold) / 520));
}
/** The damped wobble after the card springs back. */
function wobble(p: BulletTimePlan, ms: number): number {
  const s = ms - p.hit - p.hold - 380;
  if (s <= 0) return 0;
  return -Math.sin((2 * Math.PI * s) / 300) * Math.exp(-s / 260);
}
/** 0..1 strength of the green code that flickers across the card after the hit. */
export function bulletCode(p: BulletTimePlan, ms: number): number {
  return ease((ms - p.hit) / 90) * (1 - ease((ms - p.hit - p.code + 260) / 260));
}

/**
 * The card's pose: the missed punch knocks it away from the fight about its far bottom corner, it
 * squeezes a little narrower from the blow, then springs back with a damped wobble.
 */
export function bulletCardPose(
  p: BulletTimePlan,
  ms: number,
  side: Side,
  b: TargetBounds,
): CardPose {
  if (ms <= p.hit) return NEUTRAL_CARD;
  const knock = bulletKnock(p, ms);
  const angle = side * p.tilt * (knock + 0.28 * wobble(p, ms));
  if (Math.abs(angle) < 1e-4) return NEUTRAL_CARD;
  const sx = 1 - 0.05 * knock,
    sy = 1 + 0.012 * knock;
  const a = (angle * Math.PI) / 180;
  const cx = (side * b.width) / 2,
    cy = b.height / 2;
  const rx = cx * sx * Math.cos(a) - cy * sy * Math.sin(a),
    ry = cx * sx * Math.sin(a) + cy * sy * Math.cos(a);
  return { x: cx - rx, y: cy - ry, angle, sx, sy };
}

export function bulletFrames(p: BulletTimePlan, facing: number, b: TargetBounds) {
  const side: Side = facing < 0 ? -1 : 1;
  return cardFrames(p.end, p.pace, (ms) => bulletCardPose(p, ms, side, b));
}
