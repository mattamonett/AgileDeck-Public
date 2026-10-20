import * as THREE from 'three';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardFit,
  clamp,
  ease,
  glow,
  keepInView,
  localTarget,
  lowestWorldY,
  matte,
  mix,
  mixPoint,
  onCard,
  outline,
  part,
  pulse,
  reach,
  screenOf,
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
  DEPTH_SQUASH,
  KICK_REACH,
  PAT_INTERVAL,
  SNOWMAN_DURATION,
  STEP_BACK,
  snowmanBallRadius,
  snowmanBeat,
  snowmanCardPose,
  snowmanCarrotOffset,
  snowmanFrames,
  snowmanFrost,
  snowmanLandingPoint,
  snowmanLead,
  snowmanPatContact,
  snowmanProgress,
  snowmanScale,
  type SnowmanPlan,
} from './snowman-choreography';
import {
  CARROT_LENGTH,
  MITTEN_GRIP,
  ROLL_CENTRE,
  SNOWMAN_ANKLE,
  SNOWMAN_STRIDE,
  buildCarrot,
  snowmanModel,
  snowmanPose,
  type SnowmanModel,
  type SnowmanPose,
  quadGeometry,
  flakeGeometry,
  starGeometry,
} from './snowman-model';

const DEPTH = 176;
const ROUTE = 64;
const SPIN_STEPS = 48;
/** Screen gravity for flying snow and the carrot, in px per ms². */
const GRAVITY = 0.0011;
const SNOW = 0xeef5fb,
  PEBBLE = 0x2a2c33;
const FROST_SEGMENTS = 64;

function mixAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Everything that depends on the live layout but not on the moment: recomputed every frame. */
interface Stage {
  readonly start: Point;
  readonly b: TargetBounds;
  readonly view: Point;
  readonly side: Side;
  readonly fit: number;
  readonly sc: number;
  readonly floor: number;
  /** Arrival stand, where the snowball rests against the card. */
  readonly stand: Point;
  /** Admiring stand, one step back. */
  readonly back: Point;
  readonly length: number;
  /** Floor point under the fallen carrot's centre. */
  readonly carrot: Point;
  readonly fetchDir: Side;
  /** Stand from which Flurry kicks the carrot up. */
  readonly kickStand: Point;
  readonly exitDir: Side;
  readonly exit: Point;
  /** Floor point under the finished snowball and the sculpture. */
  readonly base: Point;
}
interface BallState {
  readonly centre: Point;
  readonly rx: number;
  readonly ry: number;
}
interface Piece {
  readonly group: THREE.Group;
  readonly keys: readonly (readonly [number, number])[];
  readonly marker: THREE.Object3D | null;
}
interface Puff {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  readonly a: number;
  readonly b: number;
  readonly c: number;
}
interface Chunk {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly volume: number;
  readonly ox: number;
  readonly oy: number;
  readonly vx: number;
  readonly vy: number;
  readonly depth: number;
  readonly spin: THREE.Vector3;
}
interface FrostSegment {
  readonly a: readonly [number, number];
  readonly b: readonly [number, number];
  readonly birth: number;
  readonly length: number;
  readonly width: number;
}

/** Branching frost from the near edge and the bottom edge, in card units (u across from the near edge, v down). */
function frostPattern(seed: number): FrostSegment[] {
  const r = seededRandom(`${seed}:snowman-frost`);
  const H = 1.45;
  const segments: FrostSegment[] = [];
  // Near the edges only: the value in the centre of the card stays clear.
  const allowed = (x: number, y: number) =>
    x >= 0 && x <= 0.95 && y >= 0.03 * H && y <= H && (x <= 0.27 || y >= 0.66 * H);
  const grow = (
    x: number,
    y: number,
    angle: number,
    length: number,
    depth: number,
    birth: number,
  ) => {
    const parts = depth === 0 ? 3 : 2;
    let px = x,
      py = y,
      at = birth;
    for (let k = 0; k < parts && segments.length < FROST_SEGMENTS; k++) {
      const l = length / parts,
        a = angle + (r() - 0.5) * 0.35;
      const nx = px + Math.cos(a) * l,
        ny = py + Math.sin(a) * l;
      if (!allowed(nx, ny)) return;
      segments.push({
        a: [px, py / H],
        b: [nx, ny / H],
        birth: at,
        length: l,
        width: [1.3, 0.85, 0.6][depth] ?? 0.6,
      });
      at += l;
      if (depth < 2)
        for (const turn of [-1, 1])
          if (r() < 0.75 && segments.length < FROST_SEGMENTS)
            grow(
              nx,
              ny,
              a + turn * (0.95 + r() * 0.2),
              length * (0.42 + r() * 0.12),
              depth + 1,
              at,
            );
      px = nx;
      py = ny;
    }
  };
  for (let k = 0; k < 5; k++)
    grow(0, H * (0.1 + 0.19 * k + r() * 0.06), (r() - 0.5) * 0.9, 0.2 + r() * 0.07, 0, 0);
  for (let k = 0; k < 2; k++)
    grow(
      0.08 + k * 0.2 + r() * 0.12,
      H,
      -Math.PI / 2 + (r() - 0.5) * 0.8,
      0.18 + r() * 0.06,
      0,
      0.03,
    );
  return segments;
}

export class SnowmanTrick implements CharacterRoutine {
  readonly object = new THREE.Group();
  readonly plan: SnowmanPlan;
  readonly duration: number;
  private readonly model: SnowmanModel;
  private readonly actor: THREE.Group;
  private readonly ball = new THREE.Group();
  private readonly spin = new THREE.Group();
  private readonly sculpture = new THREE.Group();
  private readonly pieces: Piece[] = [];
  /** Sculpture volumes as [x, y, radius] in sculpture units: where the chunks come from. */
  private readonly volumes: (readonly [number, number, number])[] = [];
  private readonly flat: number;
  private readonly mound: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private readonly chunks: Chunk[] = [];
  private readonly spray: Puff[] = [];
  private readonly powder: Puff[] = [];
  private readonly patPuffs: Puff[] = [];
  private readonly flakes: Puff[] = [];
  private readonly frost: FrostSegment[];
  private readonly frostHalo: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly frostCore: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly rims: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  /** The carrot once it has left the face: flies, rests on the floor, is kicked up, caught and refitted. */
  readonly carrot: THREE.Group;
  private readonly routeX = new Float64Array(ROUTE + 1);
  private readonly routeY = new Float64Array(ROUTE + 1);
  private readonly routeS = new Float64Array(ROUTE + 1);
  private readonly launchPos = new THREE.Vector3();
  private readonly launchQuat = new THREE.Quaternion();
  private readonly homePos = new THREE.Vector3();
  private readonly homeQuat = new THREE.Quaternion();
  private readonly restQuat = new THREE.Quaternion();
  private readonly carryQuat = new THREE.Quaternion();
  private readonly scratch = new THREE.Vector3();
  private readonly scratchQuat = new THREE.Quaternion();
  private readonly turnQuat = new THREE.Quaternion();
  private readonly axis = new THREE.Vector3();
  private readonly launchAxis = new THREE.Vector3();
  private readonly homeAxis = new THREE.Vector3();
  private readonly zAxis = new THREE.Vector3(0, 0, 1);
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private readonly blastAt: number;

