import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardFit,
  cardTurn,
  clamp,
  ease,
  glow,
  mix,
  mixPoint,
  onCard,
  part,
  pulse,
  reach,
  screenOf,
  setStrip,
  sideOf,
  span,
  stripGeometry,
  type CardPose,
  type CharacterRoutine,
  type Limb,
  type Side,
} from '../../kit';
import {
  ELF_DURATION,
  ELF_RIBBONS,
  ELF_SCALE,
  ELF_TRAIL,
  elfApproach,
  elfBow,
  elfBowAngle,
  elfCardPose,
  elfChase,
  elfChaseDir,
  elfCinch,
  elfFloor,
  elfFrames,
  elfRoute,
  elfSlope,
  elfSpoolLift,
  elfSpoolTravel,
  elfStrand,
  elfStrandV,
  elfTightness,
  type ElfPlan,
} from './elf-choreography';
import {
  ELF_ARM,
  ELF_GRIP,
  ELF_HIP,
  ELF_SHOULDER,
  ELF_STRIDE,
  ELF_TIP,
  SPOOL_RADIUS,
  SPOOL_WOUND,
  elfModel,
  elfPose,
  makeSpool,
  setWound,
  type ElfModel,
  type ElfPoseInput,
  type ElfSpool,
  loopShape,
  tailShape,
} from './elf-model';

const DEPTH = 172;
const CARD_Z = DEPTH - 14;
const RIBBON_SEGMENTS = 40;
const ROUTE_SAMPLES = 64;
/** The scooping pose at the moment the elf's fist closes on the rolling spool. */
export const ELF_CATCH_CROUCH = 7.4;
export const ELF_CATCH_LEAN = 0.9;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
function quadratic(a: Point, c: Point, b: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
  };
}
/** A ribbon span from a to b hanging `sag` px at its middle. */
const hang = (a: Point, b: Point, sag: number, t: number) =>
  quadratic(a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 2 * sag }, b, t);

interface Bow {
  readonly group: THREE.Group;
  readonly loops: readonly [THREE.Mesh, THREE.Mesh];
  readonly tails: readonly [THREE.Mesh, THREE.Mesh];
  readonly knot: THREE.Mesh;
}
type Strip = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

export class ElfTrick implements CharacterRoutine {
  readonly object = new THREE.Group();
  readonly plan: ElfPlan;
  readonly duration: number;
  private readonly model: ElfModel;
  private readonly ribbon: Strip;
  private readonly strands: Strip[] = [];
  private readonly creases: Strip[] = [];
  private readonly bow: Bow;
  private readonly spool: ElfSpool;
  private readonly routeLengths = new Float32Array(ROUTE_SAMPLES + 1);
  private readonly scratch = new THREE.Vector3();
  private readonly rootWorld = new THREE.Vector3();
  private readonly turn = new THREE.Quaternion();
  private readonly slipAt = new THREE.Vector3();
  private readonly slipQuat = new THREE.Quaternion();
  private readonly slipScale = new THREE.Vector3(1, 1, 1);
  private readonly caught = new THREE.Quaternion();
  // Layout for the current frame. Every field is recomputed at the start of each update.
  private side: Side = 1;
  private dir: Side = 1;
  private slope = 0;
  private fit = 1;
  private scale = ELF_SCALE;
  private start: Point = { x: 0, y: 0 };
  private bounds: TargetBounds = { left: 0, top: 0, width: 84, height: 122 };
  private view: Point = { x: 1, y: 1 };
  private stand: Point = { x: 0, y: 0 };
  private routeLength = 0;
  private reachPx = 0;
  private sc = 0;
  private ec = 0;
  private exitTotal = 0;
  private s0 = 0;
  private h0 = 0;

  constructor(actor: THREE.Group) {
    this.model = elfModel(actor);
    this.plan = this.model.plan;
    this.duration = ELF_DURATION * this.plan.pace;
    this.object.name = 'elf-gift-wrap';
    const color = ELF_RIBBONS[this.plan.ribbon] ?? ELF_RIBBONS[0];
    const dark = new THREE.Color(color).multiplyScalar(0.72).getHex();
    this.ribbon = part(this.object, 'elf-ribbon', stripGeometry(RIBBON_SEGMENTS), glow(color));
    for (let k = 0; k < this.plan.wraps; k++)
      this.strands.push(
        part(this.object, `elf-wrap-${k}`, stripGeometry(1), glow(k % 2 ? dark : color)),
      );
    for (let i = 0; i < 4; i++)
      this.creases.push(part(this.object, `elf-crease-${i}`, stripGeometry(1), glow(0x2b1d14, 0)));
    const group = new THREE.Group();
    group.name = 'elf-bow';
    this.object.add(group);
    const loops = [1, -1].map((s) =>
      part(group, 'elf-bow-loop', new THREE.ShapeGeometry(loopShape(s), 12), glow(color)),
    );
    const tails = [1, -1].map((s) =>
      part(group, 'elf-bow-tail', new THREE.ShapeGeometry(tailShape(s)), glow(dark), 0, 0, -0.05),
    );
    const knot = part(
      group,
      'elf-bow-knot',
      new THREE.CircleGeometry(0.22, 14),
      glow(dark),
      0,
      0.02,
      0.05,
    );
    const [l0, l1] = loops,
      [t0, t1] = tails;
    if (!l0 || !l1 || !t0 || !t1) throw new Error('Missing bow parts');
    this.bow = { group, loops: [l0, l1], tails: [t0, t1], knot };
    this.spool = makeSpool('elf-rolling-spool', color);
    this.object.add(this.spool.group);
  }

