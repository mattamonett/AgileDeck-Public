import * as THREE from 'three';
import { seededRandom } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  clamp,
  glow,
  mix,
  onCard,
  part,
  setStrip,
  stripGeometry,
  type CardPose,
  type Side,
} from '../../kit';
import { quadGeometry } from './snowman-model';

export const FROST_SEGMENTS = 64;

export interface FrostSegment {
  readonly a: readonly [number, number];
  readonly b: readonly [number, number];
  readonly birth: number;
  readonly length: number;
  readonly width: number;
}

/** Branching frost from the near edge and the bottom edge, in card units (u across from the near edge, v down). */
export function frostPattern(seed: number): FrostSegment[] {
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

/** The layout the frost follows: which card edge is near, and how large the card is. */
export interface FrostLayout {
  readonly side: Side;
  readonly b: TargetBounds;
  readonly fit: number;
}

/** Branching frost and a frosted rim that creep over the card from its near and bottom edges. */
export class SnowmanFrost {
  private readonly segments: readonly FrostSegment[];
  private readonly halo: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly core: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly rims: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];

  constructor(
    parent: THREE.Object3D,
    seed: number,
    private readonly depth: number,
  ) {
    this.segments = frostPattern(seed);
    this.halo = part(parent, 'snowman-frost-halo', quadGeometry(FROST_SEGMENTS), glow(0x86c6e2, 0));
    this.core = part(parent, 'snowman-frost-core', quadGeometry(FROST_SEGMENTS), glow(0xf6fdff, 0));
    for (let i = 0; i < 2; i++)
      this.rims.push(part(parent, `snowman-frost-rim-${i}`, stripGeometry(16), glow(0xbfe5f5, 0)));
  }

  /** Draws the frost grown to `grown` (0 to 1) on the card pose `q`. */
  update(grown: number, g: FrostLayout, q: CardPose, fade: number) {
    const front = grown * 0.36;
    const live = grown > 0 && fade > 0;
    const near = (u: number) => (g.side > 0 ? u : 1 - u);
    for (const [mesh, scale, z] of [
      [this.halo, 2.2, this.depth - 12],
      [this.core, 1, this.depth - 11.9],
    ] as const) {
      mesh.visible = live;
      if (!live) continue;
      const positions = mesh.geometry.getAttribute('position');
      for (let i = 0; i < FROST_SEGMENTS; i++) {
        const seg = this.segments[i];
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
          out.set(at.x, -at.y, this.depth - 12.1);
        },
        (s) => (3.2 - 1.6 * s) * g.fit,
      );
      rim.material.opacity = 0.5 * fade;
    });
  }
}
