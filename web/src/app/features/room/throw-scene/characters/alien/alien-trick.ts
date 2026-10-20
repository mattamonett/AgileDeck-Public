import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { requireSceneObject } from '../../engine/scene-object';
import { clamp, ease } from '../../kit';
import { alienReach, alienWalk, ring } from './alien-model';
import {
  ALIEN_DURATION,
  alienPlan,
  alienCardAnimation,
  alienCardPoint,
  alienCardPose,
  beat,
  type AlienPlan,
} from './alien-choreography';
export { makeAlien, alienWalk } from './alien-model';
export { ALIEN_DURATION, alienCardAnimation } from './alien-choreography';
export function alienTravel(
  alien: THREE.Group,
  plan: AlienPlan,
  progress: number,
  facing: number,
  distance: number,
) {
  alien.rotation.set(0, 0, 0);
  alien.scale.set(0.8 * facing, 0.8, 0.8);
  const walking = clamp(progress / 0.08) * (1 - beat(progress, 0.85, 1));
  alienWalk(alien, distance / 120, facing, walking);
  const head = requireSceneObject(alien, 'head');
  head.rotation.z = -0.13 * Math.sin(progress * Math.PI) + Math.sin(distance / 18) * 0.02 * walking;
  head.rotation.y = Math.sin(progress * Math.PI) * 0.12;
  const blink = 1 - Math.sin(clamp((progress - plan.blink) / 0.055) * Math.PI) * 0.93;
  for (const side of [-1, 1]) requireSceneObject(head, `eye-${side}`).scale.y = blink;
  alienReach(alien, 'lifting', 13, -3, 0);
  alienReach(alien, 'probe', 14, 2, -0.45);
}

