import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardPoint,
  cardTurn,
  clamp,
  ease,
  easeIn,
  easeOut,
  gait,
  glow,
  mix,
  part,
  pulse,
  reach,
  screenOf,
  sideOf,
  sideRoute,
  span,
  type CardPose,
  type CharacterRoutine,
  type Limb,
  type Side,
} from '../../kit';
import {
  GIFT_CLOSED,
  GIFT_D,
  GIFT_H,
  GIFT_REACH,
  GIFT_SLIDE,
  LID_H,
  SANTA_BIAS,
  SANTA_DURATION,
  SLEIGH_DROP,
  santaCardPose,
  santaContactX,
  santaExitPoint,
  santaFloor,
  santaFrames,
  santaHitch,
  santaLandingPoint,
  santaProgress,
  santaScale,
  type SantaPlan,
} from './santa-choreography';
import {
  SANTA_HIP,
  SANTA_REST,
  SANTA_SHOULDER,
  SLEIGH_BASE_TOP,
  SLEIGH_PIVOT,
  bone3,
  sackNeck,
  santaModel,
  santaPose,
  sleighRest,
  type SantaModel,
  type SantaPose,
  type SleighPose,
  type SoleTarget,
  star,
} from './santa-model';
import { buildGift, type Gift } from './santa-gift';
import { BUBBLE_H, BUBBLE_W, santaGreeting } from './santa-greeting';

const DEPTH = 172;
const FRONT = -Math.PI / 2;
const ROUTE = 32;

/** Yaw that faces a screen direction (cosine c) while turning the face three quarters to the viewer. */
export function santaYaw(c: number): number {
  return -(
    SANTA_BIAS +
    (Math.acos(Math.max(-1, Math.min(1, c))) * (Math.PI - 2 * SANTA_BIAS)) / Math.PI
  );
}

/** Smoothly eased keyframe track: holds between keys and eases from each value to the next. */
function track(ms: number, keys: readonly (readonly [number, number])[]): number {
  const first = keys[0];
  if (!first) return 0;
  if (ms <= first[0]) return first[1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i],
      b = keys[i + 1];
    if (a && b && ms < b[0]) return mix(a[1], b[1], ease((ms - a[0]) / Math.max(1, b[0] - a[0])));
  }
  return keys.at(-1)?.[1] ?? 0;
}

interface ArmGoal {
  readonly at: THREE.Vector3;
  readonly pole: THREE.Vector3;
}
interface Frame {
  readonly at: Point;
  readonly yaw: number;
  readonly pitch: number;
  readonly walked: number;
  /** Root-space x of the sleigh's centre while it is on the floor. */
  readonly sleighX: number;
  /** Screen distance the sleigh has travelled since the push-off. */
  readonly slid: number;
}

export class SantaTrick implements CharacterRoutine {
  readonly object = new THREE.Group();
  readonly plan: SantaPlan;
  readonly duration: number;
  private readonly model: SantaModel;
  private readonly actor: THREE.Group;
  private readonly gift: Gift;
  private readonly bubble: THREE.Sprite;
  private readonly sparkles: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly puffs: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly lengths = new Float32Array(ROUTE + 1);
  private readonly basis = new THREE.Matrix4();
  private readonly stand = new THREE.Matrix4();
  private readonly v = [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3());
  private readonly e = [0, 1, 2].map(() => new THREE.Vector3());
  private readonly turn = new THREE.Quaternion();
  private readonly tilt = new THREE.Quaternion();
  private readonly zAxis = new THREE.Vector3(0, 0, 1);
  private readonly yawEuler = new THREE.Euler();
  private readonly boxTop = new THREE.Vector3();
  private readonly lidUnder = new THREE.Vector3();
  private readonly standAt = new THREE.Vector3();
  private readonly standScale = new THREE.Vector3();

  constructor(actor: THREE.Group) {
    this.actor = actor;
    this.model = santaModel(actor);
    this.plan = this.model.plan;
    this.duration = SANTA_DURATION * this.plan.pace;
    this.object.name = 'santa-delivery';
    this.gift = buildGift(this.object, this.plan.wrap);
    this.bubble = santaGreeting();
    this.object.add(this.bubble);
    for (let i = 0; i < 8; i++)
      this.sparkles.push(
        part(this.object, `santa-sparkle-${i}`, star(), glow(i % 2 ? 0xffe28a : 0xfff6d8, 0)),
      );
    for (let i = 0; i < 6; i++)
      this.puffs.push(
        part(this.object, `santa-snow-${i}`, new THREE.CircleGeometry(1, 14), glow(0xf2f7ff, 0)),
      );
  }

  cardAnimation(facing: number, b?: TargetBounds) {
    return santaFrames(this.plan, facing, b ?? { left: 0, top: 0, width: 84, height: 122 });
  }

  // ---------- Route and root motion ----------

