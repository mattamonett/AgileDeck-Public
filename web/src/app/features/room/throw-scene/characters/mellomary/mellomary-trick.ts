import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardPoint,
  clamp,
  ease,
  gait,
  glow,
  keepInView,
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
  EXIT_NOTE_LIFE,
  MELLO_BIAS,
  melloCardPose,
  melloExitPoint,
  melloFlash,
  melloFrames,
  melloLandingPoint,
  melloPeek,
  melloProgress,
  melloScale,
  melloShiver,
  noteTarget,
  type MelloPlan,
} from './mellomary-choreography';
import {
  MELLO_HIP,
  melloModel,
  melloPose,
  tiptoeAnkle,
  type MelloModel,
  type MelloPose,
  type SoleTarget,
  buildNote,
} from './mellomary-model';

export { makeMelloMary } from './mellomary-model';

const DEPTH = 170;
const ROUTE = 32;
/** Notes and fright marks ride this far in front of the actor's plane. */
const EFFECT_Z = 40;
const MARKS = 3;
const ORANGE = 0xf2782b,
  VIOLET = 0x8a4fe0,
  INK = 0x3b1466;

/** Yaw that faces a screen direction (cosine c) while turning the face three quarters to the viewer. */
export function melloYaw(c: number): number {
  return -(
    MELLO_BIAS +
    (Math.acos(Math.max(-1, Math.min(1, c))) * (Math.PI - 2 * MELLO_BIAS)) / Math.PI
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

/** Where the horn sits in body space: up at her lips, ready at her chest, tucked, flourished low behind, or held out behind for the bow. */
type HornHold = 'up' | 'ready' | 'tuck' | 'flourish' | 'side';
interface HornPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly ry: number;
  readonly rz: number;
}
const HORN_POSES: Record<Exclude<HornHold, 'up'>, HornPose> = {
  ready: { x: 10.2, y: 15.4, z: 0, ry: 0, rz: -0.06 },
  tuck: { x: 2.4, y: 5.2, z: 7.6, ry: Math.PI, rz: -0.3 },
  flourish: { x: -8.6, y: 4.6, z: 6.8, ry: Math.PI, rz: -0.55 },
  side: { x: -7.4, y: 7.6, z: 7, ry: Math.PI, rz: -0.2 },
};
/** Holds where the far hand also grips the bell pipe. */
const TWO_HANDED: ReadonlySet<HornHold> = new Set(['up', 'ready']);
interface HornMove {
  readonly from: HornHold;
  readonly to: HornHold;
  readonly t: number;
}
type HandJob = 'valves' | 'pipe' | 'free';
/**
 * What each hand does, right hand first. The near-side hand always plays the valves; the far hand
 * holds the bell pipe while the horn is up or ready and is otherwise free, so a flung arm never
 * crosses her face and the valve hand never has to change.
 */
function handJobs(hold: HornHold, side: Side): readonly [HandJob, HandJob] {
  const other: HandJob = TWO_HANDED.has(hold) ? 'pipe' : 'free';
  return side > 0 ? ['valves', other] : [other, 'valves'];
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
  /** 0..1 how fast the body is moving along the approach, for the step bounce. */
  readonly speed: number;
}
/** The acted beats of the scare, each 0..1. */
interface ScareBeat {
  readonly crouch: number;
  readonly fake: number;
  readonly pose: number;
  readonly air: number;
  readonly bow: number;
}

export class MelloMaryTrick implements CharacterRoutine {
  readonly object = new THREE.Group();
  readonly plan: MelloPlan;
  readonly duration: number;
  private readonly model: MelloModel;
  private readonly actor: THREE.Group;
  private readonly hornKeys: readonly (readonly [number, HornHold])[];
  private readonly notes: THREE.Group[] = [];
  private readonly exitNotes: THREE.Group[] = [];
  private readonly rings: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly marks: THREE.Group[] = [];
  private readonly lengths = new Float32Array(ROUTE + 1);
  private readonly basis = new THREE.Matrix4();
  private readonly v = [0, 1, 2, 3].map(() => new THREE.Vector3());
  private readonly e = [0, 1, 2].map(() => new THREE.Vector3());
  /** The flank corner of the current route and the fraction of the route before it, when it has one. */
  private corner: Point | null = null;
  private cornerAt = 0;
  /** This frame's layout, so a trailing note can find where she was when it left the bell. */
  private scene: {
    start: Point;
    stand: Point;
    b: TargetBounds;
    view: Point;
    side: Side;
    scale: number;
  } | null = null;

  constructor(actor: THREE.Group) {
    this.actor = actor;
    this.model = melloModel(actor);
    this.plan = this.model.plan;
    this.duration = this.plan.end * this.plan.pace;
    this.hornKeys = hornKeys(this.plan);
    this.object.name = 'mellomary-music';
    this.plan.notes.forEach((note, i) => {
      const group = buildNote(`mellomary-note-${i}`, i % 2 ? VIOLET : ORANGE, note.beamed);
      this.object.add(group);
      this.notes.push(group);
      const ring = part(
        this.object,
        `mellomary-note-ring-${i}`,
        new THREE.RingGeometry(0.72, 1, 24),
        glow(0xfff4c2, 0),
      );
      ring.visible = false;
      this.rings.push(ring);
    });
    this.plan.exitNotes.forEach((_, i) => {
      const group = buildNote(`mellomary-exit-note-${i}`, i % 2 ? ORANGE : VIOLET, i === 1);
      this.object.add(group);
      this.exitNotes.push(group);
    });
    if (this.plan.act === 'scare')
      for (let i = 0; i < MARKS; i++) {
        const mark = new THREE.Group();
        mark.name = `mellomary-fright-mark-${i}`;
        part(
          mark,
          'mellomary-fright-halo',
          new THREE.PlaneGeometry(1, 1),
          glow(0xffffff, 0.9),
          0,
          0,
          -0.2,
        ).scale.set(1.9, 1.3, 1);
        part(mark, 'mellomary-fright-ink', new THREE.PlaneGeometry(1, 1), glow(INK, 1)).scale.set(
          1,
          1.2,
          1,
        );
        mark.visible = false;
        this.object.add(mark);
        this.marks.push(mark);
      }
  }

  cardAnimation(facing: number, b?: TargetBounds) {
    return melloFrames(this.plan, facing, b ?? { left: 0, top: 0, width: 84, height: 122 });
  }

  // ---------- Route and root motion ----------

  /** A march turns a crisp corner when the thrower sits above and beyond the card on her side. */
  private flankCorner(start: Point, stand: Point, b: TargetBounds, side: Side): Point | null {
    const p = this.plan;
    if (p.approach !== 'march' || !p.flank) return null;
    const beyond = side > 0 ? start.x < b.left - 40 : start.x > b.left + b.width + 40;
    if (!beyond || start.y > stand.y - 60 || Math.abs(start.x - stand.x) < 50) return null;
    return { x: start.x, y: stand.y };
  }
  private routeAt(
    u: number,
    start: Point,
    stand: Point,
    b: TargetBounds,
    view: Point,
    side: Side,
  ): Point {
    const c = this.corner;
    if (!c) return sideRoute(start, stand, b, view, side, this.plan.bend, u);
    const first = Math.hypot(c.x - start.x, c.y - start.y),
      second = Math.hypot(stand.x - c.x, stand.y - c.y);
    const d = clamp(u) * (first + second);
    const at =
      d <= first
        ? {
            x: mix(start.x, c.x, d / Math.max(0.001, first)),
            y: mix(start.y, c.y, d / Math.max(0.001, first)),
          }
        : {
            x: mix(c.x, stand.x, (d - first) / Math.max(0.001, second)),
            y: mix(c.y, stand.y, (d - first) / Math.max(0.001, second)),
          };
    return keepInView(at, view, 16, 40);
  }
  private measure(start: Point, stand: Point, b: TargetBounds, view: Point, side: Side): number {
    this.corner = this.flankCorner(start, stand, b, side);
    const c = this.corner;
    if (c) {
      const first = Math.hypot(c.x - start.x, c.y - start.y);
      this.cornerAt = first / Math.max(0.001, first + Math.hypot(stand.x - c.x, stand.y - c.y));
    }
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
  private progress(ms: number): number {
    return melloProgress(this.plan, ms, this.corner ? this.cornerAt : undefined);
  }
  /** Exit progress: a crisp first step, then an even marching tempo. */
  private exitProgress(ms: number): number {
    const p = this.plan,
      tau = clamp((ms - p.turned) / p.exit),
      a = 0.18;
    return tau < a ? tau ** 2 / (2 * a) / (1 - a / 2) : (tau - a / 2) / (1 - a / 2);
  }
  /** Yaw while she stands at the card: facing it (she bows to the card she scared), then about-face. */
  private standingYaw(ms: number, side: Side): number {
    const p = this.plan;
    const held = melloYaw(side);
    if (ms < p.depart) return held;
    const away = melloYaw(-side);
    const t = ease((ms - p.depart) / (p.turned - p.depart));
    // A twirl spins a whole extra turn on her toes on the way round.
    return mix(held, p.turn === 'twirl' ? away - Math.PI * 2 : away, t);
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
    // Longer routes lengthen the stride rather than blur the feet; a creep takes long, sneaky steps.
    const cycle = p.approach === 'march' ? 760 : 1000;
    const approachStride = Math.max(
      p.approach === 'march' ? 9 : 11,
      Math.min(20, length / scale / (p.travel / cycle)),
    );
    if (ms < p.travel) {
      const s = this.progress(ms) * length;
      const u = this.paramAt(s);
      const at = this.routeAt(u, start, stand, b, view, side);
      const ahead = this.routeAt(Math.min(1, u + 0.015), start, stand, b, view, side),
        behind = this.routeAt(Math.max(0, u - 0.015), start, stand, b, view, side);
      const dx = ahead.x - behind.x,
        d = Math.hypot(dx, ahead.y - behind.y);
      const heading = d > 0.5 ? melloYaw(dx / d) : melloYaw(side);
      const yaw = mix(heading, melloYaw(side), ease((ms / p.travel - 0.84) / 0.16));
      const speed = clamp((this.progress(ms + 12) - this.progress(ms - 12)) * (p.travel / 24));
      return { at, yaw, walked: s / scale, stride: approachStride, speed };
    }
    const walked = length / scale;
    if (ms < p.turned)
      return {
        at: stand,
        yaw: this.standingYaw(ms, side),
        walked,
        stride: approachStride,
        speed: 0,
      };
    const exit = melloExitPoint(p, b, view, side);
    const dx = exit.x - stand.x,
      exitLength = Math.hypot(dx, exit.y - stand.y);
    const e = this.exitProgress(ms);
    const stride = Math.max(10, Math.min(20, exitLength / scale / (p.exit / 760)));
    return {
      at: { x: mix(stand.x, exit.x, e), y: mix(stand.y, exit.y, e) },
      yaw: melloYaw(dx / Math.max(1, exitLength)),
      walked: walked + (e * exitLength) / scale,
      stride,
      speed: 1,
    };
  }

  // ---------- Body pose ----------

  private scareBeat(ms: number): ScareBeat {
    const p = this.plan;
    const crouchKeys: [number, number][] = [
      [p.travel, p.approach === 'creep' ? 0.55 : 0],
      [p.crouch, 1],
    ];
    if (p.fakeOut) crouchKeys.push([p.fake, 1], [p.fake + 260, 0.4], [p.fake + 560, 1]);
    crouchKeys.push([p.pop - 40, 1], [p.pop + 120, 0]);
    return {
      crouch: track(ms, crouchKeys),
      fake: p.fakeOut ? pulse(ms, p.fake, 560) : 0,
      pose: ease((ms - p.pop) / 200) * (1 - ease((ms - p.poseEnd) / 360)),
      air: 3.2 * pulse(ms, p.pop - 10, 230),
      bow: pulse(ms, p.bowAt + 180, 720),
    };
  }
  /** 0..1 dip of the knees on each beat of the tune. */
  private beatDip(ms: number): number {
    let dip = 0;
    for (const note of this.plan.notes)
      dip = Math.max(dip, pulse(ms, note.at - 30, this.plan.period * 0.55));
    return dip;
  }
  private playing(ms: number): number {
    const p = this.plan;
    if (p.act !== 'serenade') return 0;
    return ease((ms - p.playStart + 100) / 150) * (1 - ease((ms - p.depart + 340) / 200));
  }
  /** Cheeks puffed on the mouthpiece from the first note until the last trailing note has left the bell. */
  private puff(ms: number): number {
    const p = this.plan;
    if (p.act !== 'serenade') return 0;
    const last = p.exitNotes.at(-1) ?? p.depart;
    return ease((ms - p.playStart + 140) / 140) * (1 - ease((ms - last - 250) / 200));
  }

  private feet(ms: number, f: Frame): [SoleTarget, SoleTarget] {
    const p = this.plan;
    // A sneak walks on tiptoe with lower, softer steps; a march points its toes and lifts its knees high.
    const sneak = p.approach === 'creep';
    const step = (i: number, planted: number, creeping = sneak && ms < p.travel): SoleTarget => {
      const g = gait(f.walked, f.stride, i * 0.5, creeping ? 4.5 : 6.5);
      const point = (creeping ? 0.25 : 0.55) * Math.sin(Math.PI * g.swing);
      return {
        x: 0.2 + g.x,
        y: g.y * (1 - planted),
        toe: (creeping ? 0.42 : 0) + point * (1 - planted),
      };
    };
    if (ms < p.travel) {
      const planted = ease((ms / p.travel - 0.92) / 0.08);
      return [step(0, planted), step(1, planted)];
    }
    const neutral = (i: number) => (i === 0 ? 1.2 : -1);
    if (ms >= p.turned) {
      // The first marching step out of the turn starts from the standing feet.
      const into = ease((ms - p.turned) / 220);
      return [0, 1].map((i) => {
        const w = step(i, 0);
        return { x: mix(neutral(i), w.x, into), y: w.y * into, toe: w.toe * into };
      }) as [SoleTarget, SoleTarget];
    }
    if (ms >= p.depart) {
      const turn = pulse(ms, p.depart, p.turned - p.depart);
      if (p.turn === 'twirl')
        return [0, 1].map((i) => ({
          x: mix(neutral(i), i === 0 ? 0.5 : -0.5, turn),
          y: 0,
          toe: 0.55 * turn,
        })) as [SoleTarget, SoleTarget];
      return [0, 1].map((i) => ({
        x: neutral(i),
        y: 1.4 * pulse(ms, p.depart + i * 140, 170),
        toe: 0,
      })) as [SoleTarget, SoleTarget];
    }
    // Settle from the last walking step into the act's stance.
    const walk = [step(0, 1, sneak), step(1, 1, sneak)];
    const stance = this.stance(ms);
    return [0, 1].map((i) => {
      const settle = ease((ms - p.travel - i * 110) / 160);
      const w = walk[i] ?? { x: 0, y: 0, toe: 0 },
        s = stance[i] ?? { x: 0, y: 0, toe: 0 };
      return {
        x: mix(w.x, s.x, settle),
        y: mix(w.y, s.y, settle) + 1.2 * pulse(ms, p.travel + i * 110, 160),
        toe: mix(w.toe, s.toe, settle),
      };
    }) as [SoleTarget, SoleTarget];
  }
  private stance(ms: number): [SoleTarget, SoleTarget] {
    const p = this.plan;
    if (p.act === 'serenade') {
      // She taps her right heel on the beat.
      return [
        { x: 1.2, y: 0, toe: 0.35 * this.beatDip(ms) },
        { x: -1, y: 0, toe: 0 },
      ];
    }
    const s = this.scareBeat(ms);
    const tip = 0.3 * s.crouch * (1 - s.pose);
    return [
      { x: mix(mix(1.2, 2.4, s.crouch), 3.4, s.pose), y: s.air * (1 - s.pose), toe: tip },
      {
        // The back leg kicks up behind her in the jester pose, then steps back for the bow.
        x: mix(mix(-1, -2.2, s.crouch), -7.5 - 3 * p.kick, s.pose) - 2.2 * s.bow,
        y: s.air + s.pose * (5 + 5 * p.kick),
        toe: mix(tip, 1, s.pose) + 0.45 * s.bow,
      },
    ];
  }

  /** The body pose, easing out of the walk into the act and out of the turn into the march away. */
  private pose(ms: number, side: Side, f: Frame): MelloPose {
    const p = this.plan;
    const q = this.rawPose(ms, side, f);
    const arrive = ms >= p.travel ? ease((ms - p.travel) / 300) : 1;
    const leave = ms >= p.turned ? ease((ms - p.turned) / 220) : 1;
    if (arrive < 1) return blendBody(this.rawPose(p.travel - 1, side, f), q, arrive);
    if (leave < 1) return blendBody(this.rawPose(p.turned - 1, side, f), q, leave);
    return q;
  }
  private rawPose(ms: number, side: Side, f: Frame): MelloPose {
    const p = this.plan;
    const k = (ms + p.phase * 500) % 3300;
    const blink = k > 3160 ? Math.sin((Math.PI * (k - 3160)) / 140) : 0;
    const feet = this.feet(ms, f);
    const base = { ...REST_FACE, feet, blink, puff: this.puff(ms) };
    if (ms < p.travel || ms >= p.turned) {
      const cycle = (f.walked / f.stride) * Math.PI * 2;
      const leaving = ms >= p.turned;
      if (p.approach === 'creep' && !leaving) {
        const peek = melloPeek(p, ms);
        return {
          ...base,
          hip: MELLO_HIP - 3.6 + Math.abs(Math.sin(cycle)) * f.speed + 1.6 * peek,
          lean: 0.26 - 0.12 * peek,
          roll: 0.05 * Math.sin(cycle) * f.speed,
          headTilt: -0.08 + 0.1 * peek,
          headTurn: -side * 0.55 * peek,
          grin: 0.12 * peek,
          point: [0, peek],
          swing: 0.4 * Math.sin(cycle) * f.speed,
        };
      }
      // A proud, high-kneed march: chest up, the body lifting as each knee passes.
      const bounce = leaving ? 1 : f.speed;
      return {
        ...base,
        hip: MELLO_HIP - 1.8 + 1.2 * Math.abs(Math.sin(cycle)) * bounce,
        lean: -0.06,
        roll: 0.03 * Math.sin(cycle) * bounce,
        headTilt: 0.05,
        swing: 0.5 * Math.sin(cycle) * bounce,
      };
    }
    if (ms >= p.depart) {
      const turn = pulse(ms, p.depart, p.turned - p.depart);
      const rise = p.turn === 'twirl' ? tiptoeAnkle(0.55 * turn) - tiptoeAnkle(0) : 0.6 * turn;
      return {
        ...base,
        hip: MELLO_HIP - 0.6 + rise,
        lean: 0,
        roll: 0,
        swing: (p.turn === 'twirl' ? 1.4 : 0.6) * turn,
      };
    }
    if (p.act === 'serenade') {
      const dip = this.beatDip(ms),
        playing = this.playing(ms);
      const inhale = pulse(ms, p.lips - 60, p.playStart - p.lips + 160);
      const last = p.notes.at(-1);
      const finale = last ? pulse(ms, last.at - 40, p.period * 1.7) : 0;
      return {
        ...base,
        hip: MELLO_HIP - 0.6 - 1.4 * dip,
        lean: -0.08 * inhale - 0.04 * playing + 0.05 * dip - 0.08 * finale,
        roll: 0.05 * Math.sin((Math.PI * (ms - p.playStart)) / p.period) * playing,
        headTilt: 0.08 * inhale + 0.06 * finale,
        // Eyes happily closed while she plays.
        blink: Math.max(blink, 0.72 * playing),
        swing: 0.4 * dip,
      };
    }
    const s = this.scareBeat(ms);
    return {
      ...base,
      hip: MELLO_HIP - 0.6 - 6.5 * s.crouch - 1.2 * s.pose + s.air - 1.0 * s.bow,
      lean: 0.34 * s.crouch + (0.26 + 0.1 * p.kick) * s.pose + 0.62 * s.bow,
      // A jester's wobble while she balances on one leg.
      roll: 0.05 * Math.sin((ms - p.pop) / 110) * s.pose,
      headTilt: -0.12 * s.crouch + 0.16 * s.pose - 0.35 * s.bow,
      headTurn: -side * (0.35 * s.crouch * (1 - s.pose) * (1 - s.fake) + 0.4 * s.bow),
      wide: s.pose * (0.6 + 0.4 * p.spread) + 0.3 * s.fake,
      grin: Math.max(s.pose, 0.4 * s.fake, 0.35 * s.bow),
      point: [0, s.crouch * (1 - s.fake) * (1 - s.pose)],
      swing: s.pose * 1.2 + s.bow,
    };
  }

  // ---------- Horn ----------

  /** At her lips, tipped up with her head; the march flash and the last note lift it higher. */
  private hornUp(ms: number): HornPose {
    const m = this.model,
      p = this.plan;
    m.head.updateMatrix();
    const lips = (this.v[3] ?? new THREE.Vector3())
      .copy(m.lips.position)
      .applyMatrix4(m.head.matrix);
    const last = p.notes.at(-1);
    const finale = p.act === 'serenade' && last ? pulse(ms, last.at - 40, p.period * 1.7) : 0;
    const a = m.head.rotation.z + p.hornsUp + 0.42 * melloFlash(p, ms) + 0.3 * finale;
    const mp = m.horn.mouthpiece.position;
    const c = Math.cos(a),
      s = Math.sin(a);
    return {
      x: lips.x - (mp.x * c - mp.y * s),
      y: lips.y - (mp.x * s + mp.y * c),
      z: lips.z - mp.z,
      ry: 0,
      rz: a,
    };
  }
  /** A one-handed hold sits on the near side, mirrored when she faces left. */
  private hold(name: HornHold, ms: number, side: Side): HornPose {
    if (name === 'up') return this.hornUp(ms);
    const q = HORN_POSES[name];
    return side > 0 || TWO_HANDED.has(name) ? q : { ...q, z: -q.z };
  }
  /** Places the horn for this moment and returns the holds it is moving between. */
  private placeHorn(ms: number, side: Side): HornMove {
    const keys = this.hornKeys;
    let from: HornHold = keys[0]?.[1] ?? 'up',
      to = from,
      t = 0;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i],
        next = keys[i + 1];
      if (!key || ms < key[0]) break;
      from = to = key[1];
      t = 0;
      if (next && ms < next[0]) {
        to = next[1];
        t = ease((ms - key[0]) / Math.max(1, next[0] - key[0]));
      }
    }
    const a = this.hold(from, ms, side),
      b = this.hold(to, ms, side);
    const root = this.model.horn.root;
    root.position.set(mix(a.x, b.x, t), mix(a.y, b.y, t), mix(a.z, b.z, t));
    root.rotation.set(0, mix(a.ry, b.ry, t), mix(a.rz, b.rz, t));
    root.updateMatrixWorld(true);
    return { from, to, t };
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
  /** Reaches so the palm's grip, not the wrist, lands on a body-space point. */
  private gripAt(index: 0 | 1, target: THREE.Vector3, pole: THREE.Vector3) {
    const m = this.model,
      limb = m.arms[index],
      grip = m.hands[index].grip;
    const aim = target.clone();
    for (let i = 0; i < 3; i++) {
      this.armTo(limb, aim, pole);
      limb.root.updateMatrixWorld(true);
      const at = m.body.worldToLocal(grip.getWorldPosition(this.v[1] ?? new THREE.Vector3()));
      aim.add(target.clone().sub(at));
    }
    this.armTo(limb, aim, pole);
  }

  /** Where a hand goes when it is not on the horn, in body space; goals are authored for the left hand. */
  private freeHand(ms: number, f: Frame, arm: 0 | 1): ArmGoal {
    const g = this.leftHand(ms, f);
    return arm === 1 ? g : { at: g.at.clone().setZ(-g.at.z), pole: g.pole.clone().setZ(-g.pole.z) };
  }
  private leftHand(ms: number, f: Frame): ArmGoal {
    const p = this.plan;
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
    const shh = goal(7.2, 21.4, -1.6, 0.2, -1, -1);
    // Sneaking: an imp's hand curled up at her chest, fingers drumming.
    const imp = goal(5.4, 12.6 + 0.8 * Math.sin(ms / 90), -4.4, -0.2, -1, -1);
    const hang = goal(
      0.4 - 3.5 * Math.sin((f.walked / f.stride) * Math.PI * 2),
      -2.2,
      -6.9,
      -0.8,
      -0.3,
      -0.6,
    );
    if (ms < p.travel)
      return p.approach === 'creep' ? blendGoal(imp, shh, melloPeek(p, ms) * 1.2) : hang;
    if (p.act === 'serenade' || ms >= p.depart) return p.approach === 'creep' ? imp : hang;
    const s = this.scareBeat(ms);
    // Flung high over her head toward the card; it is always the far arm, so it never crosses her face.
    const fling = goal(2.5 + 2.5 * p.spread, 33.4, -6.5 - 2 * p.spread, -0.3, 0.2, -1);
    const sweep = goal(4.6, 6.6, 2.4, 0.6, -1, -0.5);
    let g = blendGoal(imp, shh, s.crouch);
    g = blendGoal(g, goal(6.4, 24.5, -7, -0.4, -0.6, -1), s.fake);
    g = blendGoal(g, fling, s.pose);
    return blendGoal(g, sweep, s.bow * 1.4);
  }

  /** Each hand grips its part of the horn, or gestures freely, blending as the hold changes. */
  private placeArms(ms: number, f: Frame, side: Side, move: HornMove) {
    const m = this.model;
    const marker = { valves: m.horn.valves, pipe: m.horn.pipe } as const;
    const from = handJobs(move.from, side),
      to = handJobs(move.to, side);
    for (const arm of [0, 1] as const) {
      // Elbows down and out to her own side.
      const pole = new THREE.Vector3(-0.3, -1, arm === 0 ? 1.1 : -1.1);
      const target = (job: HandJob): ArmGoal =>
        job === 'free'
          ? this.freeHand(ms, f, arm)
          : { at: m.body.worldToLocal(marker[job].getWorldPosition(new THREE.Vector3())), pole };
      const a = from[arm],
        b = to[arm];
      if (a === b && a !== 'free') {
        this.gripAt(arm, target(a).at, pole);
        continue;
      }
      const g = blendGoal(target(a), target(b), a === b ? 0 : move.t);
      this.armTo(m.arms[arm], g.at, g.pole);
    }
  }

  // ---------- Notes and fright marks ----------

  private placeNotes(ms: number, side: Side, b: TargetBounds, scale: number) {
    const p = this.plan;
    const bell = screenOf(this.model.horn.bell);
    const k = b.height / 122;
    p.notes.forEach((note, i) => {
      const group = this.notes[i],
        ring = this.rings[i];
      if (!group || !ring) return;
      const q = melloCardPose(p, ms, side, b);
      const target = cardPoint(q, noteTarget(note, b), b);
      const t = (ms - note.at) / (note.land - note.at);
      const after = ms - note.land;
      group.visible = t >= 0 && after < 240;
      if (group.visible) {
        let x: number, y: number, size: number, opacity: number;
        if (t < 1) {
          // Out of the bell on the beat, arcing over onto the card face.
          const u = ease(t);
          x = mix(bell.x, target.x, u);
          y = mix(bell.y, target.y, u) - note.arc * k * Math.sin(Math.PI * t);
          size = mix(0.45, 1, clamp(t * 3));
          opacity = 1;
          group.rotation.z = 0.25 * Math.sin(t * Math.PI * 3 + i) * side;
        } else {
          // It lands, holds for a moment and pops.
          x = target.x;
          y = target.y;
          size = 1 + 0.5 * ease((after - 60) / 180);
          opacity = 1 - ease((after - 60) / 180);
          group.rotation.z = 0;
        }
        group.position.set(x, -y, DEPTH + EFFECT_Z);
        group.scale.setScalar(scale * 1.15 * size);
        setOpacity(group, opacity);
      }
      const r = (ms - note.land) / 320;
      ring.visible = r >= 0 && r < 1;
      if (ring.visible) {
        ring.position.set(target.x, -target.y, DEPTH + EFFECT_Z - 1);
        ring.scale.setScalar(scale * (2 + 7 * ease(r)));
        ring.material.opacity = 0.85 * (1 - r);
      }
    });
    // Trailing notes leave the bell as she marches off and drift up behind her.
    const actor = this.actor.position;
    p.exitNotes.forEach((born, i) => {
      const group = this.exitNotes[i];
      if (!group) return;
      const age = (ms - born) / EXIT_NOTE_LIFE;
      group.visible = age >= 0 && age < 1;
      if (!group.visible) return;
      const birth = this.bellAt(born, bell, actor);
      const x = birth.x + side * 16 * k * age + 3 * k * Math.sin(age * 9 + i);
      const y = birth.y - 34 * k * ease(age);
      group.position.set(x, -y, DEPTH + EFFECT_Z);
      group.rotation.z = 0.3 * Math.sin(age * 7 + i);
      group.scale.setScalar(scale * mix(0.5, 1, clamp(age * 4)));
      setOpacity(group, 1 - ease((age - 0.55) / 0.45));
    });
  }
  /**
   * Where the bell was when a trailing note left it: her root position then, plus the bell's current
   * offset from her root, which holds steady while she marches with the horn up.
   */
  private bellAt(born: number, bell: Point, actor: THREE.Vector3): Point {
    const a = this.scene;
    if (!a) return bell;
    const then = this.frame(born, a.start, a.stand, a.b, a.view, a.side, a.scale).at;
    return { x: then.x + bell.x - actor.x, y: then.y + bell.y + actor.y };
  }
  /** Short shiver strokes beside the card's far top edge while it trembles. */
  private placeMarks(ms: number, side: Side, b: TargetBounds) {
    const p = this.plan;
    const shiver = melloShiver(p, ms);
    const k = b.height / 122;
    const q: CardPose = melloCardPose(p, ms, side, b);
    const far = side > 0 ? b.left + b.width : b.left;
    this.marks.forEach((mark, i) => {
      mark.visible = shiver > 0.02;
      if (!mark.visible) return;
      const jitter = 1.5 * k * Math.sin(ms / 30 + i * 2);
      const at = cardPoint(
        q,
        { x: far + side * (6 + 2 * i) * k + side * jitter, y: b.top + b.height * (0.1 + 0.15 * i) },
        b,
      );
      mark.position.set(at.x, -at.y, DEPTH + EFFECT_Z);
      mark.rotation.z = side * (0.5 - 0.5 * i) + Math.PI / 2;
      mark.scale.set(1.7 * k, 8 * k, 1);
      setOpacity(mark, shiver);
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
    this.object.visible = ms < p.end;
    this.object.position.set(0, 0, 0);
    const scale = melloScale(b);
    const stand = melloLandingPoint(p, b, view, side);
    this.scene = { start, stand, b, view, side, scale };
    const f = this.frame(ms, start, stand, b, view, side, scale);
    actor.visible = ms < p.exitEnd;
    actor.position.set(f.at.x, -f.at.y, DEPTH);
    actor.rotation.set(0, f.yaw, 0);
    actor.scale.setScalar(scale);
    melloPose(actor, this.pose(ms, side, f));
    actor.updateMatrixWorld(true);
    this.placeArms(ms, f, side, this.placeHorn(ms, side));
    actor.updateMatrixWorld(true);
    this.placeNotes(ms, side, b, scale);
    this.placeMarks(ms, side, b);
    this.object.updateMatrixWorld(true);
  }
}

const REST_FACE = {
  hip: MELLO_HIP,
  lean: 0,
  roll: 0,
  headTilt: 0,
  headRoll: 0,
  headTurn: 0,
  blink: 0,
  wide: 0,
  grin: 0,
  puff: 0,
  point: [0, 0] as const,
  swing: 0,
};

function blendGoal(a: ArmGoal, b: ArmGoal, t: number): ArmGoal {
  return { at: a.at.clone().lerp(b.at, clamp(t)), pole: a.pole.clone().lerp(b.pole, clamp(t)) };
}

/** Mixes the body and face of two poses, keeping the second pose's feet and hands. */
function blendBody(a: MelloPose, b: MelloPose, t: number): MelloPose {
  return {
    ...b,
    hip: mix(a.hip, b.hip, t),
    lean: mix(a.lean, b.lean, t),
    roll: mix(a.roll, b.roll, t),
    headTilt: mix(a.headTilt, b.headTilt, t),
    headTurn: mix(a.headTurn, b.headTurn, t),
    grin: mix(a.grin, b.grin, t),
    wide: mix(a.wide, b.wide, t),
    swing: mix(a.swing, b.swing, t),
  };
}

function setOpacity(root: THREE.Object3D, opacity: number) {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(o.material) ? o.material : [o.material])
      material.opacity = opacity;
  });
}

/** When the horn moves between holds, given the approach and the act. */
function hornKeys(p: MelloPlan): (readonly [number, HornHold])[] {
  const march = p.approach === 'march';
  if (p.act === 'serenade')
    return march
      ? [
          [0, 'up'],
          [p.travel - 60, 'up'],
          [p.travel + 200, 'ready'],
          [p.raise, 'ready'],
          [p.lips, 'up'],
        ]
      : [
          [0, 'tuck'],
          [p.travel + 40, 'tuck'],
          [p.raise, 'ready'],
          [p.lips, 'up'],
        ];
  return [
    ...(march
      ? ([
          [0, 'up'],
          [p.travel - 520, 'up'],
          [p.travel - 160, 'tuck'],
        ] as const)
      : ([[0, 'tuck']] as const)),
    [p.pop - 30, 'tuck'],
    [p.pop + 170, 'flourish'],
    [p.poseEnd, 'flourish'],
    [p.poseEnd + 360, 'ready'],
    [p.bowAt + 60, 'ready'],
    [p.bowAt + 300, 'side'],
    [p.bowEnd - 220, 'side'],
    [p.depart + 60, 'ready'],
    [p.turned - 60, 'up'],
  ];
}
