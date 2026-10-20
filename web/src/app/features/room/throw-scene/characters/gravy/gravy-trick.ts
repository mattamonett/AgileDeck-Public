import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  bezier,
  cardFit,
  cardTurn,
  clamp,
  ease,
  glow,
  localTarget,
  mix,
  onCard,
  part,
  pulse,
  reach,
  setStrip,
  sideOf,
  sideRoute,
  span,
  stripGeometry,
  NEUTRAL_CARD,
  type CardPose,
  type CharacterRoutine,
  type Limb,
  type Side,
} from '../../kit';
import {
  GRAVY_DROP_FALL,
  GRAVY_DURATION,
  GRAVY_SCALE,
  GRAVY_STEP_IN,
  gravyBeat,
  gravyBiteAt,
  gravyCardPose,
  gravyDrops,
  gravyExitPoint,
  gravyExitProgress,
  gravyFloor,
  gravyFlow,
  gravyFrames,
  gravyLandingPoint,
  gravyLastStroke,
  gravyLip,
  gravyPoured,
  gravyProgress,
  gravyRunHead,
  gravyRunoffs,
  gravyRunTail,
  gravySpots,
  gravyWipePoint,
  gravyWipeStand,
  type GravyPlan,
  type GravyRunoff,
  type GravySpot,
} from './gravy-choreography';
import {
  GRAVY_HIP,
  GRAVY_REST,
  GRAVY_SHOULDER,
  gravyModel,
  gravyPose,
  inHandOf,
  type GravyModel,
  type GravyPose,
  puddleShape,
} from './gravy-model';

const DEPTH = 172;
/** Gravy on the card sits just in front of the card and behind the chef. */
const CARD_Z = DEPTH - 14;
/** Height of the chef's middle above his soles, so he sets off centred on the sender's card. */
const BODY_MID = 40;
/** The mouth, in actor space, while walking upright. */
const MOUTH = { x: 8.7, y: 57.3 };
/** The roll is pressed with the hand held at this angle, a little up from straight at the card. */
const MOP_ANGLE = Math.PI / 2 + 0.35;
const crouchFor = (lean: number) => 1.2 + 7 * Math.max(0, lean - 0.2);
const GRAVY = 0x7a4420,
  GRAVY_DARK = 0x4a250e,
  GRAVY_SHINE = 0xe2ad6c;

interface Blob {
  readonly spot: GravySpot;
  readonly rim: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
  readonly body: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
  readonly glint: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial> | null;
  readonly fling: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> | null;
}
interface Rivulet {
  readonly runoff: GravyRunoff;
  readonly drops: readonly number[];
  readonly strip: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  readonly bead: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  readonly drop: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
}
interface Placement {
  readonly at: Point;
  readonly yaw: number;
  readonly walked: number;
  readonly planted: number;
}
interface Hold {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export class GravyTrick implements CharacterRoutine {
  readonly object = new THREE.Group();
  readonly plan: GravyPlan;
  readonly duration: number;
  private readonly model: GravyModel;
  private readonly blobs: Blob[] = [];
  private readonly rivulets: Rivulet[] = [];
  private readonly stream = part(this.object, 'gravy-stream', stripGeometry(16), glow(GRAVY));
  private readonly sheen = part(
    this.object,
    'gravy-stream-sheen',
    stripGeometry(16),
    glow(GRAVY_SHINE, 0.7),
  );
  private readonly ripple = part(
    this.object,
    'gravy-ripple',
    new THREE.RingGeometry(0.82, 1, 24),
    glow(GRAVY, 0),
  );
  private readonly streak = part(this.object, 'gravy-streak', stripGeometry(12), glow(GRAVY, 0));
  private readonly puddle = part(
    this.object,
    'gravy-puddle',
    new THREE.ShapeGeometry(puddleShape(0.7)),
    glow(GRAVY_DARK, 0),
  );
  private readonly puddleShine = part(
    this.object,
    'gravy-puddle-shine',
    new THREE.CircleGeometry(1, 16),
    glow(GRAVY_SHINE, 0),
  );
  private readonly crumbs: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly routeLengths = new Float32Array(25);
  private readonly world = new THREE.Vector3();

