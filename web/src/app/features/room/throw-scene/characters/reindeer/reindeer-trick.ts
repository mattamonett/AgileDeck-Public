import * as THREE from 'three';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardFit,
  cardPoint,
  cardTurn,
  clamp,
  ease,
  glow,
  mix,
  outline,
  part,
  pulse,
  screenOf,
  sideOf,
  type CharacterRoutine,
  type Side,
} from '../../kit';
import {
  REINDEER_DURATION,
  REINDEER_SCALE,
  arcSample,
  reindeerApproach,
  reindeerBounce,
  reindeerCardPose,
  reindeerExitProgress,
  reindeerExitRoute,
  reindeerFrames,
  reindeerLandAt,
  reindeerPress,
  reindeerPushAt,
  reindeerRoute,
  reindeerStage,
  type ReindeerPlan,
  type ReindeerStage,
} from './reindeer-choreography';
import {
  REINDEER_POSE,
  REINDEER_REST,
  fourHooves,
  mixHooves,
  reindeerModel,
  reindeerPose,
  reindeerStride,
  reindeerStrideLength,
  type ReindeerHooves,
  type ReindeerModel,
  type ReindeerPose,
} from './reindeer-model';

const DEPTH = 172;
const DEFAULT_BOUNDS: TargetBounds = { left: 0, top: 0, width: 84, height: 122 };
const PUFFS = 8;

const hooves = (...h: readonly (readonly [number, number, number])[]): ReindeerHooves =>
  fourHooves((i) => {
    const [x, y, angle] = h[i] ?? [0, 0, 0];
    return { x, y, angle };
  });
/** Launch extension: forelegs folded, hind legs driving back. */
const EXTEND = hooves([14, 9, -1.1], [13, 9.5, -1.1], [-13.5, 4.5, 0.7], [-14.5, 4.5, 0.7]);
/** The rookie's "I can fly" pose at the top of the flight. */
const FLY = hooves([22, 13, -1.3], [21, 12, -1.3], [-21, 12, 1.3], [-20, 11, 1.3]);
/** Flung backwards: sitting in the air with every leg reaching forward. */
const FLAIL = hooves([18, 12, -1], [17, 10, -1], [-3, 5, -0.4], [-4.5, 4, -0.4]);
const TUCK = hooves([13.5, 6, -0.6], [12.5, 6.5, -0.6], [-8.5, 6.5, 0.6], [-9.5, 7, 0.6]);
/** Skid stances: hooves braced ahead of the slide. */
const BRACE_FORWARD = hooves([17, 0, 0], [15.5, 0, 0], [-5.5, 0, 0], [-7, 0, 0]);
const BRACE_BACK = hooves([7, 0, 0], [5.5, 0, 0], [-15.5, 0, 0], [-17, 0, 0]);
/** Front hoof turned up for inspection. */
const LIFTED = { x: 20, y: 17, angle: 2.3 };
/** Out of reach ahead: the foreleg straightens here before folding up to the nose. */
const REACH = { x: 26, y: 4, angle: -0.6 };

function blendPose(a: ReindeerPose, b: ReindeerPose, t: number): ReindeerPose {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return {
    hooves: mixHooves(a.hooves, b.hooves, t),
    lift: mix(a.lift, b.lift, t),
    pitch: mix(a.pitch, b.pitch, t),
    neck: mix(a.neck, b.neck, t),
    headTilt: mix(a.headTilt, b.headTilt, t),
    headTurn: mix(a.headTurn, b.headTurn, t),
    ears: mix(a.ears, b.ears, t),
    flick: mix(a.flick, b.flick, t),
    lids: mix(a.lids, b.lids, t),
    brows: mix(a.brows, b.brows, t),
    blush: mix(a.blush, b.blush, t),
    tail: mix(a.tail, b.tail, t),
    bell: mix(a.bell, b.bell, t),
    rub: mix(a.rub, b.rub, t),
    scrub: mix(a.scrub, b.scrub, t),
    near: b.near,
  };
}

