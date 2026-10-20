import { clamp } from '../../kit';
import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  DUMPSTER_POINTS,
  dumpsterModel,
  dumpsterWorldPoint,
  poseDumpster,
  ink,
  softDisc,
  tinted,
} from './dumpster-model';
import {
  DUMPSTER_BODY,
  DUMPSTER_DURATION,
  DUMPSTER_PALETTES,
  dumpsterCardFire,
  dumpsterCardPoint,
  dumpsterCardPose,
  dumpsterEase,
  dumpsterFloor,
  dumpsterFrames,
  dumpsterFront,
  dumpsterMouthFire,
  dumpsterPose,
  dumpsterScale,
  dumpsterSlamHit,
  dumpsterTouchdown,
  type DumpsterPlan,
} from './dumpster-choreography';

const CARD_FIRE_DEPTH = 250,
  CARD_OVERLAY_DEPTH = 176,
  FLAME_HEIGHT = 30,
  FLAME_WIDTH = 24;
/** Card-local flame tongues: across (u), up from the bottom edge (v), size as card fractions, dimmed centre. */
export const DUMPSTER_TONGUES: readonly {
  u: number;
  v: number;
  h: number;
  w: number;
  dim: number;
}[] = [
  { u: 0.1, v: 0.02, h: 0.42, w: 0.34, dim: 1 },
  { u: 0.3, v: 0.02, h: 0.36, w: 0.3, dim: 1 },
  { u: 0.5, v: 0.02, h: 0.3, w: 0.28, dim: 0.9 },
  { u: 0.7, v: 0.02, h: 0.36, w: 0.3, dim: 1 },
  { u: 0.9, v: 0.02, h: 0.42, w: 0.34, dim: 1 },
  { u: 0.06, v: 0.34, h: 0.36, w: 0.26, dim: 1 },
  { u: 0.24, v: 0.34, h: 0.27, w: 0.19, dim: 0.6 },
  { u: 0.76, v: 0.34, h: 0.27, w: 0.19, dim: 0.6 },
  { u: 0.94, v: 0.34, h: 0.36, w: 0.26, dim: 1 },
  { u: 0.08, v: 0.64, h: 0.34, w: 0.24, dim: 1 },
  { u: 0.27, v: 0.64, h: 0.25, w: 0.18, dim: 0.6 },
  { u: 0.73, v: 0.64, h: 0.25, w: 0.18, dim: 0.6 },
  { u: 0.92, v: 0.64, h: 0.34, w: 0.24, dim: 1 },
  { u: 0.22, v: 0.97, h: 0.26, w: 0.22, dim: 1 },
  { u: 0.5, v: 0.97, h: 0.3, w: 0.24, dim: 1 },
  { u: 0.78, v: 0.97, h: 0.26, w: 0.22, dim: 1 },
];
const MOUTH_FLAMES = 7,
  EMBERS = 18,
  WASH = { columns: 8, rows: 14 } as const;