  private routeAt(
    u: number,
    start: Point,
    stand: Point,
    b: TargetBounds,
    view: Point,
    side: Side,
  ): Point {
    return sideRoute(start, stand, b, view, side, this.plan.bend, u);
  }
  private measure(start: Point, stand: Point, b: TargetBounds, view: Point, side: Side): number {
    let previous = this.routeAt(0, start, stand, b, view, side);
    this.lengths[0] = 0;
    for (let i = 1; i <= ROUTE; i++) {
      const at = this.routeAt(i / ROUTE, start, stand, b, view, side);
      this.lengths[i] =
        (this.lengths[i - 1] ?? 0) + Math.hypot(at.x - previous.x, at.y - previous.y);
      previous = at;
    }
    return this.lengths[ROUTE] ?? 0;
  }
  /** Route parameter for a distance along the measured route, so speed follows the plan exactly. */
  private paramAt(distance: number): number {
    for (let i = 0; i < ROUTE; i++) {
      const a = this.lengths[i] ?? 0,
        c = this.lengths[i + 1] ?? 0;
      if (distance <= c || i === ROUTE - 1)
        return (i + clamp((distance - a) / Math.max(0.0001, c - a))) / ROUTE;
    }
    return 1;
  }

  /** Screen distance travelled by the sleigh: kicked along, then gliding off. */
  private slid(ms: number, distance: number): number {
    const p = this.plan;
    if (ms < p.push) return 0;
    const push = 176,
      kickV = 0.06;
    const integral = (u: number) => (u <= 0 ? 0 : u < 1 ? u ** 3 - u ** 4 / 2 : u - 0.5);
    let kicked = 0;
    for (let i = 0; i < p.kicks; i++)
      kicked += kickV * push * integral((Math.min(ms, p.glide) - p.push - i * 320) / push);
    if (ms <= p.glide) return kicked;
    const v = kickV * p.kicks,
      span = p.exitEnd - p.glide,
      tau = clamp((ms - p.glide) / span);
    const extra = Math.max(0, distance - kicked - v * span);
    const ramp = 0.35;
    const g =
      tau < ramp ? tau ** 2 / (2 * ramp) / (1 - ramp / 2) : (tau - ramp / 2) / (1 - ramp / 2);
    return kicked + v * (ms - p.glide) + extra * g;
  }

  private yawAt(ms: number, side: Side): number {
    const p = this.plan,
      contact = santaYaw(side),
      exit = santaYaw(-side);
    if (ms < p.peak + 150) return contact;
    if (ms < p.settled - 250) return mix(contact, FRONT, ease((ms - p.peak - 150) / 350));
    return mix(FRONT, exit, ease((ms - p.settled + 250) / 400));
  }

  private frame(
    ms: number,
    start: Point,
    stand: Point,
    b: TargetBounds,
    view: Point,
    side: Side,
    scale: number,
  ): Frame {
    const p = this.plan;
    const length = this.measure(start, stand, b, view, side);
    if (ms < p.travel) {
      const s = santaProgress(p, ms) * length;
      const u = this.paramAt(s);
      const at = this.routeAt(u, start, stand, b, view, side);
      const ahead = this.routeAt(Math.min(1, u + 0.015), start, stand, b, view, side),
        behind = this.routeAt(Math.max(0, u - 0.015), start, stand, b, view, side);
      const dx = ahead.x - behind.x,
        d = Math.hypot(dx, ahead.y - behind.y);
      const heading = d > 0.5 ? santaYaw(dx / d) : santaYaw(side);
      const yaw = mix(heading, santaYaw(side), ease((ms / p.travel - 0.84) / 0.16));
      return { at, yaw, pitch: 0, walked: s / scale, sleighX: SLEIGH_DROP, slid: 0 };
    }
    const walked = length / scale;
    const yaw = this.yawAt(ms, side);
    if (ms < p.unfolded) return { at: stand, yaw, pitch: 0, walked, sleighX: SLEIGH_DROP, slid: 0 };
    // Departure: the root is placed relative to the sleigh, which is kicked along and glides off.
    const forward = -side * Math.cos(SANTA_BIAS) * scale;
    const step = ease((ms - p.unfolded) / (p.board - p.unfolded));
    const sit = ease((ms - p.glide) / (p.seated - p.glide));
    const sleighX = SLEIGH_DROP - 3 * step - 12 * sit;
    const exit = santaExitPoint(p, b, view, side);
    const seatedX = stand.x + forward * (SLEIGH_DROP - 2);
    const slid = this.slid(ms, Math.abs(exit.x - seatedX));
    const x = stand.x + forward * (SLEIGH_DROP - sleighX) - side * slid;
    const climb = p.flies ? easeIn((ms - p.seated) / (p.exitEnd - p.seated)) : 0;
    const pitch = p.flies
      ? 0.2 * ease((ms - p.seated) / 450) * (1 - 0.5 * ease((ms - p.exitEnd + 500) / 500))
      : 0;
    return { at: { x, y: mix(stand.y, exit.y, climb) }, yaw, pitch, walked, sleighX, slid };
  }

  // ---------- Body pose ----------