  constructor(actor: THREE.Group) {
    this.actor = actor;
    this.model = snowmanModel(actor);
    this.plan = this.model.plan;
    this.duration = SNOWMAN_DURATION * this.plan.pace;
    this.object.name = 'snowman-sculpting';
    this.blastAt = this.plan.sneeze + 60;
    const p = this.plan;
    const r = seededRandom(`${p.phase}:snowman-snow`);

    // The pushed snowball: lumps, a twig and a holly leaf make its rolling visible.
    this.ball.name = 'snowman-snowball';
    this.spin.name = 'snowman-snowball-spin';
    this.object.add(this.ball);
    this.ball.add(this.spin);
    part(this.spin, 'snowball-snow', new THREE.SphereGeometry(1, 22, 16), matte(SNOW, 0.95));
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + 0.4,
        e = (i % 2 ? 0.5 : -0.35) + i * 0.1;
      const lump = part(
        this.spin,
        'snowball-lump',
        new THREE.SphereGeometry(1, 8, 6),
        matte(0xd2e2ee, 0.95),
        Math.cos(a) * Math.cos(e) * 0.93,
        Math.sin(e) * 0.93,
        Math.sin(a) * Math.cos(e) * 0.93,
      );
      lump.scale.set(0.22, 0.16, 0.2);
    }
    const twig = part(
      this.spin,
      'snowball-twig',
      new THREE.CylinderGeometry(0.035, 0.05, 0.62, 5),
      matte(0x6e4a2c, 0.9),
      0.55,
      0.62,
      0.45,
    );
    twig.rotation.set(0.6, 0, -0.75);
    const leaf = part(
      this.spin,
      'snowball-holly',
      new THREE.ShapeGeometry(
        outline([
          [0, 0],
          [0.12, 0.1],
          [0.3, 0.06],
          [0.36, 0.18],
          [0.5, 0.12],
          [0.42, 0],
          [0.5, -0.12],
          [0.36, -0.18],
          [0.3, -0.06],
          [0.12, -0.1],
        ]),
      ),
      matte(0x2f7a3c, 0.6),
      -0.3,
      0.2,
      0.95,
    );
    leaf.rotation.set(0, -0.3, 0.4);
    part(
      this.spin,
      'snowball-berry',
      new THREE.SphereGeometry(0.08, 8, 6),
      matte(0xc8243a, 0.4),
      -0.3,
      0.2,
      1.0,
    );

    this.sculpture.name = 'snowman-sculpture';
    this.object.add(this.sculpture);
    this.flat = this.buildSculpture();
    this.mound = part(
      this.object,
      'snowman-mound',
      new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      matte(SNOW, 0.95),
    );

    for (let i = 0; i < 12; i++) {
      const mesh = part(
        this.object,
        `snowman-chunk-${i}`,
        new THREE.IcosahedronGeometry(1, 0),
        matte(i % 3 ? SNOW : 0xdce9f3, 0.95),
      );
      mesh.scale.set(1, 0.8, 0.9);
      this.chunks.push({
        mesh,
        volume: i % Math.max(1, this.volumes.length),
        ox: r() - 0.5,
        oy: r() - 0.5,
        vx: 0.03 + r() * 0.11,
        vy: -(0.07 + r() * 0.17),
        depth: r() * 12 - 4,
        spin: new THREE.Vector3(r() * 12 - 6, r() * 12 - 6, r() * 14 - 7),
      });
    }
    const puff = (
      list: Puff[],
      name: string,
      count: number,
      color: number,
      geometry: () => THREE.BufferGeometry,
    ) => {
      for (let i = 0; i < count; i++)
        list.push({
          mesh: part(this.object, `${name}-${i}`, geometry(), glow(color, 0)),
          a: r(),
          b: r(),
          c: r(),
        });
    };
    puff(this.spray, 'snowman-sneeze-spray', 7, 0xe6f4fc, () => new THREE.CircleGeometry(1, 16));
    puff(this.powder, 'snowman-powder', 10, 0xeef8ff, () => new THREE.CircleGeometry(1, 16));
    puff(this.patPuffs, 'snowman-pat-puff', 3, 0xf2f9ff, () => new THREE.CircleGeometry(1, 12));
    puff(this.flakes, 'snowman-flake', 6, 0xcfe8f7, flakeGeometry);

    this.frost = frostPattern(p.phase);
    this.frostHalo = part(
      this.object,
      'snowman-frost-halo',
      quadGeometry(FROST_SEGMENTS),
      glow(0x86c6e2, 0),
    );
    this.frostCore = part(
      this.object,
      'snowman-frost-core',
      quadGeometry(FROST_SEGMENTS),
      glow(0xf6fdff, 0),
    );
    for (let i = 0; i < 2; i++)
      this.rims.push(
        part(this.object, `snowman-frost-rim-${i}`, stripGeometry(16), glow(0xbfe5f5, 0)),
      );