  cardAnimation(facing: number) {
    return elfFrames(this.plan, facing);
  }

  /** Index of the arm toward the viewer while the elf works at the card: it holds and ties the ribbon. */
  private get near(): 0 | 1 {
    return this.side > 0 ? 0 : 1;
  }
  /** The spool hand at the card. */
  private get far(): 0 | 1 {
    return this.side > 0 ? 1 : 0;
  }
  /** The arm toward the viewer while chasing the spool: it grabs the ribbon and catches the spool. */
  private get chaser(): 0 | 1 {
    return this.dir > 0 ? 0 : 1;
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
    this.object.visible = ms < ELF_DURATION;
    this.object.position.set(0, 0, 0);
    this.side = sideOf(facing);
    this.dir = elfChaseDir(p, this.side);
    this.slope = elfSlope(p);
    this.fit = cardFit(b);
    this.scale = ELF_SCALE * this.fit;
    this.start = start;
    this.bounds = b;
    this.view = view;
    // Measurements pose the shared actor, so all of them happen before this frame's pose.
    this.stand = this.solveStand(actor);
    this.routeLength = this.measureRoute();
    this.solveChase();
    this.solveSlip(actor);
    this.solveCatch(actor);
    this.place(actor, ms);
    const q = elfCardPose(p, ms, this.side);
    this.updateSpool(ms);
    this.updateStrands(ms, q);
    this.updateCreases(ms, q);
    this.updateBow(ms, q);
    this.updateRibbon(ms, q);
  }

  // ---- layout ---------------------------------------------------------------------------------

  /** The near edge of the unanimated card at the waist, where the ribbon end is pressed on. */
  private edge(q: CardPose): Point {
    return onCard(q, this.side > 0 ? 0 : 1, this.plan.waistV, this.bounds);
  }

  /**
   * Poses the elf at the moment it presses the ribbon end onto the card, reads its real fingertip
   * and places its feet so that fingertip meets the card's near edge at the waist.
   */
  private solveStand(actor: THREE.Group): Point {
    const p = this.plan,
      b = this.bounds;
    const floor = elfFloor(b);
    const edge = this.edge({ x: 0, y: 0, angle: 0, sx: 1, sy: 1 });
    const height = (floor - edge.y) / this.scale;
    actor.position.set(0, 0, DEPTH);
    actor.rotation.set(0, this.contactYaw(), 0);
    actor.scale.setScalar(this.scale);
    const pose = this.body(p.attach, 0, this.contactYaw());
    const reachTo = { x: 5.5, y: height - (ELF_HIP + ELF_SHOULDER.y) };
    elfPose(actor, {
      ...pose,
      front: this.near === 0 ? reachTo : pose.front,
      back: this.near === 1 ? reachTo : pose.back,
    });
    const tip = screenOf(this.model.tips[this.near]);
    const x = edge.x - tip.x;
    return { x: Math.max(16, Math.min(this.view.x - 16, x)), y: floor };
  }

  private contactYaw(): number {
    return this.side > 0 ? 0 : -Math.PI;
  }
  private chaseYaw(): number {
    return this.dir > 0 ? 0 : -Math.PI;
  }

  private routeAt(u: number): Point {
    return elfRoute(this.plan, u, this.start, this.stand, this.bounds, this.view, this.side);
  }
  private measureRoute(): number {
    let previous = this.routeAt(0);
    this.routeLengths[0] = 0;
    for (let i = 1; i <= ROUTE_SAMPLES; i++) {
      const at = this.routeAt(i / ROUTE_SAMPLES);
      this.routeLengths[i] =
        (this.routeLengths[i - 1] ?? 0) + Math.hypot(at.x - previous.x, at.y - previous.y);
      previous = at;
    }
    return this.routeLengths[ROUTE_SAMPLES] ?? 0;
  }
  /** Route parameter at an arc length, so the planned speed profile is the real body speed. */
  private routeParam(distance: number): number {
    for (let i = 0; i < ROUTE_SAMPLES; i++) {
      const a = this.routeLengths[i] ?? 0,
        c = this.routeLengths[i + 1] ?? 0;
      if (distance <= c || i === ROUTE_SAMPLES - 1)
        return (i + (c > a ? clamp((distance - a) / (c - a)) : 0)) / ROUTE_SAMPLES;
    }
    return 1;
  }