interface Placement {
  readonly root: Point;
  readonly yaw: number;
  /** Distance walked along the current route, in model units. */
  readonly walked: number;
}
interface Puff {
  readonly mesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  readonly vx: number;
  readonly vy: number;
  readonly size: number;
}
interface Frame {
  readonly ms: number;
  readonly side: Side;
  readonly s: ReindeerStage;
  readonly b: TargetBounds;
  readonly scale: number;
  readonly fit: number;
  readonly root: Point;
  readonly walked: number;
  readonly approach: number;
}

export class ReindeerTrick implements CharacterRoutine {
  readonly object = new THREE.Group();
  readonly plan: ReindeerPlan;
  readonly duration: number;
  private readonly model: ReindeerModel;
  private readonly marks: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly puffs: Puff[] = [];
  private readonly sweat: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;

  constructor(actor: THREE.Group) {
    this.model = reindeerModel(actor);
    this.plan = this.model.plan;
    this.duration = REINDEER_DURATION * this.plan.pace;
    this.object.name = 'reindeer-springboard';
    for (let i = 0; i < 2; i++)
      this.marks.push(
        part(
          this.object,
          `reindeer-skid-mark-${i}`,
          new THREE.PlaneGeometry(1, 1),
          glow(0x7a5236, 0),
        ),
      );
    const r = seededRandom(`${this.plan.phase}:reindeer-snow`);
    for (let i = 0; i < PUFFS; i++) {
      const mesh = part(
        this.object,
        `reindeer-snow-${i}`,
        new THREE.CircleGeometry(1, 10),
        glow(i % 2 ? 0xa9c1d6 : 0xeef5fb, 0),
      );
      this.puffs.push({ mesh, vx: 30 + r() * 40, vy: 45 + r() * 45, size: 1.1 + r() * 1.1 });
    }
    this.sweat = part(
      this.object,
      'reindeer-sweat-drop',
      new THREE.ShapeGeometry(
        outline([
          [0, 1.6],
          [0.55, 0.3],
          [0.75, -0.4],
          [0.5, -0.9],
          [0, -1.05],
          [-0.5, -0.9],
          [-0.75, -0.4],
          [-0.55, 0.3],
        ]),
      ),
      glow(0x6fb6e8, 0),
    );
  }

  cardAnimation(facing: number, b?: TargetBounds) {
    return reindeerFrames(this.plan, sideOf(facing), b ?? DEFAULT_BOUNDS);
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
    const live = ms < REINDEER_DURATION;
    this.object.visible = live;
    this.object.position.set(0, 0, 0);
    actor.visible = live;
    const fit = cardFit(b),
      scale = REINDEER_SCALE * fit;
    const s = reindeerStage(p, b, view, side, scale);
    const route = reindeerRoute(p, start, s.stand, b, view, side, scale);
    const approach = arcSample(route, 1).length / scale;
    const at = this.place(ms, route, s, b, view, side, scale);
    actor.position.set(at.root.x, -at.root.y, DEPTH);
    actor.rotation.set(0, at.yaw, 0);
    actor.scale.setScalar(scale);
    actor.updateMatrixWorld(true);
    const frame: Frame = { ms, side, s, b, scale, fit, root: at.root, walked: at.walked, approach };
    reindeerPose(actor, this.pose(frame));
    actor.updateMatrixWorld(true);
    this.updateMarks(frame);
    this.updatePuffs(frame);
    this.updateSweat(frame);
  }

  /** Live top-edge point under the body at a moment of the springboard. */
  private bodyOnCard(t: number, s: ReindeerStage, b: TargetBounds, side: Side): Point {
    return cardPoint(reindeerCardPose(this.plan, t, side, b), s.contact, b);
  }
  /** Raw (unanimated) top-edge point under hoof i. */
  private hoofRaw(i: number, s: ReindeerStage, side: Side, scale: number): Point {
    return { x: s.contact.x + side * (REINDEER_REST[i]?.x ?? 0) * scale, y: s.contact.y };
  }
  /** Sole targets on the live card at time t, in the space of a root standing at `root`. */
  private cardHooves(
    t: number,
    root: Point,
    s: ReindeerStage,
    b: TargetBounds,
    side: Side,
    scale: number,
  ): ReindeerHooves {
    const q = reindeerCardPose(this.plan, t, side, b);
    return fourHooves((i) => {
      const at = cardPoint(q, this.hoofRaw(i, s, side, scale), b);
      return {
        x: (side * (at.x - root.x)) / scale,
        y: (root.y - at.y) / scale,
        angle: side * cardTurn(q),
      };
    });
  }

