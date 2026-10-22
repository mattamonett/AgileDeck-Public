import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  alongCurve,
  cardPoint,
  cardTurn,
  clamp,
  ease,
  easeIn,
  easeOut,
  glow,
  keepInView,
  mix,
  mixPoint,
  part,
  pulse,
  setOpacity,
  sideOf,
  sideRoute,
  span,
  type CharacterRoutine,
  type Side,
} from '../../kit';
import {
  BULLET_NO_CARD,
  BULLET_WHOA,
  FOOT,
  PUNCH_LEAN,
  STICK_HIP,
  TORSO,
  bulletCardPose,
  bulletCode,
  bulletFloor,
  bulletFrames,
  bulletLandingPoint,
  bulletScale,
  contactPoint,
  exchangeContacts,
  heroStand,
  lungeHip,
  lungeX,
  nearEdge,
  punchProgress,
  type BulletTimePlan,
  type Contact,
  type Exchange,
  type Fighter,
} from './bullettime-choreography';
import {
  GUARD,
  PIVOT,
  bulletTimeModel,
  headOf,
  shoulderOf,
  stickPose,
  type BulletTimeModel,
  type StickFigure,
  type StickPose,
} from './bullettime-model';
import {
  GREEN,
  PALE_GREEN,
  bulletBubble,
  codeSheet,
  codeStreak,
  impactSpark,
} from './bullettime-props';
import {
  AFTER_KNOCK,
  AGENT_GUARD,
  ATTENTION,
  CROUCH,
  SLIDE,
  TUCK,
  runPose,
  add,
  blendPose,
  exchangeMotion,
  keepFace,
  toBody,
  toScreen,
  type Motion,
  type Placement,
} from './bullettime-moves';

export { makeBulletTime } from './bullettime-model';
export { BULLET_NO_CARD, BULLET_WHOA } from './bullettime-choreography';

const DEPTH = 170;
/** The hero fights in front of the agent; the code on the card sits behind both of them. */
const HERO_Z = 8;
const CODE_Z = -24;
const RIPPLE_Z = -14;
const EFFECT_Z = 4;
const BUBBLE_Z = 60;
const STREAKS = 12;
const SPARKS = 4;
const SPARK_MS = 240;
const RIPPLES = 3;
const WAKES = 3;

/** Everything that depends on this frame's layout rather than on time. */
interface Layout {
  readonly start: Point;
  readonly b: TargetBounds;
  readonly view: Point;
  readonly side: Side;
  readonly s: number;
  readonly floor: number;
  readonly hero: Point;
  readonly agent: Point;
}

/** Fast first step, then an even pace. */
function getGoing(t: number): number {
  const a = 0.18,
    u = clamp(t);
  return u < a ? u ** 2 / (2 * a) / (1 - a / 2) : (u - a / 2) / (1 - a / 2);
}
/** Arc-length of a route, sampled. */
function routeLength(curve: (u: number) => Point, samples = 24): number {
  let total = 0,
    previous = curve(0);
  for (let i = 1; i <= samples; i++) {
    const at = curve(i / samples);
    total += Math.hypot(at.x - previous.x, at.y - previous.y);
    previous = at;
  }
  return total;
}

export class BulletTimeTrick implements CharacterRoutine {
  readonly object = new THREE.Group();
  readonly plan: BulletTimePlan;
  readonly duration: number;
  private readonly model: BulletTimeModel;
  private readonly code: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly ripples: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly wakes: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly streaks: THREE.Group[] = [];
  private readonly sparks: THREE.Group[] = [];
  /** Every blow that lands in the fight, in order. */
  readonly contacts: readonly Contact[];
  private readonly whoa: THREE.Sprite;
  private readonly noCard: THREE.Sprite;

