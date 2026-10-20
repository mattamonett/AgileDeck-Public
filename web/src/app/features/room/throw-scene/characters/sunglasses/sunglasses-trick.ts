import { clamp } from '../../kit';
import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { sunglassesModel, type GlassFragment } from './sunglasses';
import {
  SUNGLASSES_DURATION,
  SUNGLASSES_SCALE,
  shadesEase,
  sunglassesCardPoint,
  sunglassesCardPose,
  sunglassesFrames,
  type SunglassesPlan,
} from './sunglasses-choreography';

function ink(color: number) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
export function glassFragmentPose(
  fragment: GlassFragment,
  p: SunglassesPlan,
  age: number,
  b: TargetBounds,
) {
  const t = Math.max(0, age) / 1000,
    gravity = 245 * p.force;
  const birthY = b.top + b.height * 0.28 - fragment.position.y * SUNGLASSES_SCALE;
  const floor = b.top + b.height + 24;
  const landing =
    (fragment.vy + Math.sqrt(fragment.vy ** 2 + 4 * gravity * (floor - birthY))) / (2 * gravity);
  const bounceV = (2 * gravity * landing - fragment.vy) * 0.24;
  const u = Math.max(0, t - landing),
    bounceDuration = bounceV / gravity;
  const y =
    t < landing
      ? birthY - fragment.vy * t + gravity * t * t
      : u < bounceDuration
        ? floor - bounceV * u + gravity * u * u
        : floor;
  const slide = Math.min(u, bounceDuration) + Math.min(Math.max(0, u - bounceDuration), 0.4) * 0.3;
  return {
    x:
      b.left +
      b.width / 2 +
      fragment.position.x * SUNGLASSES_SCALE +
      fragment.vx * (Math.min(t, landing) + slide * 0.4),
    y,
    landing,
    bounceDuration,
    turn: Math.min(t, landing + bounceDuration),
    settled: t >= landing + bounceDuration,
  };
}
export function flameBase(p: SunglassesPlan, b: TargetBounds, index: number) {
  const side = index % 2 ? 1 : -1,
    row = Math.floor(index / 2);
  const delay = p.bilateral ? row * 70 : (side === p.side ? row : 11 - row) * 40;
  return {
    raw: { x: b.left + (side > 0 ? b.width - 1 : 1), y: b.top + b.height * (0.08 + row * 0.16) },
    delay,
    side,
  };
}
export function flamePose(p: SunglassesPlan, ms: number, b: TargetBounds, index: number) {
  const base = flameBase(p, b, index),
    age = ms - p.hit - 120 - base.delay;
  const strength = shadesEase(age / 180) * (1 - shadesEase((age - p.burn) / 700));
  const flicker = 1 + Math.sin(ms / 60 + p.phase + index * 0.8) * 0.12;
  const position = sunglassesCardPoint(p, ms, base.raw, b);
  const angle = (-sunglassesCardPose(p, ms).angle * Math.PI) / 180 + base.side * 0.16;
  return {
    position,
    angle,
    sx: strength * 0.38,
    sy: strength * (0.55 + (index % 3) * 0.1) * flicker,
    strength,
  };
}
export function flameTip(p: SunglassesPlan, ms: number, b: TargetBounds, index: number): Point {
  const pose = flamePose(p, ms, b, index),
    height = pose.sy * 29;
  return {
    x: pose.position.x - Math.sin(pose.angle) * height,
    y: pose.position.y - Math.cos(pose.angle) * height,
  };
}