  /** Hip height, hip shift and forward lean of the body at a moment (pure, so it can be evaluated ahead). */
  private bodyAt(ms: number, walked: number): { hip: number; hipX: number; lean: number } {
    const p = this.plan;
    if (ms < p.travel) {
      const h = santaHitch(p, ms);
      const speed = clamp(
        (santaProgress(p, ms + 12) - santaProgress(p, ms - 12)) * (p.travel / 24),
      );
      const stride = p.scurry ? 7.2 : 5.2;
      const bob = (p.scurry ? 0.9 : 0.5) * Math.abs(Math.sin((walked / stride) * Math.PI)) * speed;
      return {
        hip: SANTA_HIP - bob - 1.4 * h,
        hipX: 0,
        lean: 0.04 + (p.scurry ? 0.12 : 0.03) * speed - 0.06 * h,
      };
    }
    const lean = track(ms, [
      [p.travel, 0.04],
      [p.reach + 120, -0.07],
      [p.emerge + 200, -0.03],
      [p.out, 0.08],
      [p.show, 0.1],
      [mix(p.show, p.place, 0.55), 0.68],
      [p.place, 0.95],
      [p.wedge, 1],
      [p.tap, p.pull ? 0.95 : 0.72],
      [p.pop, p.pull ? 0.9 : 0.74],
      [p.pop + 110, -0.16],
      [p.peak + 260, 0],
      [p.settled, 0.02],
      [p.sleighReach + 160, -0.08],
      [p.sleighOut, 0.05],
      [p.toss - 110, -0.1],
      [p.toss, 0.28],
      [p.landed, 0.06],
      [p.unfolded, 0.1],
      [p.board, 0.5],
      [p.push, 0.55],
      [p.glide, 0.55],
      [p.seated, -0.08],
    ]);
    const crouch = track(ms, [
      [p.travel, 0],
      [p.show, 0],
      [mix(p.show, p.place, 0.55), 2.8],
      [p.place, 4.4],
      [p.wedge, 4.8],
      [p.tap, p.pull ? 4.4 : 2.6],
      [p.pop, p.pull ? 4 : 2.6],
      [p.pop + 110, 0],
      [p.toss - 110, 1.4],
      [p.toss, 0],
      [p.unfolded, 0],
      [p.board, 1],
      [p.push, 1.2],
      [p.glide, 1.2],
    ]);
    const seat = ease((ms - p.glide) / (p.seated - p.glide));
    const hip = mix(SANTA_HIP - crouch, SLEIGH_BASE_TOP + 5, seat);
    return { hip, hipX: 0, lean };
  }

  private laugh(ms: number): number {
    const p = this.plan;
    const ho = (start: number, end: number, count: number) =>
      ms > start && ms < end
        ? Math.abs(Math.sin((Math.PI * count * (ms - start)) / (end - start)))
        : 0;
    return Math.max(
      ho(p.peak + 200, p.settled - 120, p.laughs * 2),
      ho(p.unfold + 120, p.unfolded + 200, 3),
      ho(p.seated, p.exitEnd, 6) * 0.7,
    );
  }

  private feet(ms: number, side: Side, f: Frame, scale: number): [SoleTarget, SoleTarget] {
    const p = this.plan;
    const stride = p.scurry ? 7.2 : 5.2,
      lift = p.scurry ? 2.4 : 1.1;
    const near = side > 0 ? 0 : 1;
    const steps = [0, 1].map((i) => gait(f.walked, stride, i * 0.5, lift));
    if (ms < p.travel) {
      const planted = ease((ms / p.travel - 0.92) / 0.08);
      const at = (i: number) => ({
        x: 0.6 + (steps[i]?.x ?? 0),
        y: (steps[i]?.y ?? 0) * (1 - planted),
      });
      return [at(0), at(1)];
    }
    const neutral = (i: number) => (i === near ? 1.8 : -0.6);
    const turning = (start: number, i: number) => 1.3 * pulse(ms, start + i * 170, 170);
    const standing = (i: number): SoleTarget => {
      const settle = ease((ms - p.travel - i * 110) / 150);
      const x = mix(0.6 + (steps[i]?.x ?? 0), neutral(i), settle);
      const y =
        1.3 * pulse(ms, p.travel + i * 110, 150) +
        turning(p.peak + 150, i) +
        turning(p.settled - 250, i) +
        turning(p.settled - 80, i);
      return { x, y };
    };
    if (ms < p.unfolded) return [standing(0), standing(1)];
    // Departure, measured on the sleigh: the near foot steps onto its rear, the far foot kicks.
    const toSleigh = (x: number) => x - f.sleighX;
    const fromSleigh = (x: number) => x + f.sleighX;
    const step = ease((ms - p.unfolded) / (p.board - p.unfolded));
    const sit = ease((ms - p.glide) / (p.seated - p.glide));
    const unit = Math.cos(SANTA_BIAS) * scale;
    const board = { x: fromSleigh(-11), y: SLEIGH_BASE_TOP };
    const front: SoleTarget = {
      x: mix(mix(neutral(near), board.x, step), fromSleigh(7), sit),
      y:
        mix(0, SLEIGH_BASE_TOP, step) +
        5 * pulse(ms, p.unfolded, p.board - p.unfolded) +
        3 * pulse(ms, p.glide, p.seated - p.glide),
    };
    const far = 1 - near;
    const plant = neutral(far) - 3;
    let kickX = neutral(far) - 3 * step,
      kickY = 0;
    for (let i = 0; i < p.kicks; i++) {
      const t0 = p.push + i * 320;
      if (ms < t0) continue;
      const u = (ms - t0) / 320;
      const pushed = plant - (this.slid(Math.min(ms, t0 + 176), 0) - this.slid(t0, 0)) / unit;
      if (u < 0.55) kickX = pushed;
      else {
        const back = plant - (this.slid(t0 + 176, 0) - this.slid(t0, 0)) / unit;
        kickX = mix(back, plant, ease((u - 0.55) / 0.45));
        kickY = 3 * Math.sin(Math.PI * clamp((u - 0.55) / 0.45));
      }
    }
    const kicker: SoleTarget = {
      x: mix(kickX, fromSleigh(7), sit),
      y:
        mix(kickY, SLEIGH_BASE_TOP, sit) +
        9 * Math.sin(Math.PI * sit) * (toSleigh(kickX) < -12 ? 1 : 0.4),
    };
    return near === 0 ? [front, kicker] : [kicker, front];
  }

