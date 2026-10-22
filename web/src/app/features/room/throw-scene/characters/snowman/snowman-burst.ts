import * as THREE from 'three';
import { seededRandom, type Point } from '../../flight/flight-math';
import { ease, glow, lowestWorldY, matte, part, type Side } from '../../kit';
import {
  PAT_INTERVAL,
  SNOWMAN_GRAVITY,
  snowmanBlastAt,
  snowmanPatContact,
  type SnowmanPlan,
} from './snowman-choreography';
import { SNOW, flakeGeometry } from './snowman-model';
import type { SculptureVolume } from './snowman-sculpture';

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

/** The layout the snow follows, recomputed every frame. */
export interface BurstLayout {
  readonly side: Side;
  readonly fit: number;
  readonly sc: number;
  readonly floor: number;
  /** Floor point under the finished snowball and the sculpture. */
  readonly base: Point;
}

/**
 * The snow around the sculpture: the sneeze spray, pat puffs, the chunks and
 * powder of the burst, the heap it leaves and the flakes that settle after.
 */
export class SnowmanBurst {
  private readonly mound: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private readonly chunks: Chunk[] = [];
  private readonly spray: Puff[] = [];
  private readonly powder: Puff[] = [];
  private readonly patPuffs: Puff[] = [];
  private readonly flakes: Puff[] = [];
  private readonly scratch = new THREE.Vector3();
  private readonly blastAt: number;

  constructor(
    parent: THREE.Object3D,
    private readonly plan: SnowmanPlan,
    private readonly sculpture: THREE.Object3D,
    private readonly volumes: readonly SculptureVolume[],
    private readonly depth: number,
  ) {
    this.blastAt = snowmanBlastAt(plan);
    const r = seededRandom(`${plan.phase}:snowman-snow`);
    this.mound = part(
      parent,
      'snowman-mound',
      new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      matte(SNOW, 0.95),
    );

    for (let i = 0; i < 12; i++) {
      const mesh = part(
        parent,
        `snowman-chunk-${i}`,
        new THREE.IcosahedronGeometry(1, 0),
        matte(i % 3 ? SNOW : 0xdce9f3, 0.95),
      );
      mesh.scale.set(1, 0.8, 0.9);
      this.chunks.push({
        mesh,
        volume: i % Math.max(1, volumes.length),
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
          mesh: part(parent, `${name}-${i}`, geometry(), glow(color, 0)),
          a: r(),
          b: r(),
          c: r(),
        });
    };
    puff(this.spray, 'snowman-sneeze-spray', 7, 0xe6f4fc, () => new THREE.CircleGeometry(1, 16));
    puff(this.powder, 'snowman-powder', 10, 0xeef8ff, () => new THREE.CircleGeometry(1, 16));
    puff(this.patPuffs, 'snowman-pat-puff', 3, 0xf2f9ff, () => new THREE.CircleGeometry(1, 12));
    puff(this.flakes, 'snowman-flake', 6, 0xcfe8f7, flakeGeometry);
  }

  /** `nose` is where the sneeze leaves the face; `patPoint` is where pat `k` lands. */
  update(ms: number, g: BurstLayout, fade: number, nose: Point, patPoint: (k: number) => Point) {
    this.updateFallout(ms, g, fade);
    this.updatePuffs(ms, g, fade, nose, patPoint);
  }

  private updateFallout(ms: number, g: BurstLayout, fade: number) {
    const p = this.plan,
      sc = g.sc;
    const age = ms - this.blastAt;
    const blown = age >= 0 && fade > 0;
    const R = p.ballEnd;
    // The sad little heap left where the sculpture stood.
    this.mound.visible = blown;
    this.mound.position.set(g.base.x, -g.floor, this.depth + 2);
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
      const land =
        (-vy + Math.sqrt(vy * vy + 2 * SNOWMAN_GRAVITY * Math.max(0, floor - born.y))) /
        SNOWMAN_GRAVITY;
      const k = Math.min(age, land);
      const slide = age > land ? vx * 60 * (1 - Math.exp(-(age - land) / 60)) : 0;
      const x = born.x + vx * k + slide;
      const turn = Math.min(age, land) / 1000;
      chunk.mesh.rotation.set(chunk.spin.x * turn, chunk.spin.y * turn, chunk.spin.z * turn);
      chunk.mesh.scale.set(size, size * 0.8, size * 0.9);
      chunk.mesh.position.set(x, 0, this.depth + 1 + chunk.depth * 0.1);
      chunk.mesh.updateMatrixWorld(true);
      const low = lowestWorldY(chunk.mesh);
      const flying = -(born.y + vy * age + 0.5 * SNOWMAN_GRAVITY * age * age);
      // Never below the floor: once it touches down it rests on its own lowest point.
      chunk.mesh.position.y = Math.max(flying, -floor - low);
      chunk.mesh.material.transparent = true;
      chunk.mesh.material.opacity = fade;
    }
  }

  private updatePuffs(
    ms: number,
    g: BurstLayout,
    fade: number,
    nose: Point,
    patPoint: (k: number) => Point,
  ) {
    const p = this.plan,
      sc = g.sc,
      fit = g.fit;
    const R = p.ballEnd;
    // Sneeze spray from the nose tip toward the sculpture.
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
        this.depth + 12,
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
        this.depth + 10,
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
      const marker = patPoint(k);
      const a = -Math.PI / 2 + (i - 1) * 0.9 + puff.a * 0.3;
      const d = (3 + 8 * ease(age / 380)) * fit;
      puff.mesh.position.set(
        marker.x + Math.cos(a) * d,
        -(marker.y + Math.sin(a) * d),
        this.depth + 12,
      );
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
        this.depth + 11,
      );
      flake.mesh.rotation.z = settled ? 0.5 * i : t / 600 + i;
      flake.mesh.scale.setScalar((1.6 + flake.c) * fit);
      flake.mesh.material.opacity = 0.9 * fade;
    });
  }
}