    this.carrot = buildCarrot(this.object, 'snowman-loose-carrot');
    this.carrot.visible = false;
  }

  /** Builds the authored sculpture on the snowball; returns how much the snowball is pressed flat. */
  private buildSculpture(): number {
    const p = this.plan,
      R = p.ballEnd;
    const add = (
      name: string,
      x: number,
      y: number,
      keys: readonly (readonly [number, number])[],
      marker: THREE.Vector3 | null,
    ) => {
      const group = new THREE.Group();
      group.name = name;
      group.position.set(x, y, 0);
      this.sculpture.add(group);
      let m: THREE.Object3D | null = null;
      if (marker) {
        m = new THREE.Object3D();
        m.name = `${name}-pat`;
        m.position.copy(marker);
        group.add(m);
      }
      const piece = { group, keys, marker: m };
      this.pieces.push(piece);
      return group;
    };
    const pebble = (parent: THREE.Object3D, x: number, y: number, z: number, size: number) =>
      part(
        parent,
        'sculpture-pebble',
        new THREE.SphereGeometry(size, 8, 6),
        matte(PEBBLE, 0.5),
        x,
        y,
        z,
      );
    if (p.sculpture === 'snowman') {
      // A tiny portrait of Flurry himself.
      const r1 = 0.66 * R,
        c1 = 2 * R + 0.8 * r1,
        r2 = 0.46 * R,
        c2 = c1 + r1 + 0.8 * r2;
      this.volumes.push([0, R, R], [0, c1, r1], [0, c2, r2]);
      part(
        add('sculpture-body', 0, c1, [[0, 1]], new THREE.Vector3(-0.5 * r1, 0.866 * r1, 0)),
        'sculpture-body-ball',
        new THREE.SphereGeometry(r1, 18, 12),
        matte(SNOW, 0.95),
      );
      part(
        add('sculpture-head', 0, c2, [[1, 1]], new THREE.Vector3(-0.5 * r2, 0.866 * r2, 0)),
        'sculpture-head-ball',
        new THREE.SphereGeometry(r2, 16, 12),
        matte(SNOW, 0.95),
      );
      const face = add('sculpture-face', 0, c2, [[2, 1]], null);
      for (const az of [-0.35, 0.35])
        pebble(face, Math.sin(az) * r2 * 0.95, r2 * 0.25, Math.cos(az) * r2 * 0.92, 0.1 * R);
      const nose = part(
        face,
        'sculpture-nose',
        new THREE.ConeGeometry(0.09 * R, 0.4 * R, 8),
        matte(0xf07a22, 0.6),
        0.1 * R,
        0,
        r2 * 1.05,
      );
      nose.rotation.set(Math.PI / 2, 0, 0);
      const arms = add('sculpture-arms', 0, c1, [[3, 1]], null);
      for (const s of [-1, 1]) {
        const twig = part(
          arms,
          'sculpture-twig',
          new THREE.CylinderGeometry(0.035 * R, 0.05 * R, 0.85 * r1, 5),
          matte(0x6e4a2c, 0.9),
          s * r1 * 1.25,
          r1 * 0.45,
          0,
        );
        twig.rotation.z = -s * 0.85;
      }
      const buttons = add('sculpture-buttons', 0, c1, [[4, 1]], null);
      for (const y of [0.25, -0.2]) pebble(buttons, 0, y * r1, r1 * 0.97, 0.08 * R);
      return 0;
    }
    if (p.sculpture === 'star') {
      const flat = 0.4,
        top = 2 * R * (1 - flat),
        S = 1.05 * R;
      this.volumes.push(
        [0, R * (1 - flat), R],
        [0, top + 0.7 * S, 0.7 * S],
        [-0.85 * R, top, 0.3 * R],
        [0.85 * R, top, 0.3 * R],
      );
      const star = add(
        'sculpture-star',
        0,
        top - 0.15 * R,
        [
          [1, 0.6],
          [2, 1],
        ],
        new THREE.Vector3(-0.45 * S, 0.81 * S + 0.25 * S, 0.27 * R),
      );
      part(star, 'sculpture-star-snow', starGeometry(S, 0.5 * R), matte(SNOW, 0.9), 0, 0.81 * S, 0);
      const snowballs = add('sculpture-snowballs', 0, 0, [[3, 1]], null);
      for (const s of [-1, 1])
        part(
          snowballs,
          'sculpture-small-ball',
          new THREE.SphereGeometry(0.28 * R, 12, 8),
          matte(SNOW, 0.95),
          s * 0.85 * R,
          1.02 * R + 0.2 * R,
          0.1 * R,
        );
      pebble(
        add('sculpture-sparkle', 0, top - 0.15 * R + 0.81 * S, [[4, 1]], null),
        0,
        0,
        0.3 * R,
        0.09 * R,
      );
      return flat;
    }
    const flat = 0.25;
    const cones: readonly (readonly [number, number, number])[] = [
      [0.95 * R, 1.15 * R, 2 * R * (1 - flat) - 0.15 * R],
      [0.72 * R, 0.95 * R, 0],
      [0.5 * R, 0.8 * R, 0],
    ];
    let y = 0;
    this.volumes.push([0, R * (1 - flat), R]);
    cones.forEach(([radius, height, base], k) => {
      y = k ? y + (cones[k - 1]?.[1] ?? 0) * 0.62 : base;
      const cone = new THREE.ConeGeometry(radius, height, 12, 1);
      cone.translate(0, height / 2, 0);
      part(
        add(
          `sculpture-tier-${k}`,
          0,
          y,
          [[k, 1]],
          new THREE.Vector3(-0.45 * radius, 0.55 * height, 0),
        ),
        `sculpture-tier-${k}-snow`,
        cone,
        matte(SNOW, 0.9),
      );
      this.volumes.push([0, y + height * 0.35, radius * 0.8]);
    });
    const crown = y + (cones[2]?.[1] ?? 0);
    part(
      add('sculpture-topper', 0, crown, [[3, 1]], null),
      'sculpture-topper-ball',
      new THREE.SphereGeometry(0.2 * R, 10, 8),
      matte(SNOW, 0.95),
    );
    const ornaments = add('sculpture-ornaments', 0, 0, [[4, 1]], null);
    [
      [-0.35, 2.05],
      [0.3, 2.55],
      [-0.1, 3.05],
    ].forEach(([u, v]) =>
      pebble(ornaments, (u ?? 0) * R, (v ?? 0) * R - 0.15 * R, 0.55 * R, 0.08 * R),
    );
    return flat;
  }

  cardAnimation(facing: number) {
    return snowmanFrames(this.plan, facing);
  }

  // ---------------------------------------------------------------- layout and route

  private stage(start: Point, b: TargetBounds, view: Point, side: Side): Stage {
    const p = this.plan,
      sc = snowmanScale(b),
      fit = cardFit(b);
    const stand = keepInView(snowmanLandingPoint(p, b, view, side), view, 16, 40);
    const floor = stand.y;
    const back = { x: stand.x - side * STEP_BACK * sc, y: floor };
    const fetchDir: Side = p.noseBounce ? (side > 0 ? -1 : 1) : side;
    const inView = (x: number) => Math.max(24, Math.min(view.x - 24, x));
    const carrot = { x: inView(back.x + side * snowmanCarrotOffset(p) * sc), y: floor };
    const kickStand = { x: inView(carrot.x - fetchDir * KICK_REACH * sc), y: floor };
    const exitDir: Side = p.exitAway ? (side > 0 ? -1 : 1) : side;
    // Rolling past the card keeps low, in front of its bottom edge.
    const rise = p.exitAway ? p.exitRise * 28 : 44 + 12 * Math.abs(p.exitRise);
    const exit = {
      x: exitDir > 0 ? view.x + 95 : -95,
      y: Math.max(60, Math.min(view.y - 20, floor + rise)),
    };
    const base = { x: stand.x + side * snowmanLead(p.ballEnd) * sc, y: floor };
    const length = this.measure(start, stand, b, view, side);
    return {
      start,
      b,
      view,
      side,
      fit,
      sc,
      floor,
      stand,
      back,
      length,
      carrot,
      fetchDir,
      kickStand,
      exitDir,
      exit,
      base,
    };
  }

  private routeRaw(
    u: number,
    start: Point,
    stand: Point,
    b: TargetBounds,
    view: Point,
    side: Side,
  ): Point {
    const p = this.plan;
    const at = sideRoute(start, stand, b, view, side, p.bend, u);
    const a = sideRoute(start, stand, b, view, side, p.bend, Math.max(0, u - 0.01)),
      c = sideRoute(start, stand, b, view, side, p.bend, Math.min(1, u + 0.01));
    const dx = c.x - a.x,
      dy = c.y - a.y,
      l = Math.hypot(dx, dy) || 1;
    const w = p.wander * Math.sin(Math.PI * u) ** 2 * Math.sin(Math.PI * p.waves * u + p.wavePhase);
    return keepInView({ x: at.x - (dy / l) * w, y: at.y + (dx / l) * w }, view, 16, 40);
  }
  private measure(start: Point, stand: Point, b: TargetBounds, view: Point, side: Side): number {
    let length = 0;
    for (let i = 0; i <= ROUTE; i++) {
      const at = this.routeRaw(i / ROUTE, start, stand, b, view, side);
      if (i)
        length += Math.hypot(
          at.x - (this.routeX[i - 1] ?? at.x),
          at.y - (this.routeY[i - 1] ?? at.y),
        );
      this.routeX[i] = at.x;
      this.routeY[i] = at.y;
      this.routeS[i] = length;
    }
    return length;
  }
  /** Point at a fraction of the route's length, so the pushing speed is exactly the planned one. */
  private pointAt(s: number): Point {
    const total = this.routeS[ROUTE] ?? 0,
      target = clamp(s) * total;
    let i = 0;
    while (i < ROUTE - 1 && (this.routeS[i + 1] ?? 0) < target) i++;
    const s0 = this.routeS[i] ?? 0,
      s1 = this.routeS[i + 1] ?? s0;
    const f = s1 > s0 ? (target - s0) / (s1 - s0) : 0;
    return {
      x: mix(this.routeX[i] ?? 0, this.routeX[i + 1] ?? 0, f),
      y: mix(this.routeY[i] ?? 0, this.routeY[i + 1] ?? 0, f),
    };
  }
  /** Pushing direction, squared up to the card over the last stretch. */
  private headingAt(s: number, side: Side): Point {
    const a = this.pointAt(Math.max(0, s - 0.03)),
      c = this.pointAt(Math.min(1, s + 0.03));
    let x = c.x - a.x,
      y = c.y - a.y;
    const l = Math.hypot(x, y);
    if (l < 1e-6) return { x: side, y: 0 };
    const square = ease((s - 0.72) / 0.28);
    x = mix(x / l, side, square);
    y = mix(y / l, 0, square);
    const m = Math.hypot(x, y);
    return m < 1e-6 ? { x: side, y: 0 } : { x: x / m, y: y / m };
  }
  /** Floor point under the pushed snowball for route fraction s. */
  private ballFloor(s: number, g: Stage): Point {
    if (s >= 1) return g.base;
    const at = this.pointAt(s),
      h = this.headingAt(s, g.side),
      lead = snowmanLead(snowmanBallRadius(this.plan, s)) * g.sc;
    return { x: at.x + h.x * lead, y: at.y + h.y * lead * DEPTH_SQUASH };
  }

  // ---------------------------------------------------------------- timing helpers

  rootAt(ms: number, g: Stage): Point {
    const p = this.plan;
    if (ms < p.travel) return this.pointAt(snowmanProgress(p, ms / p.travel));
    if (ms < p.fetch)
      return { x: mix(g.stand.x, g.back.x, ease((ms - p.admire) / 300)), y: g.floor };
    if (ms < p.roll) {
      const walk = ease((ms - p.fetch) / (p.kick - 220 - p.fetch));
      // Rocks back once before setting off.
      const rock = -g.exitDir * 1.6 * g.sc * pulse(ms, p.roll - 280, 280);
      return { x: mix(g.back.x, g.kickStand.x, walk) + rock, y: g.floor };
    }
    const t = span(ms, p.roll, p.exitEnd - p.roll),
      e = t * t * (1.6 - 0.6 * t);
    return mixPoint(g.kickStand, g.exit, e);
  }
  private inhale(ms: number): number {
    const p = this.plan;
    let breath: number;
    if (p.fakeOut) {
      // Ah... ah... it fades, relief... then AH-CHOO.
      breath =
        0.85 * ease((ms - p.inhale) / 500) -
        0.75 * ease((ms - p.inhale - 500) / 300) +
        0.9 * ease((ms - p.inhale - 950) / 300);
    } else {
      const u = span(ms, p.inhale, p.sneeze - p.inhale);
      breath = ease(u) * (1 - 0.15 * Math.sin(Math.PI * 3 * u) ** 2);
    }
    return breath * (1 - ease((ms - p.sneeze) / 70));
  }
  private snap(ms: number): number {
    const p = this.plan;
    return ms < p.sneeze ? 0 : ease((ms - p.sneeze) / 70) * (1 - ease((ms - p.sneeze - 120) / 450));
  }
  private flatten(ms: number): number {
    return this.flat * ease((ms - snowmanPatContact(this.plan, 0) + 40) / 140);
  }
  private patOf(step: number): number {
    return Math.min(step, this.plan.pats - 1);
  }

  // ---------------------------------------------------------------- the actor

  private pose(ms: number, g: Stage): SnowmanPose {
    const p = this.plan,
      side = g.side;
    const t = ms / p.travel,
      approaching = ms < p.travel;
    const s = approaching ? snowmanProgress(p, t) : 1;
    const h = approaching ? this.headingAt(s, side) : { x: side, y: 0 };
    const at = this.rootAt(ms, g);
    const walked = approaching
      ? (s * g.length) / g.sc
      : g.length / g.sc + ((at.x - g.stand.x) * side) / g.sc;
    const beat = approaching ? snowmanBeat(p, t) : 0;
    const wobble = p.beat === 'wobble' ? beat : 0,
      sniffle = p.beat === 'sniffle' ? beat : 0;
    const cycle = Math.sin((walked / SNOWMAN_STRIDE) * Math.PI * 2);
    const inh = this.inhale(ms),
      snap = this.snap(ms);
    const walkEnd = p.kick - 220;
    let planted = approaching ? ease((t - 0.9) / 0.1) : 1;
    planted = Math.min(
      planted,
      1 - pulse(ms, p.admire, 300),
      1 - pulse(ms, p.fetch, walkEnd - p.fetch),
    );

    let yaw = 0.95 * h.x;
    yaw = mix(yaw, side * 0.8, ease((ms - p.travel) / 250));
    yaw = mix(yaw, side * 0.5, ease((ms - p.admire - 250) / 300));
    yaw = mix(yaw, side * 0.85, ease((ms - p.inhale) / 300));
    yaw = mix(yaw, side * 0.45, ease((ms - p.sneeze - 350) / 300));
    yaw = mix(yaw, g.fetchDir * 0.85, ease((ms - p.fetch + 100) / 300));
    yaw = mix(yaw, g.fetchDir * 0.35, ease((ms - p.refitEnd) / 260));
    yaw = mix(yaw, 0, ease((ms - p.tuck) / 320));

    const kickLeg: 0 | 1 = g.fetchDir > 0 ? 1 : 0;
    const kickWeight = ease((ms - (p.kick - 300)) / 80) * (1 - ease((ms - (p.kick + 200)) / 160));
    let lean = 0.36 * h.x + 0.05 * cycle * (1 - planted) + 0.2 * wobble * Math.sin(ms / 55);
    lean = mix(lean, side * 0.16, ease((ms - p.travel) / 280));
    for (let i = 0; i < p.pats; i++)
      lean += side * 0.07 * pulse(ms, snowmanPatContact(p, i) - 150, 260);
    lean = mix(lean, -side * 0.05 + 0.04 * Math.sin(ms / 170), ease((ms - p.buildEnd) / 300));
    lean = mix(lean, -side * 0.12 * inh + side * 0.32 * snap, ease((ms - p.inhale) / 200));
    lean = mix(lean, 0.05 * Math.sin((ms - p.sneeze) / 150), ease((ms - p.sneeze - 600) / 300));
    lean = mix(lean, g.fetchDir * 0.08 + 0.05 * cycle * (1 - planted), ease((ms - p.fetch) / 200));
    lean -= g.fetchDir * 0.12 * kickWeight;
    lean = mix(lean, 0, ease((ms - p.tuck) / 300));

    let crouch = approaching ? 0.5 + 2.2 * (1 - Math.abs(h.x)) : 0.5;
    crouch = mix(crouch, 0, ease((ms - p.buildEnd) / 300));

    let squash = approaching ? 0.12 * Math.abs(cycle) * (1 - planted) : 0;
    squash += 0.35 * pulse(ms, p.travel - 60, 260);
    for (let i = 0; i < p.pats; i++) squash += 0.12 * pulse(ms, snowmanPatContact(p, i) - 30, 160);
    squash +=
      0.3 *
      Math.max(0, Math.sin((ms - p.admire - 300) / 95)) *
      pulse(ms, p.admire + 300, p.inhale - p.admire - 300);
    squash += -0.45 * inh + 0.9 * snap;
    squash +=
      0.35 *
      Math.max(0, Math.sin((ms - p.refitEnd) / 90)) *
      pulse(ms, p.refitEnd, p.tuck - p.refitEnd);

    let nod = -0.28 * sniffle * (0.6 + 0.4 * Math.sin(ms / 60));
    nod = mix(nod, 0.2, ease((ms - p.travel) / 250));
    for (let i = 0; i < p.pats; i++) nod += 0.08 * pulse(ms, snowmanPatContact(p, i) - 60, 220);
    nod = mix(nod, -0.1, ease((ms - p.buildEnd) / 300));
    nod = mix(nod, -0.5 * inh + 0.55 * snap, ease((ms - p.inhale) / 200));
    nod = mix(nod, 0.05, ease((ms - p.sneeze - 500) / 300));
    nod = mix(nod, 0.28, ease((ms - p.fetch + 200) / 250));
    nod = mix(
      nod,
      0.3 - 0.55 * span(ms, p.kick, p.catchAt - p.kick),
      ease((ms - p.kick + 80) / 120),
    );
    nod = mix(nod, 0.02, ease((ms - p.catchAt) / 200));
    nod = mix(nod, -0.08, ease((ms - p.refitEnd) / 200));
    nod = mix(nod, 0.35, ease((ms - p.tuck) / 320));

    // Looking round for the missing nose.
    let headYaw =
      0.75 *
      Math.sin((ms - p.sneeze - 350) / 210) *
      pulse(ms, p.sneeze + 350, p.fetch - p.sneeze - 350);
    headYaw = mix(headYaw, g.exitDir * 0.9, ease((ms - p.tuck) / 320));
    let headRoll = 0.18 * wobble * Math.sin(ms / 70);
    headRoll += side * 0.22 * pulse(ms, p.buildEnd + 100, p.inhale - p.buildEnd - 100);
    headRoll +=
      0.16 * Math.sin((ms - p.refitEnd) / 75) * pulse(ms, p.refitEnd, p.tuck - p.refitEnd);

    let blink = 0;
    for (let k = 0; k < 6; k++)
      blink = Math.max(blink, pulse(ms, 900 + k * 2100 + p.phase * 60, 150));
    blink = Math.max(
      blink,
      0.55 * inh,
      snap,
      0.6 * sniffle,
      pulse(ms, p.sneeze + 420, 140),
      pulse(ms, p.sneeze + 600, 140),
    );
    const squint = Math.max(
      ease((ms - p.admire - 250) / 150) * (1 - ease((ms - p.inhale + 100) / 150)),
      ease((ms - p.refitEnd - 60) / 120) * (1 - ease((ms - p.tuck - 200) / 150)),
      p.fakeOut ? 0.7 * pulse(ms, p.inhale + 520, 420) : 0,
    );
    const mouth = Math.max(
      0.9 * inh,
      snap > 0.05 ? snap : 0,
      0.5 * pulse(ms, p.sneeze + 400, 400),
      0.3 * sniffle,
    );
    const twitch =
      0.3 * sniffle * Math.sin(ms / 32) +
      0.22 * inh * Math.sin(ms / 28) +
      0.35 * pulse(ms, p.refitEnd, 320) * Math.sin(ms / 38);

    const tuck = ease((ms - p.tuck) / (p.roll - p.tuck - 60));
    const roll = ms >= p.tuck ? -(at.x - g.kickStand.x) / (ROLL_CENTRE * g.sc) : 0;
    // Scarf tails and pompom lag behind the body's real motion; while rolling the tails stream behind.
    const before = this.rootAt(ms - 60, g);
    const speed = (at.x - before.x) / 60 / g.sc;
    const swing = Math.max(-1.3, Math.min(1.3, -speed * 5)) + side * 0.6 * snap;
    const flutter = Math.sin(ms / 85 + p.phase) * Math.min(0.25, Math.abs(speed) * 3 + 0.05);
    let kick: SnowmanPose['kick'] = null;
    if (kickWeight > 0) {
      const hipX = kickLeg ? 2.6 : -2.6;
      const touch = (g.carrot.x - g.kickStand.x) / g.sc - g.fetchDir * 2.4;
      const wind = { x: hipX * 0.9 - g.fetchDir * 1.3, y: SNOWMAN_ANKLE + 1.5 };
      let foot = mixPoint(
        wind,
        { x: touch, y: SNOWMAN_ANKLE + 0.25 },
        ease((ms - (p.kick - 90)) / 90),
      );
      foot = mixPoint(
        foot,
        { x: touch + g.fetchDir * 1.2, y: SNOWMAN_ANKLE + 3 },
        ease((ms - p.kick) / 140),
      );
      kick = { leg: kickLeg, x: foot.x, y: foot.y, weight: kickWeight };
    }
    return {
      walked,
      heading: h,
      planted,
      yaw,
      lean,
      crouch,
      squash,
      nod,
      headYaw,
      headRoll,
      blink,
      squint,
      mouth,
      noseOn: ms < p.sneeze || ms >= p.refitEnd,
      twitch,
      tuck,
      exitDir: g.exitDir,
      roll,
      tails: [swing + 0.14 + flutter - roll, swing - 0.12 - flutter * 0.8 - roll],
      curl: -swing * 0.35 + flutter,
      pompom: Math.max(-0.8, Math.min(0.8, -speed * 4 - side * 0.5 * snap + 0.25 * inh)),
      kick,
    };
  }

  private placeActor(ms: number, g: Stage) {
    const at = this.rootAt(ms, g);
    this.actor.position.set(at.x, -at.y, DEPTH);
    this.actor.rotation.set(0, 0, 0);
    this.actor.scale.setScalar(g.sc);
    snowmanPose(this.actor, this.pose(ms, g));
  }

  /** The worn carrot's world transform at another moment, measured on the real posed model. */
  private measureCarrot(
    ms: number,
    g: Stage,
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
  ) {
    this.placeActor(ms, g);
    this.model.carrot.updateWorldMatrix(true, false);
    this.model.carrot.matrixWorld.decompose(position, quaternion, this.scratch);
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
    const live = ms < SNOWMAN_DURATION;
    this.object.visible = live;
    this.object.position.set(0, 0, 0);
    const g = this.stage(start, b, view, side);
    // Measuring poses the shared actor, so it happens before this frame's pose.
    this.measureCarrot(p.sneeze, g, this.launchPos, this.launchQuat);
    this.measureCarrot(p.refitEnd, g, this.homePos, this.homeQuat);
    const q = snowmanCardPose(p, ms, side);
    this.placeActor(ms, g);
    actor.visible = live;
    actor.updateMatrixWorld(true);
    const ball = this.updateBall(ms, g);
    this.updateSculpture(ms, g);
    this.updateCarrot(ms, g);
    this.placeArms(ms, g, ball);
    if (ms >= p.tuck) {
      // Tucked up, Flurry rests on whatever part of him is lowest: the ball, the nose or the pompom.
      actor.updateMatrixWorld(true);
      actor.position.y += -this.rootAt(ms, g).y - lowestWorldY(actor);
    }
    actor.updateMatrixWorld(true);
    const fade = 1 - ease((ms - (SNOWMAN_DURATION - 650)) / 550);
    this.updateFallout(ms, g, fade);
    this.updatePuffs(ms, g, fade);
    this.updateFrost(ms, g, q, fade);
  }

  // ---------------------------------------------------------------- snowball and sculpture

  private updateBall(ms: number, g: Stage): BallState {
    const p = this.plan;
    const t = ms / p.travel,
      approaching = ms < p.travel;
    const s = approaching ? snowmanProgress(p, t) : 1;
    const floor = this.ballFloor(s, g);
    const radius = snowmanBallRadius(p, s);
    const squish = 0.07 * pulse(ms, snowmanPatContact(p, 0) - 30, 170);
    const flat = this.flatten(ms) + squish;
    const rx = radius * (1 + 0.5 * flat) * g.sc,
      ry = radius * (1 - flat) * g.sc;
    const hop =
      approaching && p.beat === 'wobble' ? 3.2 * g.sc * pulse(t, p.beatAt - 0.05, 0.1) : 0;
    const centre = { x: floor.x, y: floor.y - ry - hop };
    const h = approaching ? this.headingAt(s, g.side) : { x: g.side, y: 0 };
    this.ball.visible = ms < this.blastAt;
    this.ball.position.set(centre.x, -centre.y, DEPTH + 3 + h.y * 12);
    this.ball.scale.set(rx, ry, radius * g.sc);
    this.rollSpin(s, g, this.spin.quaternion);
    return { centre, rx, ry };
  }
  /** Integrates the rolling along the ball's real path, so its turn matches the distance and growing radius. */
  private rollSpin(s: number, g: Stage, out: THREE.Quaternion) {
    out.identity();
    let previous = this.ballFloor(0, g);
    for (let k = 1; k <= SPIN_STEPS; k++) {
      const u = (s * k) / SPIN_STEPS;
      const at = this.ballFloor(Math.min(u, 0.9999), g);
      const dx = at.x - previous.x,
        dy = at.y - previous.y,
        d = Math.hypot(dx, dy);
      previous = at;
      if (d < 1e-6) continue;
      // Screen down is toward the viewer on the floor, so the roll axis lies in the floor plane.
      this.axis.set(dy / d, 0, -dx / d);
      const radius = snowmanBallRadius(this.plan, u - s / SPIN_STEPS / 2) * g.sc;
      out.premultiply(this.turnQuat.setFromAxisAngle(this.axis, d / radius));
    }
  }

  private pieceScale(piece: Piece, ms: number): number {
    let target = 0,
      previous = 0,
      from = -Infinity;
    for (const [step, scale] of piece.keys) {
      const at = snowmanPatContact(this.plan, this.patOf(step)) - 40;
      if (ms >= at) {
        previous = target;
        target = scale;
        from = at;
      }
    }
    if (target === 0) return 0;
    const k = ms - from,
      grow = ease(k / 110);
    return (
      (previous + (target - previous) * grow) *
      (1 + 0.16 * Math.sin(k / 38) * Math.exp(-k / 120) * grow)
    );
  }
  private updateSculpture(ms: number, g: Stage) {
    this.sculpture.position.set(g.base.x, -g.base.y, DEPTH + 3.5);
    this.sculpture.scale.set(g.side * g.sc, g.sc, g.sc);
    this.sculpture.visible = ms < this.blastAt;
    for (const piece of this.pieces) {
      const scale = this.pieceScale(piece, ms);
      piece.group.visible = scale > 0.001;
      piece.group.scale.setScalar(Math.max(0.001, scale));
    }
    this.sculpture.updateMatrixWorld(true);
  }
  /** The surface Flurry pats on pat i: the top of whatever he built last, or the snowball itself. */
  private patTarget(i: number, ball: BallState, g: Stage): { contact: Point; aim: Point } {
    let marker: THREE.Object3D | null = null;
    for (const piece of this.pieces)
      if (piece.marker && this.patOf(piece.keys[0]?.[0] ?? 0) <= i - 1) marker = piece.marker;
    if (!marker || !marker.parent)
      return {
        contact: { x: ball.centre.x - g.side * 0.34 * ball.rx, y: ball.centre.y - 0.94 * ball.ry },
        aim: ball.centre,
      };
    return { contact: screenOf(marker), aim: screenOf(marker.parent) };
  }

  // ---------------------------------------------------------------- arms

  private grip(arm: Limb, contact: Point, aim: Point) {
    const c = localTarget(arm, this.object, contact.x, -contact.y),
      a = localTarget(arm, this.object, aim.x, -aim.y);
    let dx = a.x - c.x,
      dy = a.y - c.y;
    const l = Math.hypot(dx, dy);
    if (l < 1e-6) {
      dx = 0;
      dy = -1;
    } else {
      dx /= l;
      dy /= l;
    }
    // The mitten points at the aim, so its palm lands exactly on the contact point.
    return {
      x: c.x - dx * MITTEN_GRIP,
      y: c.y - dy * MITTEN_GRIP,
      angle: Math.atan2(dy, dx) + Math.PI / 2,
    };
  }
  private placeArms(ms: number, g: Stage, ball: BallState) {
    const p = this.plan,
      m = this.model,
      side = g.side;
    const inh = this.inhale(ms),
      snap = this.snap(ms);
    const t = ms / p.travel;
    const wobble = ms < p.travel && p.beat === 'wobble' ? snowmanBeat(p, t) : 0;
    const patArm = side > 0 ? 1 : 0,
      catchArm = g.fetchDir > 0 ? 1 : 0;
    m.arms.forEach((arm, i) => {
      const out = i ? 1 : -1;
      let rest = { x: out * 9.5, y: -7 + 1.5 * Math.sin(ms / 140 + i) * wobble };
      // Ta-da: the near mitten presents the finished sculpture, the other waves up high.
      const near = out === side;
      const tada = near
        ? { x: out * 12.5, y: 1 + Math.sin(ms / 160) }
        : { x: out * 6, y: 11 + 1.5 * Math.sin(ms / 90) };
      rest = mixPoint(rest, tada, ease((ms - (p.buildEnd + 80)) / 220));
      rest = mixPoint(
        rest,
        { x: out * 8.5, y: -7 + 9 * inh - 5 * snap },
        ease((ms - p.inhale) / 200),
      );
      rest = mixPoint(rest, { x: out * 7, y: -10 }, ease((ms - p.sneeze - 500) / 300));
      rest = mixPoint(
        rest,
        { x: out * 7.5, y: 7 + 2 * Math.sin(ms / 80 + i * 2) },
        ease((ms - p.refitEnd - 80) / 200),
      );
      rest = mixPoint(rest, { x: -out * 1.5, y: -3 }, ease((ms - p.tuck) / 260));
      let wrist = { x: rest.x, y: rest.y, angle: Math.atan2(rest.y, rest.x) + Math.PI / 2 };
      const blend = (goal: { x: number; y: number; angle: number }, w: number) => {
        if (w <= 0) return;
        wrist = {
          x: mix(wrist.x, goal.x, w),
          y: mix(wrist.y, goal.y, w),
          angle: mixAngle(wrist.angle, goal.angle, w),
        };
      };
      const shoulder = screenOf(arm.root);
      // Pushing: both mittens on the snowball, on the side nearest each shoulder.
      const toBuild = ease((ms - (p.build - 200)) / 200);
      const pushing = (1 - (i === patArm ? 0 : toBuild)) * (1 - 0.6 * wobble);
      if (pushing > 0 && ms < this.blastAt) {
        const nx = shoulder.x - ball.centre.x,
          ny = shoulder.y - ball.centre.y,
          nl = Math.hypot(nx, ny) || 1;
        const a = Math.atan2(ny / nl, nx / nl) + out * 0.3;
        const contact = {
          x: ball.centre.x + Math.cos(a) * ball.rx,
          y: ball.centre.y + Math.sin(a) * ball.ry,
        };
        blend(this.grip(arm, contact, ball.centre), pushing);
      }
      // Patting the sculpture into shape, one pat per added piece.
      if (i === patArm) {
        const w = toBuild * (1 - ease((ms - (p.buildEnd + 40)) / 200));
        if (w > 0) {
          const k = Math.max(0, Math.min(p.pats - 1, Math.floor((ms - p.build) / PAT_INTERVAL)));
          const u = (ms - p.build - k * PAT_INTERVAL) / PAT_INTERVAL;
          let hover = u < 0.577 ? 1 - ease(u / 0.577) : u < 0.75 ? 0 : ease((u - 0.75) / 0.25);
          if (ms < p.build) hover = 1;
          const now = this.patTarget(k, ball, g),
            next = this.patTarget(Math.min(p.pats - 1, k + 1), ball, g);
          const move = k < p.pats - 1 ? ease((u - 0.6) / 0.4) : 0;
          const surface = mixPoint(now.contact, next.contact, move),
            aim = mixPoint(now.aim, next.aim, move);
          const contact = {
            x: surface.x - side * 0.8 * g.sc * hover,
            y: surface.y - 3.5 * g.sc * hover,
          };
          blend(this.grip(arm, contact, aim), w);
        }
      }
      // Feeling for the missing nose.
      if (i === patArm) {
        const feel =
          ease((ms - (p.sneeze + 430)) / 180) * (1 - ease((ms - (p.sneeze + 1000)) / 200));
        if (feel > 0) {
          const socket = screenOf(m.carrot),
            head = screenOf(m.head);
          const tap = 1 - Math.abs(Math.sin((ms - p.sneeze - 430) / 90));
          const dx = socket.x - head.x,
            dy = socket.y - head.y,
            dl = Math.hypot(dx, dy) || 1;
          const contact = {
            x: socket.x + (dx / dl) * 1.4 * g.sc * tap,
            y: socket.y + (dy / dl) * 1.4 * g.sc * tap,
          };
          blend(this.grip(arm, contact, head), feel);
        }
      }
      // Catching the kicked carrot and pushing it back onto the face.
      if (i === catchArm) {
        const hold =
          ease((ms - (p.catchAt - 260)) / 240) * (1 - ease((ms - (p.refitEnd + 40)) / 200));
        if (hold > 0) {
          const carrot = ms < p.refitEnd ? this.gripOf(this.carrot) : this.gripOf(m.carrot);
          const aim = {
            x: carrot.x + (carrot.x - shoulder.x),
            y: carrot.y + (carrot.y - shoulder.y),
          };
          blend(this.grip(arm, carrot, aim), hold);
        }
      }
      reach(arm, wrist.x, wrist.y, i ? -1 : 1, wrist.angle);
    });
  }

  // ---------------------------------------------------------------- the carrot

  /** Where the mitten holds a carrot (worn or loose): near the tip, so it can push the base home. */
  gripOf(carrot: THREE.Object3D): Point {
    carrot.updateWorldMatrix(true, false);
    this.scratch.set(0, CARROT_LENGTH * 0.72, 0).applyMatrix4(carrot.matrixWorld);
    return { x: this.scratch.x, y: -this.scratch.y };
  }
  /** Places the loose carrot by its centre (screen) and orientation. */
  private setCarrot(centre: Point, z: number, quaternion: THREE.Quaternion, sc: number) {
    this.carrot.quaternion.copy(quaternion);
    this.carrot.scale.setScalar(sc);
    this.axis.set(0, 1, 0).applyQuaternion(quaternion);
    const half = (CARROT_LENGTH / 2) * sc;
    this.carrot.position.set(
      centre.x - this.axis.x * half,
      -centre.y - this.axis.y * half,
      z - this.axis.z * half,
    );
  }
  /** Centre of the carrot when it lies on the floor, resting on its own lowest point. */
  private carrotRest(g: Stage): Point {
    const away = this.plan.noseBounce ? -g.side : g.side;
    this.restQuat.setFromUnitVectors(
      this.yAxis,
      this.scratch.set(away * 0.88, 0, 0.47).normalize(),
    );
    this.setCarrot({ x: g.carrot.x, y: 0 }, DEPTH + 6, this.restQuat, g.sc);
    const low = lowestWorldY(this.carrot);
    return { x: g.carrot.x, y: g.floor + low };
  }
  private updateCarrot(ms: number, g: Stage) {
    const p = this.plan,
      sc = g.sc,
      half = (CARROT_LENGTH / 2) * sc;
    const visible = ms >= p.sneeze && ms < p.refitEnd && ms < SNOWMAN_DURATION;
    this.carrot.visible = visible;
    const rest = this.carrotRest(g);
    if (!visible) return;
    const launchAxis = this.launchAxis.set(0, 1, 0).applyQuaternion(this.launchQuat);
    const launch = {
      x: this.launchPos.x + launchAxis.x * half,
      y: -(this.launchPos.y + launchAxis.y * half),
    };
    const homeAxis = this.homeAxis.set(0, 1, 0).applyQuaternion(this.homeQuat);
    const home = {
      x: this.homePos.x + homeAxis.x * half,
      y: -(this.homePos.y + homeAxis.y * half),
    };
    const catchPoint = { x: g.kickStand.x + g.fetchDir * 11 * sc, y: g.floor - 19 * sc };
    this.carryQuat.setFromUnitVectors(
      this.yAxis,
      this.scratch.set(g.fetchDir * 0.45, 0.88, 0.12).normalize(),
    );
    const ballistic = (from: Point, to: Point, t0: number, t1: number) => {
      const dt = Math.max(1, t1 - t0),
        k = Math.max(0, Math.min(dt, ms - t0));
      const vx = (to.x - from.x) / dt,
        vy = (to.y - from.y - 0.5 * GRAVITY * dt * dt) / dt;
      return { x: from.x + vx * k, y: from.y + vy * k + 0.5 * GRAVITY * k * k };
    };
    let centre: Point,
      z = DEPTH + 6;
    if (ms < p.noseLanded) {
      // Blown off by the sneeze: straight into the card and back over his head, or popped up and dropped.
      if (p.noseBounce && ms < p.noseHit) {
        const card = onCard(
          snowmanCardPose(p, p.noseHit, g.side),
          g.side > 0 ? 0.03 : 0.97,
          0.62 + 0.08 * p.noseLand,
          g.b,
        );
        const hit = { x: card.x - g.side * half * 0.8, y: card.y };
        centre = ballistic(launch, hit, p.sneeze, p.noseHit);
      } else if (p.noseBounce) {
        const card = onCard(
          snowmanCardPose(p, p.noseHit, g.side),
          g.side > 0 ? 0.03 : 0.97,
          0.62 + 0.08 * p.noseLand,
          g.b,
        );
        centre = ballistic(
          { x: card.x - g.side * half * 0.8, y: card.y },
          rest,
          p.noseHit,
          p.noseLanded,
        );
      } else centre = ballistic(launch, rest, p.sneeze, p.noseLanded);
      const f = span(ms, p.sneeze, p.noseLanded - p.sneeze);
      this.scratchQuat.slerpQuaternions(this.launchQuat, this.restQuat, ease(f));
      this.scratchQuat.premultiply(
        this.turnQuat.setFromAxisAngle(this.zAxis, -g.side * Math.PI * 2 * f * f),
      );
      z = mix(this.launchPos.z + launchAxis.z * half, DEPTH + 6, f);
    } else if (ms < p.kick) {
      // Lands with a little bounce and lies on the floor.
      centre = { x: rest.x, y: rest.y - 2.5 * sc * pulse(ms, p.noseLanded, 170) };
      this.scratchQuat.copy(this.restQuat);
    } else if (ms < p.catchAt) {
      // Kicked up into the waiting mitten with one flip.
      centre = ballistic(rest, catchPoint, p.kick, p.catchAt);
      const f = span(ms, p.kick, p.catchAt - p.kick);
      this.scratchQuat.slerpQuaternions(this.restQuat, this.carryQuat, ease(f));
      this.scratchQuat.premultiply(
        this.turnQuat.setFromAxisAngle(this.zAxis, g.fetchDir * Math.PI * 2 * f * f),
      );
      z = mix(DEPTH + 6, DEPTH + 9, f);
    } else {
      // Lined up with the socket, then pushed home along its own axis.
      const f = span(ms, p.catchAt, p.refitEnd - p.catchAt);
      const pre = { x: home.x + homeAxis.x * 2.6 * sc, y: home.y - homeAxis.y * 2.6 * sc };
      centre =
        f < 0.7
          ? mixPoint(catchPoint, pre, ease(f / 0.7))
          : mixPoint(pre, home, ease((f - 0.7) / 0.3));
      this.scratchQuat.slerpQuaternions(this.carryQuat, this.homeQuat, ease(f / 0.7));
      z = mix(DEPTH + 9, this.homePos.z + homeAxis.z * half, ease(f));
    }
    this.setCarrot(centre, z, this.scratchQuat, sc);
  }

  // ---------------------------------------------------------------- fallout and effects

  private updateFallout(ms: number, g: Stage, fade: number) {
    const p = this.plan,
      sc = g.sc;
    const age = ms - this.blastAt;
    const blown = age >= 0 && fade > 0;
    const R = p.ballEnd;
    // The sad little heap left where the sculpture stood.
    this.mound.visible = blown;
    this.mound.position.set(g.base.x, -g.floor, DEPTH + 2);
    this.mound.scale.set(R * 1.15 * sc, R * 0.42 * sc * ease(age / 160 + 0.3), R * 0.85 * sc);
    this.mound.material.transparent = true;
    this.mound.material.opacity = fade;
    for (const chunk of this.chunks) {
      chunk.mesh.visible = blown;
      if (!blown) continue;
      const [vx0, vy0, vr] = this.volumes[chunk.volume] ?? [0, R, R];
      this.scratch.set(vx0 + chunk.ox * vr, vy0 + chunk.oy * vr, 0);
      this.sculpture.localToWorld(this.scratch);
      const born = { x: this.scratch.x, y: -this.scratch.y };
      const size = vr * (0.3 + 0.25 * Math.abs(chunk.ox + chunk.oy)) * sc;
      const vx = g.side * chunk.vx * p.strength + chunk.ox * 0.06,
        vy = chunk.vy * p.strength;
      const floor = g.floor + chunk.depth * g.fit;
      const land = (-vy + Math.sqrt(vy * vy + 2 * GRAVITY * Math.max(0, floor - born.y))) / GRAVITY;
      const k = Math.min(age, land);
      const slide = age > land ? vx * 60 * (1 - Math.exp(-(age - land) / 60)) : 0;
      const x = born.x + vx * k + slide;
      const turn = Math.min(age, land) / 1000;
      chunk.mesh.rotation.set(chunk.spin.x * turn, chunk.spin.y * turn, chunk.spin.z * turn);
      chunk.mesh.scale.set(size, size * 0.8, size * 0.9);
      chunk.mesh.position.set(x, 0, DEPTH + 1 + chunk.depth * 0.1);
      chunk.mesh.updateMatrixWorld(true);
      const low = lowestWorldY(chunk.mesh);
      const flying = -(born.y + vy * age + 0.5 * GRAVITY * age * age);
      // Never below the floor: once it touches down it rests on its own lowest point.
      chunk.mesh.position.y = Math.max(flying, -floor - low);
      chunk.mesh.material.transparent = true;
      chunk.mesh.material.opacity = fade;
    }
  }

  private updatePuffs(ms: number, g: Stage, fade: number) {
    const p = this.plan,
      sc = g.sc,
      fit = g.fit;
    const R = p.ballEnd;
    // Sneeze spray from the nose tip toward the sculpture.
    const axis = this.scratch.set(0, 1, 0).applyQuaternion(this.launchQuat);
    const nose = {
      x: this.launchPos.x + axis.x * CARROT_LENGTH * sc,
      y: -(this.launchPos.y + axis.y * CARROT_LENGTH * sc),
    };
    const target = { x: g.base.x, y: g.floor - R * sc * 1.6 };
    const heading = Math.atan2(target.y - nose.y, target.x - nose.x);
    this.spray.forEach((puff, i) => {
      const t = ms - p.sneeze;
      puff.mesh.visible = t >= 0 && t < 750 && fade > 0;
      if (!puff.mesh.visible) return;
      const a = heading + (i / (this.spray.length - 1) - 0.5) * 0.7;
      const v = (0.35 + 0.15 * puff.a) * p.strength,
        d = v * 180 * (1 - Math.exp(-t / 180));
      puff.mesh.position.set(
        nose.x + Math.cos(a) * d,
        -(nose.y + Math.sin(a) * d) + 0.01 * t * puff.b,
        DEPTH + 12,
      );
      puff.mesh.scale.setScalar((1.5 + 0.012 * t) * fit * (0.8 + 0.4 * puff.c));
      puff.mesh.material.opacity = 0.75 * (1 - t / 750);
    });
    // Powder from the burst sculpture drifts out and slowly settles.
    this.powder.forEach((puff, i) => {
      const t = ms - this.blastAt;
      puff.mesh.visible = t >= 0 && t < 1800 && fade > 0;
      if (!puff.mesh.visible) return;
      const [vx0, vy0, vr] = this.volumes[i % Math.max(1, this.volumes.length)] ?? [0, R, R];
      this.scratch.set(vx0 + (puff.a - 0.5) * vr, vy0 + (puff.b - 0.5) * vr, 0);
      this.sculpture.localToWorld(this.scratch);
      const drift = g.side * (0.05 + 0.08 * puff.c) * p.strength * 220 * (1 - Math.exp(-t / 220));
      const rise = 14 * fit * (1 - Math.exp(-t / 260)) - 0.012 * t * fit;
      puff.mesh.position.set(
        this.scratch.x + drift + Math.sin(t / 300 + i) * 3 * fit,
        this.scratch.y + rise,
        DEPTH + 10,
      );
      puff.mesh.scale.setScalar((2 + 0.005 * t) * fit * (0.8 + 0.5 * puff.a));
      puff.mesh.material.opacity = 0.65 * (1 - t / 1800);
    });
    // Little puffs where each pat lands.
    const k = Math.max(
      0,
      Math.min(p.pats - 1, Math.round((ms - snowmanPatContact(p, 0)) / PAT_INTERVAL)),
    );
    const age = ms - snowmanPatContact(p, k);
    this.patPuffs.forEach((puff, i) => {
      puff.mesh.visible = age >= 0 && age < 380 && ms < this.blastAt;
      if (!puff.mesh.visible) return;
      const marker = this.patPuffPoint(k, g);
      const a = -Math.PI / 2 + (i - 1) * 0.9 + puff.a * 0.3;
      const d = (3 + 8 * ease(age / 380)) * fit;
      puff.mesh.position.set(marker.x + Math.cos(a) * d, -(marker.y + Math.sin(a) * d), DEPTH + 12);
      puff.mesh.scale.setScalar((1 + 1.6 * ease(age / 380)) * fit);
      puff.mesh.material.opacity = 0.7 * (1 - age / 380);
    });
    // Snowflakes drift down after the burst and settle on the floor.
    this.flakes.forEach((flake, i) => {
      const t = ms - this.blastAt - 80;
      flake.mesh.visible = t >= 0 && fade > 0;
      if (!flake.mesh.visible) return;
      const startX = g.base.x + (flake.a - 0.5) * 60 * fit + g.side * 10 * fit,
        startY = g.floor - (34 + 30 * flake.b) * fit;
      const floor = g.floor - 1.5 * fit + flake.c * 6 * fit;
      const y = Math.min(floor, startY + 0.02 * t);
      const settled = y >= floor;
      const sway = settled ? Math.sin((floor - startY) / 0.02 / 320 + i) : Math.sin(t / 320 + i);
      flake.mesh.position.set(
        startX + sway * 6 * fit + g.side * 0.006 * Math.min(t, (floor - startY) / 0.02),
        -y,
        DEPTH + 11,
      );
      flake.mesh.rotation.z = settled ? 0.5 * i : t / 600 + i;
      flake.mesh.scale.setScalar((1.6 + flake.c) * fit);
      flake.mesh.material.opacity = 0.9 * fade;
    });
  }
  private patPuffPoint(k: number, g: Stage): Point {
    let marker: THREE.Object3D | null = null;
    for (const piece of this.pieces)
      if (piece.marker && this.patOf(piece.keys[0]?.[0] ?? 0) <= k - 1) marker = piece.marker;
    if (marker) return screenOf(marker);
    const R = this.plan.ballEnd;
    return {
      x: g.base.x - g.side * 0.34 * R * g.sc,
      y: g.floor - 1.9 * R * (1 - this.flat) * g.sc,
    };
  }

  private updateFrost(ms: number, g: Stage, q: CardPose, fade: number) {
    const p = this.plan;
    const grown = snowmanFrost(p, ms);
    const front = grown * 0.36;
    const live = grown > 0 && fade > 0;
    const near = (u: number) => (g.side > 0 ? u : 1 - u);
    for (const [mesh, scale, z] of [
      [this.frostHalo, 2.2, DEPTH - 12],
      [this.frostCore, 1, DEPTH - 11.9],
    ] as const) {
      mesh.visible = live;
      if (!live) continue;
      const positions = mesh.geometry.getAttribute('position');
      for (let i = 0; i < FROST_SEGMENTS; i++) {
        const seg = this.frost[i];
        const f = seg ? clamp((front - seg.birth) / seg.length) : 0;
        if (!seg || f <= 0) {
          for (let v = 0; v < 4; v++) positions.setXYZ(i * 4 + v, 0, 0, z);
          continue;
        }
        const a = onCard(q, near(seg.a[0]), seg.a[1], g.b),
          b = onCard(q, near(mix(seg.a[0], seg.b[0], f)), mix(seg.a[1], seg.b[1], f), g.b);
        const dx = b.x - a.x,
          dy = b.y - a.y,
          l = Math.hypot(dx, dy) || 1;
        const w = (seg.width * scale * g.fit) / 2;
        const nx = (-dy / l) * w,
          ny = (dx / l) * w;
        positions.setXYZ(i * 4, a.x + nx, -(a.y + ny), z);
        positions.setXYZ(i * 4 + 1, a.x - nx, -(a.y - ny), z);
        positions.setXYZ(i * 4 + 2, b.x + nx * 0.6, -(b.y + ny * 0.6), z);
        positions.setXYZ(i * 4 + 3, b.x - nx * 0.6, -(b.y - ny * 0.6), z);
      }
      positions.needsUpdate = true;
      mesh.geometry.computeBoundingSphere();
      mesh.material.opacity = (scale > 1 ? 0.55 : 0.95) * fade;
    }
    // A frosted rim creeps up the near edge and along the bottom from the corner.
    this.rims.forEach((rim, i) => {
      rim.visible = live;
      if (!live) return;
      setStrip(
        rim.geometry,
        16,
        (s, out) => {
          const at =
            i === 0
              ? onCard(q, near(0.012), 0.99 - s * 0.95 * grown, g.b)
              : onCard(q, near(0.01 + s * 0.45 * grown), 0.988, g.b);
          out.set(at.x, -at.y, DEPTH - 12.1);
        },
        (s) => (3.2 - 1.6 * s) * g.fit,
      );
      rim.material.opacity = 0.5 * fade;
    });
  }
}
