import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardPoint,
  cardTurn,
  clamp,
  ease,
  gait,
  glow,
  mix,
  part,
  pulse,
  reach,
  screenOf,
  sideOf,
  sideRoute,
  type CardPose,
  type CharacterRoutine,
  type Limb,
  type Side,
} from '../../kit';
import {
  DAISY_STEM,
  HIPPIE_BIAS,
  HIPPIE_DURATION,
  HIPPIE_GREETING,
  daisyFlower,
  daisyGrip,
  hippieCardAngle,
  hippieCardPose,
  hippieExitPoint,
  hippieFlash,
  hippieFrames,
  hippieLandingPoint,
  hippieProgress,
  hippieRock,
  hippieScale,
  hippieSniff,
  type HippiePlan,
} from './hippie-choreography';
import {
  HIPPIE_HIP,
  HIPPIE_REST,
  hippieModel,
  hippiePose,
  tiptoeAnkle,
  type HippieModel,
  type HippiePose,
  type SoleTarget,
} from './hippie-model';

export { makeHippie } from './hippie-model';
export { HIPPIE_DURATION, HIPPIE_GREETING } from './hippie-choreography';

const DEPTH = 170;
const ROUTE = 32;
/** The daisy rides this far in front of the actor's plane once it is tucked into the card. */
const CARD_Z = 8;
const BUBBLE_W = 640,
  BUBBLE_H = 210;
const PETALS = 4;

/** Yaw that faces a screen direction (cosine c) while turning the face three quarters to the viewer. */
export function hippieYaw(c: number): number {
  return -(
    HIPPIE_BIAS +
    (Math.acos(Math.max(-1, Math.min(1, c))) * (Math.PI - 2 * HIPPIE_BIAS)) / Math.PI
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

/** The thought bubble, drawn once into a canvas texture that is disposed through `material.map`. */
export function hippieGreeting(): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = BUBBLE_W;
    canvas.height = BUBBLE_H;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#fffaf0';
      ctx.strokeStyle = '#7a4a9c';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.roundRect(6, 6, 628, 160, 70);
      ctx.fill();
      ctx.stroke();
      for (const [x, y, r] of [
        [320, 180, 11],
        [334, 199, 6],
      ] as const) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#5b3478';
      ctx.font = 'bold 62px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(HIPPIE_GREETING, 320, 88);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    material.map = texture;
  }
  const bubble = new THREE.Sprite(material);
  bubble.name = 'hippie-greeting';
  bubble.userData['text'] = HIPPIE_GREETING;
  bubble.renderOrder = 10;
  bubble.visible = false;
  return bubble;
}

interface ArmGoal {
  readonly at: THREE.Vector3;
  readonly pole: THREE.Vector3;
}
interface Frame {
  readonly at: Point;
  readonly yaw: number;
  /** Model units walked so far, which drives the stance-planted gait. */
  readonly walked: number;
  readonly stride: number;
}

export class HippieTrick implements CharacterRoutine {
  readonly object = new THREE.Group();
  readonly plan: HippiePlan;
  readonly duration: number;
  private readonly model: HippieModel;
  private readonly actor: THREE.Group;
  private readonly bubble: THREE.Sprite;
  private readonly petals: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly lengths = new Float32Array(ROUTE + 1);
  private readonly basis = new THREE.Matrix4();
  private readonly v = [0, 1, 2, 3].map(() => new THREE.Vector3());
  private readonly e = [0, 1, 2].map(() => new THREE.Vector3());

  constructor(actor: THREE.Group) {
    this.actor = actor;
    this.model = hippieModel(actor);
    this.plan = this.model.plan;
    this.duration = HIPPIE_DURATION * this.plan.pace;
    this.object.name = 'hippie-daisy-tuck';
    // The daisy is placed in screen space, so it can stay tucked into the card after she lets go.
    this.object.add(this.model.daisy.root);
    this.bubble = hippieGreeting();
    this.object.add(this.bubble);
    for (let i = 0; i < PETALS; i++) {
      const petal = part(
        this.object,
        `hippie-loose-petal-${i}`,
        new THREE.SphereGeometry(1, 8, 6),
        glow(0xfffdf4, 0),
      );
      petal.visible = false;
      this.petals.push(petal);
    }
  }