  private pose(ms: number, side: Side, f: Frame, scale: number): SantaPose {
    const p = this.plan;
    const body = this.bodyAt(ms, f.walked);
    const ho = this.laugh(ms);
    const h = santaHitch(p, ms);
    const look = (start: number, end: number) =>
      ease((ms - start) / 160) * (1 - ease((ms - end) / 200));
    const headTurn =
      0.65 * side * (look(p.reach, p.emerge + 150) + look(p.sleighReach, p.sleighReach + 380)) -
      0.25 * side * look(p.out, p.show);
    const headTilt =
      -0.3 * look(p.show, p.tap + 80) +
      0.2 * ho -
      0.12 * look(p.pop, p.peak + 120) +
      (p.shake ? -0.2 : 0.12) * look(p.out, p.show);
    const k = (ms + p.phase * 400) % 2900;
    const blink = Math.max(k > 2760 ? Math.sin((Math.PI * (k - 2760)) / 140) : 0, 0.55 * ho);
    const sackOpen = Math.max(
      look(p.reach + 100, p.emerge + 220),
      look(p.sleighReach + 100, p.sleighReach + 420),
    );
    const tip = p.gesture === 'tip' ? pulse(ms, p.gestureAt + 120, 460) : 0;
    const walking = ms < p.travel ? Math.sin((f.walked / (p.scurry ? 7.2 : 5.2)) * Math.PI) : 0;
    let sleigh: SleighPose | null = null;
    if (ms >= p.sleighReach + 220) sleigh = this.sleighPose(ms, side, f);
    return {
      ...SANTA_REST,
      side,
      feet: this.feet(ms, side, f, scale),
      hip: body.hip + 0.9 * ho,
      hipX: body.hipX,
      lean: body.lean,
      roll: (p.scurry ? 0.03 : 0.07) * walking,
      headTilt,
      headTurn,
      blink,
      mouth: Math.max(ho, 0.5 * look(p.pop, p.peak + 200)),
      jiggle: Math.sin(ms / 45) * ho,
      sackLift: 3.2 * h * h + 1.2 * pulse(ms, p.travel - 120, 300),
      sackSway:
        0.08 * walking + 0.1 * pulse(ms, p.travel - 40, 420) - 0.12 * pulse(ms, p.toss - 160, 300),
      sackOpen,
      hatLift: tip,
      flop: 0.35 * walking + 0.5 * pulse(ms, p.pop, 400) + 0.3 * ho - 0.4 * tip,
      sleigh,
    };
  }

  // ---------- Props ----------

  /** Body-space point to root space, for a body pose evaluated at any moment. */
  private bodyToRoot(local: THREE.Vector3, ms: number, walked: number, out: THREE.Vector3) {
    const body = this.bodyAt(ms, walked);
    const c = Math.cos(-body.lean),
      s = Math.sin(-body.lean);
    return out.set(
      body.hipX + local.x * c - local.y * s,
      body.hip + local.x * s + local.y * c,
      local.z,
    );
  }

