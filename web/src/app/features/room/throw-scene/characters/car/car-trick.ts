import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { requireSceneObject } from '../../engine/scene-object';
import { raceCarDrive, carDriverRig, flat } from './car-model';
import {
  carPlan,
  carClamp,
  carEase,
  carApproach,
  carDistance,
  carCardPose,
  carCardPoint,
  carDriverPoint,
  carRootPose,
  carDriverPose,
  carClimb,
  carCough,
  carGlassOrigin,
  CAR_DURATION,
  CAR_SCALE,
} from './car-choreography';
function star(radius: number, color: number) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 ? radius * 0.42 : radius;
    if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return flat(new THREE.ShapeGeometry(s), color);
}
export class CarTrick {
  readonly object = new THREE.Group();
  readonly plan;
  get duration() {
    return CAR_DURATION * this.plan.pace;
  }
  private readonly creases = Array.from({ length: 2 }, (_, hit) => {
    const group = new THREE.Group();
    group.name = hit ? 'helmet-card-crease' : 'bumper-card-crease';
    for (let i = 0; i < 6; i++) {
      const line = flat(new THREE.PlaneGeometry(1, hit ? 7 : 10), 0x7b6965);
      const a = (i / 6) * Math.PI * 2;
      line.position.set(Math.cos(a) * (hit ? 4 : 6), Math.sin(a) * (hit ? 4 : 6), 0);
      line.rotation.z = a - Math.PI / 2;
      group.add(line);
    }
    return group;
  });
  private readonly stars = Array.from({ length: 4 }, () => star(3.2, 0xffd96b));
  private readonly sparks = Array.from({ length: 12 }, () =>
    flat(new THREE.PlaneGeometry(1.5, 5), 0xffdf86),
  );
  private readonly glass = Array.from({ length: 8 }, () => {
    const s = new THREE.Shape();
    s.moveTo(-2, -2);
    s.lineTo(3, -1);
    s.lineTo(0, 4);
    s.closePath();
    const shard = flat(new THREE.ShapeGeometry(s), 0xa8e7e5);
    shard.name = 'car-glass-shard';
    return shard;
  });
  private readonly smoke = Array.from({ length: 10 }, () =>
    flat(new THREE.SphereGeometry(1, 12, 8), 0x71808b),
  );
  private readonly skids = Array.from({ length: 8 }, () =>
    flat(new THREE.PlaneGeometry(7, 1.5), 0x171a22),
  );
  constructor(id: string) {
    this.plan = carPlan(id);
    this.object.add(
      ...this.creases,
      ...this.stars,
      ...this.sparks,
      ...this.glass,
      ...this.smoke,
      ...this.skids,
    );
    for (const part of this.object.children) part.visible = false;
  }
  cardAnimation(facing: number) {
    const frames: Keyframe[] = [];
    for (let ms = 0; ms <= CAR_DURATION; ms += 20) {
      const pose = carCardPose(ms, this.plan, facing);
      frames.push({
        offset: ms / CAR_DURATION,
        translate: pose.x + 'px ' + pose.y + 'px',
        rotate: pose.angle + 'deg',
        scale: pose.sx + ' 1',
      });
    }
    return { frames, options: { duration: this.duration, easing: 'linear' } };
  }
  travel(
    progress: number,
    car: THREE.Group,
    start: Point,
    end: Point,
    board: TargetBounds,
    facing: number,
    target: TargetBounds,
  ) {
    const p = this.plan;
    const point = carApproach(p, start, end, board, facing, progress, target);
    const previous = carApproach(
      p,
      start,
      end,
      board,
      facing,
      Math.max(0, progress - 0.015),
      target,
    );
    const ahead = carApproach(p, start, end, board, facing, Math.min(1, progress + 0.015), target);
    const distance = carDistance(p, start, end, board, facing, progress, target);
    const dx = ahead.x - previous.x;
    const dy = ahead.y - previous.y;
    const heading =
      Math.hypot(dx, dy) > 0.000001
        ? Math.atan2(-dy, dx)
        : Math.atan2(-(end.y - start.y), end.x - start.x);
    car.position.set(point.x, -point.y, 160);
    raceCarDrive(car, distance, heading);
    car.userData['drivenDistance'] = distance;
    const settle = carEase((progress - 1 + p.brake + 0.06) / (p.brake + 0.06));
    car.rotation.y += ((facing > 0 ? 0 : Math.PI) - car.rotation.y) * settle;
    car.rotation.z *= 1 - settle;
    car.updateMatrixWorld(true);
    this.object.position.set(-end.x, end.y, 0);
    this.object.visible = true;
    this.skids.forEach((mark, i) => {
      const t = 1 - p.brake + (p.brake * i) / 8;
      const point = carApproach(p, start, end, board, facing, t, target);
      mark.visible = progress >= t;
      mark.position.set(point.x + facing * 29 * CAR_SCALE, -point.y - 18.5, 24);
      mark.material.opacity = 0.45;
    });
  }
  update(
    ms: number,
    car: THREE.Group,
    b: TargetBounds,
    end: Point,
    view = {
      x: typeof window === 'undefined' ? 1024 : window.innerWidth,
      y: typeof window === 'undefined' ? 768 : window.innerHeight,
    },
  ) {
    ms = Math.round((ms / this.plan.pace) * 1e6) / 1e6;
    const p = this.plan;
    const facing = end.x < b.left ? 1 : -1;
    const root = carRootPose(ms, p, end, view, facing);
    const crush = carEase(ms / 150);
    car.position.set(root.x, -root.y, root.z);
    car.rotation.set(0, facing > 0 ? 0 : Math.PI, 0);
    car.scale.setScalar(CAR_SCALE);
    const driven = car.userData['drivenDistance'];
    const distance = typeof driven === 'number' ? driven : 0;
    const reverse = (facing > 0 ? end.x + 120 : view.x + 120 - end.x) * root.exit;
    car.traverse((part) => {
      if (part.name.includes('-wheel-')) part.rotation.z = -(distance - reverse) / (11 * CAR_SCALE);
    });
    const hood = requireSceneObject(car, 'hood');
    hood.scale.x = 1 - crush * 0.36;
    hood.rotation.z =
      crush * 0.55 +
      Math.sin(ms / 95) * 0.06 * crush * Math.exp(-ms / 650) +
      carCough(ms, p) * 0.13 +
      (root.exit > 0 ? Math.sin(ms / 85) * 0.025 : 0);
    const bumper = requireSceneObject(car, 'bumper');
    bumper.position.set(50 - crush * 10, -crush * 6, 0);
    bumper.rotation.z = -crush * 0.45;
    const windshield = requireSceneObject(car, 'windshield');
    windshield.visible = ms < 110;
    windshield.rotation.z = 0.2 + crush * 0.8;
    requireSceneObject(car, 'engine-spring').visible = ms > 150;
    requireSceneObject(car, 'steering-column').visible = ms <= 100;
    const driver = requireSceneObject(car, 'driver');
    const pose = carDriverPose(ms, p, b, end, view, facing);
    driver.position.copy(car.worldToLocal(new THREE.Vector3(pose.x, -pose.y, pose.z)));
    driver.rotation.set(0, 0, pose.angle);
    requireSceneObject(driver, 'neck').rotation.z = pose.neck;
    carDriverRig(car, ms, p);
    driver.traverse((part) => {
      if (part.name === 'driver-eye')
        part.scale.y =
          ms > 100 && ms < carClimb(p)
            ? 2.15
            : 1.8 * (Math.abs(Math.sin(ms / 590 + p.force)) < 0.06 ? 0.15 : 1);
    });
    car.updateMatrixWorld(true);
    const wheel = requireSceneObject(car, facing > 0 ? 'front-wheel-near' : 'front-wheel-far');
    if (ms >= 180) {
      const at = carRootPose(180, p, end, view, facing);
      const age = ms - 180;
      const rolling = Math.min(125, (age / 1000) * p.wheelSpeed);
      const bounce =
        age < 600
          ? Math.sin((age / 600) * Math.PI) * 14
          : age < 1000
            ? Math.sin(((age - 600) / 400) * Math.PI) * 4
            : 0;
      wheel.position.copy(
        car.worldToLocal(
          new THREE.Vector3(
            at.x + facing * 29 * CAR_SCALE - facing * rolling - facing * reverse,
            -(at.y + 10 * CAR_SCALE - bounce),
            171.2,
          ),
        ),
      );
      wheel.rotation.z = -(distance - rolling - reverse) / (11 * CAR_SCALE);
    } else wheel.position.set(29, -10, facing * 14);
    car.updateMatrixWorld(true);
    car.visible = ms < Math.round((p.departure + 1600 * p.exit) * 1e6) / 1e6;
    this.object.position.set(-end.x, end.y, 0);
    this.object.visible = ms < CAR_DURATION;
    const fade = carClamp((CAR_DURATION - ms) / 600);
    const cardPose = carCardPose(ms, p, facing);
    this.creases.forEach((mark, i) => {
      const point = carCardPoint(
        ms,
        i
          ? carDriverPoint(p, b, facing)
          : { x: facing > 0 ? b.left + 1 : b.left + b.width - 1, y: end.y },
        b,
        p,
        facing,
      );
      mark.visible = ms >= (i ? p.hit : 0);
      mark.position.set(point.x, -point.y, 29);
      mark.rotation.z = (-cardPose.angle * Math.PI) / 180;
      mark.traverse((part) => {
        if (part instanceof THREE.Mesh) part.material.opacity = 0.6 * fade;
      });
    });
    const head = requireSceneObject(driver, 'neck').localToWorld(new THREE.Vector3(0, 6, 0));
    this.stars.forEach((star, i) => {
      const a = (i / 4) * Math.PI * 2 + (ms - p.hit) / 110;
      star.visible = ms >= p.hit && ms < carClimb(p) + 200;
      star.position.set(head.x + Math.cos(a) * 13, head.y + 9 + Math.sin(a) * 4, 40);
      star.rotation.z = -a;
      star.material.opacity = 0.9 * fade;
    });
    this.sparks.forEach((spark, i) => {
      const hit = i < 8 ? 0 : p.hit;
      const age = ms - hit;
      const t = carClamp(age / 300);
      const point = carCardPoint(
        ms,
        i < 8
          ? { x: facing > 0 ? b.left : b.left + b.width, y: end.y }
          : carDriverPoint(p, b, facing),
        b,
        p,
        facing,
      );
      const a = (i / 8) * Math.PI * 2;
      spark.visible = age >= 0 && age < 300;
      spark.position.set(
        point.x + Math.cos(a) * (4 + t * 24),
        -point.y + Math.sin(a) * (4 + t * 18) - t * t * 10,
        32,
      );
      spark.rotation.z = a - Math.PI / 2;
      spark.material.opacity = 1 - t;
    });
    this.glass.forEach((shard, i) => {
      const t = carClamp((ms - 110) / 1000);
      shard.visible = ms >= 110 && ms < 1110;
      const origin = carGlassOrigin(p, end, view, facing, i);
      shard.position.set(
        origin.x + facing * t * (i - 3.5) * 7,
        -origin.y - t * 45 + Math.sin(t * Math.PI) * (15 + i * 2),
        35,
      );
      shard.rotation.z = i * 0.8 + t * (i % 2 ? 4 : -4);
      shard.material.opacity = (1 - t) * 0.7;
    });
    const engine = requireSceneObject(car, 'engine').getWorldPosition(new THREE.Vector3());
    this.smoke.forEach((puff, i) => {
      const cycle = (ms / 900 + i / 10) % 1;
      let coughing = 0;
      for (let c = 0; c < p.coughs; c++) {
        const age = ms - (p.departure - 650 + c * 220);
        if (age >= 0 && age < 400) coughing = Math.max(coughing, 1 - age / 400);
      }
      puff.visible = ms > 150 && car.visible;
      const size = 4 + cycle * 8 + coughing * 3;
      puff.position.set(
        engine.x - facing * cycle * 6 + Math.sin(i * 2 + cycle * 4) * 4,
        engine.y + 10 + cycle * 40,
        34,
      );
      puff.scale.set(size, size * 0.85, size * 0.5);
      puff.material.opacity = (1 - cycle) * (0.16 + coughing * 0.16) * fade;
    });
    for (const mark of this.skids) mark.material.opacity = 0.45 * fade;
  }
}
