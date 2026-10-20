import { ease } from '../../kit';
import * as THREE from 'three';
import { seededRandom, type Point } from '../../flight/flight-math';

const SEGMENTS = 40;
const SIDES = 8;

function flesh(color: number) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.23,
    metalness: 0.03,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function tube(color: number) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * SIDES * 3), 3),
  );
  const indices: number[] = [];
  for (let i = 0; i < SEGMENTS; i++)
    for (let j = 0; j < SIDES; j++) {
      const a = i * SIDES + j;
      const b = i * SIDES + ((j + 1) % SIDES);
      indices.push(a, b, a + SIDES, b, b + SIDES, a + SIDES);
    }
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, flesh(color));
  // Dynamic vertices cross the original bounding volume as the entrails are pulled.
  mesh.frustumCulled = false;
  return mesh;
}

/** A ripped abdominal cavity and two continuous, wet intestinal loops held in the claw. */
export class ZombieEntrails {
  readonly object = new THREE.Group();
  private readonly cavity = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), flesh(0x20070d));
  private readonly rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.2, 8, 28), flesh(0x961c32));
  private readonly strands = [tube(0xd96c7d), tube(0xa33250)];
  private readonly globs = Array.from(
    { length: 8 },
    (_, i) =>
      new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), flesh(i % 2 ? 0xb93349 : 0xf2a09d)),
  );
  private readonly pools = Array.from(
    { length: 5 },
    () => new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), flesh(0x751020)),
  );
  private readonly loop: number;
  private readonly strength: number;

  constructor(id: string) {
    const random = seededRandom(id + ':entrails');
    this.loop = 0.8 + random() * 0.4;
    this.strength = 0.9 + random() * 0.2;
    this.object.add(this.cavity, this.rim, ...this.strands, ...this.globs, ...this.pools);
    this.object.visible = false;
  }

  update(ms: number, origin: Point, grip: Point, floor: number, facing: number, fade: number) {
    const emerge = ease((ms - 4140) / 400);
    this.object.visible = emerge > 0 && fade > 0;
    const rip = ease((ms - 5050) / 210);
    const sag = (10 + Math.hypot(grip.x - origin.x, grip.y - origin.y) * 0.16) * this.strength;
    const anchor = {
      x: origin.x + (grip.x - origin.x) * rip,
      y: origin.y + (grip.y - origin.y) * rip + rip * 8,
    };
    this.cavity.position.set(origin.x, -origin.y, 20);
    this.cavity.scale.set(8.5 * emerge, 11 * emerge, 1.5);
    this.cavity.material.opacity = fade;
    this.rim.position.set(origin.x, -origin.y, 21);
    this.rim.scale.set(8.7 * emerge, 11.2 * emerge, 2);
    this.rim.material.opacity = fade;
    this.strands.forEach((strand, index) => {
      const positions = strand.geometry.getAttribute('position');
      const radius = (index ? 1.7 : 2.4) * emerge;
      for (let i = 0; i <= SEGMENTS; i++) {
        const t = i / SEGMENTS;
        const envelope = Math.sin(t * Math.PI);
        const wave = t * Math.PI * 6 + index * 1.4;
        const amplitude = 6 * this.loop * envelope * emerge;
        const x = anchor.x + (grip.x - anchor.x) * t + Math.sin(wave) * amplitude;
        const y = anchor.y + (grip.y - anchor.y) * t + envelope * sag + Math.cos(wave) * amplitude;
        const dx = grip.x - anchor.x + Math.cos(wave) * amplitude * Math.PI * 6;
        const dy =
          grip.y -
          anchor.y +
          Math.cos(t * Math.PI) * sag * Math.PI -
          Math.sin(wave) * amplitude * Math.PI * 6;
        const length = Math.max(0.01, Math.hypot(dx, dy));
        for (let j = 0; j < SIDES; j++) {
          const angle = (j / SIDES) * Math.PI * 2;
          positions.setXYZ(
            i * SIDES + j,
            x - (dy / length) * radius * Math.cos(angle),
            -y - (dx / length) * radius * Math.cos(angle),
            24 + index * 3 + Math.sin(angle) * radius,
          );
        }
      }
      positions.needsUpdate = true;
      strand.geometry.computeVertexNormals();
      strand.material.opacity = fade;
    });
    this.globs.forEach((glob, i) => {
      const age = Math.max(0, (ms - 4200 - i * 60) / 1000);
      glob.visible = ms >= 4200 + i * 60;
      const t = i / 8;
      glob.position.set(
        origin.x + facing * (t - 0.35) * Math.min(age, 0.7) * 85,
        -Math.min(floor, origin.y - age * (30 + i * 5) + age * age * 150),
        28,
      );
      glob.scale.set(1.5 + (i % 3), age > 0.9 ? 1 : 2 + (i % 2), 1);
      glob.rotation.z = age * (i - 3);
      glob.material.opacity = fade;
    });
    this.pools.forEach((pool, i) => {
      const spread = ease((ms - 4570 - i * 90) / 1100);
      pool.visible = spread > 0;
      pool.position.set(origin.x + facing * (i - 2) * 6, -floor, 18);
      pool.scale.set((6 + (i % 3) * 2) * spread, (2 + (i % 2)) * spread, 0.6);
      pool.material.opacity = fade;
    });
  }
}