  private place(
    ms: number,
    route: (u: number) => Point,
    s: ReindeerStage,
    b: TargetBounds,
    view: Point,
    side: Side,
    scale: number,
  ): Placement {
    const p = this.plan,
      fit = scale / REINDEER_SCALE,
      contactYaw = side > 0 ? 0 : -Math.PI;
    if (ms < p.travel) {
      const t = ms / p.travel,
        u = reindeerApproach(p, t);
      const at = arcSample(route, u);
      const yaw = mix(this.heading(route, u, contactYaw), contactYaw, ease((t - 0.88) / 0.12));
      return { root: at.point, yaw, walked: (at.length * u) / scale };
    }
    if (ms < p.takeoff) return { root: s.stand, yaw: contactYaw, walked: 0 };
    if (ms < p.perch) {
      const t = (ms - p.takeoff) / (p.perch - p.takeoff);
      const to = this.bodyOnCard(p.perch, s, b, side);
      const apex = Math.min(s.stand.y, to.y) - (14 + 10 * p.hop) * fit;
      const y =
        t < 0.62
          ? mix(s.stand.y, apex, Math.sin((Math.PI / 2) * (t / 0.62)))
          : mix(apex, to.y, 1 - Math.cos((Math.PI / 2) * ((t - 0.62) / 0.38)));
      return { root: { x: mix(s.stand.x, to.x, t), y }, yaw: contactYaw, walked: 0 };
    }
    if (ms < p.spring) {
      const bounce = reindeerBounce(p, ms);
      if (bounce.hop < 0)
        return { root: this.bodyOnCard(ms, s, b, side), yaw: contactYaw, walked: 0 };
      const from = this.bodyOnCard(reindeerPushAt(p, bounce.k), s, b, side),
        to = this.bodyOnCard(reindeerLandAt(p, bounce.k + 1), s, b, side);
      const h = (7 + 3 * bounce.k) * p.hop * fit,
        t = bounce.hop;
      return {
        root: { x: mix(from.x, to.x, t), y: mix(from.y, to.y, t) - 4 * h * t * (1 - t) },
        yaw: contactYaw,
        walked: 0,
      };
    }
    if (ms < p.land) {
      const t = (ms - p.spring) / (p.land - p.spring);
      const from = this.bodyOnCard(p.spring, s, b, side),
        to = s.land;
      const apex = Math.max(48, from.y - (46 + 34 * p.loft) * fit);
      let y: number;
      // Rise, a cartoon hang at the top while he strikes his flying pose, then the drop.
      if (t < 0.4) y = mix(from.y, apex, Math.sin((Math.PI / 2) * (t / 0.4)));
      else if (t < 0.52) y = apex + 3 * fit * ((t - 0.4) / 0.12) ** 2;
      else y = mix(apex + 3 * fit, to.y, 1 - Math.cos((Math.PI / 2) * ((t - 0.52) / 0.48)));
      return { root: { x: mix(from.x, to.x, t), y }, yaw: contactYaw, walked: 0 };
    }
    if (ms < p.halt) {
      const t = Math.sin((Math.PI / 2) * clamp((ms - p.land) / (p.halt - p.land)));
      return { root: { x: mix(s.land.x, s.halt.x, t), y: s.floor }, yaw: contactYaw, walked: 0 };
    }
    if (ms < p.departure) return { root: s.halt, yaw: contactYaw, walked: 0 };
    const exit = reindeerExitRoute(p, s, b, view),
      e = reindeerExitProgress(p, ms);
    const at = arcSample(exit, e);
    const turn = ease((ms - p.departure) / 420);
    return {
      root: at.point,
      yaw: mix(contactYaw, this.heading(exit, e, contactYaw), turn),
      walked: (at.length * e) / scale,
    };
  }

