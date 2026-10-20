import * as THREE from 'three';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  blobShape,
  cardFit,
  cardPoint,
  cardTurn,
  clamp,
  ease,
  gait,
  glow,
  lowestWorldY,
  mix,
  mixPoint,
  part,
  pulse,
  reach,
  setStrip,
  sideOf,
  sideRoute,
  span,
  stripGeometry,
  type CardPose,
  type CharacterRoutine,
  type Limb,
  type Side,
} from '../../kit';
import {
  PIECHEF_DURATION,
  piechefCardPose,
  piechefContact,
  piechefExitPoint,
  piechefExitProgress,
  piechefFloor,
  piechefFrames,
  piechefLandingPoint,
  piechefPeel,
  piechefProgress,
  piechefRub,
  piechefScale,
  piechefTripT,
  type PiechefPlan,
} from './piechef-choreography';
import {
  PIE_FACE,
  PIE_RADIUS,
  PIE_RIM,
  PIECHEF_HIP,
  PIECHEF_HIP_X,
  piechefModel,
  piechefPose,
  type PiechefFoot,
  type PiechefModel,
  type PiechefPose,
} from './piechef-model';

const DEPTH = 172;
/** Overlays sit on the card plane, behind the chef; the pressed filling face sits just in front of them. */
const CARD_Z = DEPTH - 15;
const FACE_Z = DEPTH - 13;
/** Height of the chef's visual centre above his feet, so he sets off centred on the sender's card. */
const LIFT = 35.5;
const STRIDE = 26;
const EXIT_STRIDE = { hurry: 26, tiptoe: 16 } as const;
const GRIP = 3.6;
const SEGMENTS = 32;
const FILLING = 0xe48a3c,
  FILLING_DARK = 0xc56b2c,
  CREAM = 0xfff4e2,
  CRUST = 0xcf9548;
/** Body-space point where the pie is carried, and root-space point where the tin is inspected. */
const CARRY = new THREE.Vector3(13.6, 12.5, 0);
const LOOK = new THREE.Vector3(12.5, 31.5, 0);
/** Root-space directions (x forward, z toward arm 0) of the rim points each mitt holds. */
const RIM_ANGLE = Math.atan2(0.95, 0.31);
/**
 * Pie-space azimuth of the rim point arm `i` holds while the chef has turned by `yaw`: the camera-side
 * mitt takes the far rim and the other the near rim, whichever side of the card he works from.
 */
const rimAzimuth = (i: number, yaw: number, side: Side) =>
  (side > 0 ? RIM_ANGLE : Math.PI - RIM_ANGLE) + i * Math.PI - yaw;
const rimPoint = (azimuth: number, out = new THREE.Vector3()) =>
  out.set(Math.cos(azimuth) * PIE_RIM, 0.3, Math.sin(azimuth) * PIE_RIM);
/** Blends two angles the short way round. */
const turnToward = (a: number, b: number, k: number) =>
  a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const UP = new THREE.Vector3(0, 1, 0);

interface Stage {
  readonly side: Side;
  readonly scale: number;
  readonly fit: number;
  readonly floor: number;
  readonly stand: Point;
  /** Unanimated card point where the filling face lands. */
  readonly contact: Point;
  readonly b: TargetBounds;
}
/** Route facts for the current layout: its length and where on it the toe catches. */
interface Walk {
  readonly total: number;
  readonly trip: number;
  readonly tripAt: number;
  readonly wTrip: number;
}
interface Placement {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
}
interface Stream {
  readonly strip: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  readonly head: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  readonly x: number;
  readonly width: number;
  readonly delay: number;
  readonly length: number;
  readonly reach: number;
  readonly cream: boolean;
  readonly drops: readonly THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[];
}
interface Speck {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  readonly angle: number;
  readonly distance: number;
  readonly size: number;
}
interface Strand {
  readonly card: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  readonly tin: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  readonly local: THREE.Vector3;
  readonly snap: number;
}

const wet = (color: number, opacity = 1) => glow(color, opacity);
/** A damped wobble that starts at `at`. */
const ring = (ms: number, at: number, amount: number, period: number, decay: number) =>
  ms < at ? 0 : amount * Math.exp(-(ms - at) / decay) * Math.sin((ms - at) / period);

export class PiechefTrick implements CharacterRoutine {
  readonly object = new THREE.Group();
  readonly plan: PiechefPlan;
  readonly duration: number;
  private readonly model: PiechefModel;
  private readonly routeLengths = new Float32Array(SEGMENTS + 1);
  private readonly splatEdge: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
  private readonly splat: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
  private readonly sheen: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
  private readonly smear: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
  private readonly creams: Speck[] = [];
  private readonly crust: Speck[] = [];
  private readonly crustArcs: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly flecks: Speck[] = [];
  private readonly crumbs: Speck[] = [];
  private readonly streams: Stream[] = [];
  private readonly strands: Strand[] = [];
  private readonly puddle = part(
    this.object,
    'piechef-puddle',
    new THREE.CircleGeometry(1, 24),
    wet(FILLING_DARK, 0.85),
  );
  private readonly creamPuddle = part(
    this.object,
    'piechef-cream-puddle',
    new THREE.CircleGeometry(1, 18),
    wet(CREAM, 0.9),
  );
  private readonly scratch = new THREE.Vector3();
  private readonly turn = new THREE.Quaternion();