  constructor(actor: THREE.Group) {
    this.model = bulletTimeModel(actor);
    this.plan = this.model.plan;
    this.duration = this.plan.end * this.plan.pace;
    this.object.name = 'bullettime-effects';
    this.code = codeSheet();
    this.object.add(this.code);
    for (let i = 0; i < RIPPLES; i++) {
      const ring = part(
        this.object,
        `bullettime-ripple-${i}`,
        new THREE.RingGeometry(0.8, 1, 40),
        glow(GREEN, 0),
      );
      ring.visible = false;
      this.ripples.push(ring);
    }
    for (let i = 0; i < WAKES; i++) {
      const ring = part(
        this.object,
        `bullettime-wake-${i}`,
        new THREE.RingGeometry(0.78, 1, 32),
        glow(PALE_GREEN, 0),
      );
      ring.visible = false;
      this.wakes.push(ring);
    }
    for (let i = 0; i < STREAKS; i++) {
      const streak = codeStreak(`bullettime-streak-${i}`);
      this.object.add(streak);
      this.streaks.push(streak);
    }
    for (let i = 0; i < SPARKS; i++) {
      const spark = impactSpark(`bullettime-spark-${i}`);
      this.object.add(spark);
      this.sparks.push(spark);
    }
    this.contacts = this.plan.exchanges.flatMap(exchangeContacts);
    this.whoa = bulletBubble(BULLET_WHOA, 'bullettime-whoa');
    this.noCard = bulletBubble(BULLET_NO_CARD, 'bullettime-no-card');
    this.object.add(this.whoa, this.noCard);
  }

  cardAnimation(facing: number, b?: TargetBounds) {
    return bulletFrames(this.plan, facing, b ?? { left: 0, top: 0, width: 84, height: 122 });
  }

  // ---------- The hero ----------

  /** Where the run ends: across the card when he was thrown from its far side, otherwise outside it. */
  private launch(l: Layout): { readonly from: Point; readonly cross: boolean } {
    const { b, side, s } = l;
    const cx = b.left + b.width / 2;
    const cross = (l.start.x - cx) * side > b.width / 2;
    if (this.plan.entry === 'flip' && cross) {
      const far = nearEdge(b, side === 1 ? -1 : 1);
      return {
        from: keepInView({ x: far + side * 16 * s, y: l.floor }, l.view, 16, 40),
        cross: true,
      };
    }
    const back = this.plan.entry === 'flip' ? 36 : 30;
    return { from: { x: l.hero.x - side * back * s, y: l.floor }, cross: false };
  }

  heroAt(ms: number, l: Layout): Placement {
    const p = this.plan;
    if (ms < p.travel) return this.heroApproach(ms, l);
    const base: Omit<Placement, 'pose'> = {
      at: l.hero,
      face: -l.side,
      rot: 0,
      opacity: 1,
      visible: true,
    };
    const landed = this.heroApproach(p.travel - 1, l);
    // He turns round to face the agent if he arrived facing the card.
    const arrived = Math.sign(landed.face) || 1;
    const turn = ease((ms - p.travel - 90) / 220);
    const face = arrived === -l.side ? -l.side : arrived * Math.cos(Math.PI * turn);
    if (ms < p.exitAt) {
      const move = this.motion(ms, 'hero', l);
      if (move) return this.moved(base, move, l);
      const spin = this.spin(ms, l.side);
      return { ...base, face: spin ?? keepFace(face), pose: this.heroFight(ms, l, landed.pose) };
    }
    return this.heroExit(ms, l, base);
  }