  /** The folded sleigh: pulled up out of the sack, swung round, tossed ahead, then unfolded. */
  private sleighPose(ms: number, side: Side, f: Frame): SleighPose {
    const p = this.plan,
      m = this.model;
    const centre = SLEIGH_PIVOT + 0.7;
    const place = (
      at: THREE.Vector3,
      angle: number,
      unfold: number,
      squash: number,
    ): SleighPose => ({
      x: at.x + Math.sin(angle) * centre,
      y: at.y - Math.cos(angle) * centre,
      angle,
      unfold,
      squash,
    });
    if (ms >= p.landed) {
      const unfold = clamp((ms - p.unfold) / (p.unfolded - p.unfold));
      return {
        x: f.sleighX,
        y: -sleighRest(m, unfold),
        angle: 0,
        unfold,
        squash: pulse(ms, p.landed, 180) + 0.6 * pulse(ms, p.seated - 80, 220),
      };
    }
    const at = Math.min(ms, p.toss);
    const held = this.sleighHeld(at, side);
    const release = this.bodyToRoot(held.at, at, f.walked, this.v[5] ?? new THREE.Vector3());
    const angle = held.angle - this.bodyAt(at, f.walked).lean;
    if (ms < p.toss) return place(release, angle, 0, 0);
    const t = (ms - p.toss) / (p.landed - p.toss);
    const land = this.v[4] ?? new THREE.Vector3();
    land.set(SLEIGH_DROP, -sleighRest(m, 0) + centre, 0);
    const flying = this.v[3] ?? new THREE.Vector3();
    flying.lerpVectors(release, land, t);
    flying.y += 9 * 4 * t * (1 - t);
    return place(flying, mix(angle, 0, easeOut(t)), 0, 0);
  }
  /** Body-space centre and angle of the folded sleigh while it is in Santa's hands. */
  private sleighHeld(ms: number, side: Side): { at: THREE.Vector3; angle: number } {
    const p = this.plan;
    const mouth = sackNeck(this.model, side).mouth;
    const at = this.v[2] ?? new THREE.Vector3();
    const up = Math.PI / 2;
    const rise = ease((ms - p.sleighReach - 220) / 200);
    const swing = ease((ms - p.sleighReach - 420) / (p.sleighOut - p.sleighReach - 420));
    const wind = ease((ms - p.sleighOut) / (p.toss - p.sleighOut - 90)),
      thrust = ease((ms - p.toss + 90) / 90);
    at.set(mouth.x + 0.3 * (rise - 1) * 14, mouth.y + 14 * (rise - 1) + 4, mouth.z);
    // Round the far side of the head, to a vertical hold in front, back for the wind-up and up into the throw.
    const ax = mix(at.x, 16.5, swing),
      ay = mix(at.y, 12, swing) + 8 * Math.sin(Math.PI * swing),
      az = mix(at.z, 0, swing) - side * 9 * Math.sin(Math.PI * swing);
    at.set(ax - 3.5 * wind + 4 * thrust, ay - 3 * wind + 5 * thrust, az);
    return { at, angle: up - 0.3 * (1 - swing) + 0.2 * wind - 0.55 * thrust };
  }

  /** Root-space bottom centre of the present while it is carried, with its tilt. */
  private giftHeld(ms: number, side: Side, walked: number): { at: THREE.Vector3; angle: number } {
    const p = this.plan;
    const mouth = sackNeck(this.model, side).mouth;
    const at = this.v[1] ?? new THREE.Vector3();
    const rise = ease((ms - p.emerge) / 220);
    const swing = ease((ms - p.emerge - 220) / (p.out - p.emerge - 220));
    // Out of the sack mouth, around the far side of the head, to a hug in front of the belly.
    at.set(mouth.x - 3 + 2 * rise, mouth.y - 13 + 13 * rise, mouth.z - side * 4);
    const hold = { x: 15, y: 12, z: 0 };
    let x = mix(at.x, hold.x, swing),
      y = mix(at.y, hold.y, swing) + 9 * Math.sin(Math.PI * swing),
      z = mix(at.z, hold.z, swing) - side * 4 * Math.sin(Math.PI * swing);
    let angle = -0.3 * (1 - swing);
    if (ms >= p.out) {
      const beat = span(ms, p.out, p.show - p.out);
      if (p.shake) {
        const raise = Math.sin(Math.PI * beat);
        y += 4 * raise + 1.1 * Math.sin(ms / 13) * raise;
        x -= 1.5 * raise;
        angle += 0.12 * Math.sin(ms / 17) * raise;
      } else y += 3 * Math.sin(Math.PI * beat);
    }
    this.bodyToRoot(this.v[0]?.set(x, y, z) ?? new THREE.Vector3(x, y, z), ms, walked, at);
    angle -= this.bodyAt(ms, walked).lean;
    // Lowered to the floor in front, then pushed in under the corner.
    const down = ease((ms - p.show) / (p.place - p.show));
    const floorX =
      GIFT_REACH - GIFT_SLIDE + GIFT_SLIDE * ease((ms - p.place) / (p.wedge - p.place));
    x = mix(at.x, floorX, down);
    y = mix(at.y, 0, down);
    z = mix(at.z, 0, down);
    return { at: at.set(x, y, z), angle: mix(angle, 0, down) };
  }