  /** Floor point `s` px along the chase from the stand point. */
  private path(s: number): Point {
    return { x: this.stand.x + this.dir * s, y: this.stand.y + this.slope * s };
  }

  /**
   * Forward distance from the elf's feet to the spool centre when its scooping fist reaches the spool,
   * from the scoop pose's shoulder and the arm length, on the sloping floor.
   */
  private catchReach(): number {
    const l = ELF_CATCH_LEAN,
      hip = ELF_HIP - ELF_CATCH_CROUCH;
    const sx = ELF_SHOULDER.x * Math.cos(l) + ELF_SHOULDER.y * Math.sin(l);
    const sy = hip - ELF_SHOULDER.x * Math.sin(l) + ELF_SHOULDER.y * Math.cos(l);
    const m = this.slope,
      r = ELF_ARM[0] + ELF_ARM[1];
    const a = 1 + m * m,
      bq = -2 * (sx + m * (SPOOL_RADIUS - sy)),
      c = sx * sx + (SPOOL_RADIUS - sy) ** 2 - r * r;
    const disc = bq * bq - 4 * a * c;
    return disc > 0 ? (-bq + Math.sqrt(disc)) / (2 * a) : sx;
  }

  /** Where along the floor the spool is caught and how far the elf runs to leave the viewport. */
  private solveChase() {
    const p = this.plan,
      view = this.view,
      stand = this.stand;
    this.reachPx = this.catchReach() * this.scale;
    const xRoom = this.dir > 0 ? view.x - stand.x : stand.x;
    const yRoom = this.slope > 0.05 ? (view.y - stand.y) / this.slope : Infinity;
    const room = Math.min(xRoom, yRoom) - 20;
    const planned = p.rollSpeed * 0.17 * this.fit * (p.snatch - p.slip);
    this.sc = Math.min(planned, Math.max(this.reachPx + 24, 0.8 * room));
    this.ec = this.sc - this.reachPx;
    const margin = 46 * this.scale + ELF_TRAIL * this.fit;
    const exitX = xRoom + margin;
    const exitY =
      this.slope > 0.05
        ? (view.y - stand.y + 58 * this.scale + this.slope * ELF_TRAIL * this.fit) / this.slope
        : Infinity;
    this.exitTotal = Math.min(exitX, exitY);
  }

  /** The spool leaves the fist with the fist's exact world transform. */
  private solveSlip(actor: THREE.Group) {
    this.place(actor, this.plan.slip);
    const held = this.model.spools[this.far].group;
    held.updateWorldMatrix(true, false);
    held.matrixWorld.decompose(this.slipAt, this.slipQuat, this.slipScale);
    this.s0 = (this.slipAt.x - this.stand.x) * this.dir;
    const rest = this.path(this.s0).y - SPOOL_RADIUS * this.slipScale.y;
    this.h0 = rest + this.slipAt.y;
  }

  /** The caught spool keeps the orientation it was rolling with when the fist closes on it. */
  private solveCatch(actor: THREE.Group) {
    const p = this.plan;
    this.place(actor, p.snatch);
    const end = this.model.arms[this.chaser].end;
    end.updateWorldMatrix(true, false);
    end.getWorldQuaternion(this.caught);
    this.caught.invert().multiply(this.freeSpoolQuat(p.snatch, this.turn));
  }

  // ---- spool motion -----------------------------------------------------------------------------

  private spoolTravel(ms: number): number {
    return elfSpoolTravel(this.plan, ms, this.s0, this.sc);
  }
  /** Centre of the loose spool, rolling on its flanges along the floor. */
  spoolCentre(ms: number): Point {
    const at = this.path(this.spoolTravel(ms));
    return {
      x: at.x,
      y: at.y - SPOOL_RADIUS * this.slipScale.y - elfSpoolLift(this.plan, ms, this.h0, this.fit),
    };
  }
  /** Rolling without slipping: the turn matches the distance travelled over the flange radius. */
  private rolled(ms: number): number {
    const distance = (this.spoolTravel(ms) - this.s0) * Math.hypot(1, this.slope);
    return distance / (SPOOL_RADIUS * this.slipScale.y);
  }
  private freeSpoolQuat(ms: number, out: THREE.Quaternion): THREE.Quaternion {
    out.setFromAxisAngle(Z_AXIS, -this.dir * this.rolled(ms));
    return out.multiply(this.slipQuat);
  }
  /** Ribbon left on the spool as it is wound onto the card. */
  private wound(ms: number): number {
    const p = this.plan;
    let paid = 0;
    for (let k = 0; k < p.wraps; k++)
      paid += ease((ms - p.wrapStart - k * p.wrapMs) / (p.wrapMs * 0.5));
    paid += ease((ms - p.tie) / (p.tied - p.tie)) + 0.6 * ease((ms - p.slip) / 1200);
    return 1 - paid / (p.wraps + 1.6);
  }
  /** Spin of the held spool: a fussy twirl on the way, then turning as ribbon pays out. */
  private spin(ms: number): number {
    const p = this.plan;
    const twirl = p.skip ? 0 : Math.PI * 2 * ease(span(ms / p.travel, p.beatAt - 0.05, 0.1));
    return -twirl - (1 - this.wound(ms)) * 9;
  }

