import * as THREE from 'three';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  bezier,
  cardFit,
  cardTurn,
  clamp,
  ease,
  lowestWorldY,
  mix,
  onCard,
  pulse,
  screenOf,
  sideOf,
  sideRoute,
  span,
  type CharacterRoutine,
  type Side,
} from '../../kit';
import {
  SCARECROW_CROW_SCALE,
  SCARECROW_DURATION,
  SCARECROW_SCALE,
  SCARECROW_TURN_HOP,
  crowCaws,
  crowHopAt,
  crowTauntAt,
  scarecrowApproach,
  scarecrowCardPose,
  scarecrowCrowU,
  scarecrowExitHops,
  scarecrowExitPoint,
  scarecrowFloor,
  scarecrowFrames,
  scarecrowProgress,
  scarecrowSnoreWindows,
  type HopFrame,
  type ScarecrowPlan,
} from './scarecrow-choreography';
import {
  CROW_BODY_Y,
  CROW_GRIP,
  crowPose,
  makeCrow,
  scarecrowModel,
  scarecrowPose,
  type CrowModel,
  type CrowPose,
  type ScarecrowModel,
  type ScarecrowPose,
} from './scarecrow-model';
import {
  cawStrokes,
  looseFeathers,
  looseStraws,
  snorePuffs,
  type Drift,
  type Puff,
} from './scarecrow-debris';

const DEPTH = 170;
const CROW_DEPTH = DEPTH + 22;
const FX_DEPTH = DEPTH + 12;
/** Height of the sleeve top above the wrist axis, in model units, where the crow's feet rest. */
const SLEEVE_TOP = 2.2;
/** Route start sits below the sender's centre so the straw body is centred on the card it leaves. */
const LAUNCH_DROP = 38;

export interface ScarecrowContact {
  readonly stand: Point;
  /** Where the straw fingertips meet the card's near edge at the knock. */
  readonly knock: Point;
  /** Normalized height of that contact on the card. */
  readonly v: number;
}

interface Stage {
  readonly start: Point;
  readonly b: TargetBounds;
  readonly view: Point;
  readonly side: Side;
  readonly fit: number;
  readonly scale: number;
  readonly cs: number;
  readonly floor: number;
  readonly stand: Point;
}
interface CrowTargets {
  /** The hat's crown top at the grab, measured on the posed scarecrow. */
  readonly hatTop: Point;
  /** Live sleeve-top point where the crow lands on the outstretched arm, at landing and take-off. */
  readonly perch: Point | null;
  readonly leave: Point | null;
}
type Segment =
  | 'before'
  | 'enter'
  | 'perch'
  | 'climb'
  | 'hover'
  | 'dive'
  | 'carry'
  | 'gone'
  | 'return'
  | 'roost'
  | 'leave'
  | 'left';
interface CrowSpot {
  readonly at: Point;
  readonly seg: Segment;
  readonly t: number;
}

export class ScarecrowTrick implements CharacterRoutine {
  readonly object = new THREE.Group();
  readonly plan: ScarecrowPlan;
  readonly duration: number;
  readonly crow: CrowModel;
  private readonly model: ScarecrowModel;
  private readonly actor: THREE.Group;
  private readonly straws: readonly Drift[];
  private readonly feathers: readonly Drift[];
  private readonly snores: readonly Puff[];
  private readonly caws: readonly Puff[];
  private readonly seatAtGrab = new THREE.Matrix4();
  private readonly gripAtGrab = new THREE.Matrix4();
  private readonly hatFrom = new THREE.Matrix4();
  private readonly fromPosition = new THREE.Vector3();
  private readonly fromRotation = new THREE.Quaternion();
  private readonly fromScale = new THREE.Vector3();
  private readonly hanging = new THREE.Quaternion();
  private readonly turnAxis = new THREE.Vector3(0, 0, 1);
  private readonly scratch = new THREE.Vector3();

  constructor(actor: THREE.Group) {
    this.actor = actor;
    this.model = scarecrowModel(actor);
    this.plan = this.model.plan;
    this.duration = SCARECROW_DURATION * this.plan.pace;
    this.object.name = 'scarecrow-shoo';
    this.crow = makeCrow();
    this.object.add(this.crow.root);
    const r = seededRandom(`${this.plan.phase}:scarecrow-straw`);
    this.straws = looseStraws(this.object, r);
    this.feathers = looseFeathers(this.object, r);
    this.snores = snorePuffs(this.object);
    this.caws = cawStrokes(this.object);
  }

  cardAnimation(facing: number) {
    return scarecrowFrames(this.plan, facing);
  }

  /**
   * The stand point is solved from the real straw fingertips in the knock pose so they meet the
   * card's near edge exactly on the live (possibly still rocking) card.
   */
  contact(b: TargetBounds, facing: number): ScarecrowContact {
    const p = this.plan,
      side = sideOf(facing);
    const stage = this.stage({ x: 0, y: 0 }, b, { x: 0, y: 0 }, side, { x: 0, y: 0 });
    this.placeScarecrow(p.knock, stage);
    const hand = screenOf(this.model.hand);
    const floor = scarecrowFloor(b);
    const q = scarecrowCardPose(p, p.knock, side);
    const edge = side > 0 ? 0 : 1;
    const a = onCard(q, edge, 0, b),
      d = onCard(q, edge, 1, b);
    const y = floor + hand.y;
    const v = (y - a.y) / (d.y - a.y);
    const x = a.x + v * (d.x - a.x);
    return { stand: { x: x - hand.x, y: floor }, knock: { x, y }, v };
  }

