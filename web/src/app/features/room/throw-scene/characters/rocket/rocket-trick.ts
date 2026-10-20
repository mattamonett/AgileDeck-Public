import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { nativeRocketPlan, rocketDetails, ink } from './rocket-model';
import {
  ROCKET_DURATION,
  ROCKET_NOZZLE,
  ROCKET_SCALE,
  rocketCardPoint,
  rocketCardPose,
  rocketContact,
  rocketEase,
  rocketFrames,
  rocketPose,
  type RocketPlan,
} from './rocket-choreography';
export function rocketNativePoint(
  p: RocketPlan,
  ms: number,
  start: Point,
  b: TargetBounds,
  view: Point,
  facing: number,
  y: number,
) {
  const q = rocketPose(p, ms, start, b, view, facing);
  return new THREE.Vector3(0, y * ROCKET_SCALE, 0)
    .applyEuler(new THREE.Euler(0, q.bank, q.angle, 'ZXY'))
    .add(new THREE.Vector3(q.point.x, -q.point.y, 172));
}
export function rocketSmokeSource(
  p: RocketPlan,
  ms: number,
  start: Point,
  b: TargetBounds,
  view: Point,
  facing: number,
) {
  const q = rocketPose(p, ms, start, b, view, facing);
  return rocketNativePoint(
    p,
    ms,
    start,
    b,
    view,
    facing,
    ROCKET_NOZZLE - 30 * (0.18 + q.power * 0.9),
  );
}
export class RocketTrick {
  readonly object = new THREE.Group();
  readonly plan;
  readonly duration;
  private readonly trail: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly cough: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly wake: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly chips: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly dent: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>[] = [];
  private readonly burn: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly contact = new THREE.Mesh(new THREE.RingGeometry(1.5, 2.3, 24), ink(0xffd397));
  constructor(actor: THREE.Group) {
    this.plan = nativeRocketPlan(actor);
    this.duration = ROCKET_DURATION * this.plan.pace;
    this.object.name = 'rocket-engine-comedy';
    this.contact.name = 'rocket-tip-contact';
    this.object.add(this.contact);
    for (const [count, list, name] of [
      [12, this.trail, 'route-smoke'],
      [24, this.cough, 'cough-smoke'],
      [16, this.wake, 'escape-smoke'],
    ] as const) {
      for (let i = 0; i < count; i++) {
        const m = new THREE.Mesh(new THREE.CircleGeometry(1, 20), ink(i % 2 ? 0x6a797b : 0xd3cabb));
        m.name = `${name}-${i}`;
        list.push(m);
        this.object.add(m);
      }
    }
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 3.5), ink(i % 2 ? 0xf3d5a4 : 0xffefce));
      m.name = `rocket-paper-${i}`;
      this.chips.push(m);
      this.object.add(m);
    }
    for (let i = 0; i < 2; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(11 * 3), 3));
      const line = new THREE.Line(
        g,
        new THREE.LineBasicMaterial({
          color: i ? 0x9b7858 : 0xffdfad,
          transparent: true,
          depthWrite: false,
        }),
      );
      line.name = `nose-dent-${i}`;
      this.dent.push(line);
      this.object.add(line);
    }
    for (let i = 0; i < 7; i++) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ink(i % 2 ? 0x695641 : 0x998061));
      strip.name = `engine-scorch-${i}`;
      this.burn.push(strip);
      this.object.add(strip);
    }
  }
  cardAnimation(facing: number) {
    return rocketFrames(this.plan, facing);
  }
  update(
    elapsed: number,
    actor: THREE.Group,
    start: Point,
    b: TargetBounds,
    view: Point,
    facing: number,
  ) {
    const p = this.plan,
      ms = elapsed / p.pace,
      q = rocketPose(p, ms, start, b, view, facing);
    this.object.position.set(0, 0, 0);
    this.object.visible = ms < ROCKET_DURATION;
    actor.scale.setScalar(ROCKET_SCALE);
    actor.rotation.set(0, q.bank, q.angle, 'ZXY');
    actor.position.set(q.point.x, -q.point.y, 172);
    actor.visible = ms < p.departure + 420 + p.exit;
    rocketDetails(
      actor,
      ms,
      q.power,
      p.fault &&
        actor.visible &&
        ((ms >= p.pad && ms < p.departure) || (ms >= p.departure + 420 && q.power < 0.35)),
    );
    actor.updateMatrixWorld(true);
    const age = ms - p.hit,
      tip = rocketCardPoint(p, ms, rocketContact(p, b, facing), b, facing);
    this.contact.visible = age >= 0 && age < 280;
    this.contact.position.set(tip.x, -tip.y, 174);
    this.contact.scale.setScalar(1 + rocketEase(age / 280) * 4);
    this.contact.material.opacity = 1 - rocketEase(age / 280);
    this.trail.forEach((m, i) =>
      this.smoke(
        m,
        ms,
        p.ignite + 75 + (i * (p.travel - 150)) / 12,
        750,
        i,
        start,
        b,
        view,
        facing,
        0,
      ),
    );
    this.cough.forEach((m, i) => {
      const block = Math.floor(i / 6),
        fire = block === 3 ? p.departure : p.fires[block];
      if (fire === undefined) {
        m.visible = false;
        return;
      }
      this.smoke(m, ms, fire + 35 + (i % 6) * 30, 850, i, start, b, view, facing, 1);
    });
    this.wake.forEach((m, i) =>
      this.smoke(m, ms, p.departure + 420 + (i * p.exit) / 16, 950, i, start, b, view, facing, 0),
    );
    this.chips.forEach((m, i) => {
      const at = rocketCardPoint(p, p.hit, rocketContact(p, b, facing), b, facing),
        t = age / 1000;
      m.visible = t >= 0 && t < 0.75;
      m.position.set(
        at.x + Math.sin(i * 2.1 + p.phase) * t * 23,
        -at.y + (20 + (i % 3) * 7) * t - 75 * t * t,
        174,
      );
      m.rotation.z = t * (i % 2 ? 3 : -3);
      m.material.opacity = 1 - rocketEase((t - 0.4) / 0.35);
    });
    const cleanup = p.departure + 420 + p.exit + 350,
      heal = 1 - rocketEase((ms - cleanup) / 550);
    this.dent.forEach((line, layer) => {
      const positions = line.geometry.getAttribute('position');
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * Math.PI * 2,
          r = i % 2 ? 2 : 5;
        const at = rocketCardPoint(
          p,
          ms,
          {
            x: rocketContact(p, b, facing).x + Math.cos(a) * r + layer * 0.7,
            y: rocketContact(p, b, facing).y + Math.sin(a) * r,
          },
          b,
          facing,
        );
        positions.setXYZ(i, at.x, -at.y, 173 + layer * 0.1);
      }
      positions.needsUpdate = true;
      line.geometry.computeBoundingSphere();
      line.visible = age >= 0 && heal > 0;
      line.material.opacity = heal * 0.7;
    });
    const first = p.fires[0];
    if (first === undefined) throw Error('Missing rocket ignition');
    const scorch = rocketEase((ms - first) / 800) * heal;
    this.burn.forEach((m, i) => {
      const length = (9 + (i % 3) * 4) * scorch,
        pose = rocketCardPose(p, ms, facing);
      const at = rocketCardPoint(
        p,
        ms,
        { x: b.left + b.width / 2 + (i - 3) * 2.2, y: b.top + length / 2 },
        b,
        facing,
      );
      m.position.set(at.x, -at.y, 170);
      m.rotation.z = (-pose.angle * Math.PI) / 180;
      m.scale.set(2.3, length * pose.sy, 1);
      m.visible = scorch > 0;
      m.material.opacity = scorch * (i % 2 ? 0.32 : 0.46);
    });
  }
  private smoke(
    m: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>,
    ms: number,
    born: number,
    life: number,
    i: number,
    start: Point,
    b: TargetBounds,
    view: Point,
    facing: number,
    cough: number,
  ) {
    const p = this.plan,
      t = (ms - born) / life,
      power = rocketPose(p, born, start, b, view, facing).power;
    m.visible = t >= 0 && t < 1 && power > 0.01;
    if (!m.visible) return;
    const source = rocketSmokeSource(p, born, start, b, view, facing);
    m.position
      .copy(source)
      .add(
        new THREE.Vector3(
          Math.sin(i * 2.3 + p.phase) * t * (cough ? 15 : 10),
          t * (cough ? 23 : 9),
          -t,
        ),
      );
    m.scale.set((2 + t * 5) * (0.8 + power * 0.3), 2 + t * 4, 1);
    m.material.opacity = (1 - rocketEase(t)) * (cough ? 0.43 : 0.35);
  }
}