/** Lift, scan, optionally startle itself, replace the card, then beam home. */
export class AlienTrick {
  readonly object = new THREE.Group();
  readonly plan: AlienPlan;
  private readonly reticles = [ring(7, 0x4dffc8, Math.PI * 1.6), ring(10, 0x203957, Math.PI * 1.7)];
  private readonly underside = new THREE.Mesh(
    new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(new Float32Array(9), 3),
    ),
    new THREE.MeshBasicMaterial({
      color: 0x5af3cd,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  private readonly scan = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color: 0x52efbf,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  private readonly sparks: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly beamRings = [ring(20, 0x267b9b), ring(18, 0x46d8bc), ring(16, 0x274761)];
  private readonly beamColumn = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 1),
    new THREE.MeshBasicMaterial({
      color: 0x329dba,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  private readonly tipWorld = new THREE.Vector3();
  constructor(id: string, plan?: AlienPlan) {
    this.plan = plan ?? alienPlan(id);
    this.underside.frustumCulled = false;
    this.object.add(
      ...this.reticles,
      this.scan,
      this.underside,
      this.beamColumn,
      ...this.beamRings,
    );
    for (let i = 0; i < 6; i++) {
      const spark = ring(1.8, i % 2 ? 0xffcb77 : 0x66ffd1);
      this.sparks.push(spark);
      this.object.add(spark);
    }
  }
  get duration() {
    return ALIEN_DURATION * this.plan.pace;
  }
  cardAnimation(facing: number, bounds?: TargetBounds) {
    return alienCardAnimation(facing, this.plan, bounds);
  }

  update(elapsed: number, alien: THREE.Group, b: TargetBounds, end: Point, viewport: Point) {
    const ms = elapsed / this.plan.pace;
    const facing = end.x < b.left + b.width / 2 ? 1 : -1;
    const pose = alienCardPose(this.plan, ms, facing);
    const reach = beat(ms, 120, 400) * (1 - beat(ms, 3000, 3270));
    const probing = beat(ms, 870, 1060) * (1 - beat(ms, 2410, 2680));
    const recoil = this.plan.malfunction ? beat(ms, 2070, 2160) * (1 - beat(ms, 2400, 2660)) : 0;
    const exit = beat(ms, 3550, 4180);
    const space = facing > 0 ? end.x - 24 : viewport.x - 24 - end.x;
    const distance = Math.min(this.plan.exitDistance, Math.max(0, space));
    const beam = beat(ms, 4190, 4660);
    alien.position.set(
      end.x + facing * (pose.lift * 3 - recoil * 5 - exit * distance),
      -end.y + beam * 85,
      140,
    );
    const turn = beat(ms, 3480, 3650);
    alien.rotation.set(0, Math.sin(turn * Math.PI) * 1.15, recoil * facing * 0.12);
    alien.scale.set(0.8 * facing, 0.8, 0.8);
    alien.visible = ms < ALIEN_DURATION;
    alienWalk(
      alien,
      (exit * distance) / 120,
      facing,
      ms > 3550 && ms < 4180 ? Math.sin(exit * Math.PI) : 0,
    );
    alien.scale.x = 0.8 * facing * (1 - turn * 2);
    const head = requireSceneObject(alien, 'head');
    head.rotation.z =
      -reach * 0.16 +
      recoil * 0.32 +
      beat(ms, 2780, 2900) * (1 - beat(ms, 3200, 3400)) * (this.plan.malfunction ? 0.2 : -0.12);
    head.rotation.y = -beat(ms, 3300, 3530) * 0.35 * (1 - exit);
    const blink = 1 - Math.sin(clamp((ms - 2850) / 140) * Math.PI) * 0.94;
    for (const side of [-1, 1]) requireSceneObject(head, `eye-${side}`).scale.y = blink;
    requireSceneObject(head, 'mouth').scale.y = 0.7 + recoil * 1.8;
    const hand = alienCardPoint(this.plan, b, ms, facing, facing > 0 ? 0.015 : 0.985, 0.94);
    const fraction = (Math.sin(((ms - 1000) / 1200) * Math.PI * 2 * this.plan.scans) + 1) / 2;
    const tip = alienCardPoint(
      this.plan,
      b,
      ms,
      facing,
      facing > 0 ? 0.06 + fraction * 0.12 : 0.94 - fraction * 0.12,
      0.92,
    );
    const cos = Math.cos(alien.rotation.z);
    const sin = Math.sin(alien.rotation.z);
    const localX = (p: Point) =>
      ((p.x - alien.position.x) * cos + (-p.y - alien.position.y) * sin) / (0.8 * facing);
    const localY = (p: Point) =>
      (-(p.x - alien.position.x) * sin + (-p.y - alien.position.y) * cos) / 0.8;
    const scrutiny = beat(ms, 2680, 2820) * (1 - beat(ms, 3240, 3460));
    const tap = this.plan.malfunction ? beat(ms, 3130, 3250) * (1 - beat(ms, 3330, 3450)) : 0;
    const salute = this.plan.malfunction ? 0 : beat(ms, 3200, 3320) * (1 - beat(ms, 3410, 3530));
    alienReach(
      alien,
      'lifting',
      13 + (localX(hand) - 13) * reach + tap * 4,
      -3 + (localY(hand) + 3) * reach + tap * 9 + salute * 19,
      ((pose.angle * -Math.PI) / 180) * facing * reach + salute * 0.3,
    );
    alienReach(
      alien,
      'probe',
      14 + (localX(tip) - 38) * probing - recoil * 4 + scrutiny,
      2 + (localY(tip) - 10) * probing - recoil * 6 + scrutiny * 4,
      -0.45 * (1 - probing) - recoil * 0.55 + scrutiny * 1.15,
    );
    const probeTip = requireSceneObject(alien, 'probe-tip');
    if (probeTip instanceof THREE.Mesh && probeTip.material instanceof THREE.MeshStandardMaterial) {
      probeTip.material.emissive.setHex(recoil > 0.2 ? 0xffae4b : 0x4affbd);
      probeTip.material.emissiveIntensity = pose.scanning * (0.7 + fraction * 0.7) + recoil + tap;
    }
    alien.updateMatrixWorld(true);
    probeTip.getWorldPosition(this.tipWorld);
    this.object.position.set(0, 0, 0);
    this.reticles.forEach((part, i) => {
      part.position.set(this.tipWorld.x, this.tipWorld.y, 170 + i);
      part.scale.setScalar(0.75 + fraction * 0.35 + i * 0.1);
      part.material.opacity = pose.scanning * (i ? 0.85 : 0.65);
      part.rotation.z = (ms / 500) * (i ? -1 : 1);
    });
    const sweep = alienCardPoint(this.plan, b, ms, facing, 0.5, 0.84 + fraction * 0.11);
    this.scan.position.set(sweep.x, -sweep.y, 155);
    this.scan.rotation.z = (-pose.angle * Math.PI) / 180;
    this.scan.scale.set(b.width * 0.85, 2, 1);
    this.scan.material.opacity = pose.scanning * 0.28;
    const lifted = alienCardPoint(this.plan, b, ms, facing, facing > 0 ? 0 : 1, 1);
    const vertices = this.underside.geometry.getAttribute('position');
    vertices.setXYZ(0, facing > 0 ? b.left + b.width : b.left, -b.top - b.height, 151);
    vertices.setXYZ(1, facing > 0 ? b.left : b.left + b.width, -b.top - b.height, 151);
    vertices.setXYZ(2, lifted.x, -lifted.y, 151);
    vertices.needsUpdate = true;
    this.underside.material.opacity = pose.lift * 0.12;
    const sparkOrigin = alienCardPoint(this.plan, b, 2070, facing, facing > 0 ? 0.14 : 0.86, 0.92);
    this.sparks.forEach((part, i) => {
      const age = clamp((ms - 2090 - i * 12) / 380);
      const angle = (i * Math.PI) / 3;
      part.position.set(
        sparkOrigin.x + Math.cos(angle) * age * 21,
        -sparkOrigin.y + Math.sin(angle) * age * 21,
        175,
      );
      part.material.opacity = this.plan.malfunction && ms > 2090 + i * 12 ? (1 - age) * 0.9 : 0;
    });
    this.beamRings.forEach((part, i) => {
      const rise = clamp((ms - 4170 - i * 90) / 430);
      part.position.set(end.x - facing * distance, -end.y - 23 + rise * 105, 160);
      part.scale.set(1, 0.28, 1);
      part.material.opacity =
        ms >= 4170 + i * 90 && ms < ALIEN_DURATION ? Math.sin(rise * Math.PI) * 0.8 : 0;
    });
    const column = beat(ms, 4170, 4380) * (1 - beat(ms, 4590, 4700));
    this.beamColumn.position.set(end.x - facing * distance, -end.y - 23 + column * 58, 153);
    this.beamColumn.scale.y = column * 116;
    this.beamColumn.material.opacity = column * 0.13;
    const fade = 1 - ease((ms - 4460) / 240);
    alien.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.transparent = true;
        child.material.opacity = fade;
      }
    });
    this.object.visible = ms < ALIEN_DURATION;
  }
}