  /** Yaw that faces along a route; moving straight down the screen faces the viewer. */
  private heading(route: (u: number) => Point, u: number, fallback: number): number {
    const ahead = arcSample(route, Math.min(1, u + 0.02)).point,
      behind = arcSample(route, Math.max(0, u - 0.02)).point;
    const dx = ahead.x - behind.x,
      length = Math.hypot(dx, ahead.y - behind.y);
    return length > 0.5 ? -Math.acos(Math.max(-1, Math.min(1, dx / length))) : fallback;
  }

  private base(f: Frame): ReindeerPose {
    const p = this.plan;
    const blink = pulse((f.ms + p.phase * 400) % 2700, 2540, 130);
    return { ...REINDEER_POSE, lids: 1 - 0.92 * blink, near: f.side > 0 ? 0 : 1 };
  }

  private pose(f: Frame): ReindeerPose {
    const p = this.plan,
      ms = f.ms;
    if (ms < p.travel) return this.approachPose(f);
    if (ms < p.takeoff) return this.gatherPose(f);
    if (ms < p.perch) return this.leapPose(f);
    if (ms < p.spring) return this.perchPose(f);
    if (ms < p.land) return this.flightPose(f);
    if (ms < p.halt) return this.skidPose(f);
    if (ms < p.steady) return this.recoverPose(f);
    if (ms < p.departure) return this.sheepishPose(f);
    return this.exitPose(f);
  }

  private standHooves(f: Frame): ReindeerHooves {
    return reindeerStride(
      f.approach,
      this.plan.approach === 'bound' ? 'bound' : 'trot',
      1,
      this.plan.stride,
    );
  }

  /** The approach pose at time t (0..1): a cocky bound, or a cautious walk that builds confidence. */
  private approachAt(f: Frame, t: number, walked: number): ReindeerPose {
    const p = this.plan,
      bound = p.approach === 'bound';
    const style = bound ? 'bound' : 'trot';
    const planted = ease((t - 0.92) / 0.08),
      moving = 1 - planted;
    const c = walked / reindeerStrideLength(style, p.stride);
    const cycle = Math.sin(Math.PI * 2 * c);
    const base = {
      ...this.base(f),
      hooves: reindeerStride(walked, style, planted, p.stride),
      bell: 0.35 * Math.sin(f.ms / 80) * moving,
    };
    if (bound)
      return {
        ...base,
        lift: -1.2 * Math.abs(cycle) * moving,
        pitch: 0.08 * cycle * moving,
        neck: 0.15,
        headTilt: 0.05 - 0.06 * cycle * moving,
        ears: -0.3,
        brows: -0.2,
        tail: -0.6,
      };
    const build = ease(t);
    const look = pulse(t, p.lookAt - 0.08, 0.16);
    return {
      ...base,
      lift: -0.6 * Math.abs(cycle) * moving,
      pitch: 0.03 * cycle * moving,
      neck: mix(-0.25, 0.12, build) + 0.15 * look,
      headTilt: 0.1 * look,
      headTurn: -f.side * 0.75 * look,
      ears: mix(0.2, -0.25, build) - 0.45 * look,
      brows: 0.7 * look,
      lids: base.lids + 0.15 * look,
      tail: mix(0.2, -0.5, build),
    };
  }
  private approachPose(f: Frame): ReindeerPose {
    return this.approachAt(f, f.ms / this.plan.travel, f.walked);
  }

  /** Crouch and eye the card's top edge; a long gather adds a bull-like hoof scrape. */
  private gatherPose(f: Frame): ReindeerPose {
    const p = this.plan;
    const from = this.approachAt(f, 1, f.approach);
    const g = ease((f.ms - p.travel) / (p.gather * 0.7));
    const scrape = p.gather > 260 ? pulse(f.ms, p.travel + 60, p.gather - 140) : 0;
    const stand = this.standHooves(f);
    const near = f.side > 0 ? 0 : 1;
    const hooves = fourHooves((i) => {
      const h = stand[i] ?? REINDEER_REST[0];
      return i === near
        ? {
            x: h.x - 3 * Math.sin(Math.PI * scrape),
            y: h.y + 2.4 * scrape,
            angle: h.angle - 0.4 * scrape,
          }
        : h;
    });
    const crouch: ReindeerPose = {
      ...from,
      hooves,
      lift: -5,
      pitch: 0.06,
      neck: 0.25,
      headTilt: 0.3,
      ears: -0.2,
      brows: -0.35,
      tail: -0.7 + 0.25 * Math.sin(f.ms / 45),
    };
    return blendPose({ ...from, hooves }, crouch, g);
  }

