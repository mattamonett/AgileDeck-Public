import * as THREE from 'three';
import { type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardUV,
  cardTurn,
  clamp,
  ease,
  glow,
  lowestWorldY,
  lowestWorldYPruned,
  mix,
  onCard,
  part,
  pulse,
  screenOf,
  sideOf,
  span,
  stripGeometry,
  type CardPose,
  type CharacterRoutine,
  type Side,
} from '../../kit';
import {
  BEAR_DURATION,
  BEAR_PIE_RADIUS,
  PRINT_TRAVEL,
  bearBitesTaken,
  bearCardPose,
  bearExitPoint,
  bearExitProgress,
  bearFloor,
  bearFrames,
  bearLandingPoint,
  bearRoute,
  bearScale,
  bearSniffing,
  bearU,
  type BearPlan,
} from './bear-choreography';
import {
  BEAR_MOUTH,
  BEAR_STRIDE,
  BEAR_WALK_HIP,
  bearModel,
  bearPose,
  bearReachPaw,
  bearShoulder,
  type BearModel,
  type BearPoseInput,
  type BearReach,
} from './bear-model';
import { BearCrumbs, BearPieWisps, BearSleepZs } from './bear-effects';
import { BearHoneyPrints } from './bear-prints';
import { gaitStep, mixKey, mixReach, sitHip, type BearKey } from './bear-keys';
import { pieStage } from './bear-pie';

const DEPTH = 172;
const CARD_Z = DEPTH - 13;
/** How far the held pie's face tips up toward the bear's mouth. */
const HOLD_TILT = 0.55;
/** The sitting bear turns three quarters toward the viewer. */
const SIT_TURN = 1;
/** Grip points sit on the pie's upper rim so the paws hold the crust, not the floor beneath it. */
const GRIP_Z = 1.1;
const FLOOR_TILT = -Math.PI / 2 + 0.5;
/** Head pitch at the moment of a bite, used to aim the head turn at the bitten spot. */
const BITE_PITCH = -0.42;

export interface BearLayout {
  readonly start: Point;
  readonly b: TargetBounds;
  readonly view: Point;
  readonly side: Side;
  readonly scale: number;
  readonly stand: Point;
  readonly floor: number;
}

/** A paw destination; `pie` targets follow the pie and are resolved once the pie is placed. */
interface Waypoint {
  readonly at: number;
  readonly move: number;
  readonly arc: number;
  readonly press: number;
  readonly pie: boolean;
  readonly where: (ms: number) => BearReach;
}
interface Measured {
  readonly key: string;
  readonly prints: Map<number, Point | null>;
  readonly births: Map<number, Point>;
}
export interface BearFrame {
  readonly card: CardPose;
  readonly pie: THREE.Matrix4 | null;
}