export class SunglassesTrick {
  readonly object = new THREE.Group();
  readonly plan;
  readonly duration;
  private readonly model;
  private readonly flames: {
    root: THREE.Group;
    outer: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
    core: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
  }[] = [];
  private readonly embers: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly smoke: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly singed: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly fuse: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>[] = [];
  private readonly scorch = new THREE.Mesh(new THREE.CircleGeometry(12, 24), ink(0x3b251e));
  private readonly flash = new THREE.Mesh(new THREE.RingGeometry(4, 6, 24), ink(0xffdba0));
  constructor(craft: THREE.Group) {
    this.model = sunglassesModel(craft);
    this.plan = this.model.plan;
    this.duration = SUNGLASSES_DURATION * this.plan.pace;
    this.object.name = 'sunglasses-payoff';
    this.scorch.name = 'scorch';
    this.flash.name = 'impact-flash';
    this.object.add(this.scorch, this.flash);
    for (let i = 0; i < 12; i++) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.bezierCurveTo(-13, 2, -11, 13, -4, 18);
      shape.quadraticCurveTo(1, 22, -1, 29);
      shape.bezierCurveTo(16, 13, 13, 1, 0, 0);
      const root = new THREE.Group();
      root.name = `flame-${i}`;
      const outer = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        ink(i % 2 ? 0xff601c : 0xf34213),
      );
      const core = new THREE.Mesh(new THREE.ShapeGeometry(shape), ink(0xffdc5b));
      core.scale.set(0.5, 0.7, 1);
      core.position.z = 1;
      root.add(outer, core);
      this.object.add(root);
      this.flames.push({ root, outer, core });
      const edge = new THREE.Shape();
      edge.moveTo(-2, -7);
      edge.lineTo(0.5, -5);
      edge.lineTo(2, -8);
      edge.lineTo(1, 4);
      edge.lineTo(-1, 8);
      edge.lineTo(-2, 5);
      edge.closePath();
      const char = new THREE.Mesh(new THREE.ShapeGeometry(edge), ink(0x4d3730));
      char.name = `singed-${i}`;
      this.singed.push(char);
      this.object.add(char);
    }
    for (let i = 0; i < 18; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 8, 6),
        ink(i % 2 ? 0xffcf64 : 0xe87732),
      );
      mesh.name = `ember-${i}`;
      this.embers.push(mesh);
      this.object.add(mesh);
    }
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 12, 8),
        ink(i % 2 ? 0xabb8b4 : 0x52635f),
      );
      mesh.name = `smoke-${i}`;
      this.smoke.push(mesh);
      this.object.add(mesh);
    }
    for (let i = 0; i < 2; i++) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color: 0xffe1a3, transparent: true, depthWrite: false }),
      );
      line.name = `ignition-${i}`;
      this.fuse.push(line);
      this.object.add(line);
    }
  }
  cardAnimation() {
    return sunglassesFrames(this.plan);
  }
  update(elapsed: number, craft: THREE.Group, b: TargetBounds, end: Point) {
    const p = this.plan,
      ms = elapsed / p.pace,
      age = ms - p.hit,
      t = Math.max(0, age) / 1000;
    const intact = age < 0,
      tilt = intact ? Math.sin((Math.PI * ms) / p.hit) : 0;
    craft.visible = ms < p.hit + 3350;
    craft.scale.setScalar(SUNGLASSES_SCALE);
    craft.position.set(
      end.x,
      -end.y + tilt * 3,
      170.4 + (intact ? 24 * (1 - shadesEase((ms - p.hit + 100) / 100)) : 0),
    );
    craft.rotation.set(0, 0, p.side * tilt * 0.08);
    this.model.intact.visible = intact;
    this.model.shards.visible = !intact && craft.visible;
    for (const gleam of this.model.gleams)
      gleam.material.opacity = 1 - 0.35 * Math.sin(Math.PI * clamp(ms / p.hit)) ** 2;
    for (const fragment of this.model.fragments) {
      const q = glassFragmentPose(fragment, p, age, b),
        mesh = fragment.mesh;
      mesh.position.set(
        (q.x - end.x) / SUNGLASSES_SCALE,
        (end.y - q.y) / SUNGLASSES_SCALE,
        fragment.position.z + Math.sin(q.turn * 2 + p.phase) * Math.min(q.turn, 1) * 5,
      );
      mesh.rotation.set(
        fragment.rotation.x + q.turn * fragment.spin * 0.45,
        fragment.rotation.y + q.turn * fragment.spin * 0.25,
        fragment.rotation.z + q.turn * fragment.spin,
      );
      const vertices = mesh.geometry.getAttribute('position'),
        point = new THREE.Vector3();
      let lowest = Infinity;
      for (let i = 0; i < vertices.count; i++) {
        point.fromBufferAttribute(vertices, i).multiply(mesh.scale).applyEuler(mesh.rotation);
        lowest = Math.min(lowest, point.y);
      }
      mesh.position.y -= lowest * shadesEase((t - q.landing + 0.06) / 0.06);
      mesh.material.opacity = 1 - shadesEase((age - 2500) / 850);
    }
    this.object.position.set(-end.x, end.y, 0);
    this.object.visible = ms < SUNGLASSES_DURATION;
    const contact = sunglassesCardPoint(p, ms, { x: end.x, y: end.y - 2.4 }, b);
    const pose = sunglassesCardPose(p, ms);
    this.flash.position.set(contact.x, -contact.y, 23);
    this.flash.visible = age >= 0 && age < 220;
    this.flash.scale.setScalar(1 + clamp(age / 220) * 3);
    this.flash.material.opacity = 1 - clamp(age / 220);
    this.scorch.position.set(contact.x, -contact.y, 22);
    this.scorch.rotation.z = (-pose.angle * Math.PI) / 180;
    this.scorch.scale.set(1, 0.35 + shadesEase(age / 300) * 0.35, 1);
    this.scorch.visible = age >= 0 && age < 4100;
    this.scorch.material.opacity =
      shadesEase(age / 150) * (1 - shadesEase((age - 2800) / 1300)) * 0.28;
    this.flames.forEach((flame, i) => {
      const q = flamePose(p, ms, b, i);
      flame.root.visible = q.strength > 0;
      flame.root.position.set(q.position.x, -q.position.y, 24);
      flame.root.rotation.z = q.angle;
      flame.root.scale.set(q.sx, q.sy, 1);
      flame.outer.material.opacity = q.strength * 0.95;
      flame.core.material.opacity = q.strength;
    });
    this.singed.forEach((mesh, i) => {
      const base = flameBase(p, b, i),
        q = ms - p.hit - 120 - base.delay,
        at = sunglassesCardPoint(p, ms, base.raw, b);
      mesh.position.set(at.x, -at.y, 23);
      mesh.rotation.set(0, base.side * shadesEase(q / 600) * 0.25, (-pose.angle * Math.PI) / 180);
      mesh.scale.set(1, b.height / 122, 1);
      mesh.visible = q > 0;
      mesh.material.opacity = shadesEase(q / 600) * (1 - shadesEase((age - 2800) / 1300)) * 0.7;
    });
    this.fuse.forEach((line, i) => {
      const base = flameBase(p, b, i),
        to = sunglassesCardPoint(p, ms, base.raw, b),
        q = shadesEase(age / 120);
      const attribute = line.geometry.getAttribute('position');
      attribute.setXYZ(0, contact.x, -contact.y, 24);
      attribute.setXYZ(
        1,
        contact.x + (to.x - contact.x) * q,
        -contact.y - (to.y - contact.y) * q,
        24,
      );
      attribute.needsUpdate = true;
      line.geometry.computeBoundingSphere();
      line.visible = age >= 0 && age < 200 && (p.bilateral || base.side === p.side);
      line.material.opacity = 1 - shadesEase((age - 120) / 80);
    });
    this.embers.forEach((mesh, i) => {
      const index = i % 12,
        birth = p.hit + 360 + flameBase(p, b, index).delay + Math.floor(i / 12) * 230;
      const q = (ms - birth) / 1000,
        from = flameTip(p, birth, b, index);
      mesh.visible = q >= 0 && q < 1.15;
      mesh.position.set(
        from.x + p.side * p.wind * q + Math.sin(q * 5 + i) * q * 4,
        -from.y + (35 + (i % 4) * 8) * q + 15 * q * q,
        26,
      );
      mesh.scale.set(1, 1 + clamp(q) * 1.2, 1);
      mesh.material.opacity = (1 - shadesEase(q / 1.15)) * 0.9;
    });
    this.smoke.forEach((mesh, i) => {
      const q = (ms - p.hit - 850 - i * 200) / 1400;
      const from = sunglassesCardPoint(
        p,
        p.hit + 850 + i * 200,
        { x: b.left + b.width * (0.3 + (i % 3) * 0.2), y: b.top + 5 },
        b,
      );
      mesh.visible = q >= 0 && q < 1;
      mesh.position.set(
        from.x + p.side * p.wind * q + Math.sin(q * 6 + p.phase + i) * q * 6,
        -from.y + q * 65,
        27,
      );
      mesh.scale.set(5 + Math.max(0, q) * 12, 3 + Math.max(0, q) * 8, 1);
      mesh.material.opacity = q >= 0 && q < 1 ? Math.sin(q * Math.PI) * 0.2 : 0;
    });
  }
}