  // ---- the actor --------------------------------------------------------------------------------

  private place(actor: THREE.Group, ms: number) {
    const p = this.plan;
    let at = this.stand,
      yaw = this.contactYaw(),
      walked = this.routeLength / this.scale;
    if (ms < p.travel) {
      const t = ms / p.travel;
      const along = elfApproach(p, t) * this.routeLength;
      const u = this.routeParam(along);
      at = this.routeAt(u);
      walked = along / this.scale;
      const ahead = this.routeAt(Math.min(1, u + 0.02)),
        behind = this.routeAt(Math.max(0, u - 0.02));
      const dx = ahead.x - behind.x,
        length = Math.hypot(dx, ahead.y - behind.y);
      let heading = yaw;
      if (length > 0.5) heading = -Math.acos(Math.max(-1, Math.min(1, dx / length)));
      yaw = mix(heading, this.contactYaw(), ease((t - 0.9) / 0.1));
    } else if (ms >= p.slip) {
      const e = elfChase(p, ms, this.ec, this.exitTotal);
      at = this.path(e);
      walked += (e * Math.hypot(1, this.slope)) / this.scale;
      yaw = mix(this.contactYaw(), this.chaseYaw(), ease((ms - p.slip - 60) / 300));
    }
    actor.visible = ms < ELF_DURATION;
    actor.position.set(at.x, -at.y, DEPTH);
    actor.rotation.set(0, yaw, 0);
    actor.scale.setScalar(this.scale);
    elfPose(actor, this.body(ms, walked, yaw));
    actor.updateMatrixWorld(true);
    this.contacts(ms);
    this.orientSpools(ms);
    actor.updateMatrixWorld(true);
  }