  private leapPose(f: Frame): ReindeerPose {
    const p = this.plan,
      t = (f.ms - p.takeoff) / (p.perch - p.takeoff);
    const stand = this.standHooves(f);
    const legs = mixHooves(
      mixHooves(stand, EXTEND, ease(t / 0.25)),
      REINDEER_REST,
      ease((t - 0.55) / 0.4),
    );
    return {
      ...this.base(f),
      hooves: legs,
      lift: t < 0.12 ? mix(-5, 1.5, ease(t / 0.12)) : mix(1.5, -1.5, ease((t - 0.12) / 0.88)),
      pitch: t < 0.2 ? mix(0.06, 0.3, ease(t / 0.2)) : mix(0.3, 0, ease((t - 0.2) / 0.7)),
      neck: mix(0.25, 0.05, ease(t)),
      headTilt: mix(0.3, -0.15, ease(t)),
      ears: mix(-0.2, -0.5, pulse(t, 0, 1)),
      lids: 1.1,
      brows: -0.35,
      tail: -0.7,
      bell: 0.4 * Math.sin(t * Math.PI * 2),
    };
  }

  /** Bouncing on the card: hooves pinned to the live top edge, hopping higher each time, then the wind-up. */
  private perchPose(f: Frame): ReindeerPose {
    const p = this.plan,
      ms = f.ms;
    const bounce = reindeerBounce(p, ms);
    const contact = this.cardHooves(ms, f.root, f.s, f.b, f.side, f.scale);
    const c = Math.max(0, reindeerPress(p, ms));
    const land = reindeerLandAt(p, bounce.k),
      push = reindeerPushAt(p, bounce.k);
    const absorb = bounce.hop < 0 ? pulse(ms, land, 260) * (bounce.k === 0 ? 1.4 : 1) : 0;
    const last = bounce.k === p.bounces && bounce.hop < 0;
    const windup = last ? ease((ms - land - 60) / (push - land - 110)) : 0;
    const air = bounce.hop < 0 ? 0 : Math.sin(Math.PI * bounce.hop);
    return {
      ...this.base(f),
      hooves: mixHooves(contact, TUCK, air),
      lift: -1.5 - 10 * c - 2.5 * absorb - 2.5 * windup + air,
      pitch: -0.03 * absorb,
      neck: 0.05 - 0.15 * windup,
      headTilt: -0.15 + 0.2 * absorb - 0.15 * windup,
      ears: -0.3 - 0.4 * air + 0.35 * absorb,
      lids: mix(1.1, 0.8, windup),
      brows: mix(-0.3, -0.7, windup),
      tail: -0.6 + 0.3 * Math.sin(ms / 40) * windup,
      bell: 0.45 * Math.sin((ms - p.perch) / 70),
    };
  }

  /** The skid stance he lands into, and holds while sliding. */
  private braced(f: Frame): ReindeerPose {
    const over = f.s.over;
    return {
      ...this.base(f),
      hooves: over ? BRACE_FORWARD : BRACE_BACK,
      lift: -3.5,
      pitch: over ? 0.12 : -0.1,
      neck: over ? 0.25 : -0.05,
      headTilt: over ? 0.25 : -0.1,
      ears: 0.45,
      lids: 1.25,
      brows: 0.9,
      tail: over ? -0.2 : 0.4,
      bell: 0,
    };
  }

