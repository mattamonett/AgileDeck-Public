import * as THREE from 'three';
import { seededRandom, type Point } from '../flight/flight-math';

export const LIGHTNING_CONTACT_MS = 420;

/** A short, target-anchored storm: gather, strike, then dissolve. */
export class LightningStorm {
  readonly object = new THREE.Group();
  private readonly cloud = new THREE.Group();
  private readonly puffs: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>[] = [];
  private readonly bolts: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>[] = [];

  constructor(id: string) {
    const random = seededRandom(id + ':storm');
    for (let i = 0; i < 7; i++) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(12 + random() * 5, 12, 8),
        new THREE.MeshStandardMaterial({
          color: i % 2 ? 0x303746 : 0x444d5d,
          roughness: 1,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      puff.position.set((i - 3) * 10, i % 2 ? 5 : -2, 2 + random() * 4);
      puff.scale.set(1.2, 0.75, 0.65);
      this.puffs.push(puff);
      this.cloud.add(puff);
    }
    this.object.add(this.cloud);
    for (let i = 0; i < 3; i++) {
      const shape = new THREE.Shape();
      const lean = (i - 1) * 8;
      shape.moveTo(-3, 0);
      shape.lineTo(lean - 9, -0.4);
      shape.lineTo(lean - 1, -0.4);
      shape.lineTo(-5, -0.72);
      shape.lineTo(1, -0.67);
      shape.lineTo(0, -1);
      shape.lineTo(12, -0.54);
      shape.lineTo(4, -0.56);
      shape.lineTo(lean + 10, -0.3);
      shape.lineTo(lean + 1, -0.3);
      shape.lineTo(3, 0);
      shape.closePath();
      const bolt = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshBasicMaterial({
          color: i === 1 ? 0xf4faff : 0xafe8ff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      bolt.visible = false;
      this.bolts.push(bolt);
      this.object.add(bolt);
    }
  }

  update(elapsed: number, target: Point, targetTop: number): void {
    const cloudY = Math.max(26, targetTop - 48);
    this.object.position.set(target.x, -cloudY, 100);
    const gather = Math.min(1, Math.max(0, elapsed / 240));
    const fade = Math.max(0, Math.min(1, (1000 - elapsed) / 300));
    this.object.visible = elapsed < 1000;
    this.cloud.scale.setScalar(0.3 + 0.7 * (1 - Math.pow(1 - gather, 3)));
    for (const puff of this.puffs) puff.material.opacity = gather * fade * 0.95;
    for (let i = 0; i < this.bolts.length; i++) {
      const bolt = this.bolts[i];
      if (!bolt) continue;
      const age = elapsed - (300 + i * 90);
      bolt.visible = age >= 0 && age < 300;
      const reach = Math.min(1, Math.max(0, age / 120));
      bolt.position.set((i - 1) * 14, -7, 12 + i);
      bolt.scale.set(1, Math.max(1, target.y - cloudY - 7) * reach, 1);
      bolt.material.opacity = Math.max(0, Math.min(1, (300 - age) / 180));
    }
  }
}
