import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { makeRabbit, rabbitPose } from './hat-model';
import {
  HAT_DURATION,
  HAT_SCALE,
  HAT_DEPTH,
  hatPlan,
  hatRabbitRise,
  hatCardPose,
  hatStagePoint,
  type HatPlan,
} from './hat-choreography';
export { makeTopHat } from './hat-model';

function glintShape() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const r = i % 2 ? 0.28 : 1;
    if (i === 0) shape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
    else shape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  shape.closePath();
  return shape;
}
export class HatTrick {
  readonly object = new THREE.Group();
  readonly plan: HatPlan;
  get duration() {
    return HAT_DURATION * this.plan.pace;
  }
  private readonly rabbit = makeRabbit();
  private readonly clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly puffs = Array.from({ length: 10 }, (_, i) => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 8),
      new THREE.MeshBasicMaterial({
        color: i % 2 ? 0xcbaadf : 0xf1e1bc,
        transparent: true,
        depthWrite: false,
      }),
    );
    mesh.name = 'magic-puff';
    return mesh;
  });
  private readonly glints = Array.from(
    { length: 16 },
    (_, i) =>
      new THREE.Mesh(
        new THREE.ShapeGeometry(glintShape()),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? 0xe7afef : 0xf5d187,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      ),
  );
  constructor(id = 'landing') {
    this.plan = hatPlan(id);
    this.object.add(this.rabbit, ...this.puffs, ...this.glints);
    this.rabbit.traverse((part) => {
      if (part instanceof THREE.Mesh) {
        const materials = Array.isArray(part.material) ? part.material : [part.material];
        for (const material of materials) material.clippingPlanes = [this.clip];
      }
    });
    for (const child of this.object.children) child.visible = false;
  }
  cardAnimation() {
    const frames: Keyframe[] = [];
    for (let ms = 0; ms <= HAT_DURATION; ms += 20) {
      const pose = hatCardPose(ms, this.plan);
      frames.push({
        offset: ms / HAT_DURATION,
        translate: pose.y === 0 ? '0 0' : '0px ' + pose.y + 'px',
        scale: '1 ' + pose.sy,
      });
    }
    return { frames, options: { duration: this.duration, easing: 'linear' } };
  }
  update(ms: number, hat: THREE.Group, b: TargetBounds, end: Point) {
    ms = Math.round((ms / this.plan.pace) * 1e6) / 1e6;
    const stage = hatStagePoint(ms, this.plan, b, end);
    const side = this.plan.spot.x < 0.5 ? -1 : 1;
    const wiggle =
      ms < 550
        ? Math.sin(ms / 70) * this.plan.wiggle * Math.sin(Math.min(1, ms / 550) * Math.PI)
        : 0;
    const bow =
      ms >= 3050 && ms < 3650 ? Math.sin(((ms - 3050) / 600) * Math.PI) * this.plan.bow * side : 0;
    const angle = wiggle + bow;
    hat.scale.setScalar(HAT_SCALE);
    hat.rotation.set(0, 0, angle);
    hat.visible = ms < this.plan.vanish;
    hat.position.set(
      stage.x - HAT_DEPTH * HAT_SCALE * Math.sin(angle),
      -stage.y - HAT_DEPTH * HAT_SCALE * (1 - Math.cos(angle)),
      160,
    );
    this.object.position.set(stage.x - end.x, end.y - stage.y, 20);
    const rise = hatRabbitRise(ms, this.plan);
    this.rabbit.visible = ms >= 550 && ms < 950 + this.plan.peekPause + 1700;
    this.rabbit.scale.setScalar(HAT_SCALE);
    this.rabbit.position.set(0, rise * HAT_SCALE, 0);
    rabbitPose(this.rabbit, ms, this.plan, rise);
    this.clip.constant = stage.y - 0.4;
    const pop = 950 + this.plan.peekPause;
    const revealAge = (ms - pop) / 1000;
    const vanishAge = (ms - this.plan.vanish + 120) / 1000;
    const vanishing = vanishAge >= 0;
    const age = vanishing ? vanishAge : revealAge;
    this.puffs.forEach((puff, i) => {
      const angle = (i * Math.PI * 2) / this.puffs.length;
      const life = vanishing ? 0.8 : 0.45;
      puff.visible = age >= 0 && age < life;
      puff.position.set(
        Math.cos(angle) * (8 + age * 32),
        (vanishing ? -12 : 4) + Math.sin(angle) * (4 + age * 17) + age * 15,
        8,
      );
      puff.scale.setScalar((3 + age * (vanishing ? 13 : 8)) * this.plan.strength);
      puff.material.opacity = Math.max(0, 1 - age / life) * (vanishing ? 0.6 : 0.4);
    });
    this.glints.forEach((glint, i) => {
      const angle = (i * Math.PI * 2) / this.glints.length + age * side * 2;
      const life = vanishing ? 1.1 : 0.85;
      glint.visible = age >= 0 && age < life;
      glint.position.set(
        Math.cos(angle) * (12 + age * 22),
        (vanishing ? -10 : 8) + Math.sin(angle) * (8 + age * 15) + age * (14 + (i % 3) * 10),
        10,
      );
      glint.rotation.z = angle;
      glint.scale.setScalar(
        (2 + (i % 3)) * this.plan.strength * Math.sin(Math.min(1, age / life) * Math.PI),
      );
      glint.material.opacity = Math.max(0, 1 - age / life);
    });
  }
}