  private flightPose(f: Frame): ReindeerPose {
    const p = this.plan,
      ms = f.ms,
      t = (ms - p.spring) / (p.land - p.spring);
    const from = this.cardHooves(
      p.spring,
      this.bodyOnCard(p.spring, f.s, f.b, f.side),
      f.s,
      f.b,
      f.side,
      f.scale,
    );
    const over = f.s.over;
    const pedal = over ? pulse(t, 0.48, 0.32) : 0.4 + 0.6 * pulse(t, 0.1, 0.7);
    const air = over
      ? mixHooves(mixHooves(from, EXTEND, ease(t / 0.15)), FLY, ease((t - 0.15) / 0.18))
      : mixHooves(from, FLAIL, ease(t / 0.2));
    const paddled = fourHooves((i) => {
      const h = air[i] ?? REINDEER_REST[0];
      const a = ms / 42 + i * (Math.PI / 2);
      return {
        x: h.x + 2.6 * Math.cos(a) * pedal,
        y: h.y + 2.6 * Math.sin(a) * pedal,
        angle: h.angle,
      };
    });
    const proud = over ? ease((t - 0.12) / 0.15) * (1 - ease((t - 0.45) / 0.12)) : 0;
    const alarm = over ? ease((t - 0.46) / 0.1) : 1;
    const flying: ReindeerPose = {
      ...this.base(f),
      hooves: paddled,
      lift: 0,
      pitch: over
        ? 0.25 * (1 - ease(t / 0.35)) + 0.05 * proud - 0.08 * alarm
        : 0.3 * pulse(t, 0, 0.9),
      neck: 0.3 * proud + 0.1 * alarm,
      headTilt: 0.1 * proud + 0.25 * alarm,
      ears: -0.8 * proud + (0.3 + 0.3 * Math.sin(ms / 50)) * alarm,
      lids: mix(1, 1.28, alarm),
      brows: mix(-0.45, 0.9, alarm),
      tail: over ? -0.8 : 0.4,
      bell: 0.6 * Math.sin(ms / 60),
    };
    return blendPose(flying, this.braced(f), ease((t - 0.68) / 0.3));
  }

  private skidPose(f: Frame): ReindeerPose {
    const p = this.plan,
      t = (f.ms - p.land) / (p.halt - p.land);
    const braced = this.braced(f);
    return {
      ...braced,
      lift: braced.lift - 1.6 * pulse(t, 0, 0.35),
      pitch: braced.pitch + (f.s.over ? 0.04 : -0.04) * pulse(t, 0, 0.5),
      ears: braced.ears + 0.25 * Math.sin(f.ms / 45) * (1 - t),
      bell: 0.7 * Math.sin(f.ms / 55) * (1 - t),
    };
  }

  /** Dazed and wobbly once the slide stops, the hooves re-plant one at a time. */
  private recovered(f: Frame): ReindeerPose {
    return {
      ...this.base(f),
      lift: -1.2,
      neck: -0.1,
      headTilt: -0.05,
      ears: 0.35,
      lids: 0.7 * this.base(f).lids,
      brows: 0.7,
      blush: 0.5,
      tail: 0.25,
    };
  }
  private recoverPose(f: Frame): ReindeerPose {
    const p = this.plan,
      t = (f.ms - p.halt) / (p.steady - p.halt);
    const braced = this.braced(f),
      settled = this.recovered(f);
    const order = f.s.over ? [0, 3, 1, 2] : [2, 1, 3, 0];
    const legs = fourHooves((i) => {
      const from = braced.hooves[i] ?? REINDEER_REST[0],
        to = REINDEER_REST[i] ?? REINDEER_REST[0];
      const r = clamp((t - 0.05 - order.indexOf(i) * 0.2) / 0.3);
      return {
        x: mix(from.x, to.x, ease(r)),
        y: 3.2 * Math.sin(Math.PI * r),
        angle: -0.5 * Math.sin(Math.PI * r),
      };
    });
    const e = ease(t),
      wobble = 1 - t;
    const blended = blendPose(braced, settled, e);
    return {
      ...blended,
      hooves: legs,
      lift: blended.lift - 1.4 * Math.abs(Math.sin(t * Math.PI * 3)) * wobble,
      pitch: blended.pitch + 0.08 * Math.sin(t * Math.PI * 4) * wobble,
      headTurn: 0.35 * Math.sin(t * Math.PI * 5) * wobble,
      ears: blended.ears + 0.3 * Math.sin(t * Math.PI * 6) * wobble,
      lids: blended.lids * (1 - 0.85 * pulse(t, 0.45, 0.2)),
      bell: 0.5 * Math.sin(f.ms / 70) * wobble,
    };
  }

