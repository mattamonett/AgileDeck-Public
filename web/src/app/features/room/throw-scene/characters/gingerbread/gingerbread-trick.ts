import * as THREE from 'three';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  blobShape,
  cardFit,
  cardPoint,
  clamp,
  ease,
  gait,
  glow,
  localTarget,
  lowestWorldY,
  mix,
  outline,
  part,
  pulse,
  reach,
  screenOf,
  sideOf,
  sideRoute,
  span,
  type CharacterRoutine,
  type Side,
} from '../../kit';
import {
  GINGERBREAD_DURATION,
  GINGERBREAD_SCALE,
  gingerbreadBeat,
  gingerbreadCardPose,
  gingerbreadExitDirection,
  gingerbreadExitX,
  gingerbreadFloor,
  gingerbreadFrames,
  gingerbreadHookPoint,
  gingerbreadLandPoint,
  gingerbreadProgress,
  gingerbreadSwing,
  gingerbreadTapAt,
  gingerbreadTugEnd,
  gingerbreadWheelDistance,
  type GingerbreadPlan,
} from './gingerbread-choreography';
import {
  FOOT_DROP,
  GINGER_ARM_Z,
  GINGER_HIP,
  GINGER_HOOK,
  GINGER_SHOULDER,
  gingerbreadHookInHand,
  gingerbreadModel,
  gingerbreadPose,
  gingerbreadSyncCuffs,
  type CaneSlot,
  type GingerbreadModel,
  type GingerbreadPose,
  type Xy,
} from './gingerbread-model';

const DEPTH = 172;
const ROUTE_SEGMENTS = 32;
/** Rolling radius of the cartwheel star, in model units. */
const WHEEL_RADIUS = 22;
/** Cane hand and angle when the crook reaches out to test the card edge. */
const TEST_REACH: Xy = { x: 7.4, y: 1.4 };
const TEST_ANGLE = -0.45;
/** One-armed trapeze grip: hand up and out, cane in line with the body below it. */
const HANG_REACH: Xy = { x: 5, y: 8.5 };
const HANG_ANGLE = -0.66;
/** Where the stowed crook rests over the cane-side shoulder, clear of the head, in body space. */
const SHOULDER_HOOK: Xy = { x: 11, y: 22.5 };
const SLOT_ANGLE = -0.58,
  SLOT_SLIDE = 8,
  SLOT_Z = -3.6;
const GRAVITY = 0.0012;

export interface GingerbreadStage {
  readonly start: Point;
  readonly b: TargetBounds;
  readonly view: Point;
  readonly side: Side;
  readonly fit: number;
  readonly scale: number;
  readonly floor: number;
  /** Feet position beside the card, solved so the crook meets the near edge at the test. */
  readonly stand: Point;
  /** Unanimated point on the card's near edge that the crook tests. */
  readonly testPoint: Point;
  /** Unanimated point on the top edge that the crook hangs from. */
  readonly hookPoint: Point;
  readonly land: Point;
  readonly exitDir: Side;
  readonly wheelTotal: number;
  readonly length: number;
}

interface Crumb {
  readonly mesh: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
  readonly kind: 'catch' | 'land' | 'wheel';
  readonly k: number;
  readonly jitter: number;
  readonly height: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly size: number;
}

const mixXy = (a: Xy, b: Xy, t: number): Xy => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) });
function mixPose(a: GingerbreadPose, b: GingerbreadPose, t: number): GingerbreadPose {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return {
    crouch: mix(a.crouch, b.crouch, t),
    lean: mix(a.lean, b.lean, t),
    bow: mix(a.bow, b.bow, t),
    headTilt: mix(a.headTilt, b.headTilt, t),
    headTurn: mix(a.headTurn, b.headTurn, t),
    look: mix(a.look, b.look, t),
    blink: mix(a.blink, b.blink, t),
    cane: mixXy(a.cane, b.cane, t),
    caneAngle: mix(a.caneAngle, b.caneAngle, t),
    free: mixXy(a.free, b.free, t),
    legs: [mixXy(a.legs[0], b.legs[0], t), mixXy(a.legs[1], b.legs[1], t)],
    toes: mix(a.toes, b.toes, t),
    twirl: mix(a.twirl, b.twirl, t),
    slide: mix(a.slide, b.slide, t),
    caneZ: mix(a.caneZ, b.caneZ, t),
  };
}
/** Ankle targets for planted feet at a given crouch; soles rest exactly on the floor. */
function planted(crouch: number, feet: readonly [number, number]): readonly [Xy, Xy] {
  const y = -(GINGER_HIP - crouch - FOOT_DROP);
  return [
    { x: feet[0], y },
    { x: feet[1], y },
  ];
}
const NEUTRAL_FEET: readonly [number, number] = [0.6, -0.6];
function rest(feet: readonly [number, number]): GingerbreadPose {
  return {
    crouch: 0,
    lean: 0,
    bow: 0,
    headTilt: 0,
    headTurn: 0,
    look: 0.5,
    blink: 0,
    cane: { x: 3.2, y: -7.2 },
    caneAngle: -0.15,
    free: { x: -2.5, y: -8.2 },
    legs: planted(0, feet),
    toes: 0,
    twirl: 0,
    slide: 0,
    caneZ: 1.1,
  };
}
/** Cane-hand target (relative to the shoulder) that puts the crook at a body-space point. */
function caneHandFor(hook: Xy, angle: number, slide: number): Xy {
  const local = gingerbreadHookInHand(0, slide);
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return {
    x: hook.x - (local.x * c - local.y * s) - GINGER_SHOULDER.x,
    y: hook.y - (local.x * s + local.y * c) - GINGER_SHOULDER.y,
  };
}