const SMOKE = { rumble: 0, burn: 3, wisp: 7, slam: 9, count: 13 } as const;
function tongueShape(mirror: number) {
  const m = (x: number) => x * mirror,
    shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(m(-12), 1, m(-12), 12, m(-6), 18);
  shape.quadraticCurveTo(m(-3), 22, m(-5), 27);
  shape.quadraticCurveTo(0, 23, m(1), FLAME_HEIGHT);
  shape.quadraticCurveTo(m(4), 22, m(6), 20);
  shape.bezierCurveTo(m(12), 13, m(11), 1, 0, 0);
  return shape;
}
interface Flame {
  readonly root: THREE.Group;
  readonly layers: readonly THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>[];
}
function flame(name: string, colors: readonly number[], mirror: number): Flame {
  const root = new THREE.Group();
  root.name = name;
  const fits: readonly [number, number, number][] = [
    [1.16, 1.1, -0.6],
    [1, 1, 0],
    [0.72, 0.8, 0],
    [0.42, 0.55, 0],
  ];
  const layers = fits.map(([sx, sy, y], i) => {
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(tongueShape(mirror)),
      ink(colors[i] ?? 0xffffff),
    );
    mesh.scale.set(sx, sy, 1);
    mesh.position.set(0, y, i * 0.1);
    root.add(mesh);
    return mesh;
  });
  return { root, layers };
}
/** A grid over the card whose vertices carry their own colour and alpha, for soft soot and heat tint. */
function washGeometry() {
  const { columns, rows } = WASH,
    count = (columns + 1) * (rows + 1),
    g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 4), 4));
  const index: number[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < columns; c++) {
      const a = r * (columns + 1) + c,
        d = a + columns + 1;
      index.push(a, a + 1, d, a + 1, d + 1, d);
    }
  g.setIndex(index);
  return g;
}
const smooth = (from: number, to: number, n: number) => {
  const t = clamp((n - from) / (to - from));
  return t * t * (3 - 2 * t);
};

const CHARRED = new THREE.Color(0x2e2119),
  point = new THREE.Vector3(),
  left = new THREE.Vector3(),
  right = new THREE.Vector3();
