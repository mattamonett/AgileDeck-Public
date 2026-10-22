import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import {
  blobShape,
  cardTurn,
  clamp,
  ease,
  glow,
  onCard,
  part,
  setStrip,
  type CardPose,
} from '../../kit';
import { BEAR_DURATION, type BearPlan } from './bear-choreography';
import type { BearLayout } from './bear-trick';

interface PrintMark {
  readonly group: THREE.Group;
  readonly materials: readonly THREE.MeshBasicMaterial[];
}

/** One honey paw print: rim, pad, four toes and a shine, all fading together. */
/** A honey paw print: darker rim, glossy pad, four toe beans and a highlight. */
function printMark(parent: THREE.Object3D, k: number): PrintMark {
  const group = new THREE.Group();
  group.name = `bear-print-${k}`;
  parent.add(group);
  const materials: THREE.MeshBasicMaterial[] = [];
  const ink = (color: number) => {
    const m = glow(color, 0);
    materials.push(m);
    return m;
  };
  part(
    group,
    'bear-print-rim',
    new THREE.ShapeGeometry(blobShape(k * 1.7, 3, 0.1)),
    ink(0xc27a12),
  ).scale.set(1.75, 1.35, 1);
  part(
    group,
    'bear-print-pad',
    new THREE.ShapeGeometry(blobShape(k * 1.7 + 0.4, 3, 0.1)),
    ink(0xf0aa2a),
    0,
    0,
    0.02,
  ).scale.set(1.45, 1.1, 1);
  for (let t = 0; t < 4; t++) {
    const a = Math.PI / 2 + (t - 1.5) * 0.48;
    const toe = part(
      group,
      'bear-print-toe',
      new THREE.CircleGeometry(1, 12),
      ink(0xe59c20),
      Math.cos(a) * 2.4,
      Math.sin(a) * 2.25 + 0.2,
      0.01,
    );
    toe.scale.set(0.58, 0.68, 1);
  }
  part(
    group,
    'bear-print-shine',
    new THREE.CircleGeometry(1, 10),
    ink(0xfff4c8),
    -0.45,
    0.35,
    0.04,
  ).scale.set(0.5, 0.28, 1);
  return { group, materials };
}

/** Honey paw prints pressed onto the card, and the bead of honey the first one runs down it. */
export class BearHoneyPrints {
  private readonly marks: PrintMark[];

  constructor(
    parent: THREE.Object3D,
    private readonly plan: BearPlan,
    private readonly drip: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>,
    private readonly cardZ: number,
  ) {
    this.marks = plan.prints.map((_, k) => printMark(parent, k));
  }

  update(ms: number, L: BearLayout, q: CardPose, pressed: readonly (Point | null)[], fade: number) {
    const p = this.plan;
    this.marks.forEach((mark, k) => {
      const uv = pressed[k],
        print = p.prints[k];
      mark.group.visible = !!uv && fade > 0 && ms < BEAR_DURATION;
      if (!uv || !print || !mark.group.visible) return;
      const at = onCard(q, uv.x, uv.y, L.b);
      mark.group.position.set(at.x, -at.y, this.cardZ - 0.5 + k * 0.01);
      mark.group.rotation.z = cardTurn(q) + L.side * print.turn;
      mark.group.scale.setScalar(1.25 * L.scale);
      const show = ease((ms - print.at) / 80) * fade;
      mark.materials.forEach(
        (m, i) => (m.opacity = (i === mark.materials.length - 1 ? 0.55 : 0.82) * show),
      );
    });
    // The first print stays sticky enough to run a thin bead of honey down the card.
    const first = pressed[0];
    const run = first ? clamp((ms - (p.prints[0]?.at ?? 0) - 260) / 1800) : 0;
    this.drip.visible = !!first && run > 0 && fade > 0 && ms < BEAR_DURATION;
    if (!first || !this.drip.visible) return;
    const length = 0.045 * ease(run);
    setStrip(
      this.drip.geometry,
      8,
      (t, out) => {
        const at = onCard(q, first.x + 0.01 * L.side, first.y + 0.025 + t * length, L.b);
        out.set(at.x, -at.y, this.cardZ - 0.4);
      },
      (t) =>
        (t > 0.8 ? 1.25 * Math.sin(Math.PI * Math.min(1, (t - 0.8) / 0.2 + 0.25)) : 0.8 - 0.3 * t) *
        L.scale,
    );
    this.drip.material.opacity = 0.85 * fade;
  }
}