  private placeGift(
    ms: number,
    side: Side,
    stand: Point,
    b: TargetBounds,
    q: CardPose,
    scale: number,
    walked: number,
  ) {
    const p = this.plan,
      g = this.gift;
    const shown = ms >= p.emerge;
    g.group.visible = g.lid.visible = shown;
    g.spring.visible = false;
    if (!shown) return;
    const held = this.giftHeld(Math.min(ms, p.wedge), side, walked);
    if (ms < p.place) {
      // Carried: root space follows the actor exactly.
      g.group.position.copy(held.at);
      this.actor.localToWorld(g.group.position);
      this.tilt.setFromAxisAngle(this.zAxis, held.angle);
      g.group.quaternion.copy(this.actor.quaternion).multiply(this.tilt);
    } else {
      // On the floor: fixed in the world at the stand point, whichever way Santa turns afterwards.
      this.stand.compose(
        this.standAt.set(stand.x, -stand.y, DEPTH),
        this.turn.setFromEuler(this.yawEuler.set(0, santaYaw(side), 0)),
        this.standScale.setScalar(scale),
      );
      g.group.position.copy(held.at).applyMatrix4(this.stand);
      g.group.quaternion.copy(this.turn);
    }
    g.group.scale.setScalar(scale);
    g.bow.rotation.y = side > 0 ? 0 : Math.PI;
    g.bow.position.z = side * (GIFT_D / 2 + 0.8);
    // Tugging the ribbon tail swings it out before the spring lets go.
    const tug = p.pull ? ease((ms - p.tap) / (p.pop - p.tap)) * (1 - ease((ms - p.pop) / 220)) : 0;
    g.tail.rotation.set(-0.9 * tug, 0, 0.25 + 0.5 * tug);
    const fade = 1 - ease((ms - p.exitEnd) / 500);
    for (const m of g.materials) {
      m.transparent = fade < 1;
      m.opacity = fade;
    }
    // The lid sits on the box until the pop, then rides the card corner exactly.
    g.group.updateMatrix();
    const top = this.boxTop.set(0, GIFT_H, 0).applyMatrix4(g.group.matrix);
    const lifted = ms >= p.pop && ms < p.settled;
    g.lid.scale.setScalar(scale);
    if (!lifted) {
      g.lid.position.set(0, GIFT_CLOSED, 0).applyMatrix4(g.group.matrix);
      g.lid.quaternion.copy(g.group.quaternion);
      return;
    }
    const contact = cardPoint(q, { x: santaContactX(p, b, side), y: b.top + b.height }, b);
    g.lid.position.set(contact.x, -contact.y, g.group.position.z);
    this.tilt.setFromAxisAngle(this.zAxis, cardTurn(q));
    g.lid.quaternion.copy(this.tilt).multiply(g.group.quaternion);
    const under = this.lidUnder
      .set(0, -LID_H, 0)
      .applyQuaternion(g.lid.quaternion)
      .multiplyScalar(scale)
      .add(g.lid.position);
    g.spring.visible = true;
    bone3(g.spring, top, under);
    g.spring.scale.x = g.spring.scale.z = scale;
  }

  // ---------- Arms ----------

  /** Three-dimensional two-bone reach: the shoulder swings so the elbow points toward the pole. */
  private armTo(limb: Limb, target: THREE.Vector3, pole: THREE.Vector3) {
    const [e1, e2, e3] = this.e;
    if (!e1 || !e2 || !e3) return;
    e1.subVectors(target, limb.root.position);
    const length = e1.length();
    if (length < 0.0001) e1.set(0, -1, 0);
    else e1.divideScalar(length);
    e2.copy(pole).addScaledVector(e1, -pole.dot(e1));
    if (e2.lengthSq() < 1e-6) e2.set(-e1.y, e1.x, 0);
    e2.normalize();
    e3.crossVectors(e1, e2);
    this.basis.makeBasis(e1, e2, e3);
    limb.root.quaternion.setFromRotationMatrix(this.basis);
    reach(limb, Math.max(0.0001, length), 0, 1);
  }
  private toBody(world: THREE.Vector3): THREE.Vector3 {
    return this.model.body.worldToLocal(world);
  }
  private markerInBody(o: THREE.Object3D, out: THREE.Vector3): THREE.Vector3 {
    o.updateWorldMatrix(true, false);
    return this.toBody(o.getWorldPosition(out));
  }
  private giftPoint(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    this.gift.group.updateMatrixWorld(true);
    return this.toBody(this.gift.group.localToWorld(out.set(x, y, z)));
  }