  cardAnimation(facing: number, b?: TargetBounds) {
    return hippieFrames(this.plan, facing, b ?? { left: 0, top: 0, width: 84, height: 122 });
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
  private paramAt(distance: number): number {
    for (let i = 0; i < ROUTE; i++) {
      const a = this.lengths[i] ?? 0,
        c = this.lengths[i + 1] ?? 0;
      if (distance <= c || i === ROUTE - 1)
        return (i + clamp((distance - a) / Math.max(0.0001, c - a))) / ROUTE;
    }
    return 1;
  }
  private baseStride(): number {
    return this.plan.gait === 'skip' ? 12 : 10;
  }
  /** Exit progress: eases from rest into an unhurried, steady wander. */
  private exitProgress(ms: number): number {
    const p = this.plan,
      tau = clamp((ms - p.turned) / p.exit),
      a = 0.3;
    return tau < a ? tau ** 2 / (2 * a) / (1 - a / 2) : (tau - a / 2) / (1 - a / 2);
  }
  private exitAt(e: number, stand: Point, exit: Point): Point {
    return {
      x: mix(stand.x, exit.x, e),
      y: mix(stand.y, exit.y, ease(e)) - Math.sin(Math.PI * 2 * e) * this.plan.meander * 0.35,
    };
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
    // Longer routes lengthen the stride rather than blur the feet.
    const approachStride = Math.max(
      this.baseStride(),
      Math.min(20, length / scale / (p.travel / 430)),
    );
    if (ms < p.travel) {
      const s = hippieProgress(p, ms) * length;
      const u = this.paramAt(s);
      const at = this.routeAt(u, start, stand, b, view, side);
      const ahead = this.routeAt(Math.min(1, u + 0.015), start, stand, b, view, side),
        behind = this.routeAt(Math.max(0, u - 0.015), start, stand, b, view, side);
      const dx = ahead.x - behind.x,
        d = Math.hypot(dx, ahead.y - behind.y);
      const heading = d > 0.5 ? hippieYaw(dx / d) : hippieYaw(side);
      const yaw = mix(heading, hippieYaw(side), ease((ms / p.travel - 0.84) / 0.16));
      return { at, yaw, walked: s / scale, stride: approachStride };
    }
    const walked = length / scale;
    if (ms < p.turned) {
      const yaw = mix(
        hippieYaw(side),
        hippieYaw(-side),
        ease((ms - p.depart) / (p.turned - p.depart)),
      );
      return { at: stand, yaw, walked, stride: approachStride };
    }
    const exit = hippieExitPoint(p, b, view, side);
    const exitLength = Math.hypot(exit.x - stand.x, exit.y - stand.y);
    const e = this.exitProgress(ms);
    const stride = Math.max(10, Math.min(20, exitLength / scale / (p.exit / 470)));
    return {
      at: this.exitAt(e, stand, exit),
      yaw: hippieYaw(-side),
      walked: walked + (e * exitLength) / scale,
      stride,
    };
  }

  // ---------- Body pose ----------

  /** Hip height, lean and the heel-up toe pitch at a moment. */
  private bodyAt(ms: number, f: Frame): { hip: number; lean: number; roll: number; toe: number } {
    const p = this.plan;
    const skip = p.gait === 'skip';
    if (ms < p.travel || ms >= p.turned) {
      const speed =
        ms < p.travel
          ? clamp((hippieProgress(p, ms + 12) - hippieProgress(p, ms - 12)) * (p.travel / 24))
          : 1;
      const cycle = (f.walked / f.stride) * Math.PI * 2;
      const leaving = ms >= p.turned;
      const bounce =
        !leaving && skip ? 2.2 * Math.max(0, Math.sin(cycle * 2)) : 0.7 * Math.abs(Math.sin(cycle));
      const sniff = hippieSniff(p, ms);
      return {
        hip: HIPPIE_HIP - 0.6 + bounce * speed - 0.8 * sniff,
        lean: (skip && !leaving ? 0.08 : 0.02) * speed - 0.12 * sniff,
        roll: (skip && !leaving ? 0.04 : 0.09) * Math.sin(cycle) * speed,
        toe: 0,
      };
    }
    const rock = hippieRock(p, ms);
    const lean = track(ms, [
      [p.travel, 0.02],
      [p.look, -0.05],
      [p.reach, -0.04],
      [p.reach + 360, 0.12 + 0.08 * p.stretch],
      [p.tuck, 0.16 + 0.1 * p.stretch],
      [p.release, 0.2 + 0.08 * p.stretch],
      [p.release + 260, 0],
      [p.depart, 0],
    ]);
    const toe = track(ms, [
      [p.reach + 120, 0],
      [p.reach + 420, 0.35 + 0.15 * p.stretch],
      [p.release, 0.42 + 0.12 * p.stretch],
      [p.release + 240, 0],
    ]);
    return {
      hip: HIPPIE_HIP - 0.6 + (tiptoeAnkle(toe) - tiptoeAnkle(0)) + 0.5 * Math.abs(rock),
      lean: lean + 0.09 * rock,
      roll: 0.05 * rock,
      toe,
    };
  }

  private feet(ms: number, f: Frame): [SoleTarget, SoleTarget] {
    const p = this.plan;
    const skip = p.gait === 'skip' && ms < p.travel;
    const lift = skip ? 3.2 : 1.6;
    const steps = [0, 1].map((i) => gait(f.walked, f.stride, i * 0.5, lift));
    const walk = (i: number, planted = 0) => ({
      x: 0.2 + (steps[i]?.x ?? 0),
      y: (steps[i]?.y ?? 0) * (1 - planted),
    });
    if (ms < p.travel) {
      const planted = ease((ms / p.travel - 0.92) / 0.08);
      return [walk(0, planted), walk(1, planted)];
    }
    if (ms >= p.turned) {
      // The first step out of the turn starts from the standing feet.
      const into = ease((ms - p.turned) / 220);
      return [0, 1].map((i) => {
        const w = walk(i);
        return { x: mix(i === 0 ? 1.2 : -1, w.x, into), y: w.y * into };
      }) as [SoleTarget, SoleTarget];
    }
    const neutral = (i: number) => (i === 0 ? 1.2 : -1);
    const shuffle = (i: number) => 1.4 * pulse(ms, p.depart + i * 170, 190);
    return [0, 1].map((i) => {
      const settle = ease((ms - p.travel - i * 110) / 160);
      const w = walk(i);
      return {
        x: mix(w.x, neutral(i), settle),
        y: 1.2 * pulse(ms, p.travel + i * 110, 160) + shuffle(i),
      };
    }) as [SoleTarget, SoleTarget];
  }

  private pose(ms: number, side: Side, f: Frame): HippiePose {
    const p = this.plan;
    const body = this.bodyAt(ms, f);
    const sniff = hippieSniff(p, ms);
    const rock = hippieRock(p, ms);
    const look = (start: number, end: number) =>
      ease((ms - start) / 180) * (1 - ease((ms - end) / 220));
    const k = (ms + p.phase * 500) % 3100;
    const blink = Math.max(k > 2960 ? Math.sin((Math.PI * (k - 2960)) / 140) : 0, 0.85 * sniff);
    const swinging =
      ms < p.travel || ms >= p.turned ? Math.sin((f.walked / f.stride) * Math.PI * 2) : 0;
    const groove =
      ms > p.swayStart && ms < p.swayEnd
        ? Math.sin((Math.PI * 4 * (ms - p.swayStart)) / p.period)
        : 0;
    const peaceArm = side > 0 ? 1 : 0,
      daisyArm = 1 - peaceArm;
    const flash = Math.max(
      hippieFlash(p, ms),
      ms >= p.turned - 100 ? pulse(ms, p.turned - 100, 1100) * 1.4 : 0,
    );
    const cardPeace =
      ease((ms - p.swayStart - 150) / 200) * (1 - ease((ms - p.swayEnd + 420) / 200));
    const peace: [number, number] = [0, 0];
    peace[peaceArm] = clamp(flash) * (p.farewell === 'wave' && ms >= p.turned - 100 ? 0.65 : 1);
    peace[daisyArm] = cardPeace;
    const lookBack = p.farewell === 'peace' ? side * 0.55 * look(p.turned, p.turned + 700) : 0;
    return {
      ...HIPPIE_REST,
      feet: this.feet(ms, f),
      toe: body.toe,
      hip: body.hip,
      lean: body.lean,
      roll: body.roll,
      headTilt:
        0.35 * sniff + 0.18 * look(p.look, p.reach + 200) + 0.2 * look(p.reach + 200, p.release),
      headRoll: p.tilt * look(p.look, p.reach + 120) + 0.06 * rock,
      headNod: 0.1 * groove + 0.04 * Math.abs(swinging),
      headTurn: lookBack - side * 0.35 * look(p.swayStart + 100, p.swayEnd - 300),
      blink,
      smile: 0.5 + 0.5 * Math.max(sniff, look(p.release, p.depart)),
      peace,
      swing: 0.6 * swinging + 0.8 * rock + 0.5 * body.lean,
    };
  }

  // ---------- Daisy ----------

  /** World grip point and screen angle of the daisy while she carries it. */
  private daisyHeld(ms: number, side: Side, scale: number, out: THREE.Vector3): number {
    const m = this.model;
    const zArm = side > 0 ? 1 : -1;
    const fs = Math.sign(Math.cos(this.actor.rotation.y)) || side;
    const sniff = hippieSniff(this.plan, ms);
    m.body.localToWorld(out.set(5.4, 1.8 + 0.6 * Math.sin(ms / 140), zArm * 5));
    // Held low and tipped forward, so the flower sits in front of her chest rather than her face.
    const carry = -fs * 0.55;
    if (sniff <= 0) return carry;
    // Raised so the flower sits under her nose, the stem leaning back toward her face.
    const nose = m.head.localToWorld(
      this.v[3]?.set(6.2, -0.4, 0) ?? new THREE.Vector3(6.2, -0.4, 0),
    );
    const angle = fs * 0.45;
    const length = DAISY_STEM * scale;
    const gx = nose.x + Math.sin(angle) * length,
      gy = nose.y - Math.cos(angle) * length;
    out.set(mix(out.x, gx, sniff), mix(out.y, gy, sniff), mix(out.z, nose.z + 2 * scale, sniff));
    return mix(carry, angle, sniff);
  }

  private placeDaisy(ms: number, side: Side, b: TargetBounds, q: CardPose, scale: number) {
    const p = this.plan,
      daisy = this.model.daisy;
    const held = this.v[0] ?? new THREE.Vector3();
    let angle = this.daisyHeld(Math.min(ms, p.reach), side, scale, held);
    if (ms >= p.reach) {
      // From her hand up onto the card corner: lifted in an arc, then pressed home at the tuck.
      const grip = cardPoint(q, daisyGrip(p, b, side), b);
      const tucked = cardTurn(q) - side * p.lean;
      const t = ease((ms - p.reach) / (p.tuck - p.reach));
      const arc = Math.sin(Math.PI * t) * 6 * scale;
      held.set(
        mix(held.x, grip.x, t) - side * arc * 0.3,
        mix(held.y, -grip.y, t) + arc,
        mix(held.z, DEPTH + CARD_Z * scale, t),
      );
      angle = mix(angle, tucked, t);
    }
    daisy.root.position.copy(held);
    daisy.root.rotation.set(0, 0, angle);
    daisy.root.scale.setScalar(scale);
    // The flower head lags the card's rock and springs back after the push.
    const swing = hippieCardAngle(p, ms, side) - hippieCardAngle(p, ms - 80, side);
    daisy.head.rotation.z = ms >= p.tuck ? ((swing * Math.PI) / 180) * 1.6 : 0;
    const fade = 1 - ease((ms - p.exitEnd) / (p.fadeEnd - p.exitEnd));
    daisy.root.visible = fade > 0;
    daisy.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
        material.transparent = fade < 1;
        material.opacity = fade;
      }
    });
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
  /** Reaches so the palm's grip, not the wrist, lands on a world point. */
  private gripTo(index: 0 | 1, world: THREE.Vector3, pole: THREE.Vector3) {
    const m = this.model,
      limb = m.arms[index],
      grip = m.hands[index].grip;
    const target = m.body.worldToLocal(world.clone());
    const aim = target.clone();
    for (let i = 0; i < 3; i++) {
      this.armTo(limb, aim, pole);
      limb.root.updateMatrixWorld(true);
      const at = m.body.worldToLocal(grip.getWorldPosition(this.v[1] ?? new THREE.Vector3()));
      aim.add(target.clone().sub(at));
    }
    this.armTo(limb, aim, pole);
  }

  private placeArms(ms: number, side: Side, f: Frame) {
    const p = this.plan,
      m = this.model;
    const daisyArm: 0 | 1 = side > 0 ? 0 : 1,
      peaceArm: 0 | 1 = side > 0 ? 1 : 0;
    const zd = daisyArm === 0 ? 1 : -1,
      zp = -zd;
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
    const blend = (a: ArmGoal, b: ArmGoal, t: number): ArmGoal => ({
      at: a.at.clone().lerp(b.at, clamp(t)),
      pole: a.pole.clone().lerp(b.pole, clamp(t)),
    });
    const swing =
      ms < p.travel || ms >= p.turned ? Math.sin((f.walked / f.stride) * Math.PI * 2) : 0;
    const hang = (z: number, s: number) => goal(0.4 + 3.5 * s, -2.2, z * 6.9, -0.8, -0.3, z * 0.6);
    const hip = (z: number) => goal(1.2, 1.4, z * 7.2, -1, 0.2, z * 0.8);
    const raised = (z: number, wiggle: number) =>
      goal(3.6 + wiggle, 28.5, z * 7.2, 0.4, -1, z * 0.9);
    const atCard = (z: number) => goal(8.2, 30, z * 6, 0.2, -1, z);

    // The daisy hand holds the stem until the tuck has settled, then flashes a peace sign at the card.
    const daisyGrip = this.model.daisy.grip.getWorldPosition(this.v[2] ?? new THREE.Vector3());
    // The elbow drops down and out toward the viewer, so the reach never crosses her face.
    const gripPole = new THREE.Vector3(0.4, -1, zd * 1.2);
    if (ms < p.release) {
      const pole = gripPole;
      this.gripTo(daisyArm, daisyGrip, pole);
    } else {
      const letGo = ease((ms - p.release) / 260);
      const card = ease((ms - p.swayStart - 120) / 260) * (1 - ease((ms - p.swayEnd + 420) / 260));
      const walking = ms >= p.turned ? hang(zd, -swing) : hip(zd);
      let g = blend(hang(zd, 0), atCard(zd), card);
      if (ms >= p.swayEnd - 420) g = blend(atCard(zd), walking, ease((ms - p.swayEnd + 420) / 420));
      if (letGo < 1) {
        // Ease out of the grip the hand had at the release.
        const from = m.body.worldToLocal(daisyGrip.clone());
        g = blend({ at: from, pole: gripPole }, g, letGo);
      }
      this.armTo(m.arms[daisyArm], g.at, g.pole);
    }

    // The free hand swings while walking, flashes a peace sign on the way in and says goodbye.
    let free = ms < p.travel || ms >= p.turned ? hang(zp, swing) : hip(zp);
    if (ms >= p.travel && ms < p.travel + 300)
      free = blend(hang(zp, swing), hip(zp), ease((ms - p.travel) / 300));
    const flash = hippieFlash(p, ms);
    if (flash > 0) free = blend(free, raised(zp, 0.8 * Math.sin(ms / 70)), flash * 1.15);
    if (ms >= p.turned - 100) {
      const g = pulse(ms, p.turned - 100, 1100);
      const farewell =
        p.farewell === 'wave'
          ? goal(
              4.5 + 2.6 * Math.sin((ms - p.turned) / 75),
              27,
              zp * (7.6 + 1.2 * Math.cos((ms - p.turned) / 75)),
              0.2,
              -1,
              zp,
            )
          : goal(-2.2, 29.5 + 0.8 * Math.sin((ms - p.turned) / 110), zp * 7.8, 0.6, -1, zp);
      free = blend(free, farewell, g * 1.4);
    }
    this.armTo(m.arms[peaceArm], free.at, free.pole);
  }

  // ---------- Bubble and effects ----------

  private placeBubble(ms: number, b: TargetBounds, view: Point) {
    const p = this.plan;
    const shownAt = p.swayStart + 150,
      goneAt = p.swayEnd - 180;
    const visible = ms >= shownAt && ms < goneAt;
    this.bubble.visible = visible;
    if (!visible) return;
    const head = screenOf(this.model.head);
    const width = Math.min(180, view.x - 16),
      height = (width * BUBBLE_H) / BUBBLE_W;
    const x = Math.max(width / 2 + 8, Math.min(view.x - width / 2 - 8, head.x));
    const y = Math.max(height / 2 + 8, Math.min(b.top - height / 2 - 6, head.y - height / 2 - 26));
    this.bubble.position.set(x, -y, DEPTH + 60);
    this.bubble.scale.set(width, height, 1);
    this.bubble.material.opacity =
      ease((ms - shownAt) / 220) * (1 - ease((ms - goneAt + 300) / 300));
  }

  /** A few loose petals shaken free by the push drift down from the flower and fade. */
  private placePetals(ms: number, side: Side, b: TargetBounds, scale: number) {
    const p = this.plan;
    const from = cardPoint(hippieCardPose(p, p.tuck, side, b), daisyFlower(p, b, side), b);
    this.petals.forEach((petal, i) => {
      const t = (ms - p.tuck - i * 70) / 1300;
      petal.visible = t > 0 && t < 1;
      if (!petal.visible) return;
      const drift = (i % 2 ? 1 : -1) * (6 + 4 * i) * scale * Math.sin(t * Math.PI * 1.5 + i);
      // They fall away off the near edge rather than across the card face.
      petal.position.set(
        from.x - side * (5 + 4 * i) * scale * t + drift * 0.4,
        -(from.y + 38 * scale * t * t + 4 * scale * t),
        DEPTH + CARD_Z * scale + 1,
      );
      petal.rotation.z = t * 5 + i;
      petal.scale.set(
        0.75 * scale,
        1.9 * scale * (0.6 + 0.4 * Math.abs(Math.cos(t * 9 + i))),
        0.2 * scale,
      );
      petal.material.opacity = 0.95 * (1 - t * t);
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
    this.object.visible = ms < p.fadeEnd;
    this.object.position.set(0, 0, 0);
    const scale = hippieScale(b);
    const stand = hippieLandingPoint(p, b, view, side);
    const f = this.frame(ms, start, stand, b, view, side, scale);
    actor.visible = ms < p.exitEnd;
    actor.position.set(f.at.x, -f.at.y, DEPTH);
    actor.rotation.set(0, f.yaw, 0);
    actor.scale.setScalar(scale);
    hippiePose(actor, this.pose(ms, side, f));
    actor.updateMatrixWorld(true);
    const q = hippieCardPose(p, ms, side, b);
    this.placeDaisy(ms, side, b, q, scale);
    this.object.updateMatrixWorld(true);
    this.placeArms(ms, side, f);
    actor.updateMatrixWorld(true);
    this.placeBubble(ms, b, view);
    this.placePetals(ms, side, b, scale);
    this.object.updateMatrixWorld(true);
  }
}