  /**
   * The embarrassed beat: head down, ears drooping and blushing, he checks his hoof (or rubs his nose
   * with it), an ear flicks, he shoots the viewer a sheepish glance and puts the hoof down.
   */
  private sheepishPose(f: Frame): ReindeerPose {
    const p = this.plan,
      ms = Math.min(f.ms, p.departure);
    const settled = this.recovered(f);
    const near = f.side > 0 ? 0 : 1;
    const toCamera = (a: number) => -f.side * a;
    const raise = ease((ms - p.steady) / 240) * (1 - ease((ms - p.glance - 380) / 220));
    const inspect = ease((ms - p.steady - 240) / 120) * (1 - ease((ms - p.glance) / 120));
    let flick = 0;
    for (let i = 0; i < p.flicks; i++)
      flick = Math.max(flick, pulse(ms, p.steady + 380 + i * 260, 150));
    const glance = ease((ms - p.glance) / 120) * (1 - ease((ms - p.glance - 300) / 160));
    const hoofCheck = p.gesture === 'hoof';
    const legs = fourHooves((i) => {
      const rest = REINDEER_REST[i] ?? REINDEER_REST[0];
      if (i !== near) return rest;
      if (!hoofCheck) {
        const out = ease(raise / 0.35);
        return {
          x: mix(rest.x, REACH.x, out),
          y: mix(rest.y, REACH.y, out),
          angle: mix(rest.angle, REACH.angle, out),
        };
      }
      const wiggle = 0.3 * Math.sin((ms - p.steady) / 70) * inspect;
      return {
        x: mix(rest.x, LIFTED.x, raise),
        y: mix(rest.y, LIFTED.y, raise),
        angle: mix(rest.angle, LIFTED.angle + wiggle, raise),
      };
    });
    const look = hoofCheck
      ? { neck: -0.55, tilt: -0.45, turn: 0.35 }
      : { neck: -0.25, tilt: -0.5, turn: 0.3 };
    const blink = pulse(ms, p.glance + 200, 110);
    return {
      ...settled,
      hooves: legs,
      lift: settled.lift - 0.4 * raise,
      neck: settled.neck + look.neck * raise * (1 - glance) + 0.3 * glance,
      headTilt: settled.headTilt + look.tilt * raise * (1 - glance) + 0.25 * glance,
      headTurn: toCamera(look.turn * raise * (1 - glance) + 0.85 * glance),
      ears: mix(settled.ears, 0.6, ease((ms - p.steady) / 300)) - 0.3 * glance,
      flick,
      lids: mix(0.62, 1.05, glance) * (1 - 0.9 * blink),
      brows: 1,
      blush: mix(0.5, 1, ease((ms - p.steady) / 400)),
      tail: 0.3 + 0.12 * Math.sin(ms / 60),
      rub: hoofCheck ? 0 : ease((raise - 0.35) / 0.65),
      scrub: (ms - p.steady) / 55,
    };
  }

  /** Shakes it off (a rookie buck or a quick slink) and gallops away out of view. */
  private exitPose(f: Frame): ReindeerPose {
    const p = this.plan,
      ms = f.ms;
    const from = this.sheepishPose(f);
    const length = reindeerStrideLength('bound', p.stride);
    const c = f.walked / length,
      cycle = Math.sin(Math.PI * 2 * c);
    const run = ease((ms - p.departure) / 220);
    const legs = mixHooves(REINDEER_REST, reindeerStride(f.walked, 'bound', 0, p.stride), run);
    const kick = p.buck ? pulse(ms, p.departure + 60, 340) : 0;
    const slink = p.buck ? 0 : 1 - ease((ms - p.departure - 200) / 500);
    const bucked = fourHooves((i) => {
      const h = legs[i] ?? REINDEER_REST[0];
      return i < 2 ? h : { x: h.x - 5 * kick, y: h.y + 7 * kick, angle: h.angle + 0.8 * kick };
    });
    const gallop: ReindeerPose = {
      ...this.base(f),
      hooves: bucked,
      lift: -1.1 * Math.abs(cycle) * run - 1.2 * slink,
      pitch: 0.07 * cycle * run - 0.18 * kick,
      neck: 0.05 - 0.4 * slink + 0.1 * kick,
      headTilt: -0.1 - 0.2 * slink,
      ears: -0.5 + 0.9 * slink - 0.3 * kick,
      lids: 1 + 0.1 * kick,
      brows: 0.6 * slink,
      blush: from.blush * (1 - ease((ms - p.departure) / 700)),
      tail: -0.5 + 0.7 * slink,
      bell: 0.45 * Math.sin(ms / 70),
    };
    return blendPose(from, gallop, ease((ms - p.departure) / 300));
  }

