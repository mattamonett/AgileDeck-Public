import { clamp } from '../../kit';
import * as THREE from 'three';
import { requireSceneObject } from '../../engine/scene-object';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  wrestlerArmTo,
  wrestlerHand,
  wrestlerLegTo,
  wrestlerRunLimbs,
  paperChip,
} from './wrestler-model';
import {
  wrestlerPlan,
  wrestlerFrames,
  wrestlerEase,
  wrestlerCardPoint,
  wrestlerContact,
  wrestlerRoot,
  wrestlerLean,
  wrestlerFeet,
  WRESTLER_DURATION,
  WRESTLER_SCALE,
} from './wrestler-choreography';
export { makeWrestler, wrestlerWalk } from './wrestler-model';
export { WRESTLER_DURATION, WRESTLER_CONTACT_MS } from './wrestler-choreography';
export class WrestlerTrick {
  readonly object = new THREE.Group();
  readonly plan;
  private readonly chips = Array.from({ length: 16 }, paperChip);
  private readonly creases = Array.from(
    { length: 8 },
    (_, i) =>
      new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? 0xfff4de : 0x837465,
          transparent: true,
          depthWrite: false,
        }),
      ),
  );
  private readonly ring = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.35, 6, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe5af, transparent: true, depthWrite: false }),
  );
  get duration() {
    return WRESTLER_DURATION * this.plan.pace;
  }
  constructor(id: string) {
    this.plan = wrestlerPlan(id);
    this.object.add(this.ring, ...this.chips, ...this.creases);
    this.object.children.forEach((part) => (part.visible = false));
  }
  cardAnimation(facing: number) {
    return wrestlerFrames(this.plan, facing);
  }
  update(ms: number, man: THREE.Group, b: TargetBounds, end: Point, view = { x: 1024, y: 768 }) {
    ms = Math.round((ms / this.plan.pace) * 1e6) / 1e6;
    const p = this.plan,
      facing = end.x < b.left + b.width / 2 ? 1 : -1;
    const body = requireSceneObject(man, 'wrestler-body'),
      head = requireSceneObject(man, 'wrestler-head');
    const exitStart = p.departure + 180,
      exitLength = 1550 * p.exit,
      u = wrestlerEase((ms - exitStart) / exitLength);
    const out = -facing > 0 ? view.x + 100 : -100;
    const point =
      ms < p.departure
        ? wrestlerRoot(p, ms, b, end, facing)
        : { x: end.x + (out - end.x) * u, y: end.y };
    man.position.set(point.x, -point.y, 166.4);
    man.scale.setScalar(WRESTLER_SCALE);
    man.rotation.set(0, 0, 0);
    const turn = wrestlerEase((ms - p.departure) / 180);
    body.rotation.set(0, 0, ms < p.departure ? wrestlerLean(p, ms, facing) : facing * 0.08 * turn);
    const inspect =
      wrestlerEase((ms - p.hit - 900) / 150) * (1 - wrestlerEase((ms - p.departure + 200) / 200));
    head.rotation.set(0, facing * 0.06 * inspect, facing * 0.025 * inspect);
    requireSceneObject(man, 'mouth').scale.y = ms > p.hit - 100 && ms < p.hit + 160 ? 1.7 : 1;
    const blink = Math.abs(Math.sin(ms / 710 + p.step));
    for (const side of ['left', 'right'])
      requireSceneObject(man, side + '-eye').scale.y = blink < 0.055 ? 0.15 + blink * 13 : 1;
    man.updateMatrixWorld(true);
    if (ms >= p.departure) {
      const prior = wrestlerEase((ms - exitStart - 5) / exitLength),
        stride = Math.min(1, Math.abs((u - prior) * (out - end.x)) * 2);
      man.rotation.y = -facing * turn * 0.25;
      wrestlerRunLimbs(man, Math.abs(point.x - end.x), -facing, stride, p.step, true, turn);
    } else {
      const charge = wrestlerEase((ms - p.hit + 260) / 260),
        flex = wrestlerEase((ms - p.hit - 1100) / 300);
      const pose =
        wrestlerEase((ms - p.hit - 1700) / 200) *
        (1 - wrestlerEase((ms - p.departure + 240) / 180));
      const previous = wrestlerRoot(p, ms - 5, b, end, facing),
        speed = Math.min(1, Math.hypot(point.x - previous.x, point.y - previous.y) * 1.5);
      for (const side of [-1, 1]) {
        const rest = new THREE.Vector3(side * 22, -12, 10),
          tuck = new THREE.Vector3(-facing * 8 + side * 9, -2, 13),
          bicep = new THREE.Vector3(side * 31, 33, 9);
        const hand = rest.lerp(tuck, charge * (1 - flex)).lerp(bicep, flex);
        const target = man.localToWorld(hand);
        let open = 0,
          angle = 0;
        if (side === facing && pose > 0) {
          open = pose;
          if (p.wave) {
            target.lerp(
              man.localToWorld(
                new THREE.Vector3(facing * 4 + Math.sin((ms - p.hit) / 100) * 6, 40, 25),
              ),
              pose,
            );
          } else {
            const brim = requireSceneObject(man, 'orange-brim').localToWorld(
              new THREE.Vector3(facing * 0.5, 0, 0.86),
            );
            angle = Math.PI * pose;
            const offset = new THREE.Vector3(-1.2, -9.5, 2.5)
              .applyAxisAngle(new THREE.Vector3(0, 0, 1), angle)
              .multiplyScalar(WRESTLER_SCALE);
            offset.applyQuaternion(body.getWorldQuaternion(new THREE.Quaternion()));
            target.lerp(brim.sub(offset), pose);
          }
        }
        wrestlerArmTo(man, side, target, open, flex * (1 - open));
        wrestlerHand(man, side).rotation.z = angle;
        const foot = wrestlerFeet(p, ms, end, facing, side);
        const plant = wrestlerEase((ms - p.hit + 120) / 120);
        const phase = Math.abs(point.x - end.x) * 0.15 * p.step + (side < 0 ? Math.PI : 0);
        const gait = man.localToWorld(
          new THREE.Vector3(
            side * 10 + Math.sin(phase) * speed * 7,
            -54 + Math.max(0, Math.cos(phase)) * speed * 5,
            0,
          ),
        );
        const standing = new THREE.Vector3(
          end.x + side * 10 * WRESTLER_SCALE,
          -end.y - 54 * WRESTLER_SCALE,
          166.4,
        );
        const planted = new THREE.Vector3(foot.x, -foot.y, 166.4);
        const walking = gait.lerp(standing, 1 - charge);
        wrestlerLegTo(man, side, walking.lerp(planted, plant));
      }
    }
    man.visible = ms < exitStart + exitLength;
    man.updateMatrixWorld(true);
    this.object.position.set(-end.x, end.y, 0);
    this.object.visible = ms < WRESTLER_DURATION;
    const age = ms - p.hit,
      hit = wrestlerCardPoint(p, ms, wrestlerContact(p, b, facing), b, facing);
    this.ring.visible = age >= 0 && age < 210;
    const pop = clamp(age / 210);
    this.ring.position.set(hit.x, -hit.y, 24);
    this.ring.scale.setScalar(3 + pop * 17 * p.force);
    this.ring.material.opacity = (1 - pop) * 0.65;
    this.chips.forEach((chip, i) => {
      const q = clamp(age / 640);
      chip.visible = age >= 0 && age < 640;
      const origin = wrestlerContact(p, b, facing),
        a = (i / 16 - 0.5) * Math.PI;
      chip.position.set(
        origin.x - facing * (Math.cos(a) * q * 22 * p.force),
        -(origin.y + Math.sin(a) * q * 20 + q * q * 34),
        25 + i * 0.01,
      );
      chip.rotation.set(q * ((i % 3) - 1), q * 2, Math.sin(i) * q * 4);
      chip.material.opacity = 1 - q;
    });
    this.creases.forEach((line, i) => {
      const row = Math.floor(i / 2),
        start = wrestlerContact(p, b, facing);
      const a = wrestlerCardPoint(
        p,
        ms,
        { x: start.x + facing * (2 + row * 2), y: start.y + (row - 1.5) * 6 },
        b,
        facing,
      );
      const z = wrestlerCardPoint(
        p,
        ms,
        {
          x: start.x + facing * b.width * (0.2 + row * 0.015),
          y: start.y + (row - 1.5) * 11 + (i % 2 ? 0.7 : 0),
        },
        b,
        facing,
      );
      const length = Math.hypot(z.x - a.x, z.y - a.y);
      line.visible = age >= 0 && age < 1300;
      line.position.set((a.x + z.x) / 2, -(a.y + z.y) / 2, 22 + (i % 2) * 0.1);
      line.scale.set(length, i % 2 ? 0.7 : 1, 1);
      line.rotation.z = Math.atan2(-(z.y - a.y), z.x - a.x);
      line.material.opacity = (1 - wrestlerEase((age - 800) / 500)) * 0.75;
    });
  }
}