  private body(ms: number, walked: number, yaw: number): ElfPoseInput {
    const p = this.plan,
      side = this.side;
    const cycle = (walked / ELF_STRIDE) * Math.PI * 2;
    const t = ms / p.travel;
    let lean = 0.14 + 0.03 * Math.sin(cycle * 2),
      crouch = 0,
      hop = 0,
      bounce = 1,
      lift = 1,
      planted = 1;
    let headTilt = 0.05 * Math.sin(cycle * 2),
      headTurn = 0,
      brow = 0,
      eyes = 1,
      mouth = 0,
      look = 0;
    let free: Point = { x: 2 * Math.sin(cycle), y: -10.8 },
      held: Point = { x: 5.5, y: -6.5 + 0.5 * Math.sin(cycle * 2) };
    let chase: Point | null = null,
      flail: Point | null = null;
    if (ms < p.travel) {
      planted = ease((t - 0.93) / 0.07);
      const beat = pulse(t, p.beatAt - 0.08, 0.16);
      if (p.skip) {
        hop = 4 * Math.sin(Math.PI * span(t, p.beatAt - 0.05, 0.1));
        free = { x: free.x + 2 * beat, y: free.y + 5 * beat };
        held = { x: held.x, y: held.y + 2 * beat };
        headTilt += 0.12 * beat;
      } else {
        // Glances down and twirls the spool tidy without breaking stride.
        held = mixPoint(held, { x: 5, y: 1.5 }, beat);
        headTilt -= 0.4 * beat;
        brow = -0.8 * beat;
      }
      const square = ease((t - 0.9) / 0.1);
      lean = mix(lean, 0.02, square);
      headTilt *= 1 - square;
    } else {
      lean = 0.02;
      headTilt = -0.15 * pulse(ms, p.travel, 260);
      // Draws the ribbon end off the spool, then the near hand carries it to the card.
      const toChest = ease((ms - p.pull) / 140);
      held = mixPoint(held, { x: 4.5, y: -3 }, toChest);
      free = mixPoint(free, { x: 5, y: -2.5 }, ease((ms - p.pull) / 160));
      headTilt -= 0.25 * toChest * (1 - ease((ms - p.attach) / 200));
    }
    if (ms >= p.attach && ms < p.slip) {
      const within = Math.max(0, (ms - p.wrapStart) / p.wrapMs);
      const theta = Math.PI * 2 * within;
      let tug = 0;
      for (let k = 0; k < p.wraps; k++) tug = Math.max(tug, pulse(ms, elfCinch(p, k) - 70, 200));
      const working = ms >= p.wrapStart ? 1 - ease((ms - p.wrapEnd) / 120) : 0;
      const settleIn = ease((ms - p.attach) / 200);
      // Over the top of the card and round behind it, then a sharp tug to cinch each wrap.
      const circle = {
        x: 6 + 3.2 * Math.sin(theta) - 5 * tug,
        y: 2 + 4.2 * Math.cos(theta) - 2.5 * tug,
      };
      held = mixPoint(
        mixPoint({ x: 4.5, y: -3 }, { x: 6, y: 6.2 }, ease((ms - p.attach) / 180)),
        circle,
        ms >= p.wrapStart ? 1 : 0,
      );
      held = mixPoint(held, { x: 2, y: -8 }, ease((ms - p.wrapEnd) / 160));
      lean = mix(lean, 0.04 - 0.16 * tug + 0.18 * ease((ms - p.wrapEnd) / 200), settleIn);
      headTilt = mix(
        headTilt,
        0.1 * Math.cos(theta) * working - 0.18 * ease((ms - p.wrapEnd) / 200),
        settleIn,
      );
      brow = -0.4 * working - 0.5 * ease((ms - p.wrapEnd) / 200);
      mouth = 0.15 * working;
    }
    if (ms >= p.tied && ms < p.slip) {
      const settle = ease((ms - p.tied) / 200);
      let tilt = -0.25 * pulse(ms, p.tied + 320, 260),
        mood = 0.5;
      if (p.crooked) {
        // Spots the lopsided bow: tilts its head to match, frowns, then two fussy pushes.
        const inspect = ease((ms - p.tied) / 200) * (1 - ease((ms - p.tied - 360) / 160));
        tilt =
          -side * ((p.crook * Math.PI) / 180) * 0.6 * inspect - 0.25 * pulse(ms, p.tied + 860, 240);
        mood = mix(0.5, -1, inspect) - 1.2 * pulse(ms, p.tied + 380, 460) * (1 - inspect);
        mouth = 0.35 * Math.max(inspect, pulse(ms, p.tied + 380, 460));
      }
      headTilt = mix(headTilt, tilt, settle);
      brow = mix(brow, mood, settle);
    }
    if (ms >= p.fixed - 200) {
      // Ta-da: arms up, eyes smugly shut, and the spool slips from the raised hand.
      const taDa = ease((ms - p.fixed + 60) / 260);
      held = mixPoint(held, { x: 8.5, y: 8.5 }, taDa);
      free = mixPoint(free, { x: -5, y: 8 }, taDa);
      lean = mix(lean, -0.06, taDa);
      hop = 1.6 * pulse(ms, p.fixed + 100, 300);
      eyes = mix(1, 0.15, taDa);
      brow = mix(brow, 0.6, taDa);
      headTilt = mix(headTilt, 0.12, taDa);
    }
    if (ms >= p.slip) {
      const alarm = ease((ms - p.slip) / 90);
      hop = 2.6 * pulse(ms, p.slip + 30, 280);
      eyes = mix(eyes, 1.35, alarm);
      mouth = alarm;
      brow = mix(brow, 1, alarm);
      planted = 1 - ease((ms - p.grab + 40) / 120);
      const reachOut = ease((ms - p.slip) / 200);
      const chaserIsNear = this.chaser === this.near;
      chase = mixPoint(chaserIsNear ? free : held, { x: 8, y: -2 }, reachOut);
      flail = mixPoint(
        chaserIsNear ? held : free,
        { x: -2 + 3 * Math.sin(ms / 70), y: 7 + 2 * Math.cos(ms / 70) },
        reachOut,
      );
      const towed = ease((ms - p.grab + 80) / 220);
      lean = mix(-0.06, 0.38, towed);
      crouch = 1.5 * towed;
      lift = 1 + 0.5 * towed;
      headTilt = mix(0.12, 0.1 + 0.05 * Math.sin(ms / 55), towed);
      chase = mixPoint(chase, { x: 10, y: -1 }, towed);
      look = 0.6 * Math.sin(ms / 120) * towed;
      flail = mixPoint(
        flail,
        { x: -3 + 4 * Math.sin(ms / 90), y: 4 + 4 * Math.cos(ms / 90) },
        towed,
      );
    }
    if (ms >= p.snatch - 240) {
      const s = ease((ms - p.snatch + 240) / 240),
        r = ease((ms - p.snatch) / 300);
      crouch = mix(mix(1.5, ELF_CATCH_CROUCH, s), 0, r);
      lean = mix(mix(0.38, ELF_CATCH_LEAN, s), p.proud ? 0.04 : 0.32, r);
      bounce = 1 - s + r;
      hop = 0;
      headTilt = mix(mix(headTilt, -0.3, s), p.proud ? 0.1 : -0.15, r);
      mouth = 1 - r;
      eyes = mix(1.35, 1, r);
      brow = mix(1, 0.4, r);
      lift = mix(lift, p.proud ? 1.8 : 1, r);
      if (chase) chase = mixPoint(chase, p.proud ? { x: 11, y: 4.5 } : { x: 4.5, y: -2.5 }, r);
      if (flail && p.proud)
        flail = mixPoint(flail, { x: 3 + 2 * Math.sin(ms / 90), y: 6 + 2 * Math.cos(ms / 90) }, r);
      // The proud elf beams at the viewer as it prances away.
      if (p.proud) headTurn = (-Math.PI / 2 - yaw) * 0.55 * r;
    }
    const near = this.near,
      far = this.far;
    const arms: [Point, Point] = [free, free];
    arms[near] = free;
    arms[far] = held;
    if (chase && flail) {
      arms[this.chaser] = chase;
      arms[this.chaser === 0 ? 1 : 0] = flail;
    }
    const moving = 1 - planted;
    return {
      walked,
      planted,
      lift,
      hop,
      crouch,
      bounce,
      lean,
      headTilt,
      headTurn,
      front: arms[0],
      back: arms[1],
      spools: [
        (far === 0 && ms < p.slip) || (this.chaser === 0 && ms >= p.snatch),
        (far === 1 && ms < p.slip) || (this.chaser === 1 && ms >= p.snatch),
      ],
      wound: this.wound(ms),
      brow,
      eyes: Math.min(
        eyes,
        1 - 0.9 * pulse(ms, p.travel * 0.35, 140) - 0.9 * pulse(ms, p.wrapEnd + 40, 140),
      ),
      mouth,
      look,
      hat:
        0.25 * Math.sin(walked * 0.55) * moving +
        lean * 0.4 +
        0.25 * Math.sin(ms / 60) * pulse(ms, p.slip, 500),
    };
  }