  private heroApproach(ms: number, l: Layout): Placement {
    const p = this.plan;
    const { s, side } = l;
    const t = clamp(ms / p.travel);
    const { from, cross } = this.launch(l);
    const routeSide: Side = cross ? (side === 1 ? -1 : 1) : side;
    const curve = (u: number) => sideRoute(l.start, from, l.b, l.view, routeSide, p.bend, u);
    const length = routeLength(curve);
    const runTime = p.run * p.travel;
    const stride = Math.max(14, Math.min(26, length / s / (runTime / 520)));
    if (t < p.run) {
      const u = getGoing(t / p.run);
      const at = alongCurve(curve, u, 24);
      const ahead = alongCurve(curve, Math.min(1, u + 0.02), 24);
      const dx = ahead.x - at.x;
      const face = Math.abs(dx) > 0.3 ? Math.sign(dx) : side;
      const lean = 0.28 * clamp((t / p.run) * 4);
      return {
        at,
        face,
        rot: 0,
        opacity: 1,
        visible: true,
        pose: runPose((u * length) / s, stride, 6.5, lean, 1),
      };
    }
    const tau = (t - p.run) / (1 - p.run);
    const ranTo = runPose(length / s, stride, 6.5, 0.28, 1);
    const dir = Math.sign(l.hero.x - from.x) || side;
    if (p.entry === 'flip') {
      // A ballistic leap with whole somersaults, tucked in the middle, landing in a crouch.
      const height = cross ? l.floor - l.b.top - 12 * s + p.loft * s : (p.loft + 6) * s;
      const at = keepInView(
        {
          x: mix(from.x, l.hero.x, tau),
          y: mix(from.y, l.hero.y, tau) - height * 4 * tau * (1 - tau),
        },
        { x: l.view.x, y: l.view.y + 200 },
        16,
        PIVOT * s + 30,
      );
      const tuck = Math.sin(Math.PI * tau);
      const pose = tau < 0.5 ? blendPose(ranTo, TUCK, tuck) : blendPose(CROUCH, TUCK, tuck);
      return {
        at,
        face: dir,
        rot: -dir * Math.PI * 2 * p.turns * ease(tau),
        opacity: 1,
        visible: true,
        pose,
      };
    }
    // A knee slide that bleeds off speed right up to his stand point.
    const glide = 1 - (1 - tau) ** 2;
    const at = { x: mix(from.x, l.hero.x, glide), y: l.floor };
    return {
      at,
      face: dir,
      rot: 0,
      opacity: 1,
      visible: true,
      pose: blendPose(ranTo, SLIDE, ease(tau / 0.25)),
    };
  }

  /** The spinning kick turns him a whole turn on the spot before the foot lands. */
  private spin(ms: number, side: Side): number | null {
    const p = this.plan;
    if (p.finisher !== 'kick' || ms < p.fin || ms > p.strike - 140) return null;
    return keepFace(-side * Math.cos(Math.PI * 2 * ease((ms - p.fin) / (p.strike - 140 - p.fin))));
  }

