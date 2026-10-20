import { ease } from '../../kit';
import * as THREE from 'three';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';

function wet(color: number) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.2,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
}
interface Shred {
  readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  readonly delay: number;
  readonly speed: number;
  readonly lift: number;
  readonly width: number;
}

/** Saw-specific aftermath: shredded tissue and blood flung by the chain, then dangling bowel. */
export class SawGore {
  readonly object = new THREE.Group();
  private readonly shreds: Shred[] = [];
  private readonly guts: THREE.Mesh<THREE.TubeGeometry, THREE.MeshStandardMaterial>[] = [];
  private readonly pools: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>[] = [];
  private readonly cavity = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), wet(0x1c040b));
  private readonly rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.16, 8, 28), wet(0x992039));
  private readonly phase: number;
  constructor(id: string) {
    const random = seededRandom(id + ':saw-viscera');
    this.phase = random() * Math.PI * 2;
    this.cavity.visible = this.rim.visible = false;
    this.object.add(this.cavity, this.rim);
    for (let i = 0; i < 48; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 10, 8),
        wet(i % 4 ? 0xab182f : 0xdb8593),
      );
      mesh.visible = false;
      this.shreds.push({
        mesh,
        delay: 1050 + random() * 1500,
        speed: 30 + random() * 110,
        lift: 45 + random() * 120,
        width: 1.2 + random() * 2,
      });
      this.object.add(mesh);
    }
    for (let i = 0; i < 4; i++) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(-0.25, -0.2, 0.1),
        new THREE.Vector3(0.35, -0.4, 0.2),
        new THREE.Vector3(-0.28, -0.65, 0.1),
        new THREE.Vector3(0.28, -0.88, 0.2),
        new THREE.Vector3(-0.1, -1.05, 0.1),
        new THREE.Vector3(0.08, -0.65, 0),
      ]);
      const gut = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 32, 0.055, 8, false),
        wet(i % 2 ? 0xb93755 : 0xdf798b),
      );
      gut.visible = false;
      this.guts.push(gut);
      this.object.add(gut);
    }
    for (let i = 0; i < 6; i++) {
      const pool = new THREE.Mesh(
        new THREE.SphereGeometry(1, 12, 8),
        wet(i % 2 ? 0x721022 : 0x98192e),
      );
      pool.visible = false;
      this.pools.push(pool);
      this.object.add(pool);
    }
  }
  update(
    ms: number,
    b: TargetBounds,
    facing: number,
    pressure: number,
    fade: number,
    contact: (time: number) => Point,
  ) {
    this.shreds.forEach((shred, i) => {
      const age = (ms - shred.delay) / 1000;
      const point = contact(shred.delay);
      const floor = b.top + b.height + 10;
      const inside =
        point.x > b.left &&
        point.x < b.left + b.width &&
        point.y > b.top &&
        point.y < b.top + b.height;
      const fall =
        (shred.lift + Math.sqrt(shred.lift ** 2 + 880 * Math.max(0, floor - point.y))) / 440;
      const t = Math.min(Math.max(0, age), fall);
      shred.mesh.visible = age >= 0 && inside && fade > 0;
      shred.mesh.position.set(
        point.x + facing * shred.speed * t * pressure,
        -Math.min(floor, point.y - shred.lift * t + 220 * t * t),
        24,
      );
      shred.mesh.scale.set(
        shred.width * (age > fall ? 1.9 : 1),
        shred.width * (age > fall ? 0.55 : i % 4 ? 1.5 : 1),
        0.7,
      );
      shred.mesh.rotation.z = t * ((i % 7) - 3);
      shred.mesh.material.opacity = fade;
    });
    const onCard = (p: Point) =>
      p.x >= b.left + 6 &&
      p.x <= b.left + b.width - 6 &&
      p.y >= b.top + 6 &&
      p.y <= b.top + b.height - 8;
    let point = contact(Math.min(ms, 2100));
    if (!onCard(point))
      for (let time = 1100; time <= Math.min(ms - 100, 2100); time += 120) {
        const candidate = contact(time);
        if (onCard(candidate)) point = candidate;
      }
    const inside = onCard(point);
    const opened = ease((ms - 1750) / 700);
    this.cavity.visible = this.rim.visible = inside && opened > 0 && fade > 0;
    this.cavity.position.set(point.x, -point.y, 18);
    this.cavity.scale.set(5.5 * opened, 9 * opened * pressure, 0.5);
    this.rim.position.set(point.x, -point.y, 19);
    this.rim.scale.set(5.8 * opened, 9.2 * opened * pressure, 1.8);
    this.cavity.material.opacity = this.rim.material.opacity = fade;
    this.guts.forEach((gut, i) => {
      const grow = ease((ms - 1800 - i * 120) / 600);
      gut.visible = inside && grow > 0 && fade > 0;
      gut.position.set(point.x + facing * (i - 1.5) * 2, -point.y + i * 2, 20 + i);
      gut.scale.set((22 + i * 3) * grow, (28 + i * 7) * grow * pressure, 12 * grow);
      gut.rotation.z = Math.sin(ms / 270 + this.phase + i * 0.6) * 0.07 * grow;
      gut.material.opacity = fade;
    });
    this.pools.forEach((pool, i) => {
      const grow = ease((ms - 2200 - i * 110) / 1500);
      pool.visible = inside && grow > 0 && fade > 0;
      pool.position.set(point.x + facing * (i - 2) * 7, -(b.top + b.height + 11 + (i % 2) * 2), 18);
      pool.scale.set((7 + (i % 3) * 3) * grow, (2 + (i % 2)) * grow, 0.8);
      pool.material.opacity = fade;
    });
  }
}