export class BearTrick implements CharacterRoutine {
  readonly object = new THREE.Group();
  readonly plan: BearPlan;
  readonly duration: number;
  readonly pie = new THREE.Group();
  private readonly model: BearModel;
  private readonly actor: THREE.Group;
  private readonly stages: THREE.Group[] = [];
  private readonly prints: BearHoneyPrints;
  private readonly crumbs: BearCrumbs;
  private readonly zs: BearSleepZs;
  private readonly wisps: BearPieWisps;
  private readonly drip = part(
    this.object,
    'bear-honey-drip',
    stripGeometry(8),
    glow(0xe39a17, 0.85),
  );
  private readonly looks = new Map<
    THREE.Material,
    { readonly opacity: number; readonly transparent: boolean }
  >();
  private readonly holdTurn = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, Math.PI / 2, HOLD_TILT, 'ZYX'),
  );
  private pieWorld: THREE.Matrix4 | null = null;
  private measured: Measured | null = null;
  /** Depth of the whole pie's lowest vertex below its centre when it lies tilted on the floor. */
  private readonly pieUnder: number;

  constructor(actor: THREE.Group) {
    this.actor = actor;
    this.model = bearModel(actor);
    this.plan = this.model.plan;
    this.duration = BEAR_DURATION * this.plan.pace;
    this.object.name = 'bear-feast';
    const p = this.plan;
    this.pie.name = 'bear-pie';
    this.pie.matrixAutoUpdate = false;
    this.object.add(this.pie);
    for (let s = 0; s < p.bites; s++)
      this.stages.push(pieStage(this.pie, s, p.biteAngles.slice(0, s)));
    this.pieUnder = this.measurePieUnder();
    this.crumbs = new BearCrumbs(this.object, p, DEPTH);
    this.prints = new BearHoneyPrints(this.object, p, this.drip, CARD_Z);
    this.zs = new BearSleepZs(this.object, p, this.model.crown, DEPTH);
    this.wisps = new BearPieWisps(this.object, p, CARD_Z);
    actor.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        if (m instanceof THREE.Material)
          this.looks.set(m, { opacity: m.opacity, transparent: m.transparent });
    });
  }

  private measurePieUnder(): number {
    const probe = new THREE.Group();
    probe.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), FLOOR_TILT);
    const whole = this.stages[0];
    if (!whole) return 0;
    probe.add(whole.clone());
    const under = -lowestWorldY(probe);
    probe.clear();
    return under;
  }

  cardAnimation(facing: number) {
    return bearFrames(this.plan, facing);
  }

  layout(start: Point, b: TargetBounds, view: Point, facing: number): BearLayout {
    const side = sideOf(facing);
    // The route starts a little below the sender so the bear's body, not its feet, leaves from it.
    return {
      start: { x: start.x, y: start.y + 14 },
      b,
      view,
      side,
      scale: bearScale(b),
      stand: bearLandingPoint(this.plan, b, view, side),
      floor: bearFloor(b),
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
    const L = this.layout(start, b, view, facing);
    this.object.visible = ms < BEAR_DURATION;
    this.object.position.set(0, 0, 0);
    // Measuring poses the shared actor at other moments, so it happens before this frame's pose.
    const measured = this.contacts(L);
    const pressed = p.prints.map((print, k) =>
      ms >= print.at ? this.pressed(measured, k, L) : null,
    );
    const births = p.biteTimes.map((at, k) => (ms >= at ? this.birth(measured, k, L) : null));
    const frame = this.stage(ms, L);
    actor.visible = ms < BEAR_DURATION && !(p.ending === 'waddle' && ms >= p.exitEnd);
    const fade = 1 - ease((ms - p.cleanup) / 600);
    this.fadeActor(p.ending === 'waddle' ? 1 : fade);
    this.updatePie(ms, frame);
    this.wisps.update(ms, L, frame.pie);
    this.prints.update(ms, L, frame.card, pressed, fade);
    this.crumbs.update(ms, L, births, fade);
    this.zs.update(ms, L, fade);
  }

  /**
   * Contacts measured on the posed model depend only on the plan and the layout, so they are kept
   * per layout (as the bouquet keeps its petal births) and re-measured whenever the layout changes.
   */
  private contacts(L: BearLayout): Measured {
    const key = [
      L.start.x,
      L.start.y,
      L.b.left,
      L.b.top,
      L.b.width,
      L.b.height,
      L.view.x,
      L.view.y,
      L.side,
    ].join(':');
    if (this.measured?.key !== key) this.measured = { key, prints: new Map(), births: new Map() };
    return this.measured;
  }
  private pressed(m: Measured, k: number, L: BearLayout): Point | null {
    if (!m.prints.has(k)) m.prints.set(k, this.pressedAt(k, L));
    return m.prints.get(k) ?? null;
  }
  private birth(m: Measured, k: number, L: BearLayout): Point | null {
    const at = this.plan.biteTimes[k];
    if (at === undefined) return null;
    if (!m.births.has(k)) m.births.set(k, this.markerAt(at, L, this.model.mouth));
    return m.births.get(k) ?? null;
  }

  /** Screen position of a model marker with the actor posed at canonical time `ms`. */
  markerAt(ms: number, L: BearLayout, marker: THREE.Object3D): Point {
    this.stage(ms, L);
    return screenOf(marker);
  }
  /** Card-normalized spot where the real paw sole pressed print `k`, so the print rides the card. */
  pressedAt(k: number, L: BearLayout): Point | null {
    const p = this.plan,
      print = p.prints[k];
    if (!print) return null;
    const at = this.markerAt(print.at, L, this.model.soles[this.armFor(print.paw, L.side)]);
    return cardUV(bearCardPose(p, print.at, L.side), at, L.b);
  }
  /** Arm index for a paw role: 0 is the paw nearest the viewer. */
  armFor(role: 0 | 1, side: Side): 0 | 1 {
    const near: 0 | 1 = side > 0 ? 0 : 1;
    if (role === 0) return near;
    return near ? 0 : 1;
  }

  /** Poses the actor for canonical time `ms` and returns the card and pie state for that moment. */
  stage(ms: number, L: BearLayout): BearFrame {
    const p = this.plan,
      actor = this.actor;
    const card = bearCardPose(p, ms, L.side);
    const root = this.rootAt(ms, L);
    // Measuring needs the whole actor; the caller decides afterwards whether it is shown.
    actor.visible = true;
    actor.position.set(root.point.x, -root.point.y, DEPTH);
    actor.rotation.set(0, root.yaw, 0);
    actor.scale.setScalar(L.scale);
    actor.updateMatrixWorld(true);
    const key = this.key(ms, L, root.walked);
    const pose: BearPoseInput = {
      ...key,
      walked: root.walked,
      planted: this.planted(ms),
      paws: [null, null],
      press: [0, 0],
    };
    const tracks = [this.track(0, L, pose), this.track(1, L, pose)] as const;
    const early = [this.follow(tracks[0], ms, false), this.follow(tracks[1], ms, false)] as const;
    bearPose(actor, {
      ...pose,
      paws: [early[0].reach, early[1].reach],
      press: [early[0].press, early[1].press],
    });
    const seat = this.seat(ms);
    if (seat > 0) {
      // Rest the seat (rump, heels, belly or chin) on the floor by its real transformed geometry.
      actor.updateMatrixWorld(true);
      actor.position.y += seat * (-L.floor - lowestWorldYPruned(actor));
    }
    actor.updateMatrixWorld(true);
    this.pieWorld = this.pieMatrix(ms, L, card, pose);
    tracks.forEach((track, arm) => {
      const late = this.follow(track, ms, true);
      bearReachPaw(actor, arm ? 1 : 0, pose, late.reach, late.press);
    });
    actor.updateMatrixWorld(true);
    return { card, pie: this.pieWorld };
  }

  /** Root placement: the arc-length paced approach, the stand point, and the sleepy walk off. */
  private rootAt(ms: number, L: BearLayout): { point: Point; yaw: number; walked: number } {
    const p = this.plan,
      side = L.side;
    const contact = side > 0 ? 0 : -Math.PI,
      sit = side > 0 ? -SIT_TURN : -Math.PI + SIT_TURN;
    const facing = (dx: number, dy: number, fallback: number) => {
      const length = Math.hypot(dx, dy);
      return length > 0.01 ? -Math.acos(Math.max(-1, Math.min(1, dx / length))) : fallback;
    };
    if (ms < p.travel) {
      const r = bearRoute(p, ms, L.start, L.stand, L.b, L.view, side);
      const yaw = mix(
        facing(r.heading.x, r.heading.y, contact),
        contact,
        ease((ms / p.travel - 0.86) / 0.14),
      );
      return { point: r.point, yaw, walked: r.walked / L.scale };
    }
    const parked = bearRoute(p, p.travel, L.start, L.stand, L.b, L.view, side).walked / L.scale;
    // Turn toward the viewer once the pie is nearly in both paws.
    let yaw = mix(contact, sit, ease((ms - p.snap - 240) / 480));
    if (p.ending !== 'waddle' || ms < p.doze) return { point: L.stand, yaw, walked: parked };
    const exit = bearExitPoint(p, L.b, L.view, side);
    const dx = exit.x - L.stand.x,
      dy = exit.y - L.stand.y;
    yaw = mix(yaw, facing(dx, dy, contact), ease((ms - p.doze - 100) / (p.settle - p.doze + 150)));
    const e = bearExitProgress(p, ms);
    return {
      point: { x: mix(L.stand.x, exit.x, e), y: mix(L.stand.y, exit.y, e) },
      yaw,
      walked: parked + (Math.hypot(dx, dy) * e) / L.scale,
    };
  }

  /** Feet come down for the arrival and lift again only when the sleepy walk off starts. */
  private planted(ms: number): number {
    const p = this.plan;
    if (ms < p.travel) return ease((ms / p.travel - 0.9) / 0.1);
    if (p.ending === 'waddle' && ms >= p.settle) return 1 - ease((ms - p.settle) / 200);
    return 1;
  }
  /** How strongly the measured seat is pressed onto the floor. */
  private seat(ms: number): number {
    const p = this.plan;
    const down = ease((ms - p.snap) / (p.seated - p.snap));
    return p.ending === 'waddle' ? down * (1 - ease((ms - p.doze) / (p.settle - p.doze))) : down;
  }
  private gaitFeet(walked: number, planted: number): [BearReach, BearReach] {
    const sole = this.model.hindSole;
    const left = gaitStep(walked, 0),
      right = gaitStep(walked, 0.5);
    return [
      { x: left.x + 0.8, y: sole + left.y * (1 - planted), angle: 0 },
      { x: right.x - 0.8, y: sole + right.y * (1 - planted), angle: 0 },
    ];
  }
  private blink(ms: number): number {
    const t = (ms + this.plan.phase * 500) % 2900;
    return 1 - pulse(t, 2700, 160);
  }

  /** Body, head and hind feet for this moment, blended through the performance's beats. */
  private key(ms: number, L: BearLayout, walked: number): BearKey {
    const p = this.plan;
    const t = ms / p.travel;
    const moving = ms < p.travel ? 1 - ease((t - 0.9) / 0.1) : 0;
    const phase = (walked / BEAR_STRIDE) * Math.PI * 2;
    const sniff = ms < p.travel ? bearSniffing(p, t) : 0;
    const parked = this.gaitFeet(walked, 1);
    let k: BearKey = {
      hip: { x: 0, y: BEAR_WALK_HIP - 0.8 * Math.abs(Math.sin(phase)) * moving },
      pitch: 0.035 * Math.sin(phase) * moving,
      roll: 0.08 * Math.sin(phase) * moving,
      headPitch: -0.55 * sniff + 0.05 * Math.sin(phase * 0.5) * moving,
      headTurn: 0,
      headTilt: 0.05 * Math.sin(phase * 0.5) * moving,
      jaw: 0,
      eyes: this.blink(ms),
      cheeks: 0,
      ears: 0.25 + 0.2 * sniff,
      sniff: sniff * Math.abs(Math.sin(ms / 45)),
      tail: Math.sin(ms / 110) * 0.4,
      breath: 0,
      feet: ms < p.travel ? this.gaitFeet(walked, this.planted(ms)) : parked,
    };
    // Arrival: the nose lifts toward the pie and twitches.
    const smell = ease((ms - p.arrive) / 260) * (1 - ease((ms - p.rear) / 200));
    k = {
      ...k,
      headPitch: mix(k.headPitch, p.find === 'card' ? 0.3 : -0.18, ease((ms - p.arrive) / 260)),
      sniff: Math.max(k.sniff, smell * Math.abs(Math.sin(ms / 40))),
      ears: mix(k.ears, 0.5, ease((ms - p.arrive) / 260)),
    };
    if (ms >= p.rear - 120) k = this.rearing(ms, L, k);
    if (p.find === 'edge' && ms >= p.drop) k = this.findUnderEdge(ms, k);
    if (ms >= p.snap) k = this.sitting(ms, k, walked, parked);
    return k;
  }

  /** Body pose that lets the paws reach a point on the card at screen height `y`. */
  private pressPose(y: number, L: BearLayout, k: BearKey): BearKey {
    const hn = clamp(((L.floor - y) / L.scale - 12) / 28);
    return {
      ...k,
      hip: { x: mix(0.8, -1.2, hn), y: mix(16.5, 18.5, hn) },
      pitch: mix(0.85, 1.3, hn),
      roll: 0,
      headPitch: mix(-0.1, 0.12, hn),
      ears: 0.55,
      jaw: 0.22,
    };
  }
  private printPoint(k: number, L: BearLayout, q: CardPose): Point {
    const print = this.plan.prints[k];
    if (!print) return L.stand;
    return onCard(q, bearU(L.side, print.depth), print.v, L.b);
  }
  private piePoint(L: BearLayout, q: CardPose): Point {
    return onCard(q, bearU(L.side, this.plan.pieDepth), this.plan.pieV, L.b);
  }

  /** Rearing up and climbing the card, one sticky press at a time. */
  private rearing(ms: number, L: BearLayout, before: BearKey): BearKey {
    const p = this.plan;
    const q = bearCardPose(p, ms, L.side);
    if (!p.prints[0]) return before;
    let k = mixKey(
      before,
      this.pressPose(this.printPoint(0, L, q).y, L, before),
      ease((ms - p.rear) / 380),
    );
    // Anticipation: a little crouch before pushing up onto the hind legs.
    k = {
      ...k,
      hip: { x: k.hip.x, y: k.hip.y - 2.4 * Math.sin(Math.PI * span(ms, p.rear - 120, 300)) },
    };
    for (let i = 1; i < p.prints.length; i++) {
      const print = p.prints[i];
      if (!print || ms < print.at - PRINT_TRAVEL) break;
      const prev = this.pressPose(this.printPoint(i - 1, L, q).y, L, before),
        next = this.pressPose(this.printPoint(i, L, q).y, L, before);
      k = mixKey(prev, next, ease((ms - print.at + PRINT_TRAVEL) / PRINT_TRAVEL));
    }
    let push = 0;
    for (const print of p.prints)
      push = Math.max(push, Math.sin(Math.PI * span(ms, print.at - 40, 200)));
    k = {
      ...k,
      hip: { x: k.hip.x + 0.7 * push, y: k.hip.y },
      headPitch: k.headPitch - 0.06 * push,
      tail: Math.sin(ms / 85) * 0.55,
    };
    if (p.find === 'card' && ms >= p.grab - 300) {
      // Down to the pie, then lean back against the sticky pull.
      const grab = this.pressPose(this.piePoint(L, q).y, L, before);
      const lean = { x: grab.hip.x + 3, y: grab.hip.y - 0.5 };
      k = mixKey(
        k,
        { ...grab, hip: lean, pitch: grab.pitch - 0.12, headPitch: -0.28, jaw: 0.3, ears: 0.6 },
        ease((ms - p.grab + 300) / 300),
      );
      const stretch = ease((ms - p.lift) / (p.snap - p.lift));
      k = {
        ...k,
        pitch: k.pitch + 0.14 * stretch,
        hip: { x: k.hip.x - 1.2 * stretch, y: k.hip.y },
      };
    }
    return k;
  }

  /** Edge find: down on all fours, peer under the card, hook the pie out and reach for it. */
  private findUnderEdge(ms: number, before: BearKey): BearKey {
    const p = this.plan;
    const crouch: BearKey = {
      ...before,
      hip: { x: 1.5, y: 17.5 },
      pitch: -0.06,
      roll: 0,
      headPitch: -0.38,
      ears: 0.6,
      jaw: 0,
    };
    let k = mixKey(before, crouch, ease((ms - p.drop) / 420));
    const lean: BearKey = {
      ...crouch,
      hip: { x: 4, y: 16.5 },
      pitch: -0.18,
      headPitch: -0.42,
      headTilt: 0.12,
    };
    k = mixKey(k, lean, ease((ms - p.hook + 300) / 300));
    const pulled: BearKey = {
      ...lean,
      hip: { x: 0.5, y: 16.5 },
      pitch: -0.05,
      headPitch: -0.3,
      headTilt: 0,
      jaw: 0.25,
    };
    k = mixKey(k, pulled, ease((ms - p.hook) / (p.dragged - p.hook)));
    const reach: BearKey = {
      ...pulled,
      hip: { x: -0.5, y: 15.5 },
      pitch: 0.06,
      headPitch: -0.3,
      ears: 0.7,
      jaw: 0.3,
    };
    return mixKey(k, reach, ease((ms - p.dragged) / (p.grab - p.dragged)));
  }

  /** Sitting with the pie: bites, chewing, the yawn, drooping and the chosen ending. */
  private sitting(
    ms: number,
    before: BearKey,
    walked: number,
    parked: [BearReach, BearReach],
  ): BearKey {
    const p = this.plan,
      m = this.model;
    const pitch = 1.2;
    const sit: BearKey = {
      ...before,
      hip: { x: -3, y: sitHip(pitch) },
      pitch,
      roll: 0,
      headPitch: -0.12,
      headTurn: 0,
      headTilt: 0,
      jaw: 0,
      eyes: this.blink(ms),
      ears: 0.3,
      sniff: 0,
      tail: 0,
      breath: 0.3 * Math.sin(ms / 600),
      feet: [
        { x: 8.5, y: m.hindHeel, angle: Math.PI / 2 },
        { x: 7.5, y: m.hindHeel, angle: Math.PI / 2 },
      ],
    };
    let k = mixKey(before, sit, ease((ms - p.snap) / (p.seated - p.snap)), 3);
    // Bites: raise the pie, turn the head to the bite, snap the jaw shut on the rim, then chew.
    let headPitch = k.headPitch,
      headTurn = k.headTurn,
      jaw = k.jaw,
      eyes = k.eyes,
      ears = k.ears;
    p.biteTimes.forEach((at, i) => {
      const lift = this.biteLift(ms, i);
      headPitch -= 0.3 * lift;
      headTurn += this.biteTurn(i) * lift;
      jaw = Math.max(jaw, 0.75 * ease((ms - at + 260) / 200) * (1 - ease((ms - at + 45) / 45)));
      const chew = span(ms, at + 40, 110 + p.chews * 110);
      if (chew > 0 && chew < 1 && i < p.bites - 1) {
        jaw = Math.max(jaw, 0.3 * Math.abs(Math.sin(chew * Math.PI * p.chews)));
        eyes = Math.min(eyes, 0.55);
        ears += 0.15 * Math.sin(chew * Math.PI * p.chews * 2);
      }
    });
    const last = p.biteTimes.at(-1) ?? p.seated;
    // The last of the pie is stuffed in whole: chubby cheeks, a long chew, a gulp and a happy squint.
    const cheeks = ease((ms - last) / 150) * (1 - ease((ms - p.swallow + 60) / 200));
    const stuffed = span(ms, last + 40, p.swallow - last - 40);
    if (stuffed > 0 && stuffed < 1)
      jaw = Math.max(jaw, 0.22 * Math.abs(Math.sin(stuffed * Math.PI * 4)));
    headPitch += 0.14 * pulse(ms, p.swallow - 140, 300);
    if (ms >= p.swallow - 200 && ms < p.yawn)
      eyes = Math.min(eyes, 0.08 + 0.92 * ease((ms - p.swallow - 200) / 160));
    k = {
      ...k,
      headPitch,
      headTurn,
      jaw,
      eyes,
      ears,
      cheeks,
      tail: 0.5 * Math.sin(ms / 90) * pulse(ms, p.swallow - 200, 600),
    };
    // A big yawn.
    const yawn = ease((ms - p.yawn) / 280) * (1 - ease((ms - p.yawn - 560) / 260));
    k = {
      ...k,
      headPitch: k.headPitch + 0.45 * yawn,
      jaw: Math.max(k.jaw, 1.3 * yawn),
      eyes: mix(k.eyes, 0, yawn),
      ears: k.ears - 0.6 * yawn,
      pitch: k.pitch + 0.08 * yawn,
    };
    // Heavy lids, nodding off and jerking awake.
    if (ms >= p.droop - 200) {
      const heavy = ease((ms - p.droop + 200) / 300);
      let nod = 0,
        lids = 0.4 - 0.15 * Math.sin(ms / 230) * heavy;
      for (let n = 0; n < p.nods; n++) {
        const at = p.droop + n * 360;
        const sink = ease((ms - at) / 260) * (1 - ease((ms - at - 260) / 90));
        nod = Math.max(nod, sink);
        lids = Math.min(lids, mix(0.4, 0.05, sink));
      }
      k = {
        ...k,
        headPitch: k.headPitch - 0.4 * nod,
        eyes: mix(k.eyes, lids, heavy),
        ears: k.ears - 0.25 * heavy,
      };
    }
    return ms >= p.doze ? this.ending(ms, k, walked, parked) : k;
  }

  private ending(
    ms: number,
    before: BearKey,
    walked: number,
    parked: [BearReach, BearReach],
  ): BearKey {
    const p = this.plan,
      m = this.model;
    const t = ease((ms - p.doze) / (p.settle - p.doze));
    const snore = Math.sin((ms - p.doze) / 520);
    if (p.ending === 'sit') {
      const slump: BearKey = {
        ...before,
        hip: { x: -2.4, y: sitHip(1.05) },
        pitch: 1.05,
        headPitch: -0.3,
        headTurn: 0,
        headTilt: 0.3,
        eyes: 0,
        ears: -0.15,
        jaw: 0.1,
        breath: 0.9 * snore,
      };
      return mixKey(before, slump, t);
    }
    if (p.ending === 'curl') {
      const lie: BearKey = {
        ...before,
        hip: { x: 1.5, y: 11 },
        pitch: -0.03,
        headPitch: -0.14,
        headTurn: 0,
        headTilt: 0.1,
        eyes: 0,
        ears: -0.1,
        jaw: 0,
        breath: 0.9 * snore,
        feet: [
          { x: 4.5, y: m.hindSole, angle: 0 },
          { x: 3.5, y: m.hindSole, angle: 0 },
        ],
      };
      return mixKey(before, lie, t, 3);
    }
    // Waddle: back up onto all fours, then plod off half asleep.
    const stand: BearKey = {
      ...before,
      hip: { x: 0, y: BEAR_WALK_HIP },
      pitch: 0,
      headPitch: -0.22,
      headTurn: 0,
      eyes: 0.35,
      ears: -0.1,
      jaw: 0,
      cheeks: 0,
      feet: parked,
    };
    const k = mixKey(before, stand, t, 3);
    if (ms < p.settle) return k;
    const going = ease((ms - p.settle) / 300);
    const sway = Math.sin(((walked / BEAR_STRIDE) * Math.PI * 2) / 2);
    const yawn = pulse(ms, p.settle + 650, 600);
    return {
      ...k,
      hip: { x: 0, y: BEAR_WALK_HIP - 0.9 * Math.abs(sway) * going },
      roll: 0.12 * sway * going,
      headPitch: -0.22 + 0.06 * sway + 0.3 * yawn,
      headTilt: 0.12 * sway * going,
      jaw: 0.9 * yawn,
      eyes: 0.35 * (1 - yawn) + 0.05,
      feet: this.gaitFeet(walked, this.planted(ms)),
    };
  }

  /** 0..1: how far the pie is raised to the mouth for bite `i` (exactly 1 at the bite). */
  private biteLift(ms: number, i: number): number {
    const at = this.plan.biteTimes[i] ?? 0;
    const last = i === this.plan.bites - 1;
    return ease((ms - at + 260) / 260) * (last ? 1 : 1 - ease((ms - at - 80) / 240));
  }
  /** Head turn that brings the mouth sideways onto bite `i`'s spot on the rim. */
  private biteTurn(i: number): number {
    const a = this.plan.biteAngles[i] ?? Math.PI / 2;
    const out = BEAR_MOUTH.x * Math.cos(BITE_PITCH) - BEAR_MOUTH.y * Math.sin(BITE_PITCH);
    return Math.asin(Math.max(-0.8, Math.min(0.8, (Math.cos(a) * BEAR_PIE_RADIUS) / out)));
  }

  /** World matrix of the pie: on the card or floor, carried, raised to each bite, then eaten. */
  private pieMatrix(
    ms: number,
    L: BearLayout,
    q: CardPose,
    pose: BearPoseInput,
  ): THREE.Matrix4 | null {
    const p = this.plan;
    if (ms >= (p.biteTimes.at(-1) ?? Infinity)) return null;
    const source = p.find === 'card' ? this.cardPie(ms, L, q) : this.floorPie(ms, L);
    const w = ease((ms - p.snap) / 420);
    if (w <= 0) return source;
    const hold = this.holdMatrix(ms, pose);
    if (w >= 1) return hold;
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      qa = new THREE.Quaternion(),
      qb = new THREE.Quaternion(),
      sa = new THREE.Vector3(),
      sb = new THREE.Vector3();
    source.decompose(a, qa, sa);
    hold.decompose(b, qb, sb);
    // The pie travels in a small arc as it is pulled free.
    const at = a.lerp(b, w);
    at.y += Math.sin(Math.PI * w) * 4 * L.scale;
    return new THREE.Matrix4().compose(at, qa.slerp(qb, w), sa.lerp(sb, w));
  }
  /** The pie stuck face-on to the card; once it pops free it no longer rides the card's wobble. */
  private cardPie(ms: number, L: BearLayout, q: CardPose): THREE.Matrix4 {
    const p = this.plan;
    const held = ms < p.snap ? q : bearCardPose(p, p.snap, L.side);
    const at = this.piePoint(L, held);
    const turn = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      cardTurn(held),
    );
    return new THREE.Matrix4().compose(
      new THREE.Vector3(at.x, -at.y, CARD_Z),
      turn,
      new THREE.Vector3(L.scale, L.scale, L.scale),
    );
  }
  /** The pie lying under the card's bottom edge, slid out by the hooked paw, resting on its real rim. */
  private floorPie(ms: number, L: BearLayout): THREE.Matrix4 {
    const p = this.plan;
    const from = L.b.left + bearU(L.side, p.pieDepth) * L.b.width,
      to = L.stand.x + L.side * 12 * L.scale;
    const x = mix(from, to, ease((ms - p.hook) / (p.dragged - p.hook)));
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), FLOOR_TILT);
    // The whole pie rests on the lowest point of its real crust, measured once in this tilt.
    const y = -L.floor + this.pieUnder * L.scale;
    return new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, DEPTH - 10),
      turn,
      new THREE.Vector3(L.scale, L.scale, L.scale),
    );
  }
  private holdMatrix(ms: number, pose: BearPoseInput): THREE.Matrix4 {
    const p = this.plan;
    const shoulder = bearShoulder(pose.hip, pose.pitch);
    const centre = new THREE.Vector3(shoulder.x + 9.5, shoulder.y - 7, 0);
    let lift = 0,
      bite = 0;
    p.biteTimes.forEach((_, i) => {
      const l = this.biteLift(ms, i);
      if (l > lift) {
        lift = l;
        bite = i;
      }
    });
    if (lift > 0) {
      // Place the pie so the bitten spot on its rim meets the real mouth marker.
      const mouth = this.actor.worldToLocal(this.model.mouth.getWorldPosition(new THREE.Vector3()));
      const a = p.biteAngles[bite] ?? Math.PI / 2;
      const notch = new THREE.Vector3(
        Math.cos(a) * BEAR_PIE_RADIUS,
        Math.sin(a) * BEAR_PIE_RADIUS,
        0,
      ).applyQuaternion(this.holdTurn);
      centre.lerp(mouth.sub(notch), lift);
    }
    const local = new THREE.Matrix4().compose(centre, this.holdTurn, new THREE.Vector3(1, 1, 1));
    return local.premultiply(this.actor.matrixWorld);
  }

  /** Each front paw's destinations through the performance. */
  private track(arm: 0 | 1, L: BearLayout, pose: BearPoseInput): Waypoint[] {
    const p = this.plan,
      m = this.model,
      side = L.side;
    const role: 0 | 1 = this.armFor(0, side) === arm ? 0 : 1;
    const shoulder = bearShoulder(pose.hip, pose.pitch);
    const toRoot = (pt: Point): BearReach => {
      const v = this.actor.worldToLocal(new THREE.Vector3(pt.x, -pt.y, CARD_Z));
      return { x: v.x, y: v.y, angle: Math.PI / 2 };
    };
    const walking = (): BearReach => {
      const step = gaitStep(pose.walked, arm ? 0.75 : 0.25);
      return { x: shoulder.x + 1 + step.x, y: m.frontSole + step.y * (1 - pose.planted), angle: 0 };
    };
    const grip = (): BearReach => {
      const pie = this.pieWorld;
      if (!pie) return tummy(0);
      const local = this.actor.worldToLocal(
        new THREE.Vector3(arm ? BEAR_PIE_RADIUS : -BEAR_PIE_RADIUS, 0, GRIP_Z).applyMatrix4(pie),
      );
      return { x: local.x, y: local.y, angle: Math.PI / 2 };
    };
    const tummy = (ms: number): BearReach => {
      const pat = Math.sin(Math.PI * span(ms, p.swallow - 120, 420)) * Math.abs(Math.sin(ms / 70));
      return {
        x: shoulder.x + 6.5 - arm * 0.8,
        y: shoulder.y - 10.5 + 1.2 * pat,
        angle: Math.PI / 2 + 0.3,
      };
    };
    const hold = arm ? -Math.PI / 2 : Math.PI / 2;
    const pressed = side * (Math.PI / 2);
    const list: Waypoint[] = [{ at: 0, move: 0, arc: 0, press: 0, pie: false, where: walking }];
    const mine = p.prints
      .map((print, k) => ({ print, k }))
      .filter(({ print }) => print.paw === role);
    const ready = p.rear + 260 + role * 60;
    if ((mine[0]?.print.at ?? p.grab) - PRINT_TRAVEL >= ready)
      list.push({
        at: ready,
        move: 280,
        arc: 0,
        press: 0,
        pie: false,
        where: () => ({ x: shoulder.x + 5, y: shoulder.y - 6, angle: 1.1 }),
      });
    // Solve the wrist so the real sole marker, not the wrist, lands on the print.
    const sole = m.soles[arm].position;
    const onPrint = (pt: Point): BearReach => {
      const r = toRoot(pt),
        lean = Math.cos(pressed);
      return {
        x: r.x - (sole.x * Math.cos(r.angle) - sole.y * lean * Math.sin(r.angle)),
        y: r.y - (sole.x * Math.sin(r.angle) + sole.y * lean * Math.cos(r.angle)),
        angle: r.angle,
      };
    };
    for (const { print, k } of mine)
      list.push({
        at: print.at,
        move: PRINT_TRAVEL,
        arc: 3,
        press: pressed,
        pie: false,
        where: (ms) => onPrint(this.printPoint(k, L, bearCardPose(p, ms, side))),
      });
    if (p.find === 'card')
      list.push({ at: p.grab, move: 300, arc: 2, press: hold, pie: true, where: grip });
    else {
      list.push({
        at: p.drop + 200,
        move: 200,
        arc: 2,
        press: 0,
        pie: false,
        where: () => ({ x: shoulder.x + 2 - role * 2.5, y: m.frontSole, angle: 0 }),
      });
      if (role === 0)
        list.push({ at: p.hook, move: 300, arc: 3, press: hold, pie: true, where: grip });
      else list.push({ at: p.grab, move: 280, arc: 3, press: hold, pie: true, where: grip });
    }
    const last = p.biteTimes.at(-1) ?? p.seated;
    list.push({ at: last + 280, move: 260, arc: 0, press: 0, pie: false, where: tummy });
    list.push({
      at: p.yawn + 300,
      move: 280,
      arc: 0,
      press: 0,
      pie: false,
      where: () => ({ x: shoulder.x + 4 + arm, y: shoulder.y + 12, angle: 1.4 }),
    });
    list.push({ at: p.yawn + 820, move: 300, arc: 0, press: 0, pie: false, where: tummy });
    if (p.ending === 'curl')
      list.push({
        at: p.settle,
        move: p.settle - p.doze,
        arc: 2,
        press: 0,
        pie: false,
        where: () => ({ x: shoulder.x + 8 - arm * 1.5, y: m.frontSole, angle: 0 }),
      });
    if (p.ending === 'waddle')
      list.push({
        at: p.settle,
        move: p.settle - p.doze,
        arc: 2,
        press: 0,
        pie: false,
        where: walking,
      });
    return list;
  }

  private follow(
    list: readonly Waypoint[],
    ms: number,
    resolvePie: boolean,
  ): { reach: BearReach; press: number } {
    let i = 0;
    for (let j = 1; j < list.length; j++) {
      const w = list[j];
      if (w && ms >= w.at - w.move) i = j;
    }
    const here = list[i],
      prev = list[i - 1];
    // Pie grips are unknown until the pie is placed, so the first pass parks those paws up high.
    const place = (w: Waypoint): BearReach =>
      w.pie && !resolvePie ? { x: 10, y: 22, angle: Math.PI / 2 } : w.where(ms);
    if (!here) return { reach: { x: 10, y: 22, angle: 0 }, press: 0 };
    if (prev && ms < here.at) {
      const e = ease((ms - here.at + here.move) / here.move);
      return {
        reach: mixReach(place(prev), place(here), e, here.arc),
        press: mix(prev.press, here.press, e),
      };
    }
    return { reach: place(here), press: here.press };
  }

  /** Quiet cleanup of a resting bear: fade only once it is asleep and still. */
  private fadeActor(opacity: number) {
    this.actor.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        const look = m instanceof THREE.Material ? this.looks.get(m) : undefined;
        if (!look || !(m instanceof THREE.Material)) continue;
        m.transparent = look.transparent || opacity < 1;
        m.opacity = look.opacity * opacity;
      }
    });
  }

  private showStage(stage: number) {
    this.stages.forEach((s, i) => (s.visible = i === stage));
  }
  private updatePie(ms: number, frame: BearFrame) {
    const p = this.plan;
    this.pie.visible = frame.pie !== null && ms < BEAR_DURATION;
    if (!frame.pie) {
      this.pie.matrix.identity();
      return;
    }
    const at = new THREE.Vector3(),
      turn = new THREE.Quaternion(),
      size = new THREE.Vector3();
    frame.pie.decompose(at, turn, size);
    // The pie pops onto the card as the throw begins.
    this.pie.matrix.compose(at, turn, size.multiplyScalar(0.4 + 0.6 * ease(ms / 220)));
    this.pie.matrixWorldNeedsUpdate = true;
    this.showStage(Math.min(p.bites - 1, bearBitesTaken(p, ms)));
  }
}