  /** Moves a hand so its fingertip (or fist) meets a screen point exactly at full weight. */
  private handTo(arm: Limb, target: Point, tip: number, w: number) {
    const parent = arm.root.parent;
    if (!parent || w <= 0) return;
    parent.updateWorldMatrix(true, false);
    arm.root.getWorldPosition(this.rootWorld);
    this.scratch.set(target.x, -target.y, this.rootWorld.z);
    parent.worldToLocal(this.scratch);
    const tx = this.scratch.x - arm.root.position.x,
      ty = this.scratch.y - arm.root.position.y;
    const restX = arm.end.position.x,
      restY = arm.end.position.y,
      restA = arm.end.rotation.z;
    reach(arm, tx, ty, -1);
    const a = arm.end.rotation.z;
    const ex = tx - tip * Math.sin(a),
      ey = ty + tip * Math.cos(a);
    reach(arm, mix(restX, ex, w), mix(restY, ey, w), -1, restA + wrapAngle(a - restA) * w);
  }

  private contacts(ms: number) {
    const p = this.plan,
      q = elfCardPose(p, ms, this.side);
    let w = 0;
    if (ms >= p.pull + 160 && ms < p.fixed) {
      w =
        ms < p.attach
          ? ease((ms - p.pull - 160) / (p.attach - p.pull - 160))
          : 1 - ease((ms - p.fixed + 200) / 200);
      this.handTo(this.model.arms[this.near], this.workPoint(ms, q), ELF_TIP, w);
    }
    const chaser = this.model.arms[this.chaser];
    if (ms >= p.slip + 100 && ms < p.grab + 220) {
      w =
        ms < p.grab
          ? ease((ms - p.slip - 100) / (p.grab - p.slip - 100))
          : 1 - ease((ms - p.grab) / 220);
      this.handTo(chaser, this.grabPoint(ms, q), ELF_TIP, w);
    }
    if (ms >= p.snatch - 240 && ms < p.snatch + 260) {
      w = ms <= p.snatch ? ease((ms - p.snatch + 240) / 240) : 1 - ease((ms - p.snatch) / 260);
      this.handTo(chaser, this.spoolCentre(ms), ELF_GRIP, w);
    }
  }

  /** Where the near fingertip works: pinning the ribbon end, tying the bow, then fixing or patting it. */
  workPoint(ms: number, q: CardPose): Point {
    const p = this.plan,
      edge = this.edge(q);
    if (ms < p.tie) return edge;
    const knot = this.bowPoint(ms, q, 0, 0);
    const at = mixPoint(edge, knot, ease((ms - p.tie) / 130));
    if (ms < p.tied) {
      const s = span(ms, p.tie + 130, p.tied - p.tie - 130),
        fade = 1 - ease((s - 0.7) / 0.3);
      return {
        // Two loops drawn back toward the elf, then the knot pulled tight.
        x: at.x - this.side * (1 - Math.cos(Math.PI * 4 * s)) * 1.3 * this.fit * fade,
        y: at.y - Math.sin(Math.PI * 4 * s) * 1.2 * this.fit * fade,
      };
    }
    if (p.crooked)
      return mixPoint(
        knot,
        this.bowPoint(ms, q, -this.side * 0.6, 0.35),
        ease((ms - p.tied - 220) / 160),
      );
    return {
      x: knot.x,
      y: knot.y + 1.4 * this.fit * (pulse(ms, p.tied + 120, 120) + pulse(ms, p.tied + 280, 120)),
    };
  }

