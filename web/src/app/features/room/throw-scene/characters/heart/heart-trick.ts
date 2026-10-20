import { clamp } from '../../kit';
import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  HEART_SEAM,
  heartShape,
  heartModel,
  heartLowest,
  heartTravelPulse,
  type HeartHalf,
} from './broken-heart';
import {
  HEART_DEPTH,
  HEART_DURATION,
  HEART_SCALE,
  heartEase,
  heartApproach,
  heartContact,
  heartContactOrigin,
  heartLandingPoint,
  heartCardPoint,
  heartCardPose,
  heartFrames,
  heartSpread,
  type HeartPlan,
} from './heart-choreography';

function ink(color: number) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
export function heartWholePose(
  p: HeartPlan,
  ms: number,
  start: Point,
  b: TargetBounds,
  view: Point,
) {
  const end = heartLandingPoint(b),
    travel = ms < p.travel;
  const press = heartEase((ms - p.travel) / (p.hit - p.travel)),
    pulse = heartTravelPulse(p, ms);
  return {
    point: travel
      ? heartApproach(p, start, end, view, ms)
      : { x: end.x, y: end.y - 12 * (1 - press) },
    depth: HEART_DEPTH + 22 * (1 - press),
    rotation: new THREE.Euler(
      0,
      travel ? Math.sin((ms / p.travel) * Math.PI) * p.side * 0.12 : 0,
      travel ? p.side * Math.sin((ms / p.travel) * Math.PI) * 0.09 : 0,
    ),
    scale: new THREE.Vector3(
      HEART_SCALE * (1 + pulse * 0.09),
      HEART_SCALE * (1 - pulse * 0.045),
      HEART_SCALE,
    ),
  };
}
export function heartHalfPose(
  p: HeartPlan,
  half: HeartHalf,
  ms: number,
  b: TargetBounds,
  view: Point,
) {
  const side = half.side,
    release = heartContactOrigin(p, p.drop, b),
    spread = heartSpread(p, side, release.x, view);
  const age = ms - p.hit,
    gap = spread * heartEase(age / p.split);
  const initialAngle = (-heartCardPose(p, p.drop).angle * Math.PI) / 180 - side * 0.23;
  const finalAngle = -side * (0.23 + p.spin),
    finalLowest = heartLowest(half, finalAngle) * HEART_SCALE;
  const floor = b.top + b.height + 20,
    birth = { x: release.x + side * spread, y: release.y + 3 };
  const gravity = 210 * p.force,
    vy = 12 * p.force;
  const landing =
    (vy + Math.sqrt(vy ** 2 + 4 * gravity * Math.max(0, floor + finalLowest - birth.y))) /
    (2 * gravity);
  const bounceV = (2 * gravity * landing - vy) * p.bounce,
    bounceDuration = bounceV / gravity;
  const t = Math.max(0, ms - p.drop) / 1000,
    u = Math.max(0, t - landing);
  const room = Math.max(0, side < 0 ? birth.x - 26 : view.x - 26 - birth.x);
  const velocity = Math.min(18 * p.force, room / (landing + bounceDuration + 0.35));
  const stop = landing + bounceDuration,
    slide =
      Math.min(t, landing) +
      Math.min(u, bounceDuration) * 0.6 +
      Math.min(Math.max(0, t - stop), 0.35) * 0.35;
  const hopStart = stop + 0.65,
    hopAge = (t - hopStart) / 0.48;
  const hop =
    p.stubborn && side === p.side && hopAge > 0 && hopAge < 1
      ? Math.sin(Math.PI * hopAge) * 13 * p.force
      : 0;
  const hope = p.stubborn && side === p.side ? heartEase(hopAge) : 0;
  const angle =
    initialAngle + (finalAngle - initialAngle) * heartEase(t / landing) - side * 0.12 * hope;
  const support = floor + heartLowest(half, angle) * HEART_SCALE;
  const y =
    t < landing
      ? birth.y - vy * t + gravity * t * t
      : u < bounceDuration
        ? support - bounceV * u + gravity * u * u
        : support;
  const origin = heartContactOrigin(p, ms, b),
    cardAngle = (-heartCardPose(p, ms).angle * Math.PI) / 180;
  return ms < p.drop
    ? {
        x: origin.x + side * gap,
        y: origin.y + heartEase(age / p.split) * 3,
        angle: cardAngle - side * 0.23 * heartEase(age / p.split),
        floor,
        landing,
        bounceDuration,
        hop: 0,
        settled: false,
      }
    : {
        x: birth.x + side * velocity * slide - side * hope * 7,
        y: y - hop,
        angle,
        floor,
        landing,
        bounceDuration,
        hop,
        settled: t >= stop && hop === 0,
      };
}
export class HeartTrick {
  readonly object = new THREE.Group();
  readonly plan;
  readonly duration;
  private readonly model;
  private readonly imprintContour = heartShape().getSpacedPoints(64);
  private readonly echoes: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly sparks: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly shadows: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly crack: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>[] = [];
  private readonly stamp: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly kiss = new THREE.Mesh(new THREE.RingGeometry(2, 3, 28), ink(0xffc7dc));
  constructor(actor: THREE.Group) {
    this.model = heartModel(actor);
    this.plan = this.model.plan;
    this.duration = HEART_DURATION * this.plan.pace;
    this.object.name = 'heartbreak';
    this.kiss.name = 'heart-contact';
    this.object.add(this.kiss);
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(
        new THREE.ShapeGeometry(heartShape()),
        ink(i % 2 ? 0xff719d : 0xffc9d9),
      );
      mesh.name = `love-echo-${i}`;
      mesh.scale.setScalar(0.12 + (i % 3) * 0.025);
      this.echoes.push(mesh);
      this.object.add(mesh);
    }
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(
        new THREE.ShapeGeometry(heartShape()),
        ink(i % 2 ? 0xff8baf : 0xf0c7d8),
      );
      mesh.name = `heart-chip-${i}`;
      mesh.scale.setScalar(0.05 + (i % 3) * 0.015);
      this.sparks.push(mesh);
      this.object.add(mesh);
    }
    for (let i = 0; i < 2; i++) {
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24), ink(0x301e35));
      shadow.name = `heart-shadow-${i}`;
      this.shadows.push(shadow);
      this.object.add(shadow);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(25 * 3), 3));
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color: i ? 0x69183b : 0xffb8d0,
          transparent: true,
          depthWrite: false,
        }),
      );
      line.name = `card-heart-crack-${i}`;
      this.crack.push(line);
      this.object.add(line);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(65 * 3), 3));
    this.stamp = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: 0xffb5cb, transparent: true, depthWrite: false }),
    );
    this.stamp.name = 'hopeful-imprint';
    this.object.add(this.stamp);
  }
  cardAnimation() {
    return heartFrames(this.plan);
  }
  update(elapsed: number, actor: THREE.Group, start: Point, b: TargetBounds, view: Point) {
    const p = this.plan,
      ms = elapsed / p.pace,
      age = ms - p.hit;
    const end = heartLandingPoint(b),
      fade = 1 - heartEase((ms - p.cleanup) / 850);
    this.object.position.set(0, 0, 0);
    this.object.visible = ms < HEART_DURATION;
    actor.visible = fade > 0;
    actor.rotation.set(0, 0, 0);
    actor.scale.setScalar(HEART_SCALE);
    this.model.intact.visible = age < 0;
    if (age < 0) {
      const q = heartWholePose(p, ms, start, b, view);
      actor.position.set(q.point.x, -q.point.y, q.depth);
      actor.rotation.copy(q.rotation);
      actor.scale.copy(q.scale);
    } else {
      actor.position.set(end.x, -end.y, HEART_DEPTH);
    }
    this.model.halves.forEach((half, i) => {
      half.root.visible = age >= 0 && fade > 0;
      const q = heartHalfPose(p, half, ms, b, view);
      half.root.position.set((q.x - end.x) / HEART_SCALE, (end.y - q.y) / HEART_SCALE, 0);
      half.root.rotation.set(0, 0, q.angle);
      half.root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          for (const material of Array.isArray(o.material) ? o.material : [o.material])
            material.opacity = fade;
        }
      });
      const shadow = this.shadows[i];
      if (shadow) {
        shadow.visible = ms >= p.drop && fade > 0;
        shadow.position.set(q.x, -q.floor, 165);
        const distance = Math.max(0, q.floor - q.y);
        shadow.scale.set(11 + distance * 0.02, 2.8, 1);
        shadow.material.opacity = (fade * 0.2) / (1 + distance / 35);
      }
    });
    actor.updateMatrixWorld(true);
    const contact = heartCardPoint(p, ms, heartContact(b), b);
    this.kiss.position.set(contact.x, -contact.y, 174);
    this.kiss.visible = age >= 0 && age < 320;
    this.kiss.scale.setScalar(1 + clamp(age / 320) * 4);
    this.kiss.material.opacity = 1 - clamp(age / 320);
    this.updateCard(ms, b);
    this.echoes.forEach((mesh, i) => {
      const birth = p.travel * (0.16 + i * 0.065),
        t = (ms - birth) / 850;
      const source = this.model.sources[i % 2];
      if (!source) return;
      const born = heartWholePose(p, birth, start, b, view);
      const from = source.position
        .clone()
        .multiply(born.scale)
        .applyEuler(born.rotation)
        .add(new THREE.Vector3(born.point.x, -born.point.y, born.depth));
      mesh.visible = t >= 0 && t < 1;
      mesh.position
        .copy(from)
        .add(
          new THREE.Vector3(p.side * Math.sin(i * 2 + p.phase) * t * 10, t * (26 + (i % 3) * 5), 0),
        );
      mesh.rotation.z = Math.sin(t * 3 + i) * 0.2;
      mesh.material.opacity = 0.7 * (1 - heartEase(t));
    });
    this.sparks.forEach((mesh, i) => {
      const at = HEART_SEAM[i % HEART_SEAM.length];
      if (!at) return;
      const origin = heartContactOrigin(p, p.hit, b),
        t = (ms - p.hit) / 1000;
      mesh.visible = t >= 0 && t < 1.3;
      mesh.position.set(
        origin.x + at[0] * HEART_SCALE + Math.sin(i * 3 + p.phase) * t * 26,
        -origin.y + at[1] * HEART_SCALE + (25 + (i % 3) * 8) * t - 70 * t * t,
        172 + t * 0.8,
      );
      mesh.rotation.z = t * (i % 2 ? 2 : -2);
      mesh.material.opacity = 1 - heartEase((t - 0.6) / 0.7);
    });
    if (ms >= HEART_DURATION) actor.visible = false;
  }
  private updateCard(ms: number, b: TargetBounds) {
    const p = this.plan,
      age = ms - p.hit,
      reveal = clamp(age / p.split);
    const restore = heartEase((ms - p.cleanup + 300) / 1050),
      coverage = reveal * (1 - restore),
      tip = heartContact(b);
    const imprint = this.stamp.geometry.getAttribute('position');
    for (let i = 0; i <= 64; i++) {
      const point = this.imprintContour[i];
      if (!point) continue;
      const at = heartCardPoint(
        p,
        ms,
        { x: tip.x + point.x * 0.65, y: tip.y - 12 - point.y * 0.65 },
        b,
      );
      imprint.setXYZ(i, at.x, -at.y, 173);
    }
    imprint.needsUpdate = true;
    this.stamp.geometry.computeBoundingSphere();
    this.stamp.visible = age >= 0 && age < p.split + 450;
    this.stamp.material.opacity = 0.6 * (1 - heartEase(age / (p.split + 450)));
    this.crack.forEach((line, layer) => {
      const positions = line.geometry.getAttribute('position');
      for (let i = 0; i <= 24; i++) {
        const t = Math.min(coverage, i / 24),
          segment = Math.min(3, Math.floor(t * 4));
        const a = HEART_SEAM[segment],
          c = HEART_SEAM[segment + 1];
        if (!a || !c) continue;
        const mix = t * 4 - segment,
          x = a[0] + (c[0] - a[0]) * mix;
        const at = heartCardPoint(
          p,
          ms,
          { x: tip.x + x * (b.width / 35) + (layer ? 0 : 0.9), y: tip.y + t * b.height * 0.48 },
          b,
        );
        positions.setXYZ(i, at.x, -at.y, 173 + layer);
      }
      positions.needsUpdate = true;
      line.geometry.computeBoundingSphere();
      line.visible = age >= 0 && coverage > 0;
      line.material.opacity = (1 - restore) * (layer ? 0.8 : 0.65);
    });
  }
}
