import { clamp } from '../../kit';
import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { tomatoModel, wet, ribbon, splatShape } from './tomato-model';
import {
  TOMATO_DEPTH,
  TOMATO_DURATION,
  TOMATO_RADIUS,
  TOMATO_SCALE,
  tomatoEase,
  tomatoApproach,
  tomatoCardPoint,
  tomatoContact,
  tomatoCompression,
  tomatoFrames,
  type TomatoPlan,
} from './tomato-choreography';
export function tomatoSpray(p: TomatoPlan, ms: number, i: number, b: TargetBounds, view: Point) {
  const t = Math.max(0, ms - p.travel) / 1000,
    at = tomatoContact(p, b);
  const angle = i * 2.399 + p.phase,
    speed = (34 + (i % 5) * 9) * p.force;
  const vx =
    Math.cos(angle) * Math.min(speed, Math.max(8, Math.min(at.x - 9, view.x - 9 - at.x)) / 1.3);
  const vy = Math.sin(angle) * speed - 22;
  return {
    x: at.x + vx * t,
    y: Math.min(b.top + b.height + 25, at.y + vy * t + 100 * t * t),
    z: TOMATO_DEPTH + t * 5,
    t,
  };
}
export function tomatoPeelPose(p: TomatoPlan, ms: number, i: number, b: TargetBounds, view: Point) {
  const sticky = p.sticky && i === 2,
    release = p.travel + 120,
    start = tomatoCardPoint(p, release, tomatoContact(p, b), b);
  const slideStart = release + p.peelDelay,
    slideEnd = slideStart + 700;
  const slide = sticky ? tomatoEase((ms - slideStart) / 700) : 0;
  const slideDistance = b.top + b.height - start.y - 5;
  const born = sticky ? slideEnd : release,
    t = Math.max(0, ms - born) / 1000;
  const expansion = tomatoEase(t / 0.35),
    angle = p.phase + i * 2.399;
  const room = Math.max(0, Math.min(start.x - 18, view.x - 18 - start.x)),
    vx = Math.cos(angle) * Math.min(35 * p.force, room / 1.1);
  const q = tomatoEase(t / 0.6),
    floor = b.top + b.height + 25;
  return {
    x: start.x + vx * Math.min(t, 1.1),
    y:
      start.y + slideDistance * slide - (sticky ? 5 : 34 + (i % 3) * 9) * t + 100 * p.force * t * t,
    z: TOMATO_DEPTH + TOMATO_RADIUS * TOMATO_SCALE * 0.18 + expansion * 9,
    rotation: new THREE.Euler(
      q * Math.sin(angle) * 0.8,
      q * Math.cos(angle) * 0.7,
      q * Math.sin(angle + 1) * 1.7,
    ),
    scale: new THREE.Vector3(
      1.35 - expansion * 0.35,
      0.7395 + expansion * 0.1305,
      0.18 + expansion * 0.82,
    ),
    floor,
    born,
    t,
    sticky,
    slide,
  };
}
const lowestPoint = new THREE.Vector3();
export function tomatoLowest(root: THREE.Group, scale: THREE.Vector3, rotation: THREE.Euler) {
  let lowest = Infinity;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.updateMatrix();
      const points = o.geometry.getAttribute('position');
      for (let i = 0; i < points.count; i++) {
        const at = lowestPoint
          .fromBufferAttribute(points, i)
          .applyMatrix4(o.matrix)
          .multiply(scale)
          .applyEuler(rotation);
        lowest = Math.min(lowest, at.y * TOMATO_SCALE);
      }
    }
  });
  return lowest;
}
export class TomatoTrick {
  readonly object = new THREE.Group();
  readonly plan;
  readonly duration;
  private readonly model;
  private readonly splat: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
  private readonly contour: readonly THREE.Vector3[];
  private readonly spray: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly seeds: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly drips: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly heads: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly drops: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 32), wet(0xb63a1d));
  private readonly glints: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>[] = [];
  constructor(actor: THREE.Group) {
    this.model = tomatoModel(actor);
    this.plan = this.model.plan;
    this.duration = TOMATO_DURATION * this.plan.pace;
    this.object.name = 'tomato-heckle';
    const geometry = new THREE.ShapeGeometry(splatShape(this.plan.phase));
    this.splat = new THREE.Mesh(geometry, wet(0xe34423));
    this.splat.name = 'wet-tomato-splat';
    this.object.add(this.splat);
    const points = geometry.getAttribute('position');
    this.contour = Array.from({ length: points.count }, (_, i) =>
      new THREE.Vector3().fromBufferAttribute(points, i),
    );
    for (let i = 0; i < 28; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 8, 6),
        wet(i % 3 ? 0xf47138 : 0xc83c1e),
      );
      mesh.name = `tomato-pulp-${i}`;
      this.spray.push(mesh);
      this.object.add(mesh);
    }
    for (let i = 0; i < 18; i++) {
      const seed = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), wet(0xffdb83));
      seed.name = `tomato-seed-${i}`;
      this.seeds.push(seed);
      this.object.add(seed);
    }
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(ribbon(), wet(i % 2 ? 0xea5b2b : 0xc63b1f));
      mesh.name = `juice-runoff-${i}`;
      this.drips.push(mesh);
      this.object.add(mesh);
      const head = new THREE.Mesh(new THREE.CircleGeometry(1, 16), wet(0xf77c3f));
      head.name = `juice-head-${i}`;
      this.heads.push(head);
      this.object.add(head);
      const drop = new THREE.Mesh(new THREE.CircleGeometry(1, 16), wet(0xdc4a24));
      drop.name = `falling-juice-${i}`;
      this.drops.push(drop);
      this.object.add(drop);
    }
    this.puddle.name = 'tomato-puddle';
    this.object.add(this.puddle);
    for (let i = 0; i < 2; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 3), 3));
      const line = new THREE.Line(
        g,
        new THREE.LineBasicMaterial({ color: 0xffc180, transparent: true, depthWrite: false }),
      );
      line.name = `wet-glint-${i}`;
      this.glints.push(line);
      this.object.add(line);
    }
  }
  cardAnimation() {
    return tomatoFrames(this.plan);
  }
  update(elapsed: number, actor: THREE.Group, start: Point, b: TargetBounds, view: Point) {
    const p = this.plan,
      ms = elapsed / p.pace,
      age = ms - p.travel,
      at = tomatoContact(p, b);
    const contact = tomatoCardPoint(p, ms, at, b),
      fade = 1 - tomatoEase((ms - p.cleanup) / 800);
    this.object.position.set(0, 0, 0);
    this.object.visible = ms < TOMATO_DURATION;
    actor.visible = fade > 0;
    actor.scale.setScalar(TOMATO_SCALE);
    actor.rotation.set(0, 0, 0);
    this.model.fruit.visible = age < 120;
    if (age < 0) {
      const q = tomatoApproach(p, ms, start, b, view);
      actor.position.set(q.x, -q.y, q.depth);
      actor.rotation.set(0, 0, q.spin);
      this.model.fruit.scale.set(1, 0.87, 1);
      this.model.stem.position.set(0, 11, 0);
      this.model.stem.rotation.set(0, 0, 0);
    } else {
      const q = tomatoCompression(p, ms);
      actor.position.set(contact.x, -contact.y, TOMATO_DEPTH + TOMATO_RADIUS * TOMATO_SCALE * q.z);
      this.model.fruit.scale.set(q.x, q.y, q.z);
      const t = Math.max(0, age - 120) / 1000;
      this.model.stem.rotation.z = p.side * Math.min(t, 0.9) * 3;
      const stemLowest = tomatoLowest(
        this.model.stem,
        new THREE.Vector3(1, 1, 1),
        this.model.stem.rotation,
      );
      const stemY = Math.max(
        contact.y - b.top - b.height - 25 - stemLowest,
        11 * TOMATO_SCALE + 27 * t - 100 * t * t,
      );
      this.model.stem.position.set(
        (p.side * Math.min(t, 1) * 16) / TOMATO_SCALE,
        stemY / TOMATO_SCALE,
        Math.min(t, 1) * 4,
      );
      this.model.stem.visible = fade > 0;
    }
    if (age < 0) this.model.stem.visible = true;
    this.model.peels.forEach((peel, i) => {
      peel.visible = age >= 120 && fade > 0;
      const q = tomatoPeelPose(p, ms, i, b, view),
        lowest = tomatoLowest(peel, q.scale, q.rotation);
      const y = Math.min(q.y, q.floor + lowest);
      peel.position.set(
        (q.x - contact.x) / TOMATO_SCALE,
        (contact.y - y) / TOMATO_SCALE,
        (q.z - actor.position.z) / TOMATO_SCALE,
      );
      peel.scale.copy(q.scale);
      peel.rotation.copy(q.rotation);
      peel.traverse((o) => {
        if (o instanceof THREE.Mesh)
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            m.transparent = true;
            m.opacity = fade;
          }
      });
    });
    this.spray.forEach((mesh, i) => {
      const q = tomatoSpray(p, ms, i, b, view);
      mesh.visible = age >= 0 && q.t < 1.35;
      mesh.position.set(q.x, -q.y, q.z);
      mesh.rotation.z = i + q.t * 3;
      mesh.scale.set(1.6 + (i % 3) * 0.5, (1.8 + (i % 4) * 0.5) * (1 + q.t * 0.5), 0.6);
      mesh.material.opacity = 1 - tomatoEase((q.t - 0.75) / 0.6);
    });
    this.seeds.forEach((mesh, i) => {
      const q = tomatoSpray(p, ms, i + 28, b, view);
      const sticky = i < 8;
      const catchTime = 0.24 + (i % 3) * 0.06;
      if (sticky) {
        const angle = i * 2.399 + p.phase,
          u = clamp(q.t / catchTime);
        const raw = {
          x: Math.max(b.left + 3, Math.min(b.left + b.width - 3, at.x + Math.cos(angle) * 10)),
          y: Math.max(b.top + 3, Math.min(b.top + b.height - 3, at.y + Math.sin(angle) * 8)),
        };
        const spot = tomatoCardPoint(
          p,
          ms,
          {
            x: at.x + (raw.x - at.x) * u,
            y: at.y + (raw.y - at.y) * u - Math.sin(Math.PI * u) * 5,
          },
          b,
        );
        mesh.position.set(spot.x, -spot.y, TOMATO_DEPTH + 0.7 + Math.sin(Math.PI * u) * 8);
      } else mesh.position.set(q.x, -q.y, q.z + 0.5);
      mesh.visible = age >= 0 && (sticky ? fade > 0 : q.t < 1.4);
      mesh.scale.set(0.7, 1.2, 0.35);
      mesh.rotation.z = i * 2.399 + (sticky && q.t >= catchTime ? catchTime : q.t) * 4;
      mesh.material.opacity = sticky ? fade : 1 - tomatoEase((q.t - 0.85) / 0.55);
    });
    this.updateJuice(ms, b, fade);
    this.model.stem.traverse((o) => {
      if (o instanceof THREE.Mesh)
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          m.transparent = true;
          m.opacity = fade;
        }
    });
    if (ms >= TOMATO_DURATION) actor.visible = false;
    actor.updateMatrixWorld(true);
  }
  private updateJuice(ms: number, b: TargetBounds, fade: number) {
    const p = this.plan,
      age = ms - p.travel,
      at = tomatoContact(p, b),
      spread = tomatoEase(age / 170);
    const rx = Math.min(23, b.width * 0.36) * p.force,
      ry = Math.min(18, b.height * 0.17) * p.force;
    const positions = this.splat.geometry.getAttribute('position');
    this.contour.forEach((point, i) => {
      const raw = {
        x: Math.max(b.left + 2, Math.min(b.left + b.width - 2, at.x + point.x * rx * spread)),
        y: Math.max(b.top + 2, Math.min(b.top + b.height - 2, at.y - point.y * ry * spread)),
      };
      const spot = tomatoCardPoint(p, ms, raw, b);
      positions.setXYZ(i, spot.x, -spot.y, TOMATO_DEPTH + 0.2);
    });
    positions.needsUpdate = true;
    this.splat.geometry.computeBoundingSphere();
    this.splat.visible = age >= 0 && fade > 0;
    this.splat.material.opacity = 0.83 * fade;
    this.glints.forEach((line, i) => {
      const points = line.geometry.getAttribute('position');
      for (let n = 0; n <= 8; n++) {
        const a = 0.7 + (n / 8) * 0.65,
          raw = {
            x: at.x - Math.cos(a) * rx * (0.58 + i * 0.19) * spread,
            y: at.y - Math.sin(a) * ry * (0.5 + i * 0.16) * spread,
          };
        const spot = tomatoCardPoint(p, ms, raw, b);
        points.setXYZ(n, spot.x, -spot.y, TOMATO_DEPTH + 0.65);
      }
      points.needsUpdate = true;
      line.geometry.computeBoundingSphere();
      line.visible = age > 100 && fade > 0;
      line.material.opacity = fade * 0.5;
    });
    let puddle = 0;
    this.drips.forEach((mesh, i) => {
      const born = p.travel + 170 + i * 100,
        t = Math.max(0, ms - born) / p.runoff;
      const flow = clamp(t * t),
        x0 = Math.max(
          b.left + 2,
          Math.min(b.left + b.width - 2, at.x + Math.sin(i * 2.399 + p.phase) * rx * 0.65),
        );
      const side = p.side > 0 ? -1 : 1,
        edge = side < 0 ? b.left + 2 + (i % 2) * 2 : b.left + b.width - 2 - (i % 2) * 2;
      const y0 = at.y + ry * 0.55,
        endY = b.top + b.height + 7 + (i % 3) * 3;
      const points = mesh.geometry.getAttribute('position'),
        width = (1.3 + (i % 3) * 0.55) * p.force;
      let tip: Point = { x: x0, y: y0 };
      for (let n = 0; n <= 16; n++) {
        const u = (n / 16) * flow,
          x = x0 + (edge - x0) * tomatoEase(u / 0.42),
          y = y0 + (endY - y0) * u;
        const raw = { x, y },
          spot = tomatoCardPoint(p, ms, raw, b);
        const taper = width * (0.7 + 0.3 * Math.sin((n / 16) * Math.PI));
        const left = tomatoCardPoint(p, ms, { x: raw.x - taper / 2, y }, b),
          right = tomatoCardPoint(p, ms, { x: raw.x + taper / 2, y }, b);
        points.setXYZ(n * 2, left.x, -left.y, TOMATO_DEPTH + 0.4);
        points.setXYZ(n * 2 + 1, right.x, -right.y, TOMATO_DEPTH + 0.4);
        tip = spot;
      }
      points.needsUpdate = true;
      mesh.geometry.computeBoundingSphere();
      mesh.visible = ms >= born && fade > 0;
      mesh.material.opacity = fade * 0.85;
      const head = this.heads[i],
        drop = this.drops[i];
      if (!head || !drop) return;
      head.visible = mesh.visible;
      head.position.set(tip.x, -tip.y, TOMATO_DEPTH + 0.6);
      head.scale.set(width * 0.9, width * 1.2, 1);
      head.material.opacity = fade * 0.85;
      const dropAge = (ms - born - p.runoff - i * 60) / 1000;
      const floor = b.top + b.height + 25,
        distance = floor - endY;
      const landing = Math.sqrt(distance / 160);
      drop.visible = dropAge >= 0 && dropAge < landing;
      drop.position.set(edge, -endY - 160 * Math.max(0, dropAge) ** 2, TOMATO_DEPTH + 1);
      drop.scale.set(width * 0.8, width * 1.3, 1);
      drop.material.opacity = fade;
      if (dropAge >= landing) puddle += tomatoEase((dropAge - landing) / 0.3);
    });
    const edge = p.side > 0 ? b.left : b.left + b.width;
    this.puddle.position.set(edge, -b.top - b.height - 25, TOMATO_DEPTH);
    this.puddle.scale.set(4 + puddle * 2.2, 1 + puddle * 0.35, 1);
    this.puddle.visible = puddle > 0 && fade > 0;
    this.puddle.material.opacity = fade * 0.7;
  }
}