  private bowSize(): number {
    return this.bounds.width * 0.12;
  }
  /** A point on the bow in its own units (x across, y up), on the live card. */
  bowPoint(ms: number, q: CardPose, lx: number, ly: number): Point {
    const p = this.plan;
    const centre = onCard(q, this.side > 0 ? p.bowU : 1 - p.bowU, p.waistV, this.bounds);
    const a = ((q.angle + elfBowAngle(p, ms)) * Math.PI) / 180,
      size = this.bowSize();
    const x = lx * size,
      y = -ly * size;
    return {
      x: centre.x + x * Math.cos(a) - y * Math.sin(a),
      y: centre.y + x * Math.sin(a) + y * Math.cos(a),
    };
  }

  /** Card end of the ribbon: the near edge while wrapped, then whipped off onto the floor behind the elf. */
  private ribbonEnd(ms: number, q: CardPose): Point {
    const p = this.plan,
      edge = this.edge(q);
    if (ms < p.unthreadEnd) return edge;
    const tail = this.path(elfChase(p, ms, this.ec, this.exitTotal) - ELF_TRAIL * this.fit);
    return mixPoint(edge, { x: tail.x, y: tail.y - 0.6 }, ease((ms - p.unthreadEnd) / 260));
  }

  /** The closest point of the taut ribbon to the reaching shoulder, within reach. */
  private grabPoint(ms: number, q: CardPose): Point {
    const a = this.ribbonEnd(ms, q),
      c = this.spoolCentre(ms);
    const shoulder = screenOf(this.model.arms[this.chaser].root);
    const dx = c.x - a.x,
      dy = c.y - a.y,
      l2 = dx * dx + dy * dy || 1;
    const t = clamp(((shoulder.x - a.x) * dx + (shoulder.y - a.y) * dy) / l2);
    const on = { x: a.x + dx * t, y: a.y + dy * t };
    const ox = on.x - shoulder.x,
      oy = on.y - shoulder.y,
      d = Math.hypot(ox, oy),
      max = 0.94 * (ELF_ARM[0] + ELF_ARM[1] + ELF_TIP) * this.scale;
    return d > max ? { x: shoulder.x + (ox / d) * max, y: shoulder.y + (oy / d) * max } : on;
  }

  private orientSpools(ms: number) {
    const p = this.plan;
    this.model.spools.forEach((spool, i) => {
      if (i === this.far && ms <= p.slip)
        spool.group.quaternion.setFromAxisAngle(Z_AXIS, this.spin(ms));
      else if (i === this.chaser && ms >= p.snatch) spool.group.quaternion.copy(this.caught);
      else spool.group.quaternion.identity();
    });
  }

  // ---- props and overlays -------------------------------------------------------------------------

  private updateSpool(ms: number) {
    const p = this.plan;
    const shown = ms >= p.slip && ms < p.snatch && ms < ELF_DURATION;
    this.spool.group.visible = shown;
    if (!shown) return;
    const c = this.spoolCentre(ms);
    this.spool.group.position.set(c.x, -c.y, this.slipAt.z);
    this.freeSpoolQuat(ms, this.spool.group.quaternion);
    this.spool.group.scale.copy(this.slipScale);
    setWound(this.spool, this.wound(ms));
    this.spool.group.updateMatrixWorld(true);
  }

  private updateStrands(ms: number, q: CardPose) {
    const p = this.plan,
      b = this.bounds;
    const nearU = this.side > 0 ? -0.012 : 1.012,
      farU = this.side > 0 ? 1.012 : -0.012;
    const width = 0.026 * b.height * q.sy;
    this.strands.forEach((strand, k) => {
      const grow = elfStrand(p, ms, k);
      strand.visible = grow > 0.002 && ms < ELF_DURATION;
      if (!strand.visible) return;
      const a = onCard(q, nearU, p.waistV, b),
        far = onCard(q, farU, elfStrandV(p, k), b);
      const end = mixPoint(a, far, grow);
      setStrip(
        strand.geometry,
        1,
        (t, out) => out.set(mix(a.x, end.x, t), -mix(a.y, end.y, t), CARD_Z + 0.1 * k),
        () => width,
      );
    });
  }