export class DumpsterTrick {
  readonly object = new THREE.Group();
  readonly plan: DumpsterPlan;
  readonly duration: number;
  private readonly model;
  private readonly palette;
  private readonly mouth: Flame[] = [];
  private readonly tongues: Flame[] = [];
  private readonly embers: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly smoke: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly dust: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly soot = new THREE.Mesh(washGeometry(), tinted(0xffffff));
  private readonly glow = new THREE.Mesh(washGeometry(), tinted(0xffffff));
  private readonly sootColor = new THREE.Color(0x24170f);
  private readonly heatColor: THREE.Color;
  private readonly debris: {
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    color: THREE.Color;
  }[] = [];
  constructor(actor: THREE.Group) {
    this.model = dumpsterModel(actor);
    this.plan = this.model.plan;
    this.duration = DUMPSTER_DURATION * this.plan.pace;
    const pal = (this.palette = DUMPSTER_PALETTES[this.plan.palette]),
      colors = [pal.edge, pal.body, pal.mid, pal.core];
    this.object.name = 'dumpster-fire-effects';
    this.heatColor = new THREE.Color(pal.body);
    this.soot.name = 'card-soot';
    this.glow.name = 'card-fire-glow';
    this.object.add(this.soot, this.glow);
    for (let i = 0; i < MOUTH_FLAMES; i++) {
      const f = flame(`mouth-flame-${i}`, colors, i % 2 ? -1 : 1);
      this.mouth.push(f);
      this.object.add(f.root);
    }
    DUMPSTER_TONGUES.forEach((_, i) => {
      const f = flame(`card-flame-${i}`, colors, i % 3 ? 1 : -1);
      this.tongues.push(f);
      this.object.add(f.root);
    });
    for (let i = 0; i < EMBERS; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 8, 6),
        ink(i % 2 ? pal.core : pal.mid),
      );
      mesh.name = `ember-${i}`;
      this.embers.push(mesh);
      this.object.add(mesh);
    }
    for (let i = 0; i < SMOKE.count; i++) {
      const mesh = new THREE.Mesh(softDisc(), tinted(pal.smoke));
      mesh.name = `smoke-${i}`;
      this.smoke.push(mesh);
      this.object.add(mesh);
    }
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(softDisc(), tinted(0xb5a993));
      mesh.name = `landing-dust-${i}`;
      this.dust.push(mesh);
      this.object.add(mesh);
    }
    const pieces: readonly [string, THREE.BufferGeometry, number][] = [
      ['paper-scrap-0', new THREE.PlaneGeometry(5, 6.5), 0xefe5cc],
      ['paper-scrap-1', new THREE.PlaneGeometry(6, 4.5), 0xe4d8bb],
      ['pizza-box-lid', new THREE.BoxGeometry(11, 1.2, 11), 0xc08e57],
    ];
    for (const [name, geometry, color] of pieces) {
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide }),
      );
      mesh.name = name;
      this.debris.push({ mesh, color: new THREE.Color(color) });
      this.object.add(mesh);
    }
  }
  cardAnimation() {
    return dumpsterFrames(this.plan);
  }
  /** Strength of one card tongue: the climbing front reaches it, then the whole fire fades. */
  tongueStrength(ms: number, index: number) {
    const tongue = DUMPSTER_TONGUES[index];
    if (!tongue) return 0;
    return (
      dumpsterCardFire(this.plan, ms) *
      dumpsterEase((dumpsterFront(this.plan, ms) - tongue.v) / 0.2)
    );
  }
  tonguePose(ms: number, index: number, b: TargetBounds) {
    const p = this.plan,
      tongue = DUMPSTER_TONGUES[index] ?? { u: 0.5, v: 0, h: 0, w: 0, dim: 0 },
      strength = this.tongueStrength(ms, index);
    // Each throw sizes its tongues a little differently so the blaze never repeats exactly.
    const flicker =
      (1 + 0.14 * Math.sin(index * 2.3 + p.phase * 1.7)) *
      (1 + 0.14 * Math.sin(ms / 53 + index * 1.7 + p.phase) + 0.06 * Math.sin(ms / 23 + index));
    const base = dumpsterCardPoint(
      p,
      ms,
      { x: b.left + tongue.u * b.width, y: b.top + b.height * (1 - tongue.v) },
      b,
    );
    const angle =
      (-dumpsterCardPose(p, ms).angle * Math.PI) / 180 +
      p.wind +
      0.1 * Math.sin(ms / 67 + index * 1.3 + p.phase);
    const height = b.height * tongue.h * strength * flicker,
      width = b.width * tongue.w * (0.35 + 0.65 * Math.min(1, strength));
    return {
      base,
      angle,
      height,
      width,
      strength,
      dim: tongue.dim,
      tip: { x: base.x - Math.sin(angle) * height, y: base.y - Math.cos(angle) * height },
    };
  }
  update(elapsed: number, actor: THREE.Group, start: Point, b: TargetBounds, view: Point) {
    const p = this.plan,
      ms = elapsed / p.pace,
      pose = dumpsterPose(p, ms, start, b, view),
      s = dumpsterScale(b);
    poseDumpster(actor, pose);
    actor.updateMatrixWorld(true);
    this.object.position.set(0, 0, 0);
    this.object.visible = ms < DUMPSTER_DURATION;
    const mouthFire = dumpsterMouthFire(p, ms),
      flicker = 0.5 + 0.5 * Math.sin(ms / 41 + p.phase);
    const crack = ms < p.open ? clamp((pose.lids[0] + pose.lids[1]) / 2 / 0.22) * 0.75 : 0;
    this.model.glow.visible = crack > 0 || mouthFire > 0;
    this.model.glow.material.opacity =
      Math.min(1, Math.max(crack, mouthFire * 0.9)) * (0.85 + 0.15 * flicker);
    this.updateMouth(ms, pose, s, mouthFire);
    this.updateCard(ms, b);
    this.updateDebris(ms, start, b, view, s);
    this.updateEmbers(ms, b, s);
    this.updateSmoke(ms, start, b, view, s);
    this.updateDust(ms, b, view, s);
    if (ms >= DUMPSTER_DURATION) actor.visible = false;
  }
  private updateMouth(ms: number, pose: ReturnType<typeof dumpsterPose>, s: number, fire: number) {
    const p = this.plan;
    dumpsterWorldPoint(pose, DUMPSTER_POINTS.mouthLeft, left);
    dumpsterWorldPoint(pose, DUMPSTER_POINTS.mouthRight, right);
    this.mouth.forEach((f, k) => {
      const flick = 1 + 0.16 * Math.sin(ms / 47 + k * 2.1 + p.phase) + 0.07 * Math.sin(ms / 19 + k);
      const height = s * (32 + 26 * Math.sin((Math.PI * (k + 0.5)) / MOUTH_FLAMES)) * fire * flick,
        width = s * (17 + 5 * Math.sin(k * 1.9 + p.phase) ** 2);
      point.lerpVectors(left, right, k / (MOUTH_FLAMES - 1));
      f.root.visible = height > 0.4;
      f.root.position.copy(point);
      f.root.position.z += (k % 2) * 0.4;
      f.root.rotation.set(0, 0, p.wind * 0.8 + 0.12 * Math.sin(ms / 61 + k * 1.4) + (k - 3) * 0.05);
      f.root.scale.set(
        (width / FLAME_WIDTH) * Math.min(1.3, 0.7 + fire * 0.45),
        height / FLAME_HEIGHT,
        1,
      );
      const alpha = Math.min(1, fire * 2);
      f.layers.forEach((layer, i) => {
        layer.material.opacity = alpha * (i === 0 ? 0.5 : i === 1 ? 0.92 : 1);
      });
    });
  }
  private updateCard(ms: number, b: TargetBounds) {
    const p = this.plan,
      cardFire = dumpsterCardFire(p, ms);
    this.tongues.forEach((f, i) => {
      const q = this.tonguePose(ms, i, b);
      f.root.visible = q.height > 0.4;
      f.root.position.set(q.base.x, -q.base.y, CARD_FIRE_DEPTH + (i % 5) * 0.5);
      f.root.rotation.set(0, 0, q.angle);
      f.root.scale.set(q.width / FLAME_WIDTH, q.height / FLAME_HEIGHT, 1);
      const alpha = Math.min(1, q.strength * 1.6) * q.dim;
      f.layers.forEach((layer, n) => {
        layer.material.opacity = alpha * (n === 0 ? 0.5 : n === 1 ? 0.9 : 1);
      });
    });
    const charred = Math.min(1, 1.15 * dumpsterEase((ms - p.climbStart) / p.climb)),
      sootFade = 1 - dumpsterEase((ms - p.fadeEnd + 200) / 900);
    const reach = 0.55 * charred,
      heat = 0.16 * Math.min(1, cardFire) * (0.85 + 0.15 * Math.sin(ms / 37 + p.phase));
    this.soot.visible = charred > 0 && sootFade > 0;
    if (this.soot.visible)
      this.writeWash(this.soot.geometry, ms, b, CARD_OVERLAY_DEPTH, this.sootColor, (u, v) => {
        const ragged = 0.05 * Math.sin(u * 13 + p.phase) + 0.035 * Math.sin(u * 29 - p.phase * 2);
        return (
          0.55 *
          sootFade *
          (0.8 + 0.2 * Math.abs(2 * u - 1)) *
          (1 - smooth(reach - 0.2, reach + 0.03, v - ragged))
        );
      });
    this.glow.visible = heat > 0.002;
    if (this.glow.visible)
      this.writeWash(
        this.glow.geometry,
        ms,
        b,
        CARD_OVERLAY_DEPTH + 0.5,
        this.heatColor,
        (_, v) => heat * (0.5 + 0.5 * (1 - v)),
      );
  }
  /** Lays the grid on the live card; corners stay clear so the wash follows the rounded card. */
  private writeWash(
    geometry: THREE.BufferGeometry,
    ms: number,
    b: TargetBounds,
    z: number,
    color: THREE.Color,
    alpha: (u: number, v: number) => number,
  ) {
    const positions = geometry.getAttribute('position'),
      colors = geometry.getAttribute('color'),
      { columns, rows } = WASH;
    for (let r = 0; r <= rows; r++)
      for (let c = 0; c <= columns; c++) {
        const i = r * (columns + 1) + c,
          u = c / columns,
          v = r / rows;
        const at = dumpsterCardPoint(
          this.plan,
          ms,
          { x: b.left + 1 + u * (b.width - 2), y: b.top + b.height - 1 - v * (b.height - 2) },
          b,
        );
        const corner = (c === 0 || c === columns) && (r === 0 || r === rows);
        positions.setXYZ(i, at.x, -at.y, z);
        colors.setXYZW(i, color.r, color.g, color.b, corner ? 0 : Math.max(0, alpha(u, v)));
      }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    geometry.computeBoundingSphere();
  }
  /** Burning scraps thrown up by the opening lid fall back into the dumpster. */
  debrisPose(ms: number, i: number, start: Point, b: TargetBounds, view: Point, s: number) {
    const p = this.plan,
      launch = p.open + (p.backdraft ? 70 : 280) + i * 40,
      birth = dumpsterPose(p, launch, start, b, view);
    const from = dumpsterWorldPoint(birth, DUMPSTER_POINTS.mouth, new THREE.Vector3());
    const vy = (p.backdraft ? 150 + i * 14 : 85 + i * 10) * Math.sqrt(s),
      g = 320 * Math.sqrt(s),
      life = (2 * vy) / g;
    const dx = ((i - 1) * 0.9 + 0.3 * Math.sin(p.phase + i * 2)) * DUMPSTER_BODY.width * s * 0.14,
      t = (ms - launch) / 1000;
    return {
      x: from.x + dx * clamp(t / life),
      y: from.y + vy * t - (g * t * t) / 2,
      z: CARD_FIRE_DEPTH - 6 + i,
      t,
      life,
      active: i < p.debris && t > 0 && t < life,
    };
  }
  private updateDebris(ms: number, start: Point, b: TargetBounds, view: Point, s: number) {
    this.debris.forEach(({ mesh, color }, i) => {
      const q = this.debrisPose(ms, i, start, b, view, s);
      mesh.visible = q.active;
      if (!q.active) return;
      mesh.position.set(q.x, q.y, q.z);
      mesh.scale.setScalar(s);
      mesh.rotation.set(
        0.6 + q.t * (2 + i),
        q.t * (3 - i) * this.plan.side,
        q.t * 5 * (i % 2 ? 1 : -1),
      );
      mesh.material.color.copy(color).lerp(CHARRED, clamp(q.t / q.life) * 0.75);
    });
  }
  emberBirth(i: number) {
    const p = this.plan,
      from = p.climbStart + 200,
      span = p.burnEnd + (p.fadeEnd - p.burnEnd) * 0.5 - from;
    return { tongue: (i * 5) % DUMPSTER_TONGUES.length, at: from + (i * span) / EMBERS };
  }
  private updateEmbers(ms: number, b: TargetBounds, s: number) {
    const p = this.plan;
    this.embers.forEach((mesh, i) => {
      const birth = this.emberBirth(i),
        q = (ms - birth.at) / 1000,
        born = this.tonguePose(birth.at, birth.tongue, b);
      mesh.visible = q >= 0 && q < 1.2 && born.strength > 0.25;
      if (!mesh.visible) return;
      mesh.position.set(
        born.tip.x + p.wind * -40 * q + Math.sin(q * 6 + i) * 3 * q,
        -born.tip.y + (36 + (i % 4) * 9) * q + 12 * q * q,
        CARD_FIRE_DEPTH + 4,
      );
      mesh.scale.setScalar((1 + (i % 3) * 0.3) * Math.max(0.7, s));
      mesh.material.opacity = (1 - dumpsterEase(q / 1.2)) * 0.95;
    });
  }
  /** Birth time, origin and drift of each smoke puff; all start at a real seam, flame tip or mouth. */
  smokeBirth(i: number, start: Point, b: TargetBounds, view: Point) {
    const p = this.plan;
    if (i < SMOKE.burn) {
      const at = p.puffs[i - SMOKE.rumble];
      if (at === undefined) return null;
      const from = dumpsterWorldPoint(
        dumpsterPose(p, at, start, b, view),
        DUMPSTER_POINTS.seam,
        new THREE.Vector3(),
      );
      return {
        at,
        from,
        life: 900,
        rise: 30,
        drift: (i - 1) * 6,
        size: [2.5, 8] as const,
        opacity: 0.32,
      };
    }
    if (i < SMOKE.wisp) {
      const k = i - SMOKE.burn,
        at = p.climbStart + p.climb * 0.8 + (k * (p.burnEnd - p.climbStart - p.climb * 0.8)) / 4;
      const tongue = 13 + (k % 3),
        tip = this.tonguePose(at, tongue, b).tip;
      return {
        at,
        from: new THREE.Vector3(tip.x, -tip.y, CARD_FIRE_DEPTH + 6),
        life: 1600,
        rise: 70,
        drift: p.wind * -60,
        size: [5, 16] as const,
        opacity: 0.22,
      };
    }
    if (i < SMOKE.slam) {
      const k = i - SMOKE.wisp,
        at = p.burnEnd + (p.fadeEnd - p.burnEnd) * 0.6 + k * 250;
      const from = dumpsterWorldPoint(
        dumpsterPose(p, at, start, b, view),
        DUMPSTER_POINTS.mouth,
        new THREE.Vector3(),
      );
      return {
        at,
        from,
        life: 1400,
        rise: 55,
        drift: p.wind * -40 + (k ? 6 : -6),
        size: [3, 10] as const,
        opacity: 0.24,
      };
    }
    const k = i - SMOKE.slam,
      at = dumpsterSlamHit(p),
      pose = dumpsterPose(p, at, start, b, view);
    const from = dumpsterWorldPoint(pose, DUMPSTER_POINTS.seam, new THREE.Vector3());
    const spread = (k - 1.5) / 1.5;
    from.x += spread * DUMPSTER_BODY.width * 0.45 * pose.s;
    return {
      at,
      from,
      life: 600,
      rise: 10,
      drift: spread * 26 * pose.s,
      size: [3, 11] as const,
      opacity: 0.36,
    };
  }
  private updateSmoke(ms: number, start: Point, b: TargetBounds, view: Point, s: number) {
    this.smoke.forEach((mesh, i) => {
      const birth = this.smokeBirth(i, start, b, view),
        q = birth ? (ms - birth.at) / birth.life : -1;
      mesh.visible = !!birth && q >= 0 && q < 1;
      if (!birth || !mesh.visible) return;
      const grow = birth.size[0] + (birth.size[1] - birth.size[0]) * Math.sqrt(q);
      mesh.position.set(
        birth.from.x + birth.drift * q + Math.sin(q * 5 + i) * 2 * q,
        birth.from.y + birth.rise * q,
        birth.from.z + 8,
      );
      mesh.scale.set(grow * Math.max(0.7, s), grow * 0.72 * Math.max(0.7, s), 1);
      mesh.material.opacity = Math.sin(Math.PI * q) * birth.opacity * 1.5;
    });
  }
  private updateDust(ms: number, b: TargetBounds, view: Point, s: number) {
    const p = this.plan,
      floor = dumpsterFloor(b, view),
      q = (ms - p.travel) / 650;
    const centre = dumpsterTouchdown(p, b, view).x;
    this.dust.forEach((mesh, i) => {
      mesh.visible = q >= 0 && q < 1;
      if (!mesh.visible) return;
      const side = i < 2 ? -1 : 1,
        far = i % 2,
        x = centre + side * (34 + far * 10) * s + side * (18 + far * 16) * s * Math.sqrt(q);
      mesh.position.set(x, -floor + (3 + far * 2) * s * q, 240);
      mesh.scale.set((3 + 5 * Math.sqrt(q)) * s, (2 + 3 * Math.sqrt(q)) * s, 1);
      mesh.material.opacity = Math.sin(Math.PI * q) * 0.5;
    });
  }
}
