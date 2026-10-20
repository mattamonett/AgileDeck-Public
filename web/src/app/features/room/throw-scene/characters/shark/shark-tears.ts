import { clamp } from '../../kit';
import * as THREE from 'three';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  sharkEase,
  sharkBitePoint,
  sharkCardPoint,
  sharkCardPose,
  sharkActorPose,
  sharkTipWorld,
  type SharkPlan,
} from './shark-choreography';
function wet(color: number) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.2,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
}
function blob(color: number) {
  return new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), wet(color));
}
const up = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
export class SharkTears {
  readonly object = new THREE.Group();
  private readonly wounds;
  private readonly meal = new THREE.Group();
  private readonly trail = Array.from({ length: 8 }, () => blob(0xb52a42));
  constructor(id: string, plan: SharkPlan) {
    const random = seededRandom(id + ':shark-tears');
    this.wounds = plan.bites.map((contact, index) => {
      const wound = new THREE.Group();
      wound.name = 'shark-bite-wound';
      const hole = blob(0x250810);
      hole.scale.set(8, 11, 0.6);
      wound.add(hole);
      for (let i = 0; i < 12; i++) {
        const flesh = blob(i % 3 ? 0xa82943 : 0xe88b92);
        const a = (i / 12) * Math.PI * 2;
        flesh.position.set(Math.cos(a) * 8, Math.sin(a) * 11, 1);
        flesh.scale.set(2.1 + random(), 2.2 + random() * 2, 1.1);
        flesh.rotation.z = -a;
        wound.add(flesh);
      }
      const points = Array.from({ length: 25 }, (_, i) => {
        const t = i / 24;
        return new THREE.Vector3(
          Math.sin(t * Math.PI * 5 + index) * 0.22 * Math.sin(t * Math.PI),
          -t + Math.sin(t * Math.PI * 6) * 0.09,
          0.03 * Math.sin(t * Math.PI * 4),
        );
      });
      const bowel = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, 0.065, 8, false),
        wet(0xd97c89),
      );
      bowel.name = 'shark-hanging-entrail';
      const strand = Array.from(
        { length: 12 },
        () => new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 1, 8), wet(0xd47a86)),
      );
      for (const part of strand) part.name = 'shark-flesh-strand';
      const blood = Array.from({ length: 18 }, (_, i) => {
        const mesh = blob(i % 4 ? 0xb51d38 : 0xdb7883);
        mesh.name = 'shark-blood';
        return {
          mesh,
          vx: 15 + random() * 75,
          vy: 25 + random() * 90,
          delay: random() * 65,
          size: 1 + random() * 1.4,
        };
      });
      const pool = blob(0x76112a);
      pool.name = 'shark-blood-pool';
      this.object.add(wound, bowel, ...strand, ...blood.map((b) => b.mesh), pool);
      return { contact, index, wound, bowel, strand, blood, pool };
    });
    this.meal.name = 'shark-held-flesh';
    for (let i = 0; i < 4; i++) {
      const flesh = blob(i % 2 ? 0xb83650 : 0xdf8d94);
      flesh.position.set((i - 1.5) * 2.5, -i * 1.7, i * 0.2);
      flesh.scale.set(3.2 - i * 0.3, 3.6, 1.3);
      this.meal.add(flesh);
    }
    this.object.add(this.meal, ...this.trail);
    for (const part of this.object.children) part.visible = false;
  }
  update(
    ms: number,
    plan: SharkPlan,
    b: TargetBounds,
    end: Point,
    viewport: Point,
    facing: number,
    grip: Point,
    fade: number,
  ) {
    for (const w of this.wounds) {
      const age = (ms - w.contact) / 1000;
      const raw = sharkBitePoint(plan, b, facing, w.index);
      const p = sharkCardPoint(ms, raw, b, plan, facing);
      const grow = sharkEase(age / 0.13);
      w.wound.visible = age >= 0 && fade > 0;
      w.wound.position.set(p.x, -p.y, 25);
      w.wound.scale.setScalar(grow * plan.force);
      w.wound.rotation.z = (-sharkCardPose(ms, plan, facing).angle * Math.PI) / 180;
      w.wound.traverse((part) => {
        if (part instanceof THREE.Mesh) part.material.opacity = fade;
      });
      const hanging = sharkEase((age - 0.35) / 0.55);
      w.bowel.visible = hanging > 0 && fade > 0;
      w.bowel.position.set(p.x, -p.y, 29);
      w.bowel.scale.set(
        10 * hanging,
        Math.min(48, b.top + b.height - p.y + 6) * hanging,
        8 * hanging,
      );
      w.bowel.rotation.z =
        facing * Math.sin((ms - w.contact) / 170) * 0.08 * Math.exp(-Math.max(0, age - 0.9));
      w.bowel.material.opacity = fade;
      for (const [i, part] of w.strand.entries()) {
        const at = (t: number) => ({
          x: p.x + (grip.x - p.x) * t,
          y:
            p.y +
            (grip.y - p.y) * t +
            Math.sin(t * Math.PI * 3) * Math.sin(t * Math.PI) * 3 * sharkEase(age / 0.2),
        });
        const a = at(i / 12);
        const z = at((i + 1) / 12);
        part.visible = age >= 0.04 && age < 0.35 && fade > 0;
        direction.set(z.x - a.x, a.y - z.y, 0);
        const length = direction.length();
        part.position.set((a.x + z.x) / 2, -(a.y + z.y) / 2, 30);
        part.quaternion.setFromUnitVectors(up, direction.normalize());
        part.scale.set(1, length + 0.2, 1);
        part.material.opacity = fade;
      }
      for (const [i, drop] of w.blood.entries()) {
        const life = age - drop.delay / 1000;
        const t = Math.max(0, life);
        drop.mesh.visible = life >= 0 && life < 1.6 && fade > 0;
        drop.mesh.position.set(
          p.x - facing * drop.vx * t * plan.force,
          -Math.min(b.top + b.height + 8, p.y - drop.vy * t + t * t * 170),
          32,
        );
        drop.mesh.scale.set(drop.size, i % 4 ? drop.size * 1.5 : drop.size * 2.4, 1.1);
        drop.mesh.rotation.z = facing * life * 3;
        drop.mesh.material.opacity = fade * clamp((1.6 - life) / 0.3);
      }
      const spread = sharkEase((age - 0.55) / 1);
      w.pool.visible = spread > 0 && fade > 0;
      w.pool.position.set(p.x - facing * 10, -b.top - b.height - 8, 20);
      w.pool.scale.set(10 * spread * plan.force, 2.3, 0.5);
      w.pool.material.opacity = fade;
    }
    const first = plan.bites[0] ?? 650;
    this.meal.visible = ms >= first + 140 && fade > 0;
    this.meal.position.set(grip.x, -grip.y, 31);
    this.meal.rotation.z = facing * Math.sin(ms / 190) * 0.12;
    this.meal.traverse((part) => {
      if (part instanceof THREE.Mesh) part.material.opacity = fade;
    });
    this.trail.forEach((drop, i) => {
      const release = plan.departure + 180 + i * 120;
      const age = (ms - release) / 1000;
      const at = sharkTipWorld(sharkActorPose(release, plan, b, end, viewport, facing));
      drop.visible = age >= 0 && age < 1.1 && fade > 0;
      drop.position.set(
        at.x - facing * age * 12,
        -Math.min(viewport.y + 10, at.y + age * age * 120),
        31,
      );
      drop.scale.set(1.2, 2.3, 1);
      drop.material.opacity = fade * clamp((1.1 - age) / 0.25);
    });
  }
}
