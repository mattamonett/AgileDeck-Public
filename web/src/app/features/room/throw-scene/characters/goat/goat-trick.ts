import * as THREE from 'three';
import { requireSceneObject } from '../../engine/scene-object';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { mixPoint } from '../../kit';
import { goatDetails, goatFoot, goatLegs } from './goat-model';
import {
  GOAT_DURATION,
  GOAT_SCALE,
  goatCardPoint,
  goatCardPose,
  goatEase,
  goatFrames,
  goatPlan,
} from './goat-choreography';
export { makeGoats, goatWalk } from './goat-model';
export { GOAT_DURATION } from './goat-choreography';
interface Pose {
  point: Point;
  turn: number;
  tilt: number;
  head: number;
  airborne: number;
  stride: number;
  bleat: number;
  perch: boolean;
}
function jump(a: Point, b: Point, q: number, height: number): Point {
  const point = mixPoint(a, b, goatEase(q));
  return { x: point.x, y: point.y - Math.sin(Math.max(0, Math.min(1, q)) * Math.PI) * height };
}
export class GoatTrick {
  readonly object = new THREE.Group();
  readonly plan;
  readonly duration;
  private readonly chips: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly rays: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly crown = new THREE.Group();
  constructor(id: string) {
    this.plan = goatPlan(id);
    this.duration = GOAT_DURATION * this.plan.pace;
    for (let i = 0; i < 12; i++) {
      const chip = new THREE.Mesh(
        new THREE.PlaneGeometry(3, 1.5),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? 0xece1c6 : 0x6f7773,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      this.chips.push(chip);
      this.object.add(chip);
    }
    for (let i = 0; i < 6; i++) {
      const ray = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 8),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? 0xffeed0 : 0xc4a35e,
          transparent: true,
          depthWrite: false,
        }),
      );
      this.rays.push(ray);
      this.object.add(ray);
    }
    for (let i = 0; i < 3; i++) {
      const shape = new THREE.Shape();
      for (let j = 0; j < 10; j++) {
        const a = (j * Math.PI) / 5 + Math.PI / 2,
          r = j % 2 ? 1.5 : 3.3,
          x = Math.cos(a) * r,
          y = Math.sin(a) * r;
        if (j === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      shape.closePath();
      const star = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshBasicMaterial({ color: 0xffd367, transparent: true, depthWrite: false }),
      );
      star.position.set((i - 1) * 9, i === 1 ? 3 : 0, 0);
      this.crown.add(star);
    }
    this.object.add(this.crown);
  }
  cardAnimation(facing: number) {
    return goatFrames(this.plan, facing);
  }
  private top(ms: number, b: TargetBounds, facing: number) {
    return goatCardPoint(this.plan, ms, { x: b.left + b.width / 2, y: b.top }, b, facing);
  }
  private pose(
    index: number,
    ms: number,
    b: TargetBounds,
    end: Point,
    facing: number,
    view: Point,
  ): Pose {
    const p = this.plan,
      top = this.top(ms, b, facing),
      initial = { x: end.x - facing * index * 52 * GOAT_SCALE, y: end.y };
    const floor = { x: end.x - facing * (index === 2 ? 44 : 0), y: end.y };
    let point = initial,
      perch = false,
      airborne = 0,
      head = 0,
      tilt = 0,
      turn = 0,
      bleat = 0,
      stride = 0;
    const land = index === 0 ? p.leader : p.hits[index === 1 ? 0 : 1] + 400,
      hit = index === 0 ? p.leader : p.hits[index === 1 ? 0 : 1],
      start = index === 0 ? 280 : hit - 620;
    if (ms < start) {
      const gather = index === 0 ? 0 : goatEase((ms - p.leader) / 320);
      point = mixPoint(initial, floor, gather);
      stride = gather > 0 && gather < 1 ? Math.sin(gather * Math.PI) : 0;
      head = index === 0 ? 0 : 0.08 * goatEase((ms - p.leader - 160) / 240);
    } else if (ms < land) {
      const jumpStart = { x: end.x, y: end.y };
      if (index > 0 && ms < start + 160) {
        const load = goatEase((ms - start) / 160);
        point = mixPoint(floor, jumpStart, load);
        stride = index === 2 ? Math.sin(((ms - start) / 160) * Math.PI) : 0;
        head = 0.08 * (1 - load) - 0.2 * load;
      } else if (index === 0) {
        const q = (ms - start) / (land - start);
        point = jump(jumpStart, top, q, b.height * 0.24 + 12);
        airborne = Math.sin(Math.max(0, Math.min(1, q)) * Math.PI);
        head = -0.15 * airborne;
      } else {
        const native = new THREE.Vector3(-9, 20, 4.3)
          .applyAxisAngle(new THREE.Vector3(0, 0, 1), -0.9)
          .add(new THREE.Vector3(14, 32, 0));
        const contact = {
          x: top.x - facing * (15 + native.x) * GOAT_SCALE,
          y: top.y + (native.y - 27) * GOAT_SCALE,
        };
        if (ms <= hit) {
          const q = (ms - start - 160) / (hit - start - 160);
          point = jump(jumpStart, contact, q, b.height * 0.13 + 8);
          airborne = Math.sin(Math.max(0, Math.min(1, q)) * Math.PI);
          head = -0.2 - 0.7 * goatEase(q);
        } else {
          const q = (ms - hit) / 400;
          point = jump(contact, top, q, 14);
          airborne = Math.sin(q * Math.PI);
          head = -0.9 * (1 - goatEase(q));
        }
      }
    } else {
      point = top;
      perch = true;
    }
    const dethroned = index === 0 ? p.hits[0] : index === 1 ? p.hits[1] : undefined;
    if (dethroned !== undefined && ms >= dethroned) {
      const age = ms - dethroned,
        q = goatEase(age / 650),
        down = { x: end.x - facing * (index === 0 ? 88 : 0), y: end.y };
      const from = this.top(dethroned, b, facing);
      point = jump(from, down, age / 650, 25);
      point.x = from.x + (down.x - from.x) * goatEase(age / 400);
      perch = false;
      airborne = age < 650 ? Math.sin((age / 650) * Math.PI) : 0;
      tilt = facing * Math.sin(Math.min(1, age / 650) * Math.PI) * 0.8;
      turn = q;
      head =
        age < 650
          ? 0.18 * Math.sin(age / 80)
          : 0.09 * Math.sin(age / 95) * (1 - goatEase((age - 650) / 400));
    }
    if (index === 2 && ms > land + 180 && ms < p.departure) {
      const q = goatEase((ms - land - 180) / 220) * (1 - goatEase((ms - p.departure + 220) / 220));
      bleat = q * Math.max(0, Math.sin((ms - land - 180) / 95));
      head = 0.18 * q;
      if (p.stamp) {
        const u = (ms - (p.hits[1] + 980)) / 90;
        if (u > 0 && u < 1) {
          point = { x: top.x, y: top.y - Math.sin(u * Math.PI) * 4 };
          perch = false;
          airborne = Math.sin(u * Math.PI) * 0.4;
        }
      }
    }
    if (ms >= p.departure) {
      const ground = { x: end.x - facing * 44, y: end.y },
        drop = goatEase((ms - p.departure) / 420);
      if (index === 2 && ms < p.departure + 420) {
        point = jump(this.top(p.departure, b, facing), ground, (ms - p.departure) / 420, 24);
        airborne = Math.sin(((ms - p.departure) / 420) * Math.PI);
        perch = false;
        head = 0;
        turn = drop;
      } else if (index === 2) point = ground;
      const exitStart = p.departure + 600,
        q = goatEase((ms - exitStart) / (1600 * p.exit)),
        startPoint =
          index === 2 ? ground : { x: end.x - facing * (index === 0 ? 88 : 0), y: end.y };
      if (ms >= p.departure + 420 || index < 2) {
        const spacing = index === 0 ? 88 : index === 1 ? 0 : 44;
        point = mixPoint(
          startPoint,
          { x: (facing > 0 ? -90 : view.x + 90) - facing * spacing, y: end.y },
          q,
        );
        turn = 1;
        tilt = 0;
        head = 0;
        bleat = 0;
        perch = false;
        airborne = 0;
        stride = q > 0 && q < 1 ? Math.min(1, Math.sin(q * Math.PI) * 3) : 0;
        const lane = Math.min(50, Math.max(0, view.y - 25 - end.y));
        point.y +=
          lane * goatEase(q / 0.3) -
          Math.abs(Math.sin((point.x - startPoint.x) * 0.095 + index * 0.5)) * 9 * stride;
      }
    }
    return { point, turn, tilt, head, airborne, stride, bleat, perch };
  }
  update(
    elapsed: number,
    herd: THREE.Group,
    b: TargetBounds,
    end: Point,
    view: Point = { x: window.innerWidth, y: window.innerHeight },
  ) {
    const ms = elapsed / this.plan.pace,
      facing = end.x < b.left + b.width / 2 ? 1 : -1;
    this.object.position.set(-end.x, end.y, 0);
    this.object.visible = ms < GOAT_DURATION;
    herd.position.set(0, 0, 168.56);
    herd.scale.setScalar(GOAT_SCALE);
    herd.visible = ms < GOAT_DURATION;
    herd.children.forEach((goat, index) => {
      const q = this.pose(this.plan.order.indexOf(index), ms, b, end, facing, view);
      goat.position.set(q.point.x / GOAT_SCALE, -q.point.y / GOAT_SCALE, 0);
      goat.scale.set(facing, 1, 1);
      goat.rotation.set(0, Math.PI * q.turn, q.tilt);
      const body = requireSceneObject(goat, 'body');
      body.rotation.set(0, 0, 0);
      body.position.y = 0;
      goatDetails(goat, ms + index * 450, q.head, q.stride + q.airborne, q.bleat);
      goatLegs(goat, q.point.x * 0.8, q.stride, this.plan.step, q.airborne);
      if (q.perch) {
        goat.updateMatrixWorld(true);
        for (let i = 0; i < 4; i++) {
          const raw = {
              x: b.left + b.width / 2 + facing * (i < 2 ? -10 : 10) * GOAT_SCALE,
              y: b.top,
            },
            foot = goatCardPoint(this.plan, ms, raw, b, facing);
          goatFoot(
            goat,
            i,
            new THREE.Vector3(foot.x, -foot.y, 168.56 + (i % 2 ? 5 : -5) * GOAT_SCALE),
            (-goatCardPose(this.plan, ms, facing).angle * Math.PI) / 180,
          );
        }
      }
    });
    herd.updateMatrixWorld(true);
    for (const [i, chip] of this.chips.entries()) {
      const latest = [this.plan.leader, this.plan.hits[0] + 400, this.plan.hits[1] + 400]
          .filter((t) => ms >= t)
          .at(-1),
        age = latest === undefined ? 1000 : ms - latest;
      chip.visible = age >= 0 && age < 500;
      const top = this.top(ms, b, facing);
      chip.position.set(
        top.x + (i - 5.5) * 3 + (i % 2 ? 1 : -1) * age * 0.02,
        -top.y + Math.sin((age / 500) * Math.PI) * 8 - age * 0.025,
        22,
      );
      chip.rotation.z = i * 0.7 + age * 0.004;
      chip.material.opacity = 1 - goatEase(age / 500);
    }
    for (const [i, ray] of this.rays.entries()) {
      const hit = this.plan.hits.find((t) => ms >= t && ms < t + 180),
        age = hit === undefined ? 1000 : ms - hit;
      ray.visible = age < 180;
      const top = this.top(ms, b, facing),
        a = (i * Math.PI) / 3;
      ray.position.set(
        top.x - facing * 15 * GOAT_SCALE + Math.cos(a) * (7 + age * 0.03),
        -top.y + 27 * GOAT_SCALE + Math.sin(a) * (7 + age * 0.03),
        25,
      );
      ray.rotation.z = a - Math.PI / 2;
      ray.material.opacity = 1 - goatEase(age / 180);
    }
    const winner = herd.children[this.plan.order[2]];
    this.crown.visible = !!winner && ms > this.plan.hits[1] + 650 && ms < this.plan.departure;
    if (winner) {
      const point = requireSceneObject(winner, 'head').localToWorld(new THREE.Vector3(-2, 31, 5));
      this.crown.position.set(point.x, point.y + Math.sin(ms / 180) * 1.5, 27);
    }
  }
}