  /** Guard, beckon, the bullet-time bend, the finisher and the dusting-off, in body space. */
  private heroFight(ms: number, l: Layout, landed: StickPose): StickPose {
    const p = this.plan;
    const bob = 0.4 * Math.sin(ms / 240);
    let q: StickPose = { ...GUARD, hip: { x: 0, y: GUARD.hip.y + bob } };
    // Settling out of the landing crouch or the slide.
    q = blendPose(landed, q, ease((ms - p.travel) / (p.entry === 'flip' ? 300 : 420)));
    // "Come on": the front hand reaches out palm up and flicks back toward him.
    const beckon = ease((ms - p.beckonAt) / 200) * (1 - ease((ms - p.beckonEnd) / 200));
    if (beckon > 0) {
      const curl = span(ms, p.beckonAt + 200, p.beckons * 330);
      const flick = curl > 0 && curl < 1 ? Math.abs(Math.sin(curl * p.beckons * Math.PI)) : 0;
      q = blendPose(
        q,
        { ...q, lean: 0, nod: -0.1, hands: [q.hands[0], { x: 17 - 5 * flick, y: 41 + 5 * flick }] },
        beckon,
      );
    }
    // Bullet time: he bends right back under the punch with his arms windmilling slowly.
    const dodge =
      ease((ms - p.swing + 40) / 300) * (1 - ease((ms - p.hit - 150) / (p.upright - p.hit - 150)));
    if (dodge > 0) {
      const back: StickPose = {
        ...GUARD,
        hip: { x: 4, y: 18 },
        lean: -p.arch,
        nod: -0.25,
        feet: [
          { x: -2.5, y: FOOT },
          { x: 5.5, y: FOOT },
        ],
        hands: [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
      };
      const sh = shoulderOf(back);
      const turn = (Math.PI * 2 * p.windmill * (ms - p.swing)) / 1000;
      const hands: [Point, Point] = [
        add(sh, -3 + 8 * Math.cos(turn), 1 + 7 * Math.sin(turn)),
        add(sh, -1 + 8 * Math.cos(turn + Math.PI * 0.8), 1 + 7 * Math.sin(turn + Math.PI * 0.8)),
      ];
      q = blendPose(q, { ...back, hands }, dodge);
    }
    q = this.heroFinisher(ms, l, q);
    // Dusting off: one hand brushes across the other a few times while he looks down at them.
    const dust = ease((ms - p.dustAt) / 160) * (1 - ease((ms - p.dustEnd) / 160));
    if (dust > 0) {
      const brush = Math.sin(
        Math.PI * 2 * clamp((ms - p.dustAt) / (p.dustEnd - p.dustAt)) * p.claps,
      );
      q = blendPose(
        q,
        {
          ...q,
          lean: 0.04,
          nod: 0.3,
          hands: [
            { x: 7, y: 35.5 },
            { x: 7 + 3.5 * brush, y: 37.5 },
          ],
        },
        dust,
      );
    }
    return q;
  }

  private heroFinisher(ms: number, l: Layout, q: StickPose): StickPose {
    const p = this.plan;
    const on = ease((ms - p.fin) / 160) * (1 - ease((ms - p.strike - 200) / 260));
    if (on <= 0) return q;
    const target = this.agentChestFor(ms, l);
    if (p.finisher === 'kick') {
      // Chamber the knee through the spin, then drive the foot into his chest.
      const extend = ease((ms - p.strike + 130) / 130);
      const chamber: StickPose = {
        ...GUARD,
        hip: { x: -1, y: 25 },
        lean: -0.3,
        hands: [
          { x: -11, y: 44 },
          { x: 7, y: 41 },
        ],
        feet: [
          { x: -3, y: FOOT },
          { x: 7, y: 15 },
        ],
      };
      return blendPose(
        q,
        { ...chamber, feet: [chamber.feet[0], mixPoint(chamber.feet[1], target, extend)] },
        on,
      );
    }
    // A short step in and an open-palm strike to the chest.
    const step = ease((ms - p.fin) / (p.strike - p.fin - 60));
    const thrust = ease((ms - p.strike + 110) / 110);
    const palm: StickPose = {
      ...GUARD,
      hip: { x: 3.5 * step, y: 24 },
      lean: 0.22,
      hands: [{ x: -2, y: 31 }, mixPoint({ x: 5, y: 34 }, target, thrust)],
      feet: [
        { x: -4.5, y: FOOT },
        { x: 5 + 5 * step, y: FOOT + 3 * Math.sin(Math.PI * step) },
      ],
    };
    return blendPose(q, palm, on);
  }

  private heroExit(ms: number, l: Layout, base: Omit<Placement, 'pose'>): Placement {
    const p = this.plan;
    const { s, side } = l;
    if (p.exit === 'fly') {
      // A crouch, then straight up and out of view with a fist raised.
      const crouch = pulse(ms, p.exitAt, 380);
      const up = easeIn((ms - p.exitAt - 220) / (p.exitLen - 220));
      const at = { x: l.hero.x, y: l.floor - (l.floor + 90 * s) * up };
      const flying: StickPose = {
        ...GUARD,
        hip: { x: 0, y: STICK_HIP },
        lean: 0,
        nod: 0.1,
        hands: [
          { x: -1.5, y: 27 },
          { x: 0.8, y: 64 },
        ],
        feet: [
          { x: -0.6, y: FOOT - 0.8 },
          { x: 0.8, y: FOOT },
        ],
        elbows: [1, -1],
      };
      const ready: StickPose = {
        ...CROUCH,
        nod: -0.2,
        hands: [
          { x: -6, y: 26 },
          { x: -4, y: 27 },
        ],
      };
      const pose =
        ms < p.exitAt + 220
          ? blendPose(GUARD, ready, crouch)
          : blendPose(ready, flying, ease((ms - p.exitAt - 220) / 160));
      return { ...base, at, pose };
    }
    // A relaxed stroll out of the side the agent came from.
    const exit = { x: side > 0 ? -90 : l.view.x + 90, y: l.floor };
    const e = getGoing((ms - p.exitAt) / p.exitLen);
    const length = Math.abs(exit.x - l.hero.x);
    const walked = (e * length) / s;
    const stride = Math.max(12, Math.min(22, length / s / (p.exitLen / 620)));
    const pose = blendPose(
      GUARD,
      runPose(walked, stride, 3.5, 0.02, 0.5),
      ease((ms - p.exitAt) / 200),
    );
    return { ...base, at: { x: mix(l.hero.x, exit.x, e), y: l.floor }, pose };
  }

  // ---------- The exchanges ----------

  /** The exchange under way at this moment, if any. */
  exchangeAt(ms: number): Exchange | undefined {
    return this.plan.exchanges.find((e) => ms >= e.at && ms < e.at + e.len);
  }

  private motion(ms: number, who: Fighter, l: Layout): Motion | null {
    const e = this.exchangeAt(ms);
    if (!e) return null;
    const hero = who === 'hero';
    return exchangeMotion(e, who, ms, {
      s: l.s,
      mark: hero ? l.hero : l.agent,
      dir: hero ? (l.side === 1 ? -1 : 1) : l.side,
      gap: Math.abs(l.hero.x - l.agent.x) / l.s,
      rest: hero
        ? { ...GUARD, hip: { x: 0, y: GUARD.hip.y + 0.4 * Math.sin(ms / 240) } }
        : AGENT_GUARD,
      opponent: (at) => (hero ? this.agentAt(at, l) : this.heroAt(at, l)),
      opponentMark: hero ? l.agent : l.hero,
    });
  }

  /** A fighter offset from his mark by an exchange: forward toward the other man, and up. */
  private moved(base: Omit<Placement, 'pose'>, m: Motion, l: Layout): Placement {
    const dir = Math.sign(base.face) || 1;
    return {
      ...base,
      at: { x: base.at.x + dir * m.dx * l.s, y: base.at.y - m.dy * l.s },
      face: keepFace(base.face * m.spin),
      rot: m.rot,
      pose: m.pose,
    };
  }

  /** Where a blow lands on screen: the attacker's hand or foot at the moment of contact. */
  contactAt(c: Contact, l: Layout): Point {
    const f = c.by === 'hero' ? this.heroAt(c.at, l) : this.agentAt(c.at, l);
    return toScreen(f, l.s, c.limb === 'hand' ? f.pose.hands[c.index] : f.pose.feet[c.index]);
  }

  // ---------- The agent ----------

  agentAt(ms: number, l: Layout): Placement {
    const p = this.plan;
    const { s, side } = l;
    const appear = p.agentEntry === 'glitch' ? ease((ms - p.agentIn + 700) / 550) : 1;
    const shown = ms >= p.agentStart && ms < p.strike + p.flight;
    const base = { face: side as number, rot: 0, opacity: appear, visible: shown };
    if (ms < p.agentIn && p.agentEntry === 'stride') {
      // A stiff, even stride in from the screen edge.
      const edge = { x: side > 0 ? -30 : l.view.x + 30, y: l.floor };
      const e = clamp((ms - p.agentStart) / (p.agentIn - p.agentStart));
      // An even pace that brakes over the last fifth to a halt at his mark.
      const u = e < 0.8 ? e / 0.9 : (e - (e - 0.8) ** 2 / 0.4) / 0.9;
      const length = Math.abs(l.agent.x - edge.x);
      const stride = Math.max(10, Math.min(18, length / s / ((p.agentIn - p.agentStart) / 640)));
      const settle = ease((e - 0.86) / 0.14);
      const pose = blendPose(
        runPose((clamp(u) * length) / s, stride, 3.2, 0, 0.35),
        ATTENTION,
        settle,
      );
      return { ...base, at: { x: mix(edge.x, l.agent.x, clamp(u)), y: l.floor }, pose };
    }
    if (ms < p.strike) {
      const move = this.motion(ms, 'agent', l);
      if (move) {
        const placed = this.moved({ ...base, at: l.agent }, move, l);
        // His tie streams out behind him through the action.
        return {
          ...placed,
          pose: { ...placed.pose, tie: placed.pose.tie + 0.3 * Math.sin(ms / 70) },
        };
      }
      const lunge = this.lungeShift(ms, l);
      const at = { x: l.agent.x + side * lunge * s, y: l.floor };
      return { ...base, at, pose: this.agentFight(ms, l, { at, face: side }, lunge) };
    }
    // Knocked flying, tumbling backwards and dissolving into code.
    const tau = clamp((ms - p.strike) / p.flight);
    const from = lungeX(p, l.b, side);
    const at = {
      x: from - side * p.knock * s * easeOut(tau),
      y: l.floor - p.lift * s * Math.sin(Math.PI * Math.min(1, tau * 1.25)),
    };
    const struck = this.agentFight(
      p.strike - 1,
      l,
      { at: { x: from, y: l.floor }, face: side },
      this.lungeShift(p.strike - 1, l),
    );
    const pose = blendPose(struck, AFTER_KNOCK, ease(tau / 0.22));
    const opacity = 1 - ease((tau - 0.25) / 0.6);
    return { ...base, at, rot: side * Math.PI * 2 * p.tumble * easeOut(tau), opacity, pose };
  }

  /** Model units the agent's hip has travelled from his stand point toward the card in the lunge. */
  private lungeShift(ms: number, l: Layout): number {
    const p = this.plan;
    const full = ((lungeX(p, l.b, l.side) - l.agent.x) * l.side) / l.s;
    // He follows through as the card gives way, so the fist stays on it.
    const at = Math.min(ms, p.strike - 1);
    const raw = contactPoint(p, l.b, l.side);
    const give =
      ((cardPoint(bulletCardPose(p, at, l.side, l.b), raw, l.b).x - raw.x) * l.side) / l.s;
    return full * ease((ms - p.swing + 140) / 420) + give;
  }

  private agentFight(
    ms: number,
    l: Layout,
    f: Pick<Placement, 'at' | 'face'>,
    lunge: number,
  ): StickPose {
    const p = this.plan;
    const lungeT = ease((ms - p.swing + 140) / 420);
    const raise = ease((ms - p.beckonEnd + 120) / 260);
    let q = blendPose(ATTENTION, AGENT_GUARD, raise);
    // Feet: the back foot stays planted through the lunge while the front foot steps in.
    const step = lungeT;
    const recover = ease((ms - p.hit - p.hold) / 400);
    const backFoot = { x: Math.max(-14.5, q.feet[0].x - lunge), y: FOOT };
    const frontFoot = {
      x: mix(q.feet[1].x - lunge * (1 - step), 7, step),
      y: FOOT + 4 * Math.sin(Math.PI * step),
    };
    q = {
      ...q,
      hip: { x: 0, y: mix(q.hip.y, lungeHip(p), lungeT * (1 - 0.6 * recover)) },
      lean: mix(q.lean, PUNCH_LEAN, lungeT * (1 - 0.75 * recover)),
      feet: lungeT > 0 ? [backFoot, frontFoot] : q.feet,
    };
    // The big punch: cocked back, then the fist crawls along its path through bullet time into the card.
    const cock = ease((ms - p.windup) / 300);
    if (cock > 0) {
      const fist = toBody(f, l.s, this.fistPath(ms, l));
      const retract = ease((ms - p.hit - p.hold) / 280);
      const back = mixPoint(fist, q.hands[0], retract);
      q = {
        ...q,
        lean: q.lean - 0.08 * cock * (1 - lungeT),
        hands: [
          mixPoint(q.hands[0], back, cock),
          mixPoint(q.hands[1], { x: 3, y: 37 }, lungeT * (1 - retract)),
        ],
        elbows: [-1, -1],
      };
    }
    // Puzzled by the card that bent under his fist.
    return {
      ...q,
      nod: 0.3 * pulse(ms, p.hit + 120, p.fin - p.hit + 200),
      tie: 0.25 * Math.sin(ms / 160) * lungeT * (1 - recover),
    };
  }

  /** The fist's path in screen space: cocked behind his shoulder, then along to the live contact point. */
  fistPath(ms: number, l: Layout): Point {
    const p = this.plan;
    const { s, side } = l;
    const contact = cardPoint(bulletCardPose(p, ms, side, l.b), contactPoint(p, l.b, side), l.b);
    const shoulder = lungeX(p, l.b, side) + side * TORSO * Math.sin(PUNCH_LEAN) * s;
    const cocked = { x: shoulder - side * 7 * s, y: l.floor - (p.contactH - 1.5) * s };
    // Until the lunge carries him in, the cocked fist rides along behind where his shoulder is now.
    const left = 1 - ease((ms - p.swing + 140) / 420);
    const pre = {
      x: cocked.x - (lungeX(p, l.b, side) - l.agent.x) * left,
      y: mix(cocked.y, l.floor - 44 * s, left),
    };
    if (ms < p.swing) return pre;
    return mixPoint(pre, contact, punchProgress(p, ms));
  }

  /** The agent's chest for the finisher, in the hero's body space. */
  private agentChestFor(ms: number, l: Layout): Point {
    const p = this.plan;
    const at = Math.min(ms, p.strike - 1);
    const agent = this.agentAt(at, l);
    const chest = toScreen(agent, l.s, add(shoulderOf(agent.pose), -1.5, -6));
    return toBody({ at: l.hero, face: -l.side }, l.s, chest);
  }

  // ---------- Placing figures and effects ----------

  private place(f: StickFigure, at: Placement, s: number, z: number) {
    f.root.visible = at.visible;
    f.root.position.set(at.at.x, -(at.at.y - PIVOT * s), z);
    f.root.scale.set(at.face * s, s, s);
    f.root.rotation.set(0, 0, at.rot);
    stickPose(f, at.pose);
    if (f === this.model.agent) setOpacity(f.root, at.opacity);
  }

  private placeCardEffects(ms: number, l: Layout) {
    const p = this.plan;
    const q = bulletCardPose(p, ms, l.side, l.b);
    const code = bulletCode(p, ms);
    this.code.visible = code > 0.01;
    if (this.code.visible) {
      const centre = cardPoint(
        q,
        { x: l.b.left + l.b.width / 2, y: l.b.top + l.b.height / 2 },
        l.b,
      );
      this.code.position.set(centre.x, -centre.y, DEPTH + CODE_Z);
      this.code.rotation.z = cardTurn(q);
      this.code.scale.set(l.b.width * q.sx * 0.94, l.b.height * q.sy * 0.95, 1);
      this.code.material.opacity = 0.62 * code * (0.85 + 0.15 * Math.sin(ms / 37));
      if (this.code.material.map) this.code.material.map.offset.y = (ms - p.hit) / 1600;
    }
    const contact = cardPoint(q, contactPoint(p, l.b, l.side), l.b);
    this.ripples.forEach((ring, i) => {
      const t = (ms - p.hit - i * 130) / 560;
      ring.visible = t >= 0 && t < 1;
      if (!ring.visible) return;
      ring.position.set(contact.x, -contact.y, DEPTH + RIPPLE_Z);
      ring.scale.setScalar(l.s * mix(2, 15 + 5 * i, easeOut(t)));
      ring.material.opacity = 0.9 * (1 - t);
    });
    // Bullet-time wake rings left behind along the punch's path.
    this.wakes.forEach((ring, i) => {
      const born = p.swing + (0.32 + 0.16 * i) * (p.hit - p.swing);
      const t = (ms - born) / 700;
      ring.visible = t >= 0 && t < 1;
      if (!ring.visible) return;
      const at = this.fistPath(born, l);
      ring.position.set(at.x, -at.y, DEPTH + EFFECT_Z);
      const r = l.s * mix(3, 9, easeOut(t));
      ring.scale.set(r * 0.45, r, 1);
      ring.material.opacity = 0.75 * (1 - t);
    });
  }

  /** Code streaks: falling into the agent as he materialises, and pouring off him as he dissolves. */
  private placeStreaks(ms: number, l: Layout) {
    const p = this.plan;
    const { s } = l;
    this.streaks.forEach((streak, i) => {
      let at: Point | null = null,
        opacity = 0,
        length = 9;
      if (p.agentEntry === 'glitch') {
        const t = (ms - (p.agentIn - 950 + i * 45)) / 600;
        if (t >= 0 && t < 1) {
          const x = l.agent.x + (((i * 7) % 13) - 6) * s;
          const top = l.floor - (78 + (i % 3) * 8) * s,
            stop = l.floor - (6 + ((i * 11) % 48)) * s;
          at = { x, y: mix(top, stop, easeIn(t)) };
          opacity = Math.sin(Math.PI * t);
          length = 12;
        }
      }
      const born = p.strike + 60 + i * 55;
      const t = (ms - born) / 650;
      if (t >= 0 && t < 1) {
        const agent = this.agentAt(born, l);
        const points = [
          headOf(agent.pose),
          shoulderOf(agent.pose),
          agent.pose.hip,
          agent.pose.hands[1],
          agent.pose.feet[0],
        ];
        const from = toScreen(agent, s, points[i % points.length] ?? agent.pose.hip);
        at = { x: from.x + ((i % 3) - 1) * 2 * s, y: from.y + 40 * s * easeIn(t) };
        opacity = 1 - t;
        length = 9 + 5 * t;
      }
      streak.visible = at !== null;
      if (!at) return;
      streak.position.set(at.x, -at.y, DEPTH + EFFECT_Z);
      streak.scale.set(0.9 * s, length * s, 1);
      setOpacity(streak, opacity);
    });
  }

  /** A flash where each blow lands, recycled from a small pool. */
  private placeSparks(ms: number, l: Layout) {
    for (const spark of this.sparks) spark.visible = false;
    this.contacts.forEach((c, i) => {
      const t = (ms - c.at) / SPARK_MS;
      if (t < 0 || t >= 1) return;
      const spark = this.sparks[i % SPARKS];
      if (!spark) return;
      const at = this.contactAt(c, l);
      spark.visible = true;
      spark.position.set(at.x, -at.y, DEPTH + EFFECT_Z + 6);
      spark.scale.setScalar(l.s * mix(1.6, c.limb === 'foot' ? 7.5 : 5, easeOut(t)));
      spark.rotation.z = 0.6 * t;
      setOpacity(spark, 1 - easeIn(t));
    });
  }

  private placeBubbles(ms: number, l: Layout, hero: Placement) {
    const p = this.plan;
    const head = toScreen(hero, l.s, headOf(hero.pose));
    const show = (bubble: THREE.Sprite, from: number, to: number, wanted: boolean) => {
      bubble.visible = wanted && ms >= from && ms < to;
      if (!bubble.visible) return;
      const aspect = Number(bubble.userData['aspect']) || 3;
      const height = Math.max(26, Math.min(40, l.b.height * 0.3));
      const width = Math.min(height * aspect, l.view.x - 16);
      const x = Math.max(width / 2 + 8, Math.min(l.view.x - width / 2 - 8, head.x));
      const y = Math.max(
        height / 2 + 8,
        Math.min(l.b.top - height / 2 - 6, head.y - height / 2 - 20),
      );
      bubble.position.set(x, -y, DEPTH + BUBBLE_Z);
      bubble.scale.set(width, (width / aspect) * 1, 1);
      bubble.material.opacity = ease((ms - from) / 160) * (1 - ease((ms - to + 220) / 220));
    };
    show(this.whoa, p.swing + 220, p.hit + 80, p.bubbles !== 'card');
    show(this.noCard, p.hit + 160, p.hit + 1150, p.bubbles !== 'whoa');
  }

  layout(start: Point, b: TargetBounds, view: Point, facing: number): Layout {
    const side = sideOf(facing);
    const s = bulletScale(b);
    return {
      start,
      b,
      view,
      side,
      s,
      floor: bulletFloor(b),
      hero: heroStand(b, side),
      agent: bulletLandingPoint(this.plan, b, view, side),
    };
  }

  update(
    elapsed: number,
    actor: THREE.Group,
    start: Point,
    b: TargetBounds,
    view: Point,
    facing: number,
  ) {
    const p = this.plan,
      ms = elapsed / p.pace;
    const l = this.layout(start, b, view, facing);
    this.object.visible = ms < p.end;
    this.object.position.set(0, 0, 0);
    actor.visible = ms < p.end;
    actor.position.set(0, 0, DEPTH);
    actor.rotation.set(0, 0, 0);
    actor.scale.setScalar(1);
    const hero = this.heroAt(ms, l);
    const heroShown = ms < p.exitEnd;
    this.place(this.model.hero, { ...hero, visible: heroShown }, l.s, HERO_Z);
    this.place(this.model.agent, this.agentAt(ms, l), l.s, 0);
    actor.updateMatrixWorld(true);
    this.placeCardEffects(ms, l);
    this.placeStreaks(ms, l);
    this.placeSparks(ms, l);
    this.placeBubbles(ms, l, hero);
    this.object.updateMatrixWorld(true);
  }
}