  constructor(actor: THREE.Group) {
    this.model = piechefModel(actor);
    this.plan = this.model.plan;
    this.duration = PIECHEF_DURATION * this.plan.pace;
    this.object.name = 'piechef-pie-mess';
    const p = this.plan;
    const r = seededRandom(`${p.phase}:piechef-mess`);
    this.splatEdge = part(
      this.object,
      'piechef-splat-edge',
      new THREE.ShapeGeometry(blobShape(p.phase + 0.7, 5, 0.09)),
      wet(FILLING_DARK),
    );
    this.splat = part(
      this.object,
      'piechef-splat',
      new THREE.ShapeGeometry(blobShape(p.phase, 5, 0.08)),
      wet(FILLING),
    );
    this.sheen = part(
      this.object,
      'piechef-sheen',
      new THREE.ShapeGeometry(blobShape(p.phase * 2, 3, 0.1)),
      wet(0xf3b178, 0.6),
    );
    this.smear = part(
      this.object,
      'piechef-smear',
      new THREE.ShapeGeometry(blobShape(p.phase + 2, 4, 0.15)),
      wet(0xd2702a, 0.8),
    );
    const speck = (
      name: string,
      color: number,
      angle: number,
      distance: number,
      size: number,
      lobes = 3,
      rough = 0.14,
    ): Speck => ({
      mesh: part(
        this.object,
        name,
        new THREE.ShapeGeometry(blobShape(angle * 3, lobes, rough)),
        wet(color),
      ),
      angle,
      distance,
      size,
    });
    // The whipped-cream crown lands in the middle of the filling, with a couple of smaller dabs.
    for (let i = 0; i < 3; i++)
      this.creams.push(
        speck(
          `piechef-cream-${i}`,
          CREAM,
          r() * Math.PI * 2,
          i ? 0.42 + r() * 0.15 : r() * 0.1,
          i ? 0.16 + r() * 0.06 : 0.4 + r() * 0.08,
          5,
          0.12,
        ),
      );
    // Broken arcs of crust stay stuck around the rim of the splat.
    for (let i = 0; i < 2; i++) {
      const start = p.phase + i * Math.PI + r() * 0.8;
      this.crustArcs.push(
        part(
          this.object,
          `piechef-crust-arc-${i}`,
          new THREE.RingGeometry(0.84, 1, 20, 1, start, 1.3 + r() * 0.8),
          wet(CRUST),
        ),
      );
    }
    for (let i = 0; i < 3; i++)
      this.crust.push(
        speck(
          `piechef-crust-${i}`,
          CRUST,
          p.phase + 2.2 + i * 2.1 + r() * 0.5,
          0.93 + r() * 0.08,
          0.1 + r() * 0.04,
          3,
          0.2,
        ),
      );
    // Flecks fly sideways and down from the impact, so the value above stays clear.
    for (let i = 0; i < 6; i++)
      this.flecks.push(
        speck(
          `piechef-fleck-${i}`,
          i % 3 ? FILLING : CREAM,
          -0.3 + r() * (Math.PI + 0.6),
          4 + r() * 8,
          0.7 + r() * 0.6,
          3,
          0.06,
        ),
      );
    for (let i = 0; i < 4; i++)
      this.crumbs.push(
        speck(
          `piechef-crumb-${i}`,
          CRUST,
          0.4 + r() * (Math.PI - 0.8),
          (r() * 2 - 1) * 18,
          1 + r() * 0.6,
        ),
      );
    // Stream positions across the splat, shuffled so filling and cream run in a different order each time.
    const slots = [-0.62, -0.3, 0.02, 0.34, 0.6];
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1)),
        a = slots[i],
        b = slots[j];
      if (a !== undefined && b !== undefined) {
        slots[i] = b;
        slots[j] = a;
      }
    }
    for (let i = 0; i < 5; i++) {
      const cream = i >= 3;
      const strip = part(
        this.object,
        `piechef-runoff-${i}`,
        stripGeometry(14),
        wet(cream ? CREAM : i % 2 ? FILLING_DARK : FILLING),
      );
      const head = part(
        this.object,
        `piechef-runoff-head-${i}`,
        new THREE.CircleGeometry(1, 14),
        wet(cream ? CREAM : FILLING),
      );
      const dropCount = cream ? (i === 3 ? 1 : 0) : 2;
      const drops = Array.from({ length: dropCount }, (_, j) =>
        part(
          this.object,
          `piechef-drop-${i}-${j}`,
          new THREE.CircleGeometry(1, 12),
          wet(cream ? CREAM : FILLING),
        ),
      );
      this.streams.push({
        strip,
        head,
        x: slots[i] ?? 0,
        width: cream ? 2.4 + r() * 0.5 : 1.3 + r() * 0.9,
        delay: 120 + i * 110 + r() * 60,
        length: (cream ? 1.45 : 0.85) + r() * 0.3,
        reach: cream && i === 4 ? 0.55 + r() * 0.2 : 1,
        cream,
        drops,
      });
    }
    for (let j = 0; j < 3; j++) {
      const a = (j / 3) * Math.PI * 2 + r();
      this.strands.push({
        card: part(this.object, `piechef-strand-card-${j}`, stripGeometry(8), wet(FILLING)),
        tin: part(this.object, `piechef-strand-tin-${j}`, stripGeometry(8), wet(FILLING)),
        local: new THREE.Vector3(
          Math.cos(a) * PIE_RADIUS * (0.3 + 0.3 * r()),
          PIE_FACE,
          Math.sin(a) * PIE_RADIUS * (0.3 + 0.3 * r()),
        ),
        snap: 0.45 + j * 0.2 + r() * 0.08,
      });
    }
  }

  cardAnimation(facing: number) {
    return piechefFrames(this.plan, facing);
  }

  /** Unanimated card point the filling face is planted on, for the current layout. */
  contactPoint(b: TargetBounds, facing: number): Point {
    return piechefContact(this.plan, b, sideOf(facing));
  }

  private stage(b: TargetBounds, view: Point, side: Side): Stage {
    return {
      side,
      scale: piechefScale(b),
      fit: cardFit(b),
      floor: piechefFloor(b),
      stand: piechefLandingPoint(this.plan, b, view, side),
      contact: piechefContact(this.plan, b, side),
      b,
    };
  }

  /** Where the straight run-up to the card begins, so the trip always happens heading at the card. */
  private runUp(s: Stage, view: Point, from: Point): Point {
    // Long routes trip a little further out, so the run-up always contains the whole stumble.
    const run = Math.max(
      (this.plan.tripDist + 26) * s.scale,
      0.16 * Math.hypot(s.stand.x - from.x, s.stand.y - from.y) + 26 * s.scale,
    );
    return { x: Math.max(16, Math.min(view.x - 16, s.stand.x - s.side * run)), y: s.stand.y };
  }
  private curveAt(u: number, from: Point, s: Stage, view: Point): Point {
    return sideRoute(from, this.runUp(s, view, from), s.b, view, s.side, this.plan.bend, u);
  }
  /** Measures the curve to the run-up, plus the straight run-up itself. */
  private measure(from: Point, s: Stage, view: Point): number {
    let previous = this.curveAt(0, from, s, view);
    this.routeLengths[0] = 0;
    for (let i = 1; i <= SEGMENTS; i++) {
      const at = this.curveAt(i / SEGMENTS, from, s, view);
      this.routeLengths[i] =
        (this.routeLengths[i - 1] ?? 0) + Math.hypot(at.x - previous.x, at.y - previous.y);
      previous = at;
    }
    const run = this.runUp(s, view, from);
    return (this.routeLengths[SEGMENTS] ?? 0) + Math.hypot(s.stand.x - run.x, s.stand.y - run.y);
  }
  /** Point at a distance along the measured route, so speed follows the authored profile exactly. */
  private routeAt(distance: number, from: Point, s: Stage, view: Point): Point {
    const curve = this.routeLengths[SEGMENTS] ?? 0;
    if (distance >= curve) {
      const run = this.runUp(s, view, from),
        straight = Math.hypot(s.stand.x - run.x, s.stand.y - run.y);
      const k = straight > 0 ? clamp((distance - curve) / straight) : 1;
      return { x: mix(run.x, s.stand.x, k), y: mix(run.y, s.stand.y, k) };
    }
    for (let i = 0; i < SEGMENTS; i++) {
      const a = this.routeLengths[i] ?? 0,
        b = this.routeLengths[i + 1] ?? 0;
      if (distance <= b)
        return this.curveAt(
          (i + (b > a ? clamp((distance - a) / (b - a)) : 0)) / SEGMENTS,
          from,
          s,
          view,
        );
    }
    return this.curveAt(1, from, s, view);
  }

  /**
   * Facing along the route, averaged over the neighbouring stretch so tight hooks (where the curve
   * swings round into the run-up) become a brisk turn instead of a snap.
   */
  private heading(
    d: number,
    length: number,
    from: Point,
    s: Stage,
    view: Point,
    fallback: number,
  ): number {
    let sum = 0,
      count = 0;
    for (let i = -4; i <= 4; i++) {
      const at = Math.max(0, Math.min(length, d + i * 10 * s.scale));
      const ahead = this.routeAt(Math.min(length, at + 3), from, s, view),
        behind = this.routeAt(Math.max(0, at - 3), from, s, view);
      const dx = ahead.x - behind.x,
        l = Math.hypot(dx, ahead.y - behind.y);
      if (l < 0.5) continue;
      sum += -Math.acos(Math.max(-1, Math.min(1, dx / l)));
      count++;
    }
    return count ? sum / count : fallback;
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
    const s = this.stage(b, view, side);
    this.object.visible = ms < PIECHEF_DURATION;
    this.object.position.set(0, 0, 0);
    const from = { x: start.x, y: start.y + LIFT * s.scale };
    const length = this.measure(from, s, view);
    const total = length / s.scale;
    const trip = piechefTripT(p, total);
    const w: Walk = {
      total,
      trip,
      tripAt: trip * p.travel,
      wTrip: piechefProgress(p, trip, trip) * total,
    };
    const contactYaw = side > 0 ? 0 : -Math.PI;
    let at: Point = s.stand,
      yaw = contactYaw,
      walked = total,
      exited = 0;
    if (ms < p.travel) {
      const t = ms / p.travel,
        d = piechefProgress(p, t, trip) * length;
      at = this.routeAt(d, from, s, view);
      walked = d / s.scale;
      yaw = mix(
        this.heading(d, length, from, s, view, contactYaw),
        contactYaw,
        ease((t - 0.86) / 0.14),
      );
    } else if (ms >= p.departure) {
      const exit = piechefExitPoint(p, b, view, side),
        e = piechefExitProgress(p, ms);
      at = { x: mix(s.stand.x, exit.x, e), y: mix(s.stand.y, exit.y, e) };
      exited = (Math.hypot(exit.x - s.stand.x, exit.y - s.stand.y) * e) / s.scale;
      yaw = mix(contactYaw, side > 0 ? -Math.PI : 0, ease((ms - p.departure) / 320));
    }
    actor.visible = ms < PIECHEF_DURATION;
    actor.position.set(at.x, -at.y, DEPTH);
    actor.rotation.set(0, yaw, 0);
    actor.scale.setScalar(s.scale);
    const pose = this.pose(ms, walked, w, exited, yaw);
    piechefPose(actor, pose);
    actor.updateMatrixWorld(true);
    const q = piechefCardPose(p, ms, side);
    this.placePie(actor, ms, s, q, yaw, w, walked);
    actor.updateMatrixWorld(true);
    this.placeArms(ms, s, q, exited);
    actor.updateMatrixWorld(true);
    this.updateSplat(ms, s, q);
    this.updateRunoff(ms, s, q);
    this.updateStrands(ms, s, q);
  }

  /** Gait phase so the tripping foot is just lifting off when its toe catches. */
  private gaitBase(wTrip: number) {
    return 0.55 - wTrip / STRIDE - this.plan.tripFoot * 0.5;
  }
  private walkFoot(i: number, distance: number, wTrip: number): PiechefFoot {
    const g = gait(distance, STRIDE, this.gaitBase(wTrip) + i * 0.5, 2.6 + 0.8 * this.plan.bounce);
    return {
      x: PIECHEF_HIP_X + g.x + (i ? -0.6 : 0.6),
      lift: g.y,
      tilt: -0.25 * Math.sin(Math.PI * g.swing),
    };
  }

  /** Feet: a planted walk, then the caught toe drags while the other foot stumbles to catch the fall. */
  private feet(
    ms: number,
    walked: number,
    w: Walk,
    exited: number,
  ): { feet: [PiechefFoot, PiechefFoot]; hop: number } {
    const p = this.plan,
      { total, wTrip } = w;
    if (ms < w.tripAt)
      return { feet: [this.walkFoot(0, walked, wTrip), this.walkFoot(1, walked, wTrip)], hop: 0 };
    const trip = p.tripFoot,
      support = 1 - trip;
    const dT = Math.max(0, walked - wTrip),
      stumbled = Math.max(1, total - wTrip);
    const caught = this.walkFoot(trip, wTrip, wTrip);
    const hop = p.stumble === 'hop';
    const settle = ease((ms - p.travel) / 140);
    const snag = ease(dT / 1.2);
    let tripFoot: PiechefFoot = {
      x: Math.max(caught.x - dT, hop ? -6 : -8.5),
      lift: hop ? 4.5 * ease(dT / 3) * (1 - settle) : caught.lift * (1 - snag),
      tilt: mix(caught.tilt, -0.45, snag),
    };
    // The support foot catches the fall in one or two lunging strides, or a few hops.
    const planted = this.walkFoot(support, wTrip, wTrip);
    const p0 = wTrip + planted.x,
      pEnd = total + 4.5;
    const n = hop
      ? Math.max(2, Math.round((pEnd - p0) / 14))
      : Math.max(1, Math.round((pEnd - p0) / 22));
    const f = clamp(dT / stumbled) * n,
      k = Math.floor(f),
      step = k >= n ? 1 : clamp((f - k) / 0.72);
    const pos = p0 + ((pEnd - p0) * Math.min(n, k + ease(step))) / n;
    const air = k >= n ? 0 : Math.sin(Math.PI * step);
    let supportFoot: PiechefFoot = {
      x: pos - walked,
      lift: air * (hop ? 1.8 : p.stumble === 'stagger' ? 3.4 : 4.2),
      tilt: -0.2 * air,
    };
    const bounce = hop ? air * 2.6 : 0;
    // After the tin comes free he draws the dragged foot back in, then shuffles the lunging one.
    const back = span(ms, p.peelEnd + 60, 300),
      shuffle = span(ms, p.peelEnd + 380, 280);
    tripFoot = {
      x: mix(tripFoot.x, -1.2, ease(back)),
      lift: tripFoot.lift + Math.sin(Math.PI * back) * 3,
      tilt: mix(tripFoot.tilt, 0, ease(back)),
    };
    supportFoot = {
      x: mix(supportFoot.x, 2.4, ease(shuffle)),
      lift: supportFoot.lift + Math.sin(Math.PI * shuffle) * 2,
      tilt: supportFoot.tilt,
    };
    const stance: [PiechefFoot, PiechefFoot] =
      trip === 0 ? [tripFoot, supportFoot] : [supportFoot, tripFoot];
    if (ms < p.departure) return { feet: stance, hop: bounce };
    // A shuffling turn on the spot, then the exit gait from where the feet stand.
    const tiptoe = p.exit === 'tiptoe';
    const stride = EXIT_STRIDE[p.exit],
      lift = tiptoe ? 5 : 3.6,
      toe = tiptoe ? -0.55 : 0;
    const turn = span(ms, p.departure, 320);
    const feet = stance.map((foot, i): PiechefFoot => {
      const g = gait(exited, stride, i * 0.5, lift);
      const walk = {
        x: PIECHEF_HIP_X + g.x,
        lift: g.y,
        tilt: toe - (tiptoe ? 0.1 : 0.25) * Math.sin(Math.PI * g.swing),
      };
      const own = clamp(turn * 2 - i);
      return {
        x: mix(foot.x, walk.x, ease(own)),
        lift: mix(foot.lift, walk.lift, ease(turn)) + Math.sin(Math.PI * own) * 2,
        tilt: mix(foot.tilt, walk.tilt, ease(turn)),
      };
    });
    return { feet: [feet[0] ?? stance[0], feet[1] ?? stance[1]], hop: 0 };
  }

  private pose(ms: number, walked: number, w: Walk, exited: number, yaw: number): PiechefPose {
    const p = this.plan;
    const t = ms / p.travel;
    const beat = ms < p.travel ? pulse(t, p.beatAt, 0.16) : 0;
    const moving = ms < p.travel ? 1 : ms > p.departure + 220 && ms < p.exitEnd ? 1 : 0;
    const stepPhase =
      ms < p.departure ? walked / STRIDE + this.gaitBase(w.wTrip) : exited / EXIT_STRIDE[p.exit];
    const bob = 0.5 + 0.5 * Math.cos(stepPhase * Math.PI * 4);
    const pressLean = 0.14 + 0.08 * p.severity;
    let hip = PIECHEF_HIP - 0.8 + (ms < p.travel ? 0.8 * p.bounce * bob : 0),
      lean = 0.07 + 0.03 * p.bounce,
      twist = 0,
      roll = 0,
      headTurn = 0,
      headTilt = 0,
      eyes = 1,
      brows = 0,
      mouth = 0,
      shrug = 0;
    if (p.beat === 'teeter') {
      lean -= 0.24 * beat;
      roll = 0.12 * beat * Math.sin(ms / 95 + p.phase);
      eyes += 0.35 * beat;
      brows = beat;
      mouth = 0.6 * beat;
    } else {
      headTilt = -0.25 * beat;
      eyes -= 0.85 * beat;
      mouth = 0.2 * beat;
    }
    if (ms >= w.tripAt) {
      const k = span(ms, w.tripAt, p.splat - w.tripAt);
      // Pitched forward by the caught toe, then braced over the pie as it lands.
      lean = mix(lean, pressLean, ease(k)) + 0.42 * p.severity * pulse(k, 0, 0.9);
      headTilt = -0.3 * pulse(k, 0.1, 0.8);
      eyes = 1.35;
      mouth = 1;
      brows = 1;
      if (p.stumble === 'stagger') {
        twist = 0.2 * Math.sin(Math.PI * 3 * k) * (1 - k) * p.severity;
        roll = 0.14 * Math.sin(Math.PI * 2 * k) * (1 - k);
      }
      if (p.stumble === 'lurch') hip -= 1.6 * pulse(k, 0.1, 0.8) * p.severity;
    }
    if (ms >= p.splat) {
      // Squeezed eyes on impact, then a pull back on the sticky tin.
      const opened = ease((ms - p.splat - p.hold * 0.65) / 120);
      hip = PIECHEF_HIP - 0.8 - 1.2 * (1 - ease((ms - p.peel) / 300));
      // He follows through as the card gives under the pie.
      lean = pressLean + 0.12 * pulse(ms, p.splat, 260) * p.strength;
      eyes = mix(0.08, 1.1, opened);
      mouth = 0.3;
      brows = 0.8;
      headTilt = -0.2 * (1 - opened) - 0.05;
      if (ms >= p.peel) {
        const peel = piechefPeel(p, ms);
        lean = mix(pressLean, -0.06, ease(span(ms, p.peel, p.peelTime)));
        brows = 0.6;
        mouth = 0.4 + 0.4 * peel;
        headTilt = 0.1 - 0.2 * pulse(peel, 0.6, 0.4);
      }
    }
    if (ms >= p.peelEnd) {
      const look = ease((ms - p.peelEnd) / 320);
      lean = mix(-0.06, 0.04, look);
      headTilt = mix(-0.1, 0.3, look);
      brows = 1;
      mouth = 0.2;
      eyes = 0.9;
    }
    if (ms >= p.release) {
      const r = span(ms, p.release, p.recover - p.release);
      if (p.tinEnd === 'drop') {
        eyes = 1.3 - 0.3 * r;
        mouth = 0.9 * (1 - r);
        headTilt = mix(-0.15, 0.35, ease(r * 1.6));
      } else {
        headTilt = mix(0.3, 0, ease(r));
        mouth = 0.1;
      }
      lean = 0.05;
    }
    if (ms >= p.recover) {
      const g = span(ms, p.recover, p.recoverEnd - p.recover);
      const toward = (-Math.PI / 2 - yaw) * 0.7;
      if (p.recovery === 'wipe') {
        lean = mix(0.05, 0.28, pulse(g, 0, 1));
        headTilt = 0.12 * pulse(g, 0, 1);
        brows = mix(0.5, 1, ease((g - 0.75) / 0.25));
        mouth = 0.3 * ease((g - 0.75) / 0.25);
      } else if (p.recovery === 'toque') {
        headTilt = -0.12 * pulse(g, 0.05, 0.6) + 0.15 * pulse(g, 0.7, 0.3);
        brows = 0.3;
        mouth = 0;
      } else {
        const up = pulse(g, 0.05, 0.9);
        shrug = 1.8 * up;
        headTurn = toward * up;
        headTilt = 0.15 * up;
        brows = up;
        mouth = 0.15 * up;
      }
      eyes = 1;
    }
    if (ms >= p.departure) {
      const e = span(ms, p.departure + 220, p.exitEnd - p.departure - 220);
      const set = ease((ms - p.departure) / 320);
      if (p.exit === 'hurry') {
        lean = mix(0.05, 0.22, set);
        hip = PIECHEF_HIP - 0.8 + 0.9 * bob * set;
        // A guilty glance back at the card, over the camera-side shoulder.
        headTurn = (-Math.PI / 2 - yaw) * 1.25 * pulse(e, 0.25, 0.4);
        eyes = 1.2;
      } else {
        lean = mix(0.05, 0.18, set);
        hip = PIECHEF_HIP - 0.8 - 1.6 * set + 0.5 * bob * set;
        // A sheepish look at the viewer while creeping off.
        headTurn = (-Math.PI / 2 - yaw) * 0.8 * pulse(e, 0.05, 0.5);
        eyes = 1 + 0.25 * Math.sin(ms / 120) * set;
      }
      headTilt = 0;
      brows = 0.6;
      mouth = 0.1;
      shrug = 0;
    }
    // Periodic blinks keep the eyes alive whenever they are not acting.
    const cycle = (ms + p.phase * 500) % 2900;
    if (cycle > 2760) eyes *= 1 - 0.9 * pulse(cycle, 2760, 140);
    const { feet, hop } = this.feet(ms, walked, w, exited);
    // The toque flops with the trip and the splat, sits askew, and only a deliberate hand sets it right.
    const fixed = p.recovery === 'toque' ? ease((ms - p.recover - 320) / 330) : 0;
    const askew = p.askew * ease((ms - p.splat) / 200) * (1 - fixed);
    const toqueTilt =
      askew +
      ring(ms, w.tripAt, 0.25, 60, 160) +
      ring(ms, p.splat, -0.5, 55, 200) +
      ring(ms, p.peelEnd, 0.22, 50, 160) +
      ring(ms, p.departure, 0.18, 60, 180) -
      0.06 * p.bounce * Math.sin(stepPhase * Math.PI * 4 - 1.1) * moving;
    const swing = Math.sin(stepPhase * Math.PI * 2) * moving;
    return {
      hip: hip + hop,
      lean,
      twist,
      roll,
      feet,
      headTurn,
      headTilt,
      eyes,
      brows,
      mouth,
      toqueTilt,
      toqueSlip: 2.4 * ease((ms - p.splat) / 120) * (1 - fixed),
      apron:
        0.1 * swing +
        ring(ms, p.travel, 0.45 * p.severity, 65, 220) +
        ring(ms, p.splat, 0.2, 55, 160) +
        ring(ms, p.peelEnd, -0.18, 60, 160) +
        ring(ms, p.departure + 220, -0.25, 60, 200),
      bow: 0.35 * Math.sin(ms / 70) * moving + ring(ms, p.travel, -0.5, 60, 200),
      shrug,
      splatted: ms >= p.splat,
    };
  }

  /** Root-space point while the chef stands at the card, in world space. */
  private atStand(s: Stage, v: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(
      s.stand.x + s.side * v.x * s.scale,
      -s.stand.y + v.y * s.scale,
      DEPTH + s.side * v.z * s.scale,
    );
  }
  private pressed(s: Stage, q: CardPose): Placement {
    const at = cardPoint(q, s.contact, s.b);
    return {
      position: new THREE.Vector3(at.x, -at.y, FACE_Z + PIE_FACE * s.scale),
      quaternion: new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(0, 0, 1), cardTurn(q))
        .multiply(
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
        ),
    };
  }
  /** The tin is peeled from the bottom up, hinging about its top rim, which stays stuck to the live card. */
  private peeled(ms: number, s: Stage, q: CardPose): Placement {
    const flat = this.pressed(s, q);
    const rim = (PIE_RADIUS + 0.55) * s.scale;
    const hinge = cardPoint(q, { x: s.contact.x, y: s.contact.y - rim }, s.b);
    const turn = cardTurn(q);
    const axis = new THREE.Vector3(Math.cos(turn), Math.sin(turn), 0);
    const spin = new THREE.Quaternion().setFromAxisAngle(axis, -1.2 * piechefPeel(this.plan, ms));
    const offset = new THREE.Vector3(
      flat.position.x - hinge.x,
      flat.position.y + hinge.y,
      flat.position.z - FACE_Z,
    ).applyQuaternion(spin);
    return {
      position: new THREE.Vector3(hinge.x, -hinge.y, FACE_Z).add(offset),
      quaternion: spin.multiply(flat.quaternion),
    };
  }
  /** Held up in front of the chef so he can peer at what is left in the tin. */
  private looking(s: Stage): Placement {
    const normal = new THREE.Vector3(-s.side * 0.55, 0.35, 0.75).normalize();
    return {
      position: this.atStand(s, LOOK),
      quaternion: new THREE.Quaternion().setFromUnitVectors(UP, normal),
    };
  }
  private inspected(ms: number, s: Stage): Placement {
    const p = this.plan;
    const free = this.peeled(p.peelEnd, s, piechefCardPose(p, p.peelEnd, s.side)),
      look = this.looking(s);
    const k = ease((ms - p.peelEnd) / 320);
    const position = free.position.clone().lerp(look.position, k);
    position.y += Math.sin(Math.PI * k) * 6 * s.scale;
    position.x += Math.sin(ms / 70) * 0.4 * s.scale * k;
    return { position, quaternion: free.quaternion.clone().slerp(look.quaternion, k) };
  }

  private setPie(actor: THREE.Group, world: Placement) {
    const pie = this.model.pie;
    pie.position.copy(actor.worldToLocal(world.position.clone()));
    pie.quaternion.copy(actor.getWorldQuaternion(this.turn).invert().multiply(world.quaternion));
    pie.updateMatrixWorld(true);
  }

  private placePie(
    actor: THREE.Group,
    ms: number,
    s: Stage,
    q: CardPose,
    yaw: number,
    w: Walk,
    walked: number,
  ) {
    const p = this.plan,
      m = this.model;
    let rimAngles: readonly [number, number] = [
      rimAzimuth(0, yaw, s.side),
      rimAzimuth(1, yaw, s.side),
    ];
    let fade = 1;
    if (ms < p.splat) {
      const beat = ms < p.travel ? pulse(ms / p.travel, p.beatAt, 0.16) : 0;
      const local = CARRY.clone();
      let tilt = 0.3,
        wobble = 0;
      if (p.beat === 'sniff') {
        local.lerp(new THREE.Vector3(11.5, 22, 0), beat);
        tilt += 0.25 * beat;
      } else {
        // The pie teeters dangerously and he chases its balance with his whole body.
        wobble = 0.75 * beat * Math.sin(ms / 95 + p.phase);
        local.x += 3.5 * beat * Math.sin(ms / 130 + p.phase);
      }
      // A little jiggle with every step while it is carried.
      local.y +=
        0.4 * Math.sin(((walked - w.wTrip) / STRIDE) * Math.PI * 4) * (ms < w.tripAt ? 1 : 0);
      const carry = m.body.localToWorld(local);
      const carried = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, wobble));
      // The trip flings the pie forward and over, face first into the card.
      const thrust = span(ms, w.tripAt + 60, p.splat - w.tripAt - 60);
      const press = this.pressed(s, q);
      const position = carry.lerp(press.position, thrust * thrust);
      position.y += Math.sin(Math.PI * thrust) * 9 * s.scale;
      // It tips back toward the chef as he pitches forward, then goes over face first.
      const tip = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        s.side * 0.7 * Math.sin(Math.PI * thrust),
      );
      this.setPie(actor, {
        position,
        quaternion: carried.slerp(press.quaternion, ease(thrust)).premultiply(tip),
      });
    } else if (ms < p.peel) {
      this.setPie(actor, this.pressed(s, q));
    } else if (ms < p.peelEnd) {
      this.setPie(actor, this.peeled(ms, s, q));
    } else if (ms < p.release) {
      this.setPie(actor, this.inspected(ms, s));
    } else if (p.tinEnd === 'tuck') {
      // Tucked under the far arm, peeking out behind his back, so the near mitt is free to act.
      const tuckArm = s.side > 0 ? 1 : 0,
        z = tuckArm === 0 ? 1 : -1;
      const tucked = {
        position: m.body.localToWorld(new THREE.Vector3(-4.5, 9, z * 10.8)),
        quaternion: m.body
          .getWorldQuaternion(new THREE.Quaternion())
          .multiply(new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(0, 0, -z))),
      };
      const from = this.inspected(p.release, s);
      const k = ease((ms - p.release) / 350);
      this.setPie(actor, {
        position: from.position.lerp(tucked.position, k),
        quaternion: from.quaternion.slerp(tucked.quaternion, k),
      });
      const under = Math.atan2(-0.85 * z, 0.5);
      rimAngles =
        tuckArm === 0
          ? [turnToward(rimAngles[0], under, k), rimAngles[1]]
          : [rimAngles[0], turnToward(rimAngles[1], under, k)];
    } else {
      this.dropTin(actor, ms, s);
      fade = 1 - ease((ms - p.exitEnd) / 450);
    }
    m.rims.forEach((rim, i) => rimPoint(rimAngles[i] ?? 0, rim.position));
    m.pie.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
        mat.transparent = fade < 1;
        mat.opacity = fade;
      }
    });
    m.pie.updateMatrixWorld(true);
  }

  /** The tin slips from the mitts, tumbles over and clatters to rest upside down on the floor. */
  private dropTin(actor: THREE.Group, ms: number, s: Stage) {
    const p = this.plan;
    const from = this.inspected(p.release, s);
    const g = 900 * s.fit,
      vx = s.side * 26 * s.fit,
      vy = 40 * s.fit;
    const height = Math.max(1, s.floor + from.position.y);
    const fall = (vy + Math.sqrt(vy * vy + 2 * g * height)) / g;
    const t = Math.max(0, ms - p.release) / 1000,
      flying = Math.min(t, fall);
    const rest = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(0, -1, 0));
    rest.premultiply(new THREE.Quaternion().setFromAxisAngle(UP, p.phase));
    const rock =
      0.3 * Math.exp(-Math.max(0, t - fall) / 0.2) * Math.sin(Math.max(0, t - fall) / 0.045);
    const quaternion = from.quaternion.clone().slerp(rest, ease(t / fall));
    quaternion.premultiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rock),
    );
    const position = new THREE.Vector3(
      from.position.x + vx * flying,
      from.position.y + vy * flying - 0.5 * g * flying * flying,
      DEPTH + 6 * s.scale,
    );
    this.setPie(actor, { position, quaternion });
    // Rest on the tin's real lowest vertex rather than its nominal centre.
    const lowest = lowestWorldY(this.model.pie);
    if (lowest < -s.floor || t >= fall) {
      position.y += -s.floor - lowest;
      this.setPie(actor, { position, quaternion });
    }
  }

  /**
   * Converts a world point into a limb's planar target, relative to its root: the point in the limb's
   * plane that appears at the same screen position, so mitts stay on the rim while the chef turns.
   */
  private armTarget(limb: Limb, world: THREE.Vector3): Point {
    const parent = limb.root.parent;
    if (!parent) return { x: 0, y: 0 };
    parent.updateWorldMatrix(true, false);
    this.scratch.copy(world);
    parent.worldToLocal(this.scratch);
    const projected = { x: this.scratch.x, y: this.scratch.y };
    const e = parent.matrixWorld.elements,
      z = limb.root.position.z;
    const det = (e[0] ?? 0) * (e[5] ?? 0) - (e[4] ?? 0) * (e[1] ?? 0);
    const size = parent.matrixWorld.getMaxScaleOnAxis() ** 2;
    const rx = world.x - (e[8] ?? 0) * z - (e[12] ?? 0),
      ry = world.y - (e[9] ?? 0) * z - (e[13] ?? 0);
    const trust = Math.abs(det) > 1e-6 ? clamp((Math.abs(det) / size - 0.15) / 0.25) : 0;
    const exact =
      trust > 0
        ? {
            x: ((e[5] ?? 0) * rx - (e[4] ?? 0) * ry) / det,
            y: ((e[0] ?? 0) * ry - (e[1] ?? 0) * rx) / det,
          }
        : projected;
    return {
      x: mix(projected.x, exact.x, trust) - limb.root.position.x,
      y: mix(projected.y, exact.y, trust) - limb.root.position.y,
    };
  }
  /** Puts the centre of the mitt, not the wrist, on the target. */
  private grip(limb: Limb, target: Point) {
    // Solve with the mitt as part of the forearm, then put the wrist that far short of the target.
    const [upper, lower] = limb.lengths,
      fore = lower + GRIP;
    const wanted = Math.hypot(target.x, target.y);
    const d = Math.min(upper + fore - 0.0001, Math.max(fore - upper + 0.0001, wanted));
    const a = wanted > 0.0001 ? Math.atan2(target.y, target.x) : -Math.PI / 2;
    const elbow =
      a -
      Math.acos(Math.max(-1, Math.min(1, (upper * upper + d * d - fore * fore) / (2 * upper * d))));
    const ex = Math.cos(elbow) * upper,
      ey = Math.sin(elbow) * upper;
    const k = lower / fore;
    reach(limb, ex + (Math.cos(a) * d - ex) * k, ey + (Math.sin(a) * d - ey) * k, -1);
  }

  private placeArms(ms: number, s: Stage, q: CardPose, exited: number) {
    const p = this.plan,
      m = this.model;
    const camera = s.side > 0 ? 0 : 1;
    const tuckArm = p.tinEnd === 'tuck' ? 1 - camera : -1;
    const look = this.looking(s);
    m.arms.forEach((arm, i) => {
      const held = m.rims[i];
      if (held && (ms < p.release || i === tuckArm)) {
        this.grip(arm, this.armTarget(arm, held.getWorldPosition(new THREE.Vector3())));
        return;
      }
      // Hands leave the rim where it was at the release, then act.
      const lookRim = rimPoint(rimAzimuth(i, s.side > 0 ? 0 : -Math.PI, s.side))
        .applyQuaternion(look.quaternion)
        .multiplyScalar(s.scale)
        .add(look.position);
      const left = this.armTarget(arm, lookRim);
      const free = this.freeHand(ms, arm, i, s, q, exited, camera);
      const k = ease((ms - p.release) / 200);
      this.grip(arm, { x: mix(left.x, free.x, k), y: mix(left.y, free.y, k) });
    });
  }

  /** Where a free mitt goes: a startled fling, the recovery gesture, then the exit carriage. */
  private freeHand(
    ms: number,
    arm: Limb,
    i: number,
    s: Stage,
    q: CardPose,
    exited: number,
    camera: number,
  ): Point {
    const p = this.plan;
    const hang = { x: 2.5 + (i ? -0.5 : 0.5), y: -19.5 };
    const hip = { x: 6.2, y: -12.6 };
    let target = p.tinEnd === 'drop' ? { x: 7 + i, y: 3 - i } : hang;
    // Startle settles to the hip before the gesture.
    target = mixPoint(target, hip, ease((ms - p.release - 220) / 200));
    const actor = camera;
    const g = span(ms, p.recover, p.recoverEnd - p.recover);
    if (ms >= p.recover && ms < p.departure) {
      if (p.recovery === 'wipe' && i === actor) {
        const rubbing = span(ms, p.recover + 250, p.recoverEnd - p.recover - 450);
        const along =
          s.side *
          s.b.width *
          (0.02 +
            0.07 * (1 - Math.cos(Math.PI * 5 * rubbing)) * (rubbing > 0 && rubbing < 1 ? 1 : 0));
        const at = cardPoint(
          q,
          { x: s.contact.x + along, y: s.contact.y + s.b.height * 0.015 * piechefRub(p, ms) },
          s.b,
        );
        const onCard = this.armTarget(arm, new THREE.Vector3(at.x, -at.y, FACE_Z));
        target = mixPoint(
          target,
          onCard,
          ease((ms - p.recover) / 250) * (1 - ease((ms - p.recoverEnd + 200) / 200)),
        );
      } else if (p.recovery === 'toque' && i === actor) {
        const brim = this.armTarget(arm, this.model.brim.getWorldPosition(new THREE.Vector3()));
        brim.y -= 1.2 * pulse(g, 0.7, 0.12) + 1.2 * pulse(g, 0.82, 0.12);
        target = mixPoint(
          target,
          brim,
          ease((ms - p.recover) / 300) * (1 - ease((ms - p.recoverEnd + 220) / 220)),
        );
      } else if (p.recovery === 'shrug') {
        target = mixPoint(target, { x: 9.5, y: -6.5 + (i ? -0.8 : 0) }, pulse(g, 0.05, 0.9));
      }
    }
    if (ms >= p.departure) {
      const k = ease((ms - p.departure) / 320);
      const stride = EXIT_STRIDE[p.exit];
      const phase = (exited / stride) * Math.PI * 2 + i * Math.PI;
      const carriage =
        p.exit === 'tiptoe'
          ? { x: 7.5, y: -6 + i * 1.2 + 0.6 * Math.sin(phase) }
          : { x: 3 + 6 * Math.sin(phase), y: -14 + 2 * Math.cos(phase) };
      target = mixPoint(target, carriage, k);
    }
    return target;
  }

  private specks(list: readonly Speck[], visible: boolean, fade: number) {
    for (const s of list) {
      s.mesh.visible = visible && fade > 0;
      s.mesh.material.opacity = fade;
    }
  }

  private updateSplat(ms: number, s: Stage, q: CardPose) {
    const p = this.plan;
    const fade = 1 - ease((ms - p.exitEnd) / 500);
    const live = ms >= p.splat && fade > 0;
    const grow = mix(0.55, 1, ease((ms - p.splat) / 140));
    const rx = 1.18 * PIE_RADIUS * s.scale * (0.92 + 0.12 * p.strength) * grow,
      ry = rx * 0.92;
    // The filling slowly sags under its own weight.
    const sag = 0.05 * s.b.height * ease((ms - p.splat - 400) / 3200);
    const centre = { x: s.contact.x, y: s.contact.y + sag * 0.5 };
    const turn = cardTurn(q);
    const place = (mesh: THREE.Mesh, raw: Point, z: number, sx: number, sy: number, spin = 0) => {
      const at = cardPoint(q, raw, s.b);
      mesh.position.set(at.x, -at.y, z);
      mesh.rotation.z = turn + spin;
      mesh.scale.set(Math.max(0.001, sx), Math.max(0.001, sy), 1);
    };
    for (const mesh of [this.splatEdge, this.splat]) {
      mesh.visible = live;
      mesh.material.opacity = 0.95 * fade;
    }
    place(this.splatEdge, centre, CARD_Z, rx * 1.07 * q.sx, (ry + sag) * 1.07 * q.sy, p.phase);
    place(this.splat, centre, CARD_Z + 0.1, rx * q.sx, (ry + sag) * q.sy, p.phase);
    this.sheen.visible = live && ms >= p.peel;
    this.sheen.material.opacity = 0.55 * fade;
    place(
      this.sheen,
      { x: centre.x - rx * 0.3, y: centre.y - ry * 0.35 },
      CARD_Z + 0.3,
      rx * 0.32,
      ry * 0.18,
      -0.3,
    );
    this.specks(this.creams, live, fade);
    for (const c of this.creams)
      place(
        c.mesh,
        {
          x: centre.x + Math.cos(c.angle) * c.distance * rx,
          y: centre.y + Math.sin(c.angle) * c.distance * ry + sag * 0.3,
        },
        CARD_Z + 0.25,
        c.size * rx,
        c.size * ry * 0.85,
        c.angle,
      );
    for (const arc of this.crustArcs) {
      arc.visible = live;
      arc.material.opacity = fade;
      place(arc, centre, CARD_Z + 0.2, rx * q.sx, (ry + sag) * q.sy, 0);
    }
    this.specks(this.crust, live, fade);
    for (const c of this.crust)
      place(
        c.mesh,
        {
          x: centre.x + Math.cos(c.angle) * c.distance * rx,
          y: centre.y + Math.sin(c.angle) * c.distance * (ry + sag),
        },
        CARD_Z + 0.35,
        c.size * rx,
        c.size * rx * 0.7,
        c.angle,
      );
    // Flecks burst out at the impact and stick where they land on the card.
    this.specks(this.flecks, live, fade);
    const burst = ease((ms - p.splat) / 120);
    for (const f of this.flecks) {
      const d = rx * 0.85 + f.distance * s.fit * burst;
      const slide = 3 * s.fit * ease((ms - p.splat - 300) / 2200);
      place(
        f.mesh,
        { x: centre.x + Math.cos(f.angle) * d, y: centre.y + Math.sin(f.angle) * d + slide },
        CARD_Z + 0.4,
        f.size * s.fit,
        f.size * s.fit * (1 + 0.5 * (1 - burst)),
        f.angle,
      );
    }
    // The awkward wipe drags a streak of filling toward the middle of the card, below the value.
    const rubbed =
      p.recovery === 'wipe' ? ease((ms - p.recover - 250) / (p.recoverEnd - p.recover - 450)) : 0;
    this.smear.visible = live && rubbed > 0;
    this.smear.material.opacity = 0.8 * fade;
    place(
      this.smear,
      { x: centre.x + s.side * s.b.width * 0.07 * rubbed, y: centre.y + ry * 0.1 },
      CARD_Z + 0.05,
      rx * 0.7 + s.b.width * 0.1 * rubbed,
      ry * 0.42,
      0,
    );
    // Crust crumbs break off as the tin pops free and fall to the floor.
    const popped = piechefCardPose(p, p.peelEnd, s.side);
    const age = Math.max(0, ms - p.peelEnd) / 1000;
    this.specks(this.crumbs, ms >= p.peelEnd && fade > 0, fade);
    for (const c of this.crumbs) {
      const born = cardPoint(
        popped,
        { x: centre.x + Math.cos(c.angle) * rx, y: centre.y + Math.sin(c.angle) * ry },
        s.b,
      );
      const g = 900 * s.fit,
        size = c.size * s.fit;
      const land = Math.sqrt((2 * Math.max(0, s.floor - size - born.y)) / g);
      const t = Math.min(age, land);
      const bounce =
        age > land
          ? Math.abs(Math.sin(Math.min(Math.PI, (age - land) * 14))) *
            2.5 *
            s.fit *
            Math.exp(-(age - land) * 6)
          : 0;
      c.mesh.position.set(
        born.x + c.distance * s.fit * t,
        -(born.y + 0.5 * g * t * t - bounce),
        CARD_Z + 1,
      );
      c.mesh.rotation.z = c.angle + age * 4 * (age < land ? 1 : 0);
      c.mesh.scale.set(size, size * 0.8, 1);
    }
  }

  /** Narrow streams run from the splat to the card's lower edge, drip off it, and pool on the floor. */
  private updateRunoff(ms: number, s: Stage, q: CardPose) {
    const p = this.plan;
    const fade = 1 - ease((ms - p.exitEnd) / 500);
    const rx = 1.18 * PIE_RADIUS * s.scale * (0.92 + 0.12 * p.strength);
    const bottom = s.b.top + s.b.height - 0.4;
    let landed = 0,
      creamLanded = 0,
      sumX = 0,
      count = 0;
    for (const stream of this.streams) {
      const born = p.splat + stream.delay,
        duration = p.runoff * stream.length;
      const x0 = s.contact.x + stream.x * rx,
        y0 = s.contact.y + rx * 0.5;
      const full = Math.max(1, bottom - y0);
      const t = Math.max(0, ms - born) / duration;
      const length = full * stream.reach * clamp(t * t);
      const width = stream.width * s.fit;
      const live = ms >= born && length > 0.3 && fade > 0;
      stream.strip.visible = stream.head.visible = live;
      stream.strip.material.opacity = stream.head.material.opacity = 0.92 * fade;
      const point = (k: number) =>
        cardPoint(
          q,
          { x: x0 + Math.sin(k * 5 + stream.x * 7) * 0.5 * s.fit * k, y: y0 + k * length },
          s.b,
        );
      if (live) {
        setStrip(
          stream.strip.geometry,
          14,
          (k, out) => {
            const at = point(k);
            out.set(at.x, -at.y, CARD_Z + 0.2);
          },
          (k) => width * (1 - 0.3 * k),
        );
        const tip = point(1);
        // The leading bead swells while it hangs at the card edge.
        const hanging =
          t >= 1 && stream.reach >= 1
            ? 1 + 0.3 * Math.abs(Math.sin((ms - born - duration) / 160))
            : 1;
        stream.head.position.set(tip.x, -tip.y, CARD_Z + 0.3);
        stream.head.scale.set(width * 0.8 * hanging, width * 0.95 * hanging, 1);
      }
      const edge = p.splat + stream.delay + duration;
      stream.drops.forEach((drop, j) => {
        const detach = edge + 180 + j * 480;
        const from = cardPoint(piechefCardPose(p, detach, s.side), { x: x0, y: bottom }, s.b);
        const g = 900 * s.fit;
        const fallTime = Math.sqrt((2 * Math.max(0, s.floor - from.y)) / g);
        const age = (ms - detach) / 1000;
        drop.visible = age >= 0 && age < fallTime && fade > 0;
        drop.position.set(from.x, -(from.y + 0.5 * g * Math.max(0, age) ** 2), CARD_Z + 1);
        drop.scale.set(width * 0.75, width * 1.25, 1);
        drop.material.opacity = fade;
        if (age >= fallTime) {
          const splash = ease((age - fallTime) / 0.25);
          if (stream.cream) creamLanded += splash;
          else landed += splash;
          sumX += from.x;
          count++;
        }
      });
    }
    const x = count ? sumX / count : s.contact.x;
    this.puddle.visible = landed > 0 && fade > 0;
    this.puddle.position.set(x, -s.floor, CARD_Z + 0.5);
    this.puddle.scale.set((2.5 + 2.6 * landed) * s.fit, (0.8 + 0.25 * landed) * s.fit, 1);
    this.puddle.material.opacity = 0.85 * fade;
    this.creamPuddle.visible = creamLanded > 0 && fade > 0;
    this.creamPuddle.position.set(x + 1.5 * s.fit, -s.floor + 0.3 * s.fit, CARD_Z + 0.6);
    this.creamPuddle.scale.set(2.6 * creamLanded * s.fit, 0.8 * creamLanded * s.fit, 1);
    this.creamPuddle.material.opacity = 0.9 * fade;
  }

  /** Gooey strings stretch from the tin to the card as it peels, thin out, snap and retract. */
  private updateStrands(ms: number, s: Stage, q: CardPose) {
    const p = this.plan;
    const peel = piechefPeel(p, ms);
    const active = ms >= p.peel && ms < p.peelEnd + 200;
    const popped = ease((ms - p.peelEnd) / 160);
    const tin = new THREE.Vector3();
    for (const strand of this.strands) {
      const raw = {
        x: s.contact.x + strand.local.x * s.scale,
        y: s.contact.y - strand.local.z * s.scale,
      };
      const card = cardPoint(q, raw, s.b);
      this.model.pie.localToWorld(tin.copy(strand.local));
      const snapped = peel >= strand.snap;
      const retract = Math.max(clamp((peel - strand.snap) / 0.15), popped);
      const width = (1.6 - 1.1 * clamp(peel / strand.snap)) * s.fit;
      strand.card.visible = active && retract < 1;
      strand.tin.visible = active && snapped && retract < 1;
      strand.card.material.opacity = strand.tin.material.opacity = 0.95;
      if (!strand.card.visible) continue;
      const dx = tin.x - card.x,
        dy = -tin.y - card.y;
      const reachOf = snapped ? 0.35 * (1 - retract) : 1;
      const sag = 3 * s.fit * clamp(peel / strand.snap);
      setStrip(
        strand.card.geometry,
        8,
        (k, out) =>
          out.set(
            card.x + dx * reachOf * k,
            -(card.y + dy * reachOf * k + Math.sin(Math.PI * k) * sag * (snapped ? 0.3 : 1)),
            FACE_Z + 0.5,
          ),
        (k) => width * (snapped ? 1 - 0.7 * k : 0.7 + 0.3 * Math.abs(1 - 2 * k)),
      );
      if (strand.tin.visible)
        setStrip(
          strand.tin.geometry,
          8,
          (k, out) =>
            out.set(
              tin.x - dx * reachOf * k,
              tin.y + dy * reachOf * k - k * 2 * s.fit,
              tin.z + 0.5,
            ),
          (k) => width * (1 - 0.7 * k),
        );
    }
  }
}