  /** Fold lines where the cinched ribbon bites into both edges of the card's waist. */
  private updateCreases(ms: number, q: CardPose) {
    const p = this.plan,
      b = this.bounds;
    const tight = clamp(elfTightness(p, ms) / Math.max(1, p.wraps));
    const corners = [
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 1],
    ] as const;
    this.creases.forEach((crease, i) => {
      const [u, s] = corners[i] ?? [0, 1];
      crease.visible = tight > 0.01 && ms < ELF_DURATION;
      if (!crease.visible) return;
      const inward = u ? -1 : 1;
      const from = onCard(q, u + inward * 0.005, p.waistV + s * 0.03, b),
        to = onCard(
          q,
          u + inward * (0.03 + 0.04 * tight),
          p.waistV + s * (0.045 + 0.035 * tight),
          b,
        );
      setStrip(
        crease.geometry,
        1,
        (t, out) => out.set(mix(from.x, to.x, t), -mix(from.y, to.y, t), CARD_Z - 0.2),
        () => 0.9 * this.fit,
      );
      crease.material.opacity = 0.35 * tight * Math.min(1, p.squeeze);
    });
  }

  private updateBow(ms: number, q: CardPose) {
    const p = this.plan,
      grow = elfBow(p, ms);
    const shown = grow.knot > 0.001 && ms < ELF_DURATION;
    this.bow.group.visible = shown;
    if (!shown) return;
    const centre = this.bowPoint(ms, q, 0, 0);
    this.bow.group.position.set(centre.x, -centre.y, CARD_Z + 0.6);
    this.bow.group.rotation.z = cardTurn(q) - (elfBowAngle(p, ms) * Math.PI) / 180;
    this.bow.group.scale.setScalar(this.bowSize());
    const [first, second] = this.side > 0 ? this.bow.loops : [this.bow.loops[1], this.bow.loops[0]];
    first.scale.setScalar(Math.max(0.001, grow.first));
    second.scale.setScalar(Math.max(0.001, grow.second));
    first.visible = grow.first > 0.001;
    second.visible = grow.second > 0.001;
    for (const tail of this.bow.tails) {
      tail.scale.set(1, Math.max(0.001, grow.tails), 1);
      tail.visible = grow.tails > 0.001;
    }
    this.bow.knot.scale.setScalar(Math.max(0.001, grow.knot));
  }

  /**
   * The ribbon runs from the wound ribbon on the spool to the card's near edge; once the elf grabs it,
   * through its fingertip; once off the card, its loose end drags along the floor behind.
   */
  private updateRibbon(ms: number, q: CardPose) {
    const p = this.plan;
    const visible = ms >= p.pull + 80 && ms < ELF_DURATION;
    this.ribbon.visible = visible;
    if (!visible) return;
    let centre: Point, z: number;
    if (ms < p.slip || ms >= p.snatch) {
      const held = this.model.spools[ms < p.slip ? this.far : this.chaser].group;
      centre = screenOf(held);
      held.getWorldPosition(this.scratch);
      z = this.scratch.z;
    } else {
      centre = this.spoolCentre(ms);
      z = this.slipAt.z;
    }
    const end = ms < p.attach ? screenOf(this.model.tips[this.near]) : this.ribbonEnd(ms, q);
    const endZ = ms < p.attach ? DEPTH + 2 : ms < p.unthreadEnd ? CARD_Z + 0.4 : DEPTH - 4;
    const tip = screenOf(this.model.tips[this.chaser]);
    const dx = end.x - centre.x,
      dy = end.y - centre.y,
      l2 = dx * dx + dy * dy || 1;
    const along = Math.max(
      0.1,
      Math.min(0.9, ((tip.x - centre.x) * dx + (tip.y - centre.y) * dy) / l2),
    );
    const lambda = ms < p.slip ? 0.5 : mix(0.5, along, ease((ms - p.slip) / 150));
    const held =
      ms < p.grab ? 0 : ms < p.snatch ? ease((ms - p.grab) / 100) : 1 - ease((ms - p.snatch) / 200);
    const mid = mixPoint({ x: centre.x + dx * lambda, y: centre.y + dy * lambda }, tip, held);
    const next = held > 0.5 ? mid : end;
    const nl = Math.hypot(next.x - centre.x, next.y - centre.y) || 1;
    const radius = SPOOL_WOUND * (0.55 + 0.45 * clamp(this.wound(ms))) * this.scale * 0.9;
    const rim = {
      x: centre.x + ((next.x - centre.x) / nl) * radius,
      y: centre.y + ((next.y - centre.y) / nl) * radius,
    };
    let tug = 0;
    for (let k = 0; k < p.wraps; k++) tug = Math.max(tug, pulse(ms, elfCinch(p, k) - 70, 200));
    const slack = ms < p.attach ? 3 : mix(3, 5, ease((ms - p.attach) / 200));
    const taut = Math.max(tug, ease((ms - p.slip - 150) / 250));
    const sag = (slack * (1 - 0.85 * taut) + 0.4) * this.fit;
    const l1 = Math.hypot(mid.x - rim.x, mid.y - rim.y),
      l2b = Math.hypot(end.x - mid.x, end.y - mid.y),
      split = l1 / (l1 + l2b || 1);
    const width = 2.4 * this.fit;
    setStrip(
      this.ribbon.geometry,
      RIBBON_SEGMENTS,
      (t, out) => {
        const single = hang(rim, end, sag, t);
        const double =
          t < split
            ? hang(rim, mid, (sag * split) / 2, split > 0 ? t / split : 0)
            : hang(mid, end, (sag * (1 - split)) / 2, split < 1 ? (t - split) / (1 - split) : 1);
        const at = mixPoint(single, double, held);
        // Once caught, the trailing ribbon runs behind the elf rather than across it.
        out.set(at.x, -at.y, ms >= p.snatch ? DEPTH - 8 * this.scale : mix(z, endZ, t));
      },
      () => width,
    );
  }
}