  /** Two scuffed skid lines from where the hooves touched down to where the slide stopped. */
  private updateMarks(f: Frame) {
    const p = this.plan;
    const fade = 1 - ease((f.ms - p.exitEnd) / 400);
    const braced = f.s.over ? BRACE_FORWARD : BRACE_BACK;
    const slid = Math.sin((Math.PI / 2) * clamp((f.ms - p.land) / (p.halt - p.land)));
    const now = mix(f.s.land.x, f.s.halt.x, slid);
    this.marks.forEach((mark, i) => {
      const bx = f.side * (braced[i === 0 ? 0 : 2]?.x ?? 0) * f.scale;
      const a = f.s.land.x + bx,
        z = now + bx;
      mark.visible = f.ms >= p.land && fade > 0 && Math.abs(z - a) > 0.5;
      if (!mark.visible) return;
      mark.position.set((a + z) / 2, -(f.s.floor + 0.6), DEPTH - 20);
      mark.scale.set(Math.abs(z - a), 1.5 * f.fit, 1);
      mark.material.opacity = 0.5 * fade;
    });
  }

  /** Snow sprays forward off the leading hooves during the skid and settles on the floor. */
  private updatePuffs(f: Frame) {
    const p = this.plan;
    const braced = f.s.over ? BRACE_FORWARD : BRACE_BACK;
    const skid = p.halt - p.land;
    this.puffs.forEach((puff, i) => {
      const birth = p.land + (i / PUFFS) * skid * 0.85;
      const age = (f.ms - birth) / 1000;
      puff.mesh.visible = age >= 0 && age < 0.9 && f.ms < REINDEER_DURATION;
      if (!puff.mesh.visible) return;
      const leading = f.s.over ? (i % 2 ? 1 : 0) : i % 2 ? 3 : 2;
      const slid = Math.sin((Math.PI / 2) * clamp((birth - p.land) / skid));
      const x0 = mix(f.s.land.x, f.s.halt.x, slid) + f.side * (braced[leading]?.x ?? 0) * f.scale;
      const g = 280,
        fall = (2 * puff.vy) / g,
        flying = Math.min(age, fall);
      const x = x0 + f.s.dir * puff.vx * f.fit * flying;
      const y = f.s.floor - (puff.vy * flying - 0.5 * g * flying * flying) * f.fit;
      const rested = age >= fall;
      puff.mesh.position.set(x, -y + puff.size * f.fit * (rested ? 0.3 : 0.8), DEPTH + 6);
      puff.mesh.scale.set(
        puff.size * f.fit * (rested ? 1.5 : 1),
        puff.size * f.fit * (rested ? 0.45 : 1),
        1,
      );
      puff.mesh.material.opacity = 0.9 * (1 - ease((age - 0.45) / 0.45));
    });
  }

  /** A nervous bead of sweat rolls off his brow during the embarrassed pause. */
  private updateSweat(f: Frame) {
    const p = this.plan;
    const age = f.ms - p.steady - 150;
    const show = ease(age / 150) * (1 - ease((f.ms - p.departure) / 200));
    this.sweat.visible = age >= 0 && show > 0.01 && f.ms < REINDEER_DURATION;
    if (!this.sweat.visible) return;
    const at = screenOf(this.model.sweat);
    // Beside the back of the head, clear of the face, rolling down as it goes.
    this.sweat.position.set(
      at.x - f.side * 2.5 * f.fit,
      -at.y - 5 * f.fit * ease(age / 900),
      DEPTH + 24,
    );
    this.sweat.scale.setScalar(2.4 * f.fit);
    this.sweat.material.opacity = 0.92 * show;
  }
}