  constructor(actor: THREE.Group) {
    this.model = gravyModel(actor);
    this.plan = this.model.plan;
    this.duration = GRAVY_DURATION * this.plan.pace;
    this.object.name = 'gravy-spill';
    gravySpots(this.plan).forEach((spot, i) => {
      const rim = part(
        this.object,
        `gravy-pool-rim-${i}`,
        new THREE.ShapeGeometry(puddleShape(i * 1.7 + this.plan.phase)),
        glow(GRAVY_DARK),
      );
      const body = part(
        this.object,
        `gravy-pool-${i}`,
        new THREE.ShapeGeometry(puddleShape(i * 2.3 + 1)),
        glow(GRAVY),
      );
      const glint =
        i % 3 === 0
          ? part(
              this.object,
              `gravy-pool-glint-${i}`,
              new THREE.CircleGeometry(1, 12),
              glow(GRAVY_SHINE, 0.75),
            )
          : null;
      const fling = spot.flung
        ? part(this.object, `gravy-fling-${i}`, new THREE.SphereGeometry(1, 8, 6), glow(GRAVY))
        : null;
      this.blobs.push({ spot, rim, body, glint, fling });
    });
    gravyRunoffs(this.plan).forEach((runoff, i) => {
      this.rivulets.push({
        runoff,
        drops: gravyDrops(runoff),
        strip: part(this.object, `gravy-runoff-${i}`, stripGeometry(10), glow(GRAVY)),
        bead: part(
          this.object,
          `gravy-runoff-bead-${i}`,
          new THREE.CircleGeometry(1, 14),
          glow(GRAVY),
        ),
        drop: part(this.object, `gravy-drop-${i}`, new THREE.CircleGeometry(1, 12), glow(GRAVY)),
      });
    });
    for (let i = 0; i < 6; i++)
      this.crumbs.push(
        part(
          this.object,
          `gravy-crumb-${i}`,
          new THREE.SphereGeometry(1, 6, 5),
          glow(i % 2 ? 0xc98a45 : 0xe6b56c),
        ),
      );
  }

  cardAnimation(facing: number) {
    return gravyFrames(this.plan, facing);
  }

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
  /** Measures the approach so the body moves by arc length and planted feet advance with it. */
  private measureRoute(
    start: Point,
    stand: Point,
    b: TargetBounds,
    view: Point,
    side: Side,
  ): number {
    let previous = this.routeAt(0, start, stand, b, view, side);
    this.routeLengths[0] = 0;
    for (let i = 1; i <= 24; i++) {
      const at = this.routeAt(i / 24, start, stand, b, view, side);
      this.routeLengths[i] =
        (this.routeLengths[i - 1] ?? 0) + Math.hypot(at.x - previous.x, at.y - previous.y);
      previous = at;
    }
    return this.routeLengths[24] ?? 0;
  }
  /** Route parameter at which the given fraction of the route's length has been covered. */
  private paramAt(fraction: number): number {
    const total = this.routeLengths[24] ?? 0,
      wanted = clamp(fraction) * total;
    for (let i = 0; i < 24; i++) {
      const a = this.routeLengths[i] ?? 0,
        b = this.routeLengths[i + 1] ?? 0;
      if (wanted <= b || i === 23) return (i + (b > a ? clamp((wanted - a) / (b - a)) : 0)) / 24;
    }
    return 1;
  }