  private stage(start: Point, b: TargetBounds, view: Point, side: Side, stand: Point): Stage {
    const fit = cardFit(b);
    return {
      start,
      b,
      view,
      side,
      fit,
      scale: SCARECROW_SCALE * fit,
      cs: SCARECROW_CROW_SCALE * fit,
      floor: scarecrowFloor(b),
      stand,
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
      ms = elapsed / p.pace,
      side = sideOf(facing);
    const live = ms < SCARECROW_DURATION;
    this.object.visible = live;
    this.object.position.set(0, 0, 0);
    const { stand, knock } = this.contact(b, side);
    const c = this.stage(start, b, view, side, stand);
    // Every measurement poses the shared rigs, so all of them happen before this frame's pose.
    this.placeScarecrow(p.grab, c);
    this.model.hatSeat.updateWorldMatrix(true, false);
    this.seatAtGrab.copy(this.model.hatSeat.matrixWorld);
    const hatTop = this.scratch.copy(this.model.hatTop.position).applyMatrix4(this.seatAtGrab);
    const targets: CrowTargets = {
      hatTop: { x: hatTop.x, y: -hatTop.y },
      perch: p.perch === 'arm' ? this.sleeveAt(p.perchAt, c) : null,
      leave: p.perch === 'arm' && p.chase ? this.sleeveAt(p.crowLeave, c) : null,
    };
    const mouths = this.snoreBirths(ms).map((birth) => {
      this.placeScarecrow(birth.at, c);
      return { ...birth, mouth: screenOf(this.model.mouth) };
    });
    this.placeCrow(p.grab, c, targets, null);
    this.crow.grip.updateWorldMatrix(true, false);
    this.gripAtGrab.copy(this.crow.grip.matrixWorld);

    if (ms < p.grab && this.model.hat.parent !== this.model.head)
      this.model.head.add(this.model.hat);
    this.placeScarecrow(ms, c);
    actor.visible = live;
    const sleeve = this.sleeveNow(c);
    this.placeCrow(ms, c, targets, sleeve);
    this.crow.root.visible = this.crow.root.visible && live;
    this.placeHat(ms, c);
    this.updateStraw(ms, c, knock);
    this.updateFeathers(ms, c, targets);
    this.updateSnores(ms, c, mouths);
    this.updateCaws(ms, c);
  }

  /* ---------------------------------------------------------------------------------------------- */
  /* The scarecrow                                                                                    */

  private route(c: Stage, u: number): Point {
    const from = { x: c.start.x, y: c.start.y + LAUNCH_DROP * c.scale };
    return sideRoute(from, c.stand, c.b, c.view, c.side, this.plan.bend, u);
  }

  private placeScarecrow(ms: number, c: Stage) {
    const p = this.plan;
    let root: Point = c.stand,
      lift = 0,
      dir: number = c.side,
      tip: Point = { x: 0, y: 0 };
    if (ms < p.travel) {
      ({ root, lift, dir, tip } = this.approach(ms, c));
    } else if (ms < p.exitStart) {
      lift = 7 * c.scale * pulse(ms, p.startle, 280);
    } else if (ms < p.exitStart + SCARECROW_TURN_HOP) {
      // A little hop on the spot turns it round to give chase.
      const s = (ms - p.exitStart) / SCARECROW_TURN_HOP;
      lift = 9 * c.scale * Math.sin(Math.PI * s);
      dir = sweep(c.side, -c.side, s);
    } else {
      ({ root, lift, dir, tip } = this.chase(ms, c));
    }
    const actor = this.actor;
    actor.position.set(root.x, -root.y + lift, DEPTH);
    actor.rotation.set(0, 0, 0);
    actor.scale.set(dir * c.scale, c.scale, c.scale);
    scarecrowPose(actor, { ...this.pose(ms), tip });
    actor.updateMatrixWorld(true);
  }

  /** Pole tip offset in model units for a planted tip seen from the root. */
  private tipOffset(tip: Point, root: Point, dir: number, scale: number): Point {
    return { x: (tip.x - root.x) / (dir * scale), y: -(tip.y - root.y) / scale };
  }

  private approach(ms: number, c: Stage) {
    const p = this.plan;
    const f = scarecrowApproach(p, ms / p.travel);
    const at = (u: number) => this.route(c, u);
    const heading = (a: number, b: number) => {
      const dx = at(b).x - at(a).x;
      return Math.abs(dx) > 2 ? Math.sign(dx) : c.side;
    };
    // Facing on each planting is the direction it arrived from; the last flight turns to the card.
    const facingAt = (frame: HopFrame) =>
      frame.hop >= p.hops
        ? c.side
        : frame.hop === 0
          ? heading(frame.tipFrom, frame.tipTo)
          : heading(frame.tipPrev, frame.tipFrom);
    const root = at(f.u);
    const now = facingAt(f);
    if (f.planted)
      return { root, lift: 0, dir: now, tip: this.tipOffset(at(f.tipFrom), root, now, c.scale) };
    const next = f.hop + 1 >= p.hops ? c.side : heading(f.tipFrom, f.tipTo);
    const takeoff = this.tipOffset(at(f.tipFrom), at(scarecrowProgress(p, f.from)), now, c.scale);
    const landing = this.tipOffset(at(f.tipTo), at(scarecrowProgress(p, f.to)), next, c.scale);
    const s = ease(f.stage);
    const length = Math.hypot(at(f.tipTo).x - at(f.tipFrom).x, at(f.tipTo).y - at(f.tipFrom).y);
    const hop = 13 * c.scale * Math.max(0.45, Math.min(1.25, length / (55 * c.fit)));
    return {
      root,
      lift: f.lift * f.height * hop,
      dir: sweep(now, next, f.stage),
      tip: { x: mix(takeoff.x, landing.x, s), y: mix(takeoff.y, landing.y, s) },
    };
  }

  private chase(ms: number, c: Stage) {
    const p = this.plan;
    const exit = scarecrowExitPoint(p, c.stand, c.view, c.side);
    const at = (u: number) => ({
      x: mix(c.stand.x, exit.x, u),
      y: mix(c.stand.y, exit.y, u) - 14 * c.fit * Math.sin(Math.PI * u),
    });
    const f = scarecrowExitHops(p, ms);
    const dir = -c.side,
      root = at(f.u);
    if (f.planted)
      return { root, lift: 0, dir, tip: this.tipOffset(at(f.tipFrom), root, dir, c.scale) };
    const takeoff = this.tipOffset(at(f.tipFrom), at(f.from * f.from), dir, c.scale);
    const landing = this.tipOffset(at(f.tipTo), at(f.to * f.to), dir, c.scale);
    const s = ease(f.stage);
    return {
      root,
      lift: f.lift * f.height * 14 * c.scale,
      dir,
      tip: { x: mix(takeoff.x, landing.x, s), y: mix(takeoff.y, landing.y, s) },
    };
  }

  private pose(ms: number): Omit<ScarecrowPose, 'tip'> {
    const p = this.plan;
    let lean = 0,
      nod = 0.3,
      roll = 0.12 * Math.sin(ms / 420 + p.phase),
      turn = 0,
      lids = 0.55 + 0.45 * pulse(ms % 2300, 1500, 180),
      mouth = 0.1,
      shrug = 0,
      hatPop = 0,
      legSwing = 0;
    let near: Point = { x: 2, y: -19.5 },
      far: Point = { x: 1, y: -19.5 };
    const toward = (from: Point, to: Point, w: number): Point => ({
      x: mix(from.x, to.x, w),
      y: mix(from.y, to.y, w),
    });
    const dozeNod = mix(0.6, -0.45, p.doze);
    const breath = Math.sin(((ms - p.dozeAt) / p.snore) * Math.PI * 2);
    if (ms < p.travel) {
      const t = ms / p.travel,
        f = scarecrowApproach(p, t);
      legSwing = f.planted ? 3 * Math.cos(Math.PI * f.stage) : -3 * Math.cos(Math.PI * f.stage);
      // Arms float up as it drops onto the pole and flop down while it vaults; the head flops on landing.
      const up = f.planted ? 4 * (1 - f.stage) ** 2 : 4 * f.stage ** 2;
      near = { x: 2 - 0.6 * legSwing, y: -19.5 + up };
      far = { x: 1 - 0.5 * legSwing, y: -19.5 + up * 0.8 };
      nod += f.planted ? 0.16 * Math.sin(Math.PI * f.stage) : 0;
      if (p.nod) {
        // Nods off in mid-hop, then jolts awake on a bigger one.
        const asleep = pulse(t, p.nodAt - 0.08, 0.16),
          jolt = pulse(t, p.nodAt + 0.07, 0.1);
        nod += 0.5 * asleep - 0.35 * jolt;
        lids = mix(mix(lids, 1, asleep), 0, jolt);
        mouth += 0.5 * jolt;
        near = toward(near, { x: 6, y: -12 }, jolt);
        far = toward(far, { x: 4, y: -12 }, jolt);
      } else {
        // A huge yawn on the way.
        const yawn = pulse(t, p.nodAt - 0.06, 0.2);
        mouth += 0.85 * yawn;
        nod -= 0.35 * yawn;
        lids = mix(lids, 0.85, yawn);
      }
    } else {
      const settle = ms - p.travel;
      lean = -0.08 * Math.exp(-settle / 160) * Math.sin(settle / 60);
      legSwing = -3 * Math.exp(-settle / 150) * Math.cos(settle / 70);
      const sway = 2 * Math.exp(-settle / 200) * Math.sin(settle / 80);
      near = { x: 2.5 + sway, y: -19.6 };
      far = { x: 1.5 + sway, y: -19.6 };
      // Dozes off standing on its pole.
      const dz = ease((ms - p.dozeAt) / 500);
      nod = mix(0.3, dozeNod + 0.07 * breath, dz);
      lids = mix(0.55, 1, dz);
      mouth = mix(0.1, 0.12 + p.doze * (0.35 + 0.25 * breath), dz);
      roll = mix(roll, 0.22 * p.doze, dz);
      shrug = 0.25 * breath * dz;
      lean += 0.015 * breath * dz;
      for (const at of p.cawAt) {
        const twitch = pulse(ms, at + 120, 220) * (ms < p.startle ? 1 : 0);
        nod -= 0.15 * twitch;
        lids -= 0.3 * twitch;
      }
      // The double take: one sleepy peek, then the start.
      const peek = pulse(ms, p.startle - 330, 260);
      lids -= 0.45 * peek;
      turn -= 0.25 * peek;
      const s0 = ease((ms - p.startle) / 90);
      lids = mix(lids, 0, s0);
      mouth = mix(mouth, 1 - 0.35 * ease((ms - p.startle - 200) / 400), s0);
      nod = mix(nod, -0.3, s0);
      near = toward(near, { x: 7, y: 17 }, s0);
      far = toward(far, { x: -4, y: 16 }, s0);
      hatPop = 3.2 * pulse(ms, p.startle, 320);
      // Windmilling arms to shoo the crow.
      const flail = ease((ms - p.startle - 150) / 160) * (1 - ease((ms - p.grab - 100) / 260));
      const a = ((ms - p.startle) / 1000) * Math.PI * 2 * 2.4 * p.frenzy;
      near = toward(near, { x: 5 + 9 * Math.sin(a), y: 6 + 10 * Math.cos(a) }, flail);
      far = toward(far, { x: -2 + 9 * Math.sin(a + 2.3), y: 6 + 10 * Math.cos(a + 2.3) }, flail);
      lean += 0.07 * p.frenzy * Math.sin(a * 0.5) * flail;
      turn += 0.35 * Math.sin(a * 0.7) * flail;
      nod += 0.12 * Math.sin(a) * flail;
      // One wild swing knocks the card: the pose is exact at the contact instant.
      const hit = Math.max(0, 1 - ((ms - p.knock) / 120) ** 2);
      near = toward(near, { x: 19.5, y: -6 + 4 * p.knockLift }, hit);
      lean = mix(lean, -0.12, hit);
      // Hat gone: pats its bare straw head and stares after the thief.
      const lost = ease((ms - p.grab) / 200);
      const pat = ease((ms - p.grab - 120) / 200) * (1 - ease((ms - p.grab - 700) / 250));
      near = toward(near, { x: 3, y: 19.5 }, pat);
      nod = mix(nod, -0.4, lost);
      turn = mix(turn, -0.45, lost);
      mouth = mix(mouth, 0.8, lost);
      lids = mix(lids, 0, lost);
      const dismay = ease((ms - p.grab - 700) / 400);
      near = toward(near, { x: 2.2, y: -19.6 }, dismay);
      far = toward(far, { x: 1.4, y: -19.6 }, dismay);
      shrug -= 0.5 * dismay;
      nod = mix(nod, 0.15, dismay);
      lids = mix(lids, 0.35, dismay);
      mouth = mix(mouth, 0.35, dismay);
      turn = mix(turn, -0.3, dismay);
      if (p.perch === 'arm') {
        // Holds its arm out after the crow; it lands on it.
        const offer = ease((ms - p.back - 100) / 450);
        const weight =
          2.4 * dipCurve(ms - p.perchAt) +
          0.8 * ease((ms - p.perchAt) / 150) * (1 - ease((ms - p.crowLeave) / 120));
        near = toward(near, { x: -19.5, y: 3 - weight }, offer);
        turn = mix(turn, -0.75, offer);
        nod = mix(nod, -0.15, offer);
      } else {
        const watch = ease((ms - p.back - 300) / 400);
        nod = mix(nod, -0.25, watch);
        turn = mix(turn, 0.1, watch);
      }
      if (!p.chase) {
        const notice = ease((ms - p.notice) / 250);
        lids = mix(lids, 0, notice);
        mouth = mix(mouth, 0.2, notice);
        const sigh = pulse(ms, p.perchAt + 600, 500);
        shrug += 1.2 * sigh;
        lean += 0.03 * sigh;
        const off = ease((ms - p.nodOff) / 600);
        const later = Math.sin(((ms - p.nodOff) / p.snore) * Math.PI * 2);
        lids = mix(lids, 1, off);
        nod = mix(nod, dozeNod + 0.07 * later, off);
        mouth = mix(mouth, 0.12 + p.doze * (0.35 + 0.25 * later), off);
        roll = mix(roll, 0.22 * p.doze, off);
        turn = mix(turn, p.perch === 'arm' ? -0.2 : 0, off);
        shrug += 0.25 * later * off;
        if (p.perch === 'arm') near = { x: near.x, y: near.y - 1.5 * off };
      } else {
        const lunge = ease((ms - p.lunge + 150) / 150) * (1 - ease((ms - p.lunge - 150) / 250));
        if (p.perch === 'arm') {
          far = toward(far, { x: -17, y: 7 }, lunge);
          lean += 0.12 * lunge;
        } else {
          near = toward(near, { x: 19, y: 12 }, lunge);
          far = toward(far, { x: 17, y: 10 }, lunge);
          lean -= 0.15 * lunge;
        }
        mouth = mix(mouth, 1, lunge);
        lids = mix(lids, 0, lunge);
        const go = ease((ms - p.exitStart) / 220);
        const wave = ((ms - p.exitStart) / 1000) * Math.PI * 2 * 3;
        near = toward(near, { x: 15 + 3 * Math.sin(wave), y: 8 + 5 * Math.sin(wave) }, go);
        far = toward(far, { x: 13 + 3 * Math.sin(wave + 2), y: 6 + 5 * Math.sin(wave + 2) }, go);
        nod = mix(nod, -0.2, go);
        turn = mix(turn, 0, go);
        mouth = mix(mouth, 0.85, go);
        lids = mix(lids, 0, go);
        lean = mix(lean, -0.08, go);
        if (ms >= p.exitStart + SCARECROW_TURN_HOP) {
          const f = scarecrowExitHops(p, ms);
          legSwing = f.planted ? 3 * Math.cos(Math.PI * f.stage) : -3 * Math.cos(Math.PI * f.stage);
        }
      }
    }
    return {
      lean,
      nod,
      roll,
      turn,
      lids: clamp(lids),
      mouth: clamp(mouth),
      near,
      far,
      legSwing,
      shrug,
      hatPop,
    };
  }

  /** Sleeve-top point on the near forearm, measured on the posed actor. */
  private sleeveNow(c: Stage): Point {
    const wrist = screenOf(this.model.wrist);
    return { x: wrist.x, y: wrist.y - SLEEVE_TOP * c.scale };
  }
  private sleeveAt(ms: number, c: Stage): Point {
    this.placeScarecrow(ms, c);
    return this.sleeveNow(c);
  }

  /* ---------------------------------------------------------------------------------------------- */
  /* The crow                                                                                         */

  /** Where the crow's root (between its soles) is at a moment, segment by segment. */
  private crowSpot(ms: number, c: Stage, tg: CrowTargets, sleeve: Point | null): CrowSpot {
    const p = this.plan,
      side = c.side,
      dir = -side;
    const card = (at: number, u: number) => onCard(scarecrowCardPose(p, at, side), u, 0, c.b);
    if (ms < p.crowEnter) return { at: { x: -999, y: -999 }, seg: 'before', t: 0 };
    if (ms < p.crowLand) {
      const land = card(p.crowLand, p.crowU);
      const from = { x: land.x + side * (250 + 70 * p.crowFrom), y: -50 };
      const t = span(ms, p.crowEnter, p.crowLand - p.crowEnter);
      const s = 1 - (1 - t) ** 2;
      return {
        at: bezier(
          from,
          { x: from.x - side * 40, y: from.y + 170 + 30 * p.crowFrom },
          { x: land.x + side * 70, y: land.y - 60 },
          land,
          s,
        ),
        seg: 'enter',
        t,
      };
    }
    if (ms < p.flush) {
      const at = card(ms, scarecrowCrowU(p, ms, side));
      let lift = 0;
      for (let k = 0; k < p.crowHops; k++)
        lift += 5 * c.fit * Math.sin(Math.PI * span(ms, crowHopAt(p, k), 240));
      return { at: { x: at.x, y: at.y - lift }, seg: 'perch', t: 0 };
    }
    const grabRoot = {
      x: tg.hatTop.x - dir * CROW_GRIP.x * c.cs,
      y: tg.hatTop.y + CROW_GRIP.y * c.cs,
    };
    const launch = card(p.flush, scarecrowCrowU(p, p.flush, side));
    const hover = {
      x: (tg.hatTop.x + launch.x) / 2,
      y: Math.min(launch.y, tg.hatTop.y) - 60 * c.fit,
    };
    const climbEnd = p.flush + 340,
      diveStart = p.grab - 280;
    if (ms < climbEnd) {
      const t = span(ms, p.flush, 340);
      return {
        at: bezier(
          launch,
          { x: launch.x, y: launch.y - 45 },
          { x: hover.x + side * 30, y: hover.y + 15 },
          hover,
          ease(t),
        ),
        seg: 'climb',
        t,
      };
    }
    if (ms < diveStart) {
      const t = span(ms, climbEnd, diveStart - climbEnd),
        w = Math.sin(Math.PI * t);
      return {
        at: {
          x: hover.x + 6 * c.fit * w * Math.sin((ms - climbEnd) / 90),
          y: hover.y + 4 * c.fit * w * Math.sin((ms - climbEnd) / 70),
        },
        seg: 'hover',
        t,
      };
    }
    if (ms < p.grab) {
      const t = span(ms, diveStart, 280);
      return {
        at: bezier(
          hover,
          { x: hover.x, y: hover.y - 14 },
          { x: grabRoot.x + side * 16, y: grabRoot.y - 24 },
          grabRoot,
          ease(t),
        ),
        seg: 'dive',
        t,
      };
    }
    if (ms < p.away) {
      const t = span(ms, p.grab, p.away - p.grab);
      const out = { x: grabRoot.x + dir * 280, y: -110 };
      return {
        at: bezier(
          grabRoot,
          { x: grabRoot.x, y: grabRoot.y - 50 },
          { x: grabRoot.x + dir * 110, y: grabRoot.y - 160 },
          out,
          t * t,
        ),
        seg: 'carry',
        t,
      };
    }
    if (ms < p.back) return { at: { x: grabRoot.x + dir * 280, y: -110 }, seg: 'gone', t: 0 };
    const roost = p.perch === 'arm' ? (tg.perch ?? c.stand) : card(p.perchAt, p.perchU);
    if (ms < p.perchAt) {
      const t = span(ms, p.back, p.perchAt - p.back);
      const from = { x: roost.x - side * (240 + 60 * p.crowFrom), y: -70 };
      return {
        at: bezier(
          from,
          { x: from.x + side * 40, y: from.y + 150 },
          { x: roost.x - side * 60, y: roost.y - 55 },
          roost,
          1 - (1 - t) ** 2,
        ),
        seg: 'return',
        t,
      };
    }
    const perched = (at: number): Point => {
      if (p.perch === 'arm')
        return at === ms && sleeve ? sleeve : (tg.leave ?? tg.perch ?? c.stand);
      const spot = card(at, p.perchU);
      return {
        x: spot.x,
        y: spot.y - 5 * c.fit * Math.sin(Math.PI * span(at, crowTauntAt(p), 240)),
      };
    };
    if (ms < p.crowLeave) return { at: perched(ms), seg: 'roost', t: 0 };
    const t = span(ms, p.crowLeave, 1000);
    const from = perched(p.crowLeave);
    const out = { x: from.x + dir * 340, y: -120 };
    if (t >= 1) return { at: out, seg: 'left', t };
    return {
      at: bezier(
        from,
        { x: from.x, y: from.y - 40 },
        { x: from.x + dir * 120, y: from.y - 140 },
        out,
        t * t,
      ),
      seg: 'leave',
      t,
    };
  }

  private placeCrow(ms: number, c: Stage, tg: CrowTargets, sleeve: Point | null) {
    const p = this.plan,
      side = c.side,
      crow = this.crow;
    const spot = this.crowSpot(ms, c, tg, sleeve);
    const flying =
      spot.seg === 'enter' ||
      spot.seg === 'climb' ||
      spot.seg === 'hover' ||
      spot.seg === 'dive' ||
      spot.seg === 'carry' ||
      spot.seg === 'return' ||
      spot.seg === 'leave';
    let dir: number = -side,
      rot = 0;
    if (spot.seg === 'return') dir = side;
    if (spot.seg === 'roost') {
      dir = p.perch === 'arm' ? side : sweep(side, -side, span(ms, crowTauntAt(p), 240));
    }
    if (spot.seg === 'leave') dir = p.perch === 'arm' ? sweep(side, -side, spot.t * 6) : -side;
    if (spot.seg === 'perch') rot = cardTurn(scarecrowCardPose(p, ms, side));
    if (spot.seg === 'roost' && p.perch === 'card') rot = cardTurn(scarecrowCardPose(p, ms, side));
    let pitch = 0;
    if (flying) {
      const a = this.crowSpot(ms - 6, c, tg, sleeve).at,
        b = this.crowSpot(ms + 6, c, tg, sleeve).at;
      const vx = (b.x - a.x) / 12,
        vy = -(b.y - a.y) / 12;
      const speed = Math.hypot(vx, vy) * 1000;
      const heading = Math.atan2(Math.sign(dir) * vy, Math.sign(dir) * vx);
      pitch = Math.max(-0.45, Math.min(0.45, 0.6 * heading)) * ease(speed / 160);
      // The crow levels out exactly as its talons close on the hat.
      if (spot.seg === 'dive') pitch *= 1 - ease(spot.t);
      if (spot.seg === 'carry') pitch *= ease(spot.t / 0.2);
    }
    crow.root.visible = spot.seg !== 'before' && spot.seg !== 'gone' && spot.seg !== 'left';
    crow.root.position.set(spot.at.x, -spot.at.y, CROW_DEPTH);
    crow.root.rotation.set(0, 0, rot + (flying ? pitch * 0.35 : 0));
    crow.root.scale.set(dir * c.cs, c.cs, c.cs);
    crowPose(crow, this.crowPoseAt(ms, spot, pitch));
    crow.root.updateMatrixWorld(true);
  }

  private crowPoseAt(ms: number, spot: CrowSpot, pitch: number): CrowPose {
    const p = this.plan;
    const flap = -0.45 + 0.8 * Math.sin(ms * (spot.seg === 'hover' ? 0.075 : 0.053) + p.phase);
    let q: CrowPose = {
      pitch: pitch * 0.65,
      flap,
      spread: 1,
      feet: 0,
      grip: 0,
      headTilt: -0.1 * pitch,
      headTurn: 0,
      beak: 0,
      fluff: 0,
      tail: -0.3 * pitch,
    };
    const landing = (t: number) => ease((t - 0.65) / 0.3);
    switch (spot.seg) {
      case 'enter':
      case 'return': {
        const flare = landing(spot.t);
        q = {
          ...q,
          flap: mix(flap, -1.05, flare),
          feet: ease((spot.t - 0.6) / 0.3),
          tail: mix(q.tail, 0.3, flare),
        };
        break;
      }
      case 'climb':
        q = { ...q, feet: 1 - ease(spot.t / 0.5), flap: mix(-1.1, flap, ease(spot.t / 0.3)) };
        break;
      case 'dive':
        q = {
          ...q,
          feet: ease((spot.t - 0.3) / 0.5),
          grip: ease((spot.t - 0.5) / 0.4),
          flap: mix(flap, -0.9, ease((spot.t - 0.6) / 0.4)),
        };
        break;
      case 'carry':
        q = { ...q, feet: 1, grip: 1, headTurn: -0.4 * pulse(spot.t, 0.05, 0.4) };
        break;
      case 'leave':
        q = { ...q, feet: 1 - ease(spot.t / 0.3), flap: mix(-1.1, flap, ease(spot.t / 0.2)) };
        break;
      case 'perch':
      case 'roost': {
        const since = ms - (spot.seg === 'perch' ? p.crowLand : p.perchAt);
        let spread = 1 - ease(since / 220),
          hopFlick = 0;
        if (spot.seg === 'perch')
          for (let k = 0; k < p.crowHops; k++)
            hopFlick = Math.max(hopFlick, pulse(ms, crowHopAt(p, k), 240));
        else if (p.perch === 'card') hopFlick = pulse(ms, crowTauntAt(p), 240);
        spread = Math.max(spread, 0.45 * hopFlick);
        let beak = 0;
        for (const at of crowCaws(p)) beak = Math.max(beak, pulse(ms, at, 260));
        const startled = spot.seg === 'perch' ? pulse(ms, p.startle, 200) : 0;
        const sleepy =
          spot.seg === 'roost' && !p.chase && p.perch === 'arm'
            ? ease((ms - p.nodOff - 300) / 600)
            : 0;
        q = {
          pitch: 0.15 * beak - 0.1 * sleepy,
          flap: mix(flap, -0.7, hopFlick),
          spread: Math.max(spread, 0.6 * startled),
          feet: 1,
          grip: 0,
          headTilt: 0.3 * beak - 0.08 + 0.08 * Math.sin(ms / 430 + p.phase) - 0.25 * sleepy,
          headTurn: 0.35 * Math.sin(ms / 610 + p.phase) * (1 - sleepy),
          beak,
          fluff: Math.max(startled, 0.6 * sleepy),
          tail: 0.25 * beak + 0.2 * hopFlick,
        };
        break;
      }
      default:
        break;
    }
    return q;
  }

  /** The one hat moves from the head, to the talons, to the crow's head while it is off screen. */
  private placeHat(ms: number, c: Stage) {
    const p = this.plan,
      m = this.model,
      hat = m.hat,
      crow = this.crow;
    m.topTuft.visible = ms >= p.grab;
    if (ms < p.grab) return;
    if (ms < p.away) {
      if (hat.parent !== crow.grip) crow.grip.add(hat);
      this.hatFrom.copy(this.gripAtGrab).invert().multiply(this.seatAtGrab);
      this.hatFrom.decompose(this.fromPosition, this.fromRotation, this.fromScale);
      const from =
        (Math.abs(this.fromScale.x) + Math.abs(this.fromScale.y) + Math.abs(this.fromScale.z)) / 3;
      const size = c.scale / c.cs;
      // Hanging from its crown, swinging a little, upright in the world whatever the crow's attitude.
      const dir = Math.sign(crow.root.scale.x) || 1;
      const swing = 0.22 * Math.sin((ms - p.grab) / 110) * Math.exp(-(ms - p.grab) / 600);
      this.hanging.setFromAxisAngle(this.turnAxis, dir * (swing - crow.root.rotation.z));
      const w = ease((ms - p.grab) / 220);
      hat.quaternion.copy(this.fromRotation).slerp(this.hanging, w);
      const s = mix(from, size, w);
      hat.scale.setScalar(s);
      hat.position.copy(m.hatTop.position).multiplyScalar(-s).applyQuaternion(hat.quaternion);
      return;
    }
    if (hat.parent !== crow.crown) crow.crown.add(hat);
    hat.position.set(0.2, -0.6, 0);
    hat.rotation.set(0, 0, 0.24);
    hat.scale.setScalar(c.scale / c.cs);
  }

  /* ---------------------------------------------------------------------------------------------- */
  /* Straw, feathers, snores and caws                                                                 */

  /** Straw shakes loose from the knocking hand and spills from the bare head as the hat is torn off. */
  private updateStraw(ms: number, c: Stage, knock: Point) {
    const p = this.plan;
    const head = this.scratch.setFromMatrixPosition(this.seatAtGrab);
    const crown = { x: head.x, y: -head.y };
    const fade = 1 - ease((ms - (SCARECROW_DURATION - 500)) / 450);
    this.straws.forEach((d, i) => {
      const knocked = i < 5;
      const born = (knocked ? p.knock : p.grab) + d.delay;
      d.mesh.scale.setScalar(c.scale);
      // Knocked straw flies back off the hand, away from the card.
      this.drift(d, ms - born, knocked ? knock : crown, c, 0.45, 70, fade, knocked ? c.side : 1);
    });
  }

  private updateFeathers(ms: number, c: Stage, tg: CrowTargets) {
    const p = this.plan;
    const at = this.crowSpot(p.flush, c, tg, null).at;
    const body = { x: at.x, y: at.y - CROW_BODY_Y * c.cs };
    // Shaken-loose feathers drift outward past the nearer card edge, clear of the value.
    const out = Math.sign(body.x - (c.b.left + c.b.width / 2)) || -c.side;
    const fade = 1 - ease((ms - (SCARECROW_DURATION - 500)) / 450);
    for (const d of this.feathers) {
      d.mesh.scale.setScalar(c.cs);
      this.drift(d, ms - p.startle - d.delay, body, c, 0.9, 32, fade, out);
    }
  }

  /**
   * Light debris with drag: it pops out, drifts down fluttering, and comes to rest lying flat with
   * its lowest real vertex on the floor.
   */
  private drift(
    d: Drift,
    age: number,
    from: Point,
    c: Stage,
    tau: number,
    terminal: number,
    fade: number,
    heading = 1,
  ) {
    const mesh = d.mesh;
    mesh.visible = age >= 0 && fade > 0;
    if (!mesh.visible) return;
    mesh.material.opacity = fade;
    mesh.material.transparent = true;
    const vy = d.vy * c.fit,
      vx = d.vx * c.fit * heading,
      vt = terminal * c.fit;
    const yAt = (t: number) => from.y + vt * t + (vy - vt) * tau * (1 - Math.exp(-t / tau));
    const xAt = (t: number) =>
      from.x +
      vx * tau * (1 - Math.exp(-t / tau)) +
      d.flutter * c.fit * Math.sin(t * 5 + d.turn) * Math.min(1, t / 0.3);
    const apex = -tau * Math.log(vt / (vt - vy));
    let lo = Math.max(0, apex),
      hi = 12;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (yAt(mid) < c.floor) lo = mid;
      else hi = mid;
    }
    const land = hi,
      t = age / 1000;
    const s = Math.min(t, land);
    const spin = d.turn + d.spin * s + (d.spin === 0 ? 0.6 * Math.sin(s * 4) : 0);
    const flat = Math.round((spin - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
    const settle = ease((t - land) / 0.15);
    mesh.position.set(xAt(s), -yAt(s), FX_DEPTH);
    mesh.rotation.set(0, 0, mix(spin, flat, settle));
    if (t >= land) {
      mesh.updateMatrixWorld(true);
      mesh.position.y += -c.floor - lowestWorldY(mesh);
    }
  }

  /** Snore births whose puffs are on screen now; each one is emitted from the mouth at its birth. */
  private snoreBirths(ms: number): { slot: number; at: number }[] {
    const p = this.plan,
      births: { slot: number; at: number }[] = [];
    for (const [from, to] of scarecrowSnoreWindows(p)) {
      if (ms < from) continue;
      const n = Math.floor((Math.min(ms, to) - from) / p.snore);
      for (let k = Math.max(0, n - 2); k <= n; k++) {
        const at = from + k * p.snore;
        if (at <= ms && at < to && ms - at < 1500) births.push({ slot: k % 3, at });
      }
    }
    return births;
  }

  private updateSnores(
    ms: number,
    c: Stage,
    births: readonly { slot: number; at: number; mouth: Point }[],
  ) {
    const p = this.plan;
    this.snores.forEach((puff, i) => {
      const birth = births.filter((b) => b.slot === i).at(-1);
      puff.group.visible = !!birth && ms < SCARECROW_DURATION;
      if (!birth) return;
      const age = ms - birth.at,
        a = age / 1000;
      // The start pops any puff still hanging in the air.
      const pop = birth.at < p.startle && ms >= p.startle ? span(ms, p.startle, 150) : 0;
      if (pop >= 1) {
        puff.group.visible = false;
        return;
      }
      const opacity = ease(age / 150) * (1 - ease((age - 1100) / 400)) * (1 - pop);
      for (const m of puff.materials) m.opacity = opacity;
      const back = -c.side;
      puff.group.position.set(
        birth.mouth.x + back * (4 + 10 * a) * c.fit + 2.5 * c.fit * Math.sin(age / 200),
        -(birth.mouth.y - (6 + 26 * a) * c.fit),
        FX_DEPTH + 10,
      );
      puff.group.rotation.z = 0.2 * Math.sin(age / 300) - 0.15 * back;
      puff.group.scale.setScalar((1.6 + 1.6 * a) * (0.7 + 0.5 * p.doze) * c.fit * (1 + 0.6 * pop));
    });
  }

  /** Short strokes burst from the beak on each caw. */
  private updateCaws(ms: number, c: Stage) {
    const tip = screenOf(this.crow.beakTip);
    const dir = Math.sign(this.crow.root.scale.x) || 1;
    const at = crowCaws(this.plan).find((t) => ms >= t && ms < t + 280);
    this.caws.forEach((stroke, i) => {
      stroke.group.visible = at !== undefined && this.crow.root.visible;
      if (at === undefined) return;
      const s = (ms - at) / 280;
      const a = (dir > 0 ? 0 : Math.PI) + (i - 1) * 0.55;
      const r = (2.5 + 8 * s) * c.fit;
      stroke.group.position.set(tip.x + Math.cos(a) * r, -tip.y + Math.sin(a) * r, CROW_DEPTH + 6);
      stroke.group.rotation.z = a;
      stroke.group.scale.set(3.4 * c.fit, 0.55 * c.fit, 1);
      for (const m of stroke.materials) m.opacity = 1 - s;
    });
  }
}

/** Facing sweep: the body turns edge-on and through, without an instant flip of a visible pose. */
function sweep(from: number, to: number, s: number): number {
  if (from === to) return from;
  const v = from * Math.cos(Math.PI * ease(s));
  return Math.abs(v) < 0.12 ? 0.12 * (s < 0.5 ? from : to) : v;
}
function dipCurve(t: number): number {
  if (t <= 0) return 0;
  return (1 - Math.exp(-t / 25)) * Math.exp(-t / 170) * Math.cos(t / 55);
}
