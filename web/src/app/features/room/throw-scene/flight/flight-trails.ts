import * as THREE from 'three';
import { disposeObject } from '../engine/throw-models';
import type { Trail } from './projectile-motion';

const COLORS: Record<Exclude<Trail, 'none'>, readonly number[]> = {
  smoke: [0xbac8d2, 0xe0e7ea, 0xffae55],
  rainbow: [0xff719d, 0xffd866, 0x74e7a3, 0x7ecaff, 0xc39aff],
  gold: [0xffd866, 0xfff3bb],
  fire: [0xff743d, 0xffcf66],
  electric: [0x88f5ff, 0xbea3ff],
};
interface Puff {
  mesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  born: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  soft: boolean;
}

/** When a flight last left a puff, and how many it has left. */
export interface TrailWake {
  lastTrail: number;
  trailSequence: number;
}

export class FlightTrails {
  private readonly puffs: Puff[] = [];
  constructor(private readonly scene: THREE.Scene) {}
  get active() {
    return this.puffs.length > 0;
  }

  /** Leaves puffs behind an object in flight at its trail's cadence; small screens puff less. */
  follow(kind: Trail, position: THREE.Vector3, heading: number, now: number, wake: TrailWake) {
    const interval = (kind === 'smoke' ? 65 : 140) * (window.innerWidth < 600 ? 1.4 : 1);
    if (kind !== 'none' && now - wake.lastTrail >= interval) {
      this.emit(kind, position, heading, now, wake.trailSequence++);
      wake.lastTrail = now;
    }
  }

  emit(kind: Trail, position: THREE.Vector3, heading: number, now: number, sequence: number) {
    if (kind === 'none') return;
    const soft = kind === 'smoke';
    const colors = COLORS[kind];
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(soft ? 4 : 2.5, soft ? 10 : 4),
      new THREE.MeshBasicMaterial({
        color: colors[sequence % colors.length] ?? 0xffffff,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    );
    const spread = Math.sin(sequence * 2.4);
    const tail = kind === 'smoke' ? 28 : 19;
    const x = position.x - Math.cos(heading) * tail;
    const y = position.y - Math.sin(heading) * tail;
    mesh.position.set(x, y, position.z - 2);
    this.scene.add(mesh);
    this.puffs.push({
      mesh,
      born: now,
      x,
      y,
      vx: -Math.cos(heading) * 22 + spread * 13,
      vy: -Math.sin(heading) * 22 + (soft ? 25 : -15),
      life: soft ? 650 : 420,
      soft,
    });
    while (this.puffs.length > 180) {
      const oldest = this.puffs.shift();
      if (oldest) disposeObject(oldest.mesh);
    }
  }

  update(now: number) {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const puff = this.puffs[i];
      if (!puff) continue;
      const age = (now - puff.born) / puff.life;
      if (age >= 1) {
        disposeObject(puff.mesh);
        this.puffs.splice(i, 1);
        continue;
      }
      puff.mesh.position.x = puff.x + puff.vx * age;
      puff.mesh.position.y = puff.y + puff.vy * age;
      puff.mesh.material.opacity = (1 - age) * 0.65;
      puff.mesh.scale.setScalar(puff.soft ? 1 + age * 2.5 : 1 - age * 0.7);
      puff.mesh.rotation.z = age * 3;
    }
  }

  clear() {
    for (const puff of this.puffs) disposeObject(puff.mesh);
    this.puffs.length = 0;
  }
}