  /** Where the chef stands, which way he faces and how far he has walked, at any moment. */
  private placement(
    ms: number,
    start: Point,
    b: TargetBounds,
    view: Point,
    side: Side,
    scale: number,
  ): Placement {
    const p = this.plan;
    const from = { x: start.x, y: start.y + BODY_MID * scale };
    const stand = gravyLandingPoint(p, b, view, side),
      close = gravyWipeStand(p, b, view, side);
    const contactYaw = side > 0 ? 0 : -Math.PI;
    const length = this.measureRoute(from, stand, b, view, side);
    const step = Math.abs(close.x - stand.x);
    if (ms < p.travel) {
      const t = ms / p.travel,
        u = gravyProgress(p, t),
        r = this.paramAt(u);
      const at = this.routeAt(r, from, stand, b, view, side);
      const ahead = this.routeAt(Math.min(1, r + 0.02), from, stand, b, view, side),
        behind = this.routeAt(Math.max(0, r - 0.02), from, stand, b, view, side);
      const dx = ahead.x - behind.x,
        heading = Math.hypot(dx, ahead.y - behind.y);
      let yaw: number = contactYaw;
      if (heading > 0.5) yaw = -Math.acos(Math.max(-1, Math.min(1, dx / heading)));
      // Square up to the card over the last strides.
      yaw = mix(yaw, contactYaw, ease((t - 0.88) / 0.12));
      return { at, yaw, walked: (u * length) / scale, planted: ease((t - 0.94) / 0.06) };
    }
    if (ms < p.departure) {
      const s = ease((ms - p.stepIn) / GRAVY_STEP_IN);
      return {
        at: { x: mix(stand.x, close.x, s), y: stand.y },
        yaw: contactYaw,
        walked: (length + step * s) / scale,
        planted: 1 - pulse(ms, p.stepIn, GRAVY_STEP_IN),
      };
    }
    const exit = gravyExitPoint(p, b, view, side),
      e = gravyExitProgress(p, ms);
    const total = Math.hypot(exit.x - close.x, exit.y - close.y),
      gone = total * e.d;
    // Backing away steps the feet backwards before he turns and walks off.
    const backed = p.exit === 'backAway' ? Math.min(gone, total * 0.1) : 0;
    return {
      at: { x: mix(close.x, exit.x, e.d), y: mix(close.y, exit.y, e.d) },
      yaw: mix(contactYaw, side > 0 ? -Math.PI : 0, e.turn),
      walked: (length + step - backed + (gone - backed)) / scale,
      planted: 1 - ease((ms - p.departure) / 160),
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
    const live = ms < GRAVY_DURATION;
    this.object.visible = live;
    this.object.position.set(0, 0, 0);
    const fit = cardFit(b),
      scale = GRAVY_SCALE * fit;
    const q = gravyCardPose(p, ms, side);
    const place = this.placement(ms, start, b, view, side, scale);
    actor.visible = live;
    actor.position.set(place.at.x, -place.at.y, DEPTH);
    actor.rotation.set(0, place.yaw, 0);
    actor.scale.setScalar(scale);
    const reachLean = Math.max(
      ...[-80, 0, 80].map((dt) => this.leanFor(ms + dt, place, b, side, scale)),
    );
    gravyPose(actor, this.pose(ms, place, reachLean));
    actor.updateMatrixWorld(true);
    this.placeArms(ms, b, q, side, place);
    actor.updateMatrixWorld(true);
    const fade = 1 - ease((ms - p.exitEnd) / 450);
    this.updateStream(ms, b, q, side, scale, live);
    this.updatePool(ms, b, q, side, scale, live && fade > 0, fade);
    this.updateRunoff(ms, b, q, side, fit, live && fade > 0, fade);
    this.updateCrumbs(ms, start, b, view, side, scale, live && fade > 0, fade);
  }

  /**
   * Smallest forward lean (with the crouch that goes with it) that brings the roll's grip within the
   * arm's reach of the card spot being mopped, so the roll can stay exactly on the card.
   */
  private leanFor(
    ms: number,
    place: Placement,
    b: TargetBounds,
    side: Side,
    scale: number,
  ): number {
    const p = this.plan;
    const t = Math.max(p.wipeStart, Math.min(p.wipeEnd, ms));
    const spot = gravyWipePoint(p, t);
    const target = onCard(gravyCardPose(p, t, side), side > 0 ? spot.n : 1 - spot.n, spot.v, b);
    const roll = inHandOf(this.model.wiper, this.model.arms[1].end);
    const c = Math.cos(MOP_ANGLE),
      s = Math.sin(MOP_ANGLE);
    const hx = ((target.x - place.at.x) * side) / scale - (roll.x * c - roll.y * s),
      hy = (place.at.y - target.y) / scale - (roll.x * s + roll.y * c);
    const [upper, lower] = this.model.arms[1].lengths;
    const limit = (upper + lower) * 0.985;
    const short = (lean: number) => {
      const sx =
          GRAVY_HIP.x + GRAVY_SHOULDER.x * Math.cos(lean) + GRAVY_SHOULDER.y * Math.sin(lean),
        sy =
          GRAVY_HIP.y -
          crouchFor(lean) +
          GRAVY_SHOULDER.y * Math.cos(lean) -
          GRAVY_SHOULDER.x * Math.sin(lean);
      return Math.hypot(hx - sx, hy - sy) - limit;
    };
    let lo = 0.12,
      hi = 0.12;
    if (short(lo) <= 0) return lo;
    for (let k = 1; k <= 45 && short(hi) > 0; k++) {
      lo = hi;
      hi = 0.12 + k * 0.012;
    }
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      if (short(mid) <= 0) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  private pose(ms: number, place: Placement, reachLean: number): GravyPose {
    const p = this.plan;
    const beat = ms < p.travel ? gravyBeat(p, ms / p.travel) : 0;
    const steady = p.beat === 'steady' ? beat : 0,
      sniff = p.beat === 'sniff' ? beat : 0;
    let lean = (p.march ? 0.07 : 0.02) - 0.12 * steady + 0.14 * sniff,
      headTilt = -0.28 * sniff + 0.12 * steady,
      headTurn = 0,
      brows = 0.7 * steady,
      mouth = 0.4 * steady,
      crouch = 0,
      blink = Math.max(pulse((ms + p.phase * 500) % 2900, 2740, 150), sniff > 0.35 ? sniff : 0);
    // Raise and pour: a careful, concentrating lean over the card.
    const aim = ease((ms - p.raise) / 400) * (1 - ease((ms - p.oops) / 300));
    lean = mix(lean, 0.06, aim);
    headTilt = mix(headTilt, -0.32, aim);
    brows = mix(brows, -0.35, aim);
    // The over-tip: eyebrows shoot up, mouth drops open, he recoils.
    const alarm = ease((ms - p.tip) / 120) * (1 - ease((ms - p.oops - 200) / 300));
    lean -= 0.1 * alarm;
    headTilt += 0.28 * alarm;
    brows = mix(brows, 1, alarm);
    mouth = Math.max(mouth, 0.9 * alarm);
    // Oops: a guilty look straight out at the viewer.
    const look = pulse(ms, p.oops, 620);
    headTurn = (-Math.PI / 2 - place.yaw) * 0.6 * look;
    blink = Math.max(blink, pulse(ms, p.oops + 330, 120));
    // Mopping: leaning in hard over the card with a bob on every stroke.
    const mop = ease((ms - p.wipeStart + 300) / 300) * (1 - ease((ms - p.wipeEnd) / 300));
    lean = mix(lean, reachLean, mop);
    crouch = crouchFor(reachLean) * mop;
    headTilt = mix(headTilt, -0.36, mop);
    brows = mix(brows, -0.45, mop);
    mouth = mix(mouth, 0.15, mop);
    // Inspecting the soggy roll, with a sheepish glance back at any smear.
    const inspect = ease((ms - p.wipeEnd) / 260) * (1 - ease((ms - p.departure) / 300));
    headTilt = mix(headTilt, -0.12, inspect);
    brows = mix(brows, 0.55, inspect);
    lean = mix(lean, 0.02, inspect);
    if (p.streak) headTurn += -0.35 * pulse(ms, p.wipeEnd + 200, 420);
    let eaten = 0,
      chew = 0;
    if (ms >= p.departure) {
      const go = ease((ms - p.departure) / 300);
      if (p.exit === 'backAway') {
        lean = mix(lean, -0.04, go);
        headTilt = mix(headTilt, -0.3, go);
        brows = mix(brows, 0.6, go);
      } else {
        lean = mix(lean, 0.05, go);
        headTilt = mix(headTilt, 0.05, go);
        brows = mix(brows, 0.2, go);
        for (let k = 0; k < p.bites; k++) {
          const at = gravyBiteAt(p, k);
          eaten += ease((ms - at) / 90);
          chew = Math.max(
            chew,
            pulse(ms, at - 120, 160),
            0.5 * Math.abs(Math.sin((ms - at) / 60)) * pulse(ms, at + 60, 300),
          );
        }
        blink = Math.max(blink, 0.4 * go * (1 - chew));
      }
      mouth = Math.max(mouth * (1 - go), chew);
    }
    const poured = gravyPoured(p, ms + p.fall);
    return {
      ...GRAVY_REST,
      walked: place.walked,
      stride: this.stride(ms),
      planted: place.planted,
      crouch,
      lean,
      headTurn,
      headTilt,
      hatLag: 0.12 * Math.sin(ms / 60) * pulse(ms, p.tip, 500) - 0.08 * lean,
      blink,
      brows,
      mouth,
      level: 1 - 0.85 * poured,
      bead: gravyFlow(p, ms) + 0.4 * pulse(ms, p.dry, 300),
      dribble: ease((ms - p.right) / 400),
      boatRoll: 0.38 * Math.cos(place.yaw),
      soak: clamp((ms - p.wipeStart) / (p.wipeEnd - p.wipeStart)),
      eaten,
    };
  }

  /** Short waddling or longer marching steps on the way in, hurried long strides on the way out. */
  private stride(ms: number): number {
    return ms >= this.plan.departure ? 20 : this.plan.march ? 15 : 10;
  }

  /** Grip that puts a marker carried in this hand exactly on a screen point, holding the hand at `angle`. */
  private gripFor(arm: Limb, marker: THREE.Object3D, screen: Point, angle: number): Hold {
    const target = localTarget(arm, this.object, screen.x, -screen.y);
    const held = inHandOf(marker, arm.end);
    const c = Math.cos(angle),
      s = Math.sin(angle);
    return {
      x: target.x - (held.x * c - held.y * s),
      y: target.y - (held.x * s + held.y * c),
      angle,
    };
  }

  private placeArms(ms: number, b: TargetBounds, q: CardPose, side: Side, place: Placement) {
    const p = this.plan,
      m = this.model;
    const [boatArm, rollArm] = m.arms;
    const uOf = (n: number) => (side > 0 ? n : 1 - n);
    const bodyTurn = m.body.rotation.z;
    const beat = ms < p.travel ? gravyBeat(p, ms / p.travel) : 0;
    const steady = p.beat === 'steady' ? beat : 0,
      sniff = p.beat === 'sniff' ? beat : 0;
    const swing = Math.sin((place.walked / this.stride(ms)) * Math.PI * 2) * (1 - place.planted);
    // Boat arm: carried level, lifted over the card to pour, then held safely aloft while mopping.
    const slosh = 0.24 * Math.sin(ms / 70) * steady;
    let tilt = slosh - 0.12 * sniff;
    let boat: Hold = { x: mix(8.5, 7.5, sniff), y: mix(-12, -3.5, sniff) + 0.6 * swing, angle: 0 };
    const lip = gravyLip(p, ms);
    const pouring = lip.hold * (1 - ease((ms - p.oops - 200) / 350));
    const aloft = ease((ms - p.oops - 200) / 350) * (1 - ease((ms - p.departure) / 450));
    if (pouring > 0) {
      const at = onCard(NEUTRAL_CARD, uOf(lip.n), lip.v, b);
      const grip = this.gripFor(boatArm, m.lip, at, Math.PI / 2 - lip.tilt - bodyTurn);
      boat = { x: mix(boat.x, grip.x, pouring), y: mix(boat.y, grip.y, pouring), angle: 0 };
      tilt = mix(tilt, lip.tilt, pouring);
    }
    // Held up and slightly back in world terms, so it stays clear of his face however far he leans in.
    const up = {
      x: -5 * Math.cos(bodyTurn) + 24 * Math.sin(bodyTurn),
      y: 5 * Math.sin(bodyTurn) + 24 * Math.cos(bodyTurn),
    };
    boat = { x: mix(boat.x, up.x, aloft), y: mix(boat.y, up.y, aloft), angle: 0 };
    tilt = mix(tilt, -0.3, aloft);
    reach(boatArm, boat.x, boat.y, -1, Math.PI / 2 - tilt - bodyTurn);
    // Roll arm: swinging or out for balance, to the mouth in dismay, pressed to the card, then inspected or eaten.
    let roll: Hold = {
      x: mix(1 - 2.5 * swing, -8, steady),
      y: mix(-19, -5, steady),
      angle: mix(0.2, 1.2, steady),
    };
    const dismay = pulse(ms, p.oops - 60, 640);
    roll = {
      x: mix(roll.x, 8, dismay),
      y: mix(roll.y, 6.5, dismay),
      angle: mix(roll.angle, 2.4, dismay),
    };
    const mop = ease((ms - p.wipeStart + 380) / 380) * (1 - ease((ms - p.wipeEnd) / 260));
    if (mop > 0) {
      const spot = gravyWipePoint(p, ms);
      const grip = this.gripFor(
        rollArm,
        m.wiper,
        onCard(q, uOf(spot.n), spot.v, b),
        MOP_ANGLE - bodyTurn,
      );
      roll = {
        x: mix(roll.x, grip.x, mop),
        y: mix(roll.y, grip.y, mop),
        angle: mix(roll.angle, grip.angle, mop),
      };
    }
    const inspect = ease((ms - p.wipeEnd) / 260) * (1 - ease((ms - p.departure - 150) / 350));
    roll = {
      x: mix(roll.x, 9, inspect),
      y: mix(roll.y, 1, inspect),
      angle: mix(roll.angle, 1.9, inspect),
    };
    if (ms >= p.departure) {
      const go = ease((ms - p.departure - 150) / 350);
      if (p.exit === 'backAway')
        roll = { x: mix(roll.x, 6, go), y: mix(roll.y, -5, go), angle: mix(roll.angle, 1.6, go) };
      else {
        let toMouth = 0;
        for (let k = 0; k < p.bites; k++)
          toMouth = Math.max(toMouth, pulse(ms, gravyBiteAt(p, k) - 260, 420));
        roll = {
          x: mix(roll.x, mix(4, 9.5, toMouth), go),
          y: mix(roll.y, mix(-8, 6.5, toMouth), go),
          angle: mix(roll.angle, mix(1.2, 2.3, toMouth), go),
        };
      }
    }
    reach(rollArm, roll.x, roll.y, -1, roll.angle);
  }

  private updateStream(
    ms: number,
    b: TargetBounds,
    q: CardPose,
    side: Side,
    scale: number,
    live: boolean,
  ) {
    const p = this.plan;
    const flowing = live && ms >= p.flow && ms < p.dry + p.fall;
    this.stream.visible = this.sheen.visible = flowing;
    const uOf = (n: number) => (side > 0 ? n : 1 - n);
    const land = onCard(q, uOf(p.poolN), p.poolV, b);
    this.updateRipple(ms, land, scale);
    if (!flowing) return;
    const lip = this.model.lip.getWorldPosition(this.world);
    const a = { x: lip.x, y: -lip.y },
      lipZ = lip.z;
    const drop = Math.max(6 * scale, land.y - a.y);
    // Leaves the spout moving forward, then falls straight into the pool.
    const c1 = { x: a.x + side * 6 * scale, y: a.y + 1.5 * scale },
      c2 = { x: land.x, y: land.y - drop * 0.45 };
    const head = clamp((ms - p.flow) / p.fall) ** 1.6,
      tail = clamp((ms - p.dry) / p.fall) ** 1.6;
    const width = (1.1 + 3 * gravyFlow(p, Math.min(ms, p.dry - 1))) * scale * 0.85;
    const along = (s: number) => mix(tail, head, s);
    setStrip(
      this.stream.geometry,
      16,
      (s, out) => {
        const t = along(s),
          at = bezier(a, c1, c2, land, t);
        out.set(at.x, -at.y, mix(lipZ, CARD_Z + 1.5, t));
      },
      (s) => width * (1 - 0.3 * along(s)),
    );
    setStrip(
      this.sheen.geometry,
      16,
      (s, out) => {
        const t = along(s),
          at = bezier(a, c1, c2, land, t);
        out.set(at.x - width * 0.22, -at.y, mix(lipZ, CARD_Z + 1.5, t) + 0.2);
      },
      (s) => width * 0.28 * (1 - 0.3 * along(s)) * (s > 0.92 ? 0.3 : 1),
    );
  }

  private updateRipple(ms: number, land: Point, scale: number) {
    const p = this.plan;
    const first = span(ms, p.contact, 380),
      glug = span(ms, p.tip + p.fall, 460);
    const t = glug > 0 && glug < 1 ? glug : first;
    this.ripple.visible = t > 0 && t < 1;
    this.ripple.position.set(land.x, -land.y, CARD_Z + 1.2);
    const wide = glug > 0 && glug < 1 ? 7 : 4;
    this.ripple.scale.set((2 + wide * ease(t)) * scale, (1.2 + 0.45 * wide * ease(t)) * scale, 1);
    this.ripple.material.opacity = 0.55 * (1 - t);
  }

  private updatePool(
    ms: number,
    b: TargetBounds,
    q: CardPose,
    side: Side,
    scale: number,
    live: boolean,
    fade: number,
  ) {
    const p = this.plan;
    const uOf = (n: number) => (side > 0 ? n : 1 - n);
    const turn = cardTurn(q);
    const land = onCard(q, uOf(p.poolN), p.poolV, b);
    this.blobs.forEach(({ spot, rim, body, glint, fling }, i) => {
      const grow = ease((ms - spot.at) / (spot.flung ? 90 : 240)),
        wiped = ease((ms - spot.wiped) / 90);
      const size = spot.r * b.height * grow * (1 - wiped);
      const show = live && size > 0.05;
      rim.visible = body.visible = show;
      const at = onCard(q, uOf(spot.n), spot.v, b);
      rim.position.set(at.x, -at.y, CARD_Z + 0.2 + i * 0.01);
      rim.rotation.z = turn + i * 1.3;
      rim.scale.set(size * 1.07, size * 0.97, 1);
      rim.material.opacity = 0.9 * fade;
      body.position.set(at.x - 0.15 * size, -at.y + 0.12 * size, CARD_Z + 0.4 + i * 0.01);
      body.rotation.z = turn - i * 0.9;
      body.scale.set(size, size * 0.88, 1);
      body.material.opacity = 0.96 * fade;
      if (glint) {
        glint.visible = show && size > 1.2;
        glint.position.set(at.x - 0.38 * size, -at.y + 0.34 * size, CARD_Z + 0.7 + i * 0.01);
        glint.rotation.z = 0.5;
        glint.scale.set(0.34 * size, 0.14 * size, 1);
        glint.material.opacity = 0.7 * fade;
      }
      if (fling) {
        // Splashes thrown out by the glug arc from the landing point to where they stick.
        const k = span(ms, spot.at - 150, 150);
        fling.visible = live && k > 0 && k < 1;
        fling.position.set(
          mix(land.x, at.x, k),
          -(mix(land.y, at.y, k) - Math.sin(Math.PI * k) * 9 * scale),
          CARD_Z + 6,
        );
        fling.scale.set(1.1 * scale, 1.4 * scale, 1);
      }
    });
    // An imperfect cleanup leaves a thin smear along the last stroke, which stays until the chef is gone.
    const last = gravyLastStroke(p);
    this.streak.visible = p.streak && live && ms >= last + 30;
    if (!this.streak.visible) return;
    const until = Math.min(ms, p.wipeEnd);
    setStrip(
      this.streak.geometry,
      12,
      (s, out) => {
        const w = gravyWipePoint(p, mix(last, until, s));
        const at = onCard(q, uOf(w.n), w.v + 0.018, b);
        out.set(at.x, -at.y, CARD_Z + 0.9);
      },
      (s) => 1.5 * scale * (0.5 + 0.5 * Math.sin(Math.PI * s)),
    );
    this.streak.material.opacity = 0.7 * fade;
  }

  private updateRunoff(
    ms: number,
    b: TargetBounds,
    q: CardPose,
    side: Side,
    fit: number,
    live: boolean,
    fade: number,
  ) {
    const p = this.plan;
    const uOf = (n: number) => (side > 0 ? n : 1 - n);
    const floor = gravyFloor(b);
    let landed = 0,
      sumX = 0;
    this.rivulets.forEach(({ runoff, drops, strip, bead, drop }, i) => {
      const head = gravyRunHead(runoff, ms),
        tail = gravyRunTail(runoff, ms);
      const meander = (v: number) => runoff.n + Math.sin(v * 38 + i * 2.1) * 0.008;
      const show = live && ms >= runoff.born && head - tail > 0.004;
      strip.visible = bead.visible = show;
      if (show) {
        setStrip(
          strip.geometry,
          10,
          (s, out) => {
            const v = mix(tail, head, s),
              at = onCard(q, uOf(meander(v)), v, b);
            out.set(at.x, -at.y, CARD_Z + 0.05 + i * 0.01);
          },
          (s) => runoff.width * fit * (1.15 - 0.35 * s),
        );
        strip.material.opacity = 0.95 * fade;
        // The leading bead swells while it hangs at the bottom edge between drips.
        const edge = ms - runoff.born - runoff.run;
        const swell = edge > 0 && tail < 1 ? ((edge % 340) / 340) * 0.7 : 0;
        const at = onCard(q, uOf(meander(head)), head, b);
        bead.position.set(at.x, -at.y - swell * runoff.width * fit * 0.6, CARD_Z + 0.1 + i * 0.01);
        bead.scale.set(runoff.width * fit * 0.75, runoff.width * fit * (0.85 + swell), 1);
        bead.material.opacity = fade;
      }
      let falling: number | null = null;
      for (const at of drops) {
        if (at <= ms) falling = at;
        landed += ease((ms - at - GRAVY_DROP_FALL) / 260);
      }
      const age = falling === null ? -1 : ms - falling;
      drop.visible = live && falling !== null && age < GRAVY_DROP_FALL;
      if (drop.visible && falling !== null) {
        const from = onCard(gravyCardPose(p, falling, side), uOf(meander(1)), 1, b);
        const k = age / GRAVY_DROP_FALL;
        drop.position.set(from.x, -mix(from.y, floor, k * k), CARD_Z + 2);
        drop.scale.set(runoff.width * fit * 0.7, runoff.width * fit * (0.9 + 0.8 * k), 1);
      }
      sumX += onCard(NEUTRAL_CARD, uOf(runoff.n), 1, b).x;
    });
    // Drops gather into a small puddle on the floor under the card.
    const amount = Math.min(10, landed);
    this.puddle.visible = this.puddleShine.visible = live && amount > 0.02;
    const x = sumX / Math.max(1, this.rivulets.length);
    this.puddle.position.set(x, -floor - 0.5 * fit, DEPTH - 18);
    this.puddle.scale.set((2.5 + 1.6 * amount) * fit, (0.9 + 0.35 * amount) * fit, 1);
    this.puddle.material.opacity = 0.92 * fade;
    this.puddleShine.position.set(x - (0.6 + 0.5 * amount) * fit, -floor + 0.1 * fit, DEPTH - 17.8);
    this.puddleShine.scale.set((0.5 + 0.3 * amount) * fit, 0.22 * fit, 1);
    this.puddleShine.material.opacity = 0.45 * fade;
  }

  /** Crumbs fall from the mouth at each bite of the roll and rest on the floor. */
  private updateCrumbs(
    ms: number,
    start: Point,
    b: TargetBounds,
    view: Point,
    side: Side,
    scale: number,
    live: boolean,
    fade: number,
  ) {
    const p = this.plan;
    const floor = gravyFloor(b);
    this.crumbs.forEach((crumb, i) => {
      const k = Math.floor(i / 2);
      const at = gravyBiteAt(p, k);
      crumb.visible = live && p.exit === 'nibble' && k < p.bites && ms >= at;
      if (!crumb.visible) return;
      const there = this.placement(at, start, b, view, side, scale);
      const mouth = {
        x: there.at.x + Math.cos(there.yaw) * MOUTH.x * scale,
        y: there.at.y - MOUTH.y * scale,
      };
      const t = (ms - at) / 1000,
        vx = (i % 2 ? 22 : -14) * scale,
        land = Math.sqrt((2 * Math.max(0, floor - mouth.y)) / 700);
      const s = Math.min(t, land);
      crumb.position.set(
        mouth.x + vx * s,
        -Math.min(floor - 0.6 * scale, mouth.y + 350 * s * s),
        DEPTH + 10,
      );
      crumb.scale.set(0.8 * scale, 0.6 * scale, 0.6 * scale);
      crumb.material.opacity = fade;
    });
  }
}