export class GingerbreadTrick implements CharacterRoutine {
  readonly object = new THREE.Group();
  readonly plan: GingerbreadPlan;
  readonly duration: number;
  private readonly model: GingerbreadModel;
  private readonly actor: THREE.Group;
  private readonly routeLengths = new Float32Array(ROUTE_SEGMENTS + 1);
  private readonly crumbs: Crumb[] = [];
  private readonly sparkles: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly slot: CaneSlot;
  private readonly scratch = new THREE.Vector3();

  constructor(actor: THREE.Group) {
    this.actor = actor;
    this.model = gingerbreadModel(actor);
    this.plan = this.model.plan;
    this.duration = GINGERBREAD_DURATION * this.plan.pace;
    this.object.name = 'gingerbread-acrobatics';
    const r = seededRandom(`${this.plan.phase}:gingerbread-crumbs`);
    const kinds: readonly (readonly ['catch' | 'land' | 'wheel', number])[] = [
      ['catch', 0],
      ['land', 0],
      ['land', 1],
      ['wheel', 0],
      ['wheel', 1],
      ['wheel', 2],
      ['wheel', 3],
      ['wheel', 4],
    ];
    kinds.forEach(([kind, k], i) => {
      const color = kind === 'catch' ? 0xfff6e6 : i % 2 ? 0xb8732f : 0x8f5222;
      const mesh = part(
        this.object,
        `gingerbread-crumb-${i}`,
        new THREE.ShapeGeometry(blobShape(i * 1.7 + r(), 5, 0.28)),
        glow(color),
      );
      this.crumbs.push({
        mesh,
        kind,
        k,
        jitter: r() * 2 - 1,
        height: 8 + r() * 10,
        vx: (r() * 2 - 1) * 0.05,
        vy: -0.05 - r() * 0.12,
        spin: (r() * 2 - 1) * 0.02,
        size: kind === 'catch' ? 1.6 : 1.9 + r() * 1.1,
      });
    });
    const star = outline([
      [0, 1],
      [0.22, 0.22],
      [1, 0],
      [0.22, -0.22],
      [0, -1],
      [-0.22, -0.22],
      [-1, 0],
      [-0.22, 0.22],
    ]);
    for (let i = 0; i < 2; i++)
      this.sparkles.push(
        part(
          this.object,
          `gingerbread-tink-${i}`,
          new THREE.ShapeGeometry(star),
          glow(0xfffbe8, 0),
        ),
      );
    // The stowed cane hangs by its crook over the shoulder, exactly where the hand leaves it.
    const c = Math.cos(SLOT_ANGLE),
      s = Math.sin(SLOT_ANGLE);
    this.slot = {
      position: new THREE.Vector3(
        SHOULDER_HOOK.x - (GINGER_HOOK.x * c - GINGER_HOOK.y * s),
        SHOULDER_HOOK.y - (GINGER_HOOK.x * s + GINGER_HOOK.y * c),
        GINGER_ARM_Z + SLOT_Z,
      ),
      quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), SLOT_ANGLE),
    };
  }

  cardAnimation(facing: number, b?: TargetBounds) {
    return gingerbreadFrames(this.plan, facing, b ?? { left: 0, top: 0, width: 84, height: 122 });
  }

  /** Solves the layout for this frame; it poses the actor to measure the real crook, so call it first. */
  layout(start: Point, b: TargetBounds, view: Point, facing: number): GingerbreadStage {
    const p = this.plan,
      side = sideOf(facing);
    const fit = cardFit(b),
      scale = GINGERBREAD_SCALE * fit,
      floor = gingerbreadFloor(b);
    this.reset(scale, side, 0, 0);
    this.pose(this.testPose(p.testHit, NEUTRAL_FEET));
    const hook = screenOf(this.model.hook);
    const edgeX = side > 0 ? b.left : b.left + b.width;
    const stand = { x: edgeX - hook.x, y: floor };
    const land = gingerbreadLandPoint(p, stand, b, view, side, fit);
    return {
      start,
      b,
      view,
      side,
      fit,
      scale,
      floor,
      stand,
      testPoint: { x: edgeX, y: floor + hook.y },
      hookPoint: gingerbreadHookPoint(p, b, side),
      land,
      exitDir: gingerbreadExitDirection(p, side),
      wheelTotal: Math.abs(gingerbreadExitX(p, view, side) - land.x),
      length: this.measureRoute(start, stand, b, view, side),
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
    const ms = elapsed / this.plan.pace;
    this.object.visible = ms < GINGERBREAD_DURATION;
    this.object.position.set(0, 0, 0);
    const st = this.layout(start, b, view, facing);
    this.place(ms, st);
    actor.visible = ms < GINGERBREAD_DURATION;
    actor.updateMatrixWorld(true);
    this.updateCrumbs(ms, st);
    this.updateSparkles(ms, st);
  }

  private reset(scale: number, side: Side, roll: number, yaw: number) {
    this.actor.position.set(0, 0, DEPTH);
    this.actor.rotation.set(0, yaw, roll);
    this.actor.scale.set(side * scale, scale, scale);
  }
  private pose(q: GingerbreadPose, slot: CaneSlot | null = null) {
    gingerbreadPose(this.actor, q, slot);
    this.actor.updateMatrixWorld(true);
  }
  private worldOf(o: THREE.Object3D): THREE.Vector3 {
    o.updateWorldMatrix(true, false);
    return o.getWorldPosition(this.scratch).clone();
  }

  /** Poses and places the actor for canonical ms; measurements of other moments happen before posing this one. */
  private place(ms: number, st: GingerbreadStage) {
    const p = this.plan;
    if (ms < p.travel) this.placeRoute(ms, st);
    else if (ms < p.leap) this.placeTest(ms, st);
    else if (ms < p.catchAt) this.placeLeap(ms, st);
    else if (ms < p.release) this.placeHang(ms, st);
    else if (ms < p.land) this.placeFlip(ms, st);
    else if (ms < p.exitAt) this.placeGround(ms, st);
    else this.placeWheel(ms, st);
  }

  // ---- Approach -------------------------------------------------------------------------------

  private measureRoute(
    start: Point,
    stand: Point,
    b: TargetBounds,
    view: Point,
    side: Side,
  ): number {
    let previous = sideRoute(start, stand, b, view, side, this.plan.bend, 0);
    this.routeLengths[0] = 0;
    for (let i = 1; i <= ROUTE_SEGMENTS; i++) {
      const at = sideRoute(start, stand, b, view, side, this.plan.bend, i / ROUTE_SEGMENTS);
      this.routeLengths[i] =
        (this.routeLengths[i - 1] ?? 0) + Math.hypot(at.x - previous.x, at.y - previous.y);
      previous = at;
    }
    return this.routeLengths[ROUTE_SEGMENTS] ?? 0;
  }
  /** Bezier parameter at a fraction of the route's length, so speed is set by the plan, not the curve. */
  private routeParam(u: number, length: number): number {
    const want = clamp(u) * length;
    for (let i = 0; i < ROUTE_SEGMENTS; i++) {
      const a = this.routeLengths[i] ?? 0,
        b = this.routeLengths[i + 1] ?? 0;
      if (want <= b || i === ROUTE_SEGMENTS - 1)
        return (i + (b > a ? clamp((want - a) / (b - a)) : 0)) / ROUTE_SEGMENTS;
    }
    return 1;
  }
  /** Where the feet stop: the gait offsets reached at the end of the walk. */
  private arrivalFeet(st: GingerbreadStage): readonly [number, number] {
    const sneak = this.plan.approach === 'sneak';
    const walked = st.length / st.scale,
      stride = sneak ? 8 : 14;
    return [0.6 + gait(walked, stride, 0, 0).x, -0.6 + gait(walked, stride, 0.5, 0).x];
  }

  private placeRoute(ms: number, st: GingerbreadStage) {
    const p = this.plan,
      t = ms / p.travel;
    const u = gingerbreadProgress(p, ms);
    const at = this.routeParam(u, st.length);
    const point = sideRoute(st.start, st.stand, st.b, st.view, st.side, p.bend, at);
    const ahead = sideRoute(
        st.start,
        st.stand,
        st.b,
        st.view,
        st.side,
        p.bend,
        Math.min(1, at + 0.02),
      ),
      behind = sideRoute(
        st.start,
        st.stand,
        st.b,
        st.view,
        st.side,
        p.bend,
        Math.max(0, at - 0.02),
      );
    const dx = ahead.x - behind.x,
      len = Math.hypot(dx, ahead.y - behind.y);
    const dirW = len > 0.01 ? Math.max(-1, Math.min(1, (dx / len) * 2.2)) : st.side;
    const arrive = ease((t - 0.86) / 0.14);
    const dirL = mix(dirW * st.side, 1, arrive);
    const walked = (u * st.length) / st.scale;
    const { pose, hop } = this.routePose(ms, walked, dirL, arrive);
    this.reset(st.scale, st.side, 0, 0.42 * dirW * (1 - arrive));
    this.actor.position.set(point.x, -point.y + hop * st.scale, DEPTH);
    this.pose(pose);
  }

  private routePose(
    ms: number,
    walked: number,
    dirL: number,
    arrive: number,
  ): { pose: GingerbreadPose; hop: number } {
    const p = this.plan,
      sneak = p.approach === 'sneak';
    const beat = gingerbreadBeat(p, ms);
    const stride = sneak ? 8 : 14,
      lift = sneak ? 3.4 : 4.2;
    const phase = (walked / stride) * Math.PI * 2;
    const crouch = (sneak ? 2.6 + 0.5 * Math.sin(phase * 2) : 0.6) * (1 - arrive);
    const legs = [0, 1].map((i) => {
      const g = gait(walked, stride, i * 0.5, lift),
        s = i ? -1 : 1;
      return {
        x: s * 0.6 + g.x * dirL,
        y: -(GINGER_HIP - crouch - FOOT_DROP) + g.y * (1 - arrive),
      };
    });
    const blink = pulse(ms, p.travel * 0.25 + 200 * Math.sin(p.phase), 140);
    let moving: GingerbreadPose;
    if (sneak) {
      // Tiptoeing low with a finger to the lips; the acted beat is a nervous look back over the shoulder.
      moving = {
        crouch,
        lean: -0.13 * dirL,
        bow: 0,
        headTilt: 0.08 + 0.1 * beat,
        headTurn: -0.85 * dirL * beat,
        look: dirL * (0.7 - 1.6 * beat),
        blink,
        cane: { x: 4.6, y: -4.6 },
        caneAngle: -0.35,
        free: { x: 4.4, y: 7.2 },
        legs: [legs[0] ?? { x: 0, y: -9 }, legs[1] ?? { x: 0, y: -9 }],
        toes: 0,
        twirl: 0,
        slide: 0,
        caneZ: 1.1,
      };
    } else {
      // A jaunty skip, swinging the cane; the acted beat is a full baton twirl of the cane in the fist.
      const twirl = (Math.PI * 2 * ease(span(ms / p.travel, p.beatAt, 0.18))) % (Math.PI * 2);
      moving = {
        crouch,
        lean: -0.07 * dirL,
        bow: 0,
        headTilt: 0.07 * Math.sin(phase * 2),
        headTurn: 0,
        look: dirL * 0.7,
        blink,
        cane: { x: 4.2, y: -3.8 + 1.6 * Math.sin(phase) * (1 - beat) + 3 * beat },
        caneAngle: -0.25 + 0.2 * Math.sin(phase),
        free: { x: -2.5 + 3 * Math.sin(phase), y: -6.5 + 2 * Math.abs(Math.cos(phase)) },
        legs: [legs[0] ?? { x: 0, y: -9 }, legs[1] ?? { x: 0, y: -9 }],
        toes: 0,
        twirl,
        slide: 0,
        caneZ: 1.1,
      };
    }
    const settled = { ...rest([moving.legs[0].x, moving.legs[1].x]), legs: moving.legs };
    const hop = sneak ? 0 : 4.2 * Math.abs(Math.sin(phase)) * (1 - arrive);
    return { pose: mixPose(moving, settled, arrive), hop };
  }

  // ---- Testing the hook --------------------------------------------------------------------------

  private testPose(ms: number, feet: readonly [number, number]): GingerbreadPose {
    const p = this.plan;
    const base = rest(feet);
    const raise = ease((ms - p.testStart) / (p.testHit - p.testStart));
    const last = p.test === 'tap' ? gingerbreadTapAt(p, p.taps - 1) : gingerbreadTugEnd(p);
    const back = ease((ms - last - 40) / 240);
    let windup = 0;
    if (p.test === 'tap')
      for (let k = 0; k < p.taps; k++) windup += pulse(ms, gingerbreadTapAt(p, k) - 170, 170);
    const tug =
      p.test === 'tug' ? pulse(ms, p.testHit + 60, 190) + pulse(ms, p.testHit + 290, 190) : 0;
    const reachOut = { x: TEST_REACH.x - 2.4 * windup, y: TEST_REACH.y + 0.8 * windup };
    let q: GingerbreadPose = {
      ...base,
      lean: 0.07 * tug,
      headTilt: 0.28 * pulse(ms, last + 120, 420),
      look: mix(0.5, 0.9, raise) * (1 - 0.6 * back),
      blink: pulse(ms, last + 330, 140),
      cane: mixXy(mixXy(base.cane, reachOut, raise), base.cane, back),
      caneAngle: mix(mix(base.caneAngle, TEST_ANGLE, raise), base.caneAngle, back),
      free: { x: -2.5 - 2.5 * tug, y: -8.2 + 4 * tug },
    };
    // Anticipation: a deep crouch, cane swept low and back, leaning toward the card.
    const c = ease((ms - p.testEnd) / (p.leap - p.testEnd));
    if (c > 0)
      q = mixPose(
        q,
        {
          ...q,
          crouch: 4.8,
          lean: -0.12,
          look: 0.9,
          headTilt: -0.12,
          legs: planted(4.8, feet),
          cane: { x: 1.5, y: -8.6 },
          caneAngle: 0.5,
          free: { x: -4.5, y: -6.5 },
        },
        c,
      );
    return { ...q, legs: planted(q.crouch, feet) };
  }

  private placeTest(ms: number, st: GingerbreadStage) {
    const p = this.plan;
    this.reset(st.scale, st.side, 0, 0);
    this.actor.position.set(st.stand.x, -st.floor, DEPTH);
    const q = this.testPose(ms, this.arrivalFeet(st));
    this.pose(q);
    // While the crook holds the edge during a tug, the hand follows the card exactly.
    if (p.test === 'tug' && ms >= p.testHit && ms <= gingerbreadTugEnd(p)) {
      const card = gingerbreadCardPose(p, ms, st.side, st.b);
      this.holdHook(cardPoint(card, st.testPoint, st.b), q.caneAngle);
    }
  }

  /** Solves the cane arm so the crook's bearing point sits on a screen point (cane angle in body space). */
  private holdHook(at: Point, angle: number) {
    const arm = this.model.arms[0];
    const t = localTarget(arm, this.object, at.x, -at.y);
    const hook = gingerbreadHookInHand(0, 0);
    const c = Math.cos(angle),
      s = Math.sin(angle);
    reach(arm, t.x - (hook.x * c - hook.y * s), t.y - (hook.x * s + hook.y * c), -1, angle);
    gingerbreadSyncCuffs(this.actor);
    this.actor.updateMatrixWorld(true);
  }

  // ---- Leap, trapeze and flip ---------------------------------------------------------------------

  private hangPose(ms: number): GingerbreadPose {
    const p = this.plan;
    const swing = gingerbreadSwing(p, ms) / p.amp;
    const out = Math.max(0, swing);
    const wave = out * Math.sin((ms - p.catchAt) / 45) * 1.2;
    return {
      crouch: 0,
      lean: 0,
      bow: 0,
      headTilt: 0.15 * swing,
      headTurn: 0,
      look: -0.8 * swing,
      blink: 0,
      cane: HANG_REACH,
      caneAngle: HANG_ANGLE,
      free: { x: mix(-2.8, -6.5, out), y: mix(-8, 6.5, out) + wave },
      // Pumping: legs lead into each swing and tuck at the far end.
      legs: [
        { x: 0.8 - 3 * swing, y: -10.6 + 3.5 * Math.abs(swing) },
        { x: -0.8 - 3 * swing, y: -10.6 + 3 * Math.abs(swing) },
      ],
      toes: 0.3,
      twirl: 0,
      slide: 0,
      caneZ: 1.1,
    };
  }

  /** Hangs the body from the crook: the crook sits on the live card point and the body pivots about it. */
  private placeHang(ms: number, st: GingerbreadStage) {
    const p = this.plan;
    const q = this.hangPose(ms);
    this.reset(st.scale, st.side, 0, 0);
    this.pose(q);
    const hook = this.worldOf(this.model.hook),
      navel = this.worldOf(this.model.navel);
    const upright = Math.atan2(hook.x - navel.x, hook.y - navel.y);
    this.actor.rotation.z = upright - st.side * gingerbreadSwing(p, ms);
    this.actor.updateMatrixWorld(true);
    const held = this.worldOf(this.model.hook);
    const at = cardPoint(gingerbreadCardPose(p, ms, st.side, st.b), st.hookPoint, st.b);
    this.actor.position.set(at.x - held.x, -at.y - held.y, DEPTH);
    this.actor.updateMatrixWorld(true);
  }

  private placeLeap(ms: number, st: GingerbreadStage) {
    const p = this.plan;
    this.placeHang(p.catchAt, st);
    const caught = this.actor.position.clone(),
      roll = this.actor.rotation.z;
    const s = (ms - p.leap) / (p.catchAt - p.leap);
    const q = mixPose(
      this.testPose(p.leap, this.arrivalFeet(st)),
      this.hangPose(p.catchAt),
      ease(s / 0.7),
    );
    this.reset(st.scale, st.side, roll * ease(s), 0);
    this.actor.position.set(
      mix(st.stand.x, caught.x, s),
      mix(-st.floor, caught.y, 1 - (1 - s) ** 2),
      DEPTH,
    );
    this.pose(q);
  }

  private flipTuck(): GingerbreadPose {
    return {
      crouch: 0,
      lean: 0,
      bow: 0,
      headTilt: 0.2,
      headTurn: 0,
      look: 0,
      blink: 0.7,
      cane: { x: -2, y: -9 },
      caneAngle: 0.1,
      free: { x: 1.8, y: -9.2 },
      legs: [
        { x: 2, y: -5.4 },
        { x: -2, y: -5.4 },
      ],
      toes: 0,
      twirl: 0,
      slide: 0,
      caneZ: 1.1,
    };
  }

  /** Lets go at the outward peak and somersaults down to the landing, rotating about his middle. */
  private placeFlip(ms: number, st: GingerbreadStage) {
    const p = this.plan;
    this.placeGround(p.land, st);
    const landed = this.worldOf(this.model.navel);
    const landPose = this.groundPose(p.land);
    this.placeHang(p.release, st);
    const from = this.worldOf(this.model.navel),
      roll = this.actor.rotation.z;
    const hangPose = this.hangPose(p.release);
    const s = (ms - p.release) / (p.land - p.release);
    const q =
      s < 0.5
        ? mixPose(hangPose, this.flipTuck(), ease(s / 0.35))
        : mixPose(this.flipTuck(), landPose, ease((s - 0.6) / 0.4));
    // Flipping "forward" turns the way he flies (outward); "back" turns against it.
    const turns = p.flipDir * st.side * Math.PI * 2 * p.flips;
    const spin = roll + (turns - roll) * ease(s);
    this.reset(st.scale, st.side, spin, 0);
    this.pose(q);
    const navel = this.worldOf(this.model.navel);
    const cx = mix(from.x, landed.x, s),
      cy = mix(from.y, landed.y, s) + 30 * st.fit * 4 * s * (1 - s);
    this.actor.position.set(cx - navel.x, cy - navel.y, DEPTH);
    this.actor.updateMatrixWorld(true);
  }

  // ---- Landing, bow, stow ---------------------------------------------------------------------------

  private readyPose(base: GingerbreadPose, st: GingerbreadStage | null): GingerbreadPose {
    const p = this.plan;
    const toward = st ? st.exitDir * st.side : 1;
    const up = { x: 3.6, y: 9.2 };
    return {
      ...base,
      crouch: 1.6,
      lean: -0.18 * toward,
      bow: 0,
      headTilt: 0,
      look: 0.8 * toward,
      blink: 0,
      cane: p.stow === 'back' ? up : base.cane,
      caneAngle: p.stow === 'back' ? 0.3 : base.caneAngle,
      free: { x: -up.x, y: up.y },
      legs: planted(1.6, [1.6, -1.6]),
    };
  }

  private groundPose(ms: number, st: GingerbreadStage | null = null): GingerbreadPose {
    const p = this.plan;
    const tau = ms - p.land;
    const absorb = 1 - ease(tau / 280);
    const crouch = 4.6 * absorb;
    let q: GingerbreadPose = {
      ...rest(NEUTRAL_FEET),
      crouch,
      look: 0,
      legs: planted(crouch, NEUTRAL_FEET),
      cane: { x: 6, y: -1 },
      caneAngle: -0.9,
      free: { x: -6, y: -1 },
    };
    if (!p.stick) {
      // Teeters on the landing, windmilling, the outer foot lifting as he tips.
      const w = ease(tau / 80) * (1 - ease((ms - p.landEnd + 320) / 260));
      const tip = 0.3 * Math.sin(tau / 55) * Math.exp(-tau / 650) * w;
      const a = tau / 70;
      const legs = planted(crouch, NEUTRAL_FEET);
      q = {
        ...q,
        lean: tip,
        headTilt: -0.6 * tip,
        look: -tip * 3,
        cane: mixXy(q.cane, { x: 3.5 + 4.2 * Math.cos(a + 1), y: 2 + 4.2 * Math.sin(a + 1) }, w),
        free: mixXy(q.free, { x: -3.5 - 4.2 * Math.cos(a), y: 2 + 4.2 * Math.sin(a) }, w),
        legs: [legs[0], { x: legs[1].x, y: legs[1].y + 9 * Math.max(0, tip) }],
      };
    }
    const tada = ease((ms - (p.stick ? p.land + 120 : p.landEnd - 300)) / 220);
    q = mixPose(
      q,
      {
        ...q,
        lean: 0,
        headTilt: 0,
        look: 0,
        cane: { x: 3.4, y: 9.2 },
        caneAngle: 0.25,
        free: { x: -4, y: 8.8 },
        legs: planted(crouch, NEUTRAL_FEET),
      },
      tada,
    );
    q = mixPose(q, this.bowPose(ms, q), ease((ms - p.landEnd) / 220));
    const neutral = { ...rest(NEUTRAL_FEET), look: 0.2 };
    q = mixPose(q, neutral, ease((ms - p.bowEnd + 220) / 220));
    q = mixPose(q, this.stowPose(neutral), ease((ms - p.stowAt) / (p.stowEnd - p.stowAt)));
    return mixPose(
      q,
      this.readyPose(this.stowPose(neutral), st),
      ease((ms - p.stowEnd) / (p.exitAt - p.stowEnd)),
    );
  }

  private bowPose(ms: number, from: GingerbreadPose): GingerbreadPose {
    const p = this.plan;
    if (p.bow === 'sweep') {
      // A deep showman's bow: cane swept out wide, free hand to the tummy.
      const deep = ease((ms - p.landEnd) / 240) * (1 - ease((ms - p.bowEnd + 300) / 260));
      return {
        ...from,
        crouch: 0.6,
        bow: 0.8 * deep,
        lean: 0,
        headTilt: 0,
        look: 0,
        cane: { x: 7.5, y: -3.5 },
        caneAngle: -1.2,
        free: { x: 5.2, y: -5 },
        legs: planted(0.6, NEUTRAL_FEET),
        blink: 0.8 * deep,
      };
    }
    // Two quick bobs, tipping the cane at the brow like a hat.
    const bob = pulse(ms, p.landEnd + 60, 340) + pulse(ms, p.landEnd + 420, 340);
    return {
      ...from,
      crouch: 0.8 * bob,
      bow: 0.42 * bob,
      lean: 0,
      headTilt: 0.1 * bob,
      look: 0,
      cane: { x: 1.8, y: 7.8 },
      caneAngle: 0.5,
      free: { x: -6.5, y: -1 },
      legs: planted(0.8 * bob, NEUTRAL_FEET),
    };
  }

  private stowPose(base: GingerbreadPose): GingerbreadPose {
    if (this.plan.stow === 'back')
      return {
        ...base,
        cane: caneHandFor(SHOULDER_HOOK, SLOT_ANGLE, SLOT_SLIDE),
        caneAngle: SLOT_ANGLE,
        slide: SLOT_SLIDE,
        caneZ: SLOT_Z,
        headTilt: 0.12,
        look: 0.6,
      };
    // Tucked upright against his side, under the arm.
    return { ...base, cane: { x: 1.2, y: -9.6 }, caneAngle: 0.22, headTilt: -0.08, look: -0.4 };
  }

  private caneSlot(ms: number): CaneSlot | null {
    return this.plan.stow === 'back' && ms >= this.plan.stowEnd ? this.slot : null;
  }

  private placeGround(ms: number, st: GingerbreadStage) {
    this.reset(st.scale, st.side, 0, 0);
    this.actor.position.set(st.land.x, -st.floor, DEPTH);
    this.pose(this.groundPose(ms, st), this.caneSlot(ms));
  }

  // ---- Cartwheel exit ---------------------------------------------------------------------------------

  private placeWheel(ms: number, st: GingerbreadStage) {
    const p = this.plan;
    const ready = this.groundPose(p.exitAt, st);
    const star: GingerbreadPose = {
      ...ready,
      crouch: 0,
      lean: 0,
      legs: [
        { x: 4.4, y: -10.6 },
        { x: -4.4, y: -10.6 },
      ],
      cane: p.stow === 'back' ? { x: 3.4, y: 9.6 } : ready.cane,
      free: { x: -3.4, y: 9.6 },
      look: 0,
    };
    const q = mixPose(ready, star, ease((ms - p.exitAt) / 260));
    const d = gingerbreadWheelDistance(p, ms, st.wheelTotal, st.fit);
    this.reset(st.scale, st.side, (-st.exitDir * d) / (WHEEL_RADIUS * st.scale), 0);
    this.pose(q, this.caneSlot(ms));
    const navel = this.worldOf(this.model.navel);
    const m = this.model;
    let lowest = Infinity;
    for (const o of [...m.arms.map((a) => a.end), ...m.legs.map((l) => l.end), m.head, m.cane])
      lowest = Math.min(lowest, lowestWorldY(o));
    this.actor.position.set(st.land.x + st.exitDir * d - navel.x, -st.floor - lowest, DEPTH);
    this.actor.updateMatrixWorld(true);
  }

  // ---- Effects ----------------------------------------------------------------------------------------

  private crumbBirth(c: Crumb, st: GingerbreadStage): { at: number; x: number; y: number } {
    const p = this.plan;
    if (c.kind === 'catch') {
      const hook = cardPoint(gingerbreadCardPose(p, p.catchAt, st.side, st.b), st.hookPoint, st.b);
      return { at: p.catchAt + 30, x: hook.x - st.side * 4 * st.fit, y: hook.y + 4 * st.fit };
    }
    if (c.kind === 'land')
      return {
        at: p.land + 20,
        x: st.land.x + (c.k ? -1 : 1) * (3 + 2 * Math.abs(c.jitter)) * st.fit,
        y: st.floor - 3 * st.fit,
      };
    const at = p.exitAt + 380 + c.k * 220;
    const d = gingerbreadWheelDistance(p, at, st.wheelTotal, st.fit);
    return {
      at,
      x: st.land.x + st.exitDir * d + c.jitter * 6 * st.fit,
      y: st.floor - c.height * st.fit,
    };
  }

  /** Crumbs shake loose, fall under gravity and rest on their real outline on the floor. */
  private updateCrumbs(ms: number, st: GingerbreadStage) {
    const p = this.plan;
    const fade = 1 - ease((ms - p.exitEnd) / 450);
    for (const c of this.crumbs) {
      const birth = this.crumbBirth(c, st);
      const age = ms - birth.at;
      c.mesh.visible = age >= 0 && fade > 0 && ms < GINGERBREAD_DURATION;
      if (!c.mesh.visible) continue;
      const drop = Math.max(0, st.floor - birth.y);
      const landAt = (-c.vy + Math.sqrt(c.vy * c.vy + 2 * GRAVITY * drop)) / GRAVITY;
      const s = Math.min(age, landAt);
      const x = birth.x + c.vx * s * st.fit,
        y = birth.y + c.vy * s + 0.5 * GRAVITY * s * s;
      c.mesh.scale.set(c.size * st.scale, c.size * st.scale * 0.8, 1);
      c.mesh.rotation.z = c.spin * s;
      c.mesh.position.set(x, -Math.min(y, st.floor), DEPTH + 3);
      c.mesh.material.opacity = fade;
      if (age >= landAt) {
        c.mesh.updateMatrixWorld(true);
        c.mesh.position.y += -st.floor - lowestWorldY(c.mesh);
      }
    }
  }

  private updateSparkles(ms: number, st: GingerbreadStage) {
    const p = this.plan;
    const tinks = [
      {
        at:
          p.test === 'tap'
            ? gingerbreadTapAt(
                p,
                Math.max(0, Math.min(p.taps - 1, Math.floor((ms - p.testHit + 40) / 240))),
              )
            : p.testHit,
        raw: st.testPoint,
      },
      { at: p.catchAt, raw: st.hookPoint },
    ];
    this.sparkles.forEach((mesh, i) => {
      const tink = tinks[i];
      const t = tink ? (ms - tink.at) / 240 : -1;
      mesh.visible = !!tink && t >= 0 && t < 1;
      if (!tink || !mesh.visible) return;
      const at = cardPoint(gingerbreadCardPose(p, ms, st.side, st.b), tink.raw, st.b);
      mesh.position.set(at.x, -at.y, DEPTH + 10);
      mesh.rotation.z = t * 1.2;
      mesh.scale.setScalar((2 + 4 * ease(t)) * st.fit);
      mesh.material.opacity = Math.sin(Math.PI * t);
    });
  }
}
