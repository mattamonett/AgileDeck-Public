import { clamp } from '../../kit';
import * as THREE from 'three';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { requireSceneObject } from '../../engine/scene-object';
import { dogPose, dogRun, liquid } from './dog-model';
import {
  DOG_DURATION,
  dogPlan,
  dogEase,
  dogCardPose,
  dogSplashPoint,
  type DogPlan,
} from './dog-choreography';
const up = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
export class DogTrick {
  readonly object = new THREE.Group();
  readonly plan: DogPlan;
  get duration() {
    return DOG_DURATION * this.plan.pace;
  }
  private readonly stream = new THREE.Group();
  private readonly puddle = new THREE.Group();
  private readonly jet = Array.from({ length: 20 }, () =>
    liquid(0xf4d556, new THREE.CylinderGeometry(0.95, 1.15, 1, 7)),
  );
  private readonly stains = Array.from({ length: 6 }, () =>
    liquid(0xd8ac24, new THREE.SphereGeometry(1, 12, 8)),
  );
  private readonly drips = Array.from({ length: 6 }, () =>
    liquid(0xe4ba38, new THREE.CapsuleGeometry(1, 1, 4, 8)),
  );
  private readonly droplets = Array.from({ length: 12 }, () =>
    liquid(0xf4d556, new THREE.SphereGeometry(1, 10, 8)),
  );
  private readonly pools = Array.from({ length: 5 }, () =>
    liquid(0xd8ac24, new THREE.SphereGeometry(1, 14, 8)),
  );
  private readonly marks: readonly { u: number; v: number; radius: number }[];
  private readonly origin = new THREE.Vector3();
  constructor(id = 'landing') {
    this.plan = dogPlan(id);
    const random = seededRandom(id + ':pee-runoff');
    this.marks = this.stains.map(() => ({
      u: random() * 0.1,
      v: random() * 0.06 - 0.03,
      radius: 1.8 + random() * 2.8,
    }));
    this.stream.name = 'pee-stream';
    this.stream.add(...this.jet);
    this.puddle.name = 'pee-puddle';
    this.puddle.add(...this.pools);
    this.object.add(this.stream, this.puddle, ...this.stains, ...this.drips, ...this.droplets);
    for (const part of this.object.children) part.visible = false;
  }
  cardAnimation(facing: number) {
    const frames: Keyframe[] = [];
    for (let ms = 0; ms <= DOG_DURATION; ms += 40) {
      const pose = dogCardPose(ms, this.plan, facing);
      frames.push({ offset: ms / DOG_DURATION, translate: pose.x + 'px ' + pose.y + 'px' });
    }
    return { frames, options: { duration: this.duration, easing: 'linear' } };
  }
  update(
    ms: number,
    dog: THREE.Group,
    b: TargetBounds,
    end: Point,
    viewport = {
      x: typeof window === 'undefined' ? 1024 : window.innerWidth,
      y: typeof window === 'undefined' ? 768 : window.innerHeight,
    },
  ) {
    ms = Math.round((ms / this.plan.pace) * 1e6) / 1e6;
    const facing = end.x < b.left + b.width / 2 ? 1 : -1;
    const lift = dogEase((ms - 1250) / 430) * (1 - dogEase((ms - 3150) / 350)) * this.plan.lift;
    const sniff = ms < 1000 ? Math.abs(Math.sin(clamp(ms / 1000) * Math.PI * this.plan.sniffs)) : 0;
    const lean = dogEase(ms / 250) * (1 - dogEase((ms - 950) / 300));
    const turn = dogEase((ms - 1000) / 300);
    const depart = dogEase((ms - 3800) / (750 * this.plan.exit));
    const exit = facing > 0 ? -90 : viewport.x + 90;
    const originX = end.x + facing * (9 * lean + 4 * turn);
    const x = originX + (exit - originX) * depart;
    const exitProgress = clamp((ms - 3800) / (750 * this.plan.exit));
    const stride = Math.min(
      1,
      ((Math.abs(exit - originX) * 6 * exitProgress * (1 - exitProgress)) /
        (750 * this.plan.exit)) *
        7,
    );
    const hop =
      this.plan.hop && depart > 0 && depart < 0.75 ? Math.sin((depart / 0.75) * Math.PI) * 12 : 0;
    dogRun(dog, depart > 0 ? Math.abs(x - originX) : 0, facing, ms * this.plan.wag, stride);
    dog.position.set(x, -end.y + hop, 160);
    dog.rotation.y = turn * Math.PI;
    dogPose(
      dog,
      depart > 0 ? Math.abs(x - originX) : 0,
      lift,
      -0.08 - sniff * 0.16 + (ms > 2000 && ms < 2900 ? 0.08 : 0),
      ms * this.plan.wag,
      stride,
    );
    const head = requireSceneObject(dog, 'puppy-head');
    head.position.y = 14 - sniff * 1.5;
    head.rotation.y = ms > 2000 && ms < 2900 ? Math.sin(((ms - 2000) / 900) * Math.PI) * 0.18 : 0;
    requireSceneObject(dog, 'puppy-tongue').visible = ms >= 2900 || ms < 1250;
    dog.visible = ms < 4650 && depart < 1;
    dog.updateMatrixWorld(true);
    requireSceneObject(dog, 'pee-origin').getWorldPosition(this.origin);
    this.object.position.set(-end.x, end.y, 0);
    const splash = dogSplashPoint(ms, this.plan, b, facing);
    const fade = clamp((DOG_DURATION - ms) / 500);
    const flow = dogEase((ms - 1800) / 120) * (1 - dogEase((ms - 2860) / 130));
    this.stream.visible = ms >= 1800 && ms < 2990;
    const point = (t: number) => ({
      x: this.origin.x + (splash.x - this.origin.x) * t,
      y:
        -this.origin.y +
        (splash.y + this.origin.y) * t -
        Math.sin(t * Math.PI) * (17 + this.plan.pressure * 5),
    });
    this.jet.forEach((segment, i) => {
      const a = point(i / this.jet.length);
      const z = point((i + 1) / this.jet.length);
      direction.set(z.x - a.x, a.y - z.y, 0);
      segment.position.set((a.x + z.x) / 2, -(a.y + z.y) / 2, 37);
      segment.scale.set(
        flow * this.plan.pressure,
        direction.length() + 0.4,
        flow * this.plan.pressure,
      );
      segment.quaternion.setFromUnitVectors(up, direction.normalize());
      segment.material.opacity = 0.95 * flow;
    });
    const fill = dogEase((ms - 1830) / 850);
    this.stains.forEach((stain, i) => {
      const mark = this.marks[i];
      if (!mark) return;
      stain.visible = ms >= 1840 && fade > 0;
      const x = splash.x + facing * mark.u * b.width;
      const y = splash.y + mark.v * b.height;
      stain.position.set(x, -y, 12);
      stain.scale.set(mark.radius * fill, (mark.radius + 1.5) * fill, 0.25);
      stain.material.opacity = 0.55 * fade;
      const drip = this.drips[i];
      if (!drip) return;
      const length = Math.max(
        0,
        Math.min(
          b.top + b.height - y + 4 + (i % 3) * 3,
          ((ms - 1950 - i * 70) / 1000) * (18 + i * 2) * this.plan.pressure,
        ),
      );
      drip.visible = length > 0 && fade > 0;
      drip.position.set(x, -y - length / 2, 13);
      drip.scale.set((0.6 + (i % 2) * 0.35) * fill, length / 3, 0.35);
      drip.material.opacity = 0.72 * fade;
    });
    this.puddle.visible = ms >= 2150 && fade > 0;
    this.pools.forEach((pool, i) => {
      const spread = dogEase((ms - 2150 - i * 90) / 1100) * this.plan.pressure;
      pool.position.set(splash.x + (i - 2) * 6, -b.top - b.height - 8 - (i % 2), 16);
      pool.scale.set((7 + (i % 3) * 2) * spread, (2 + (i % 2)) * spread, 0.5);
      pool.material.opacity = fade * 0.7;
    });
    this.droplets.forEach((drop, i) => {
      const age = ((Math.min(ms, 2940) - 1800) / 460 + i / this.droplets.length) % 1;
      drop.visible = ms >= 1870 && ms < 3180;
      drop.position.set(
        splash.x + Math.sin(i * 7) * age * 22,
        -splash.y + Math.sin(age * Math.PI) * 7 - age * age * 22,
        30,
      );
      drop.scale.set(0.8 + (i % 2) * 0.3, 1.3, 0.8);
      drop.material.opacity = flow * fade;
    });
  }
}