  private placeArms(ms: number, side: Side) {
    const p = this.plan,
      m = this.model;
    const nearArm = side > 0 ? m.arms[0] : m.arms[1],
      farArm = side > 0 ? m.arms[1] : m.arms[0];
    const zn = side * SANTA_SHOULDER.z;
    const neck = sackNeck(m, side);
    const goal = (
      x: number,
      y: number,
      z: number,
      px: number,
      py: number,
      pz: number,
    ): ArmGoal => ({
      at: new THREE.Vector3(x, y, z),
      pole: new THREE.Vector3(px, py, pz),
    });
    const down = (z: number) => new THREE.Vector3(-0.7, -1, 0.9 * Math.sign(z));
    const blend = (a: ArmGoal, b: ArmGoal, t: number): ArmGoal => ({
      at: a.at.clone().lerp(b.at, clamp(t)),
      pole: a.pole.clone().lerp(b.pole, clamp(t)),
    });
    const gripZ = side * (GIFT_D / 2 + 2.1);
    const giftNear = (): ArmGoal => ({
      at: this.giftPoint(0, 6, gripZ, new THREE.Vector3()),
      pole: down(zn),
    });
    const giftFar = (): ArmGoal => ({
      at: this.giftPoint(0, 6, -gripZ, new THREE.Vector3()),
      pole: down(-zn),
    });
    const neckNear: ArmGoal = { at: neck.grip.clone(), pole: down(zn) };
    const neckFar: ArmGoal = { at: neck.shoulder.clone().lerp(neck.grip, 0.62), pole: down(-zn) };
    const belly = (z: number, ho: number) =>
      goal(11.6, 7 + 1.2 * ho, z * 0.7, -0.6, -1, Math.sign(z));
    const ho = this.laugh(ms);
    const mouth: ArmGoal = {
      at: neck.mouth.clone().add(new THREE.Vector3(0.6, 1.6, 0)),
      pole: new THREE.Vector3(0.5, 1, 0.9 * side),
    };
    const sleighGrip = (i: 0 | 1): ArmGoal => {
      const grip = m.carryGrips[side > 0 ? i : i === 0 ? 1 : 0];
      return {
        at: grip ? this.markerInBody(grip, new THREE.Vector3()) : new THREE.Vector3(),
        pole: down(i === 0 ? zn : -zn),
      };
    };
    const rail = (i: 0 | 1): ArmGoal => {
      const grip = m.railGrips[side > 0 ? i : i === 0 ? 1 : 0];
      return {
        at: grip ? this.markerInBody(grip, new THREE.Vector3()) : new THREE.Vector3(),
        pole: down(i === 0 ? zn : -zn),
      };
    };
    const rest = (z: number) => goal(6, 4.5, z * 1.3, -0.5, -1, Math.sign(z));
    let near: ArmGoal, far: ArmGoal;
    if (ms < p.reach) {
      near = neckNear;
      far = neckFar;
    } else if (ms < p.emerge) {
      near = blend(neckNear, mouth, ease((ms - p.reach) / (p.emerge - p.reach)));
      far = neckFar;
    } else if (ms < p.wedge) {
      near = blend(mouth, giftNear(), ease((ms - p.emerge) / 120));
      far = blend(neckFar, giftFar(), ease((ms - p.emerge - 90) / 200));
    } else if (ms < p.pop) {
      const tug = ease((ms - p.tap) / (p.pop - p.tap));
      const trigger = p.pull
        ? this.giftPoint(
            1.8,
            mix(7.6, 9.4, tug),
            side * (GIFT_D / 2 + mix(1.8, 5.4, tug)),
            new THREE.Vector3(),
          )
        : this.giftPoint(
            0.5,
            GIFT_H + LID_H + 1.6 - 1.2 * pulse(ms, p.tap, p.pop - p.tap),
            side * (GIFT_D / 2 - 1),
            new THREE.Vector3(),
          );
      near = blend(
        giftNear(),
        { at: trigger, pole: down(zn) },
        ease((ms - p.wedge) / (p.tap - p.wedge)),
      );
      far = giftFar();
    } else if (ms < p.settled) {
      const up = (z: number) => goal(7, 25, z * 1.35, -0.2, -1, Math.sign(z));
      const startle = ease((ms - p.pop) / 110),
        hug = ease((ms - p.peak - 120) / 220);
      const lastNear = this.giftPoint(0, 6, gripZ, new THREE.Vector3());
      near = blend(blend({ at: lastNear, pole: down(zn) }, up(zn), startle), belly(zn, ho), hug);
      far = blend(blend(giftFar(), up(-zn), startle), belly(-zn, ho), hug);
    } else if (ms < p.sleighReach + 220) {
      near = blend(belly(zn, 0), mouth, ease((ms - p.settled) / (p.sleighReach + 220 - p.settled)));
      far = blend(belly(-zn, 0), rest(-zn), ease((ms - p.settled) / 300));
    } else if (ms < p.toss) {
      near = blend(mouth, sleighGrip(0), ease((ms - p.sleighReach - 220) / 120));
      far = blend(rest(-zn), sleighGrip(1), ease((ms - p.sleighReach - 300) / 200));
    } else if (ms < p.unfolded + 100) {
      const follow = (z: number) => goal(15, 21, z * 1.2, -0.3, -1, Math.sign(z));
      const settleT = ease((ms - p.toss - 160) / 260);
      near = blend(follow(zn), rest(zn), settleT);
      far = blend(follow(-zn), rest(-zn), settleT);
    } else if (ms < p.seated) {
      near = blend(rest(zn), rail(0), ease((ms - p.unfolded - 100) / 200));
      far = blend(rest(-zn), rail(1), ease((ms - p.unfolded - 100) / 200));
    } else {
      // After turning to leave, the far arm from the card faces the viewer, so it does the gesture.
      near = rail(0);
      const g = clamp((ms - p.gestureAt) / 700);
      if (p.gesture === 'wave') {
        const wave = goal(
          9,
          33,
          -zn * (1.5 + 0.35 * Math.sin(g * Math.PI * 6)),
          0,
          -0.4,
          -Math.sign(zn),
        );
        far = blend(rail(1), wave, Math.sin(Math.PI * g) * 1.6);
      } else {
        m.head.updateMatrixWorld(true);
        const brim = this.toBody(m.hat.localToWorld(new THREE.Vector3(3.6, 0.6, -side * 4.6)));
        far = blend(
          rail(1),
          { at: brim, pole: new THREE.Vector3(0.2, -1, -side) },
          Math.sin(Math.PI * g) * 1.6,
        );
      }
    }
    this.armTo(nearArm, near.at, near.pole);
    this.armTo(farArm, far.at, far.pole);
  }

