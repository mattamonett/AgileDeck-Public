import * as THREE from 'three';
import { seededRandom, type Point } from '../../flight/flight-math';
import {
  ease,
  glow,
  lowestWorldY,
  matte,
  outline,
  part,
  screenOf,
  setStrip,
  stripGeometry,
} from '../../kit';
import { BEAR_DURATION, type BearPlan } from './bear-choreography';
import type { BearLayout } from './bear-trick';

interface Crumb {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly bite: number;
  readonly shape: THREE.Vector3;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly dx: number;
}

/** Crumbs fall from the mouth at each bite and settle on their real geometry on the floor. */
export class BearCrumbs {
  private readonly crumbs: Crumb[] = [];

  constructor(
    parent: THREE.Object3D,
    private readonly plan: BearPlan,
    private readonly depth: number,
  ) {
    const p = plan;
    const r = seededRandom(`${p.phase}:bear-crumbs`);
    for (let k = 0; k < p.bites; k++)
      for (let i = 0; i < 4; i++) {
        const color = i % 3 === 1 ? 0xd2691e : i % 3 ? 0xe0ac63 : 0xbd7f42;
        const mesh = part(
          parent,
          `bear-crumb-${k}-${i}`,
          new THREE.DodecahedronGeometry(1, 0),
          matte(color, 0.8),
        );
        const shape = new THREE.Vector3(0.9 + r() * 0.5, 0.6 + r() * 0.3, 0.8 + r() * 0.3);
        this.crumbs.push({
          mesh,
          bite: k,
          shape,
          vx: (r() * 2 - 1) * 55,
          vy: -40 - r() * 50,
          spin: (r() * 2 - 1) * 9,
          dx: (r() - 0.5) * 4,
        });
      }
  }

  update(ms: number, L: BearLayout, births: readonly (Point | null)[], fade: number) {
    const g = 980;
    this.crumbs.forEach((c) => {
      const birth = births[c.bite],
        at = this.plan.biteTimes[c.bite] ?? 0;
      c.mesh.visible = !!birth && fade > 0 && ms < BEAR_DURATION;
      if (!birth || !c.mesh.visible) return;
      const e = (ms - at) / 1000,
        size = 0.75 * L.scale;
      const drop = Math.max(0, L.floor - birth.y - size);
      const land = (-c.vy + Math.sqrt(c.vy * c.vy + 2 * g * drop)) / g;
      const s = Math.min(e, land);
      const slide = e > land ? c.vx * 0.12 * ease((e - land) / 0.25) : 0;
      c.mesh.rotation.set(c.spin * s * 0.6, 0, c.spin * s);
      c.mesh.scale.copy(c.shape).multiplyScalar(size);
      c.mesh.position.set(
        birth.x + c.dx * L.scale + c.vx * s * 0.6 + slide,
        -(birth.y + c.vy * s + 0.5 * g * s * s),
        this.depth + 16 * L.scale,
      );
      c.mesh.updateMatrixWorld(true);
      const lowest = lowestWorldY(c.mesh);
      if (e >= land || lowest < -L.floor) c.mesh.position.y += -L.floor - lowest;
      c.mesh.material.transparent = fade < 1;
      c.mesh.material.opacity = fade;
    });
  }
}

/** Zs that drift up from the dozing bear's crown, away from the card. */
export class BearSleepZs {
  private readonly zs: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>[] = [];

  constructor(
    parent: THREE.Object3D,
    private readonly plan: BearPlan,
    private readonly crown: THREE.Object3D,
    private readonly depth: number,
  ) {
    const z = outline([
      [-1, 1],
      [1, 1],
      [1, 0.62],
      [-0.38, -0.62],
      [1, -0.62],
      [1, -1],
      [-1, -1],
      [-1, -0.62],
      [0.38, 0.62],
      [-1, 0.62],
    ]);
    for (let i = 0; i < 3; i++)
      this.zs.push(part(parent, `bear-z-${i}`, new THREE.ShapeGeometry(z), glow(0x6f86c9, 0)));
  }

  update(ms: number, L: BearLayout, fade: number) {
    const p = this.plan;
    const crown = p.ending !== 'waddle' && ms >= p.doze + 150 ? screenOf(this.crown) : null;
    this.zs.forEach((z, i) => {
      const age = (ms - p.doze - 150 - i * 520) / 1560;
      z.visible = !!crown && age >= 0 && fade > 0 && ms < BEAR_DURATION;
      if (!crown || !z.visible) return;
      const a = age % 1;
      // Zs drift away from the card so they never sit over the value.
      z.position.set(
        crown.x - L.side * (3 + 14 * a) * L.scale,
        -crown.y + (4 + 20 * a) * L.scale,
        this.depth + 30,
      );
      z.rotation.z = 0.25 * Math.sin(a * Math.PI * 2 + i) - L.side * 0.15;
      z.scale.setScalar((1.1 + 1.3 * a) * L.scale);
      z.material.opacity = 0.9 * Math.sin(Math.PI * a) * fade;
    });
  }
}

/** Steam wisps rising from the warm pie until the bear takes it. */
export class BearPieWisps {
  private readonly wisps: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];

  constructor(
    parent: THREE.Object3D,
    private readonly plan: BearPlan,
    private readonly cardZ: number,
  ) {
    for (let i = 0; i < 3; i++)
      this.wisps.push(part(parent, `bear-pie-wisp-${i}`, stripGeometry(10), glow(0xfff1dc, 0)));
  }

  update(ms: number, L: BearLayout, pie: THREE.Matrix4 | null) {
    const p = this.plan;
    const end = p.find === 'card' ? p.grab : p.hook;
    const strength = ease(ms / 300) * (1 - ease((ms - end + 300) / 300));
    const centre = pie ? new THREE.Vector3().setFromMatrixPosition(pie) : null;
    this.wisps.forEach((wisp, i) => {
      wisp.visible = strength > 0.01 && centre !== null;
      if (!wisp.visible || !centre) return;
      const baseX = centre.x + (i - 1) * 3.2 * L.scale,
        baseY = centre.y + 3 * L.scale,
        height = (11 + 3 * i) * L.scale;
      const drift = ms / 380 + i * 2.1 + p.phase;
      setStrip(
        wisp.geometry,
        10,
        (t, out) =>
          out.set(
            baseX + Math.sin(drift + t * 5) * 1.6 * L.scale * t,
            baseY + t * height,
            this.cardZ + 1,
          ),
        (t) => (1 - t * 0.7) * 1.3 * L.scale,
      );
      wisp.material.opacity = 0.32 * strength * (0.75 + 0.25 * Math.sin(drift * 1.7));
    });
  }
}