  // ---------- Bubble and effects ----------

  private placeBubble(ms: number, b: TargetBounds, view: Point) {
    const p = this.plan;
    const visible = ms >= p.unfold && ms < p.bubbleOut;
    this.bubble.visible = visible;
    if (!visible) return;
    const head = screenOf(this.model.hat);
    const width = Math.min(190, view.x - 16),
      height = (width * BUBBLE_H) / BUBBLE_W;
    const x = Math.max(width / 2 + 8, Math.min(view.x - width / 2 - 8, head.x));
    const y = Math.max(height / 2 + 8, Math.min(b.top - height / 2 - 8, head.y - height / 2 - 14));
    this.bubble.position.set(x, -y, DEPTH + 60);
    this.bubble.scale.set(width, height, 1);
    this.bubble.material.opacity =
      ease((ms - p.unfold) / 220) * (1 - ease((ms - p.bubbleOut + 320) / 320));
  }

  private placeEffects(ms: number, b: TargetBounds, side: Side, scale: number) {
    const p = this.plan;
    const top = cardPoint(
      santaCardPose(p, p.peak, side, b),
      { x: santaContactX(p, b, side), y: b.top + b.height },
      b,
    );
    this.sparkles.forEach((s, i) => {
      const t = (ms - p.pop - (i % 3) * 30) / 650;
      s.visible = t > 0 && t < 1;
      if (!s.visible) return;
      const a = -Math.PI / 2 + ((i / 7) * 2 - 1) * 1.25;
      const r = (8 + 26 * easeOut(t)) * scale * (0.7 + 0.1 * (i % 4));
      s.position.set(
        top.x + Math.cos(a) * r - side * 4 * scale,
        -(top.y + Math.sin(a) * r * 0.8),
        DEPTH + 30,
      );
      s.rotation.z = t * 4 + i;
      s.scale.setScalar((1.4 + (i % 3) * 0.5) * scale * Math.sin(Math.PI * t));
      s.material.opacity = 1 - t * t;
    });
    // Snow puffs where the sleigh lands and where the boot kicks off.
    this.puffs.forEach((puff, i) => {
      const born = i < 3 ? p.landed : p.push + (i - 3) * 320 + 60;
      const live = i < 3 ? 1 : i - 3 < p.kicks ? 1 : 0;
      const t = (ms - born) / 520;
      puff.visible = live > 0 && t > 0 && t < 1;
      if (!puff.visible) return;
      const floor = santaFloor(b);
      const base =
        i < 3 ? screenOf(this.model.sleigh) : screenOf(this.model.legs[side > 0 ? 1 : 0].end);
      const spread = ((i % 3) - 1) * 12 * scale;
      puff.position.set(base.x + spread * (1 + t), -(floor - 2 - 7 * t * scale), DEPTH + 20);
      puff.scale.set((2.5 + 4 * t) * scale, (1.6 + 2.5 * t) * scale, 1);
      puff.material.opacity = 0.75 * (1 - t);
    });
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
    this.object.visible = ms < SANTA_DURATION;
    this.object.position.set(0, 0, 0);
    const scale = santaScale(b);
    const stand = santaLandingPoint(p, b, view, side);
    // The feet start just below the sender's card centre so the body itself leaves from it.
    const from = { x: start.x, y: start.y + 26 * scale };
    const f = this.frame(ms, from, stand, b, view, side, scale);
    actor.visible = ms < SANTA_DURATION;
    actor.position.set(f.at.x, -f.at.y, DEPTH);
    actor.rotation.set(0, f.yaw, f.pitch);
    actor.scale.setScalar(scale);
    santaPose(actor, this.pose(ms, side, f, scale));
    actor.updateMatrixWorld(true);
    const q = santaCardPose(p, ms, side, b);
    this.placeGift(ms, side, stand, b, q, scale, f.walked);
    this.object.updateMatrixWorld(true);
    this.placeArms(ms, side);
    actor.updateMatrixWorld(true);
    this.placeBubble(ms, b, view);
    this.placeEffects(ms, b, side, scale);
    this.object.updateMatrixWorld(true);
  }
}
