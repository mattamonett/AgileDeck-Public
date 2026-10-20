import { clamp } from '../../kit';
import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { requireSceneObject } from '../../engine/scene-object';
import { dinoDetails, dinoMouth, dinoPlant, nativeDinoPlan, ink } from './dinosaur-model';
import {
  DINO_DURATION,
  DINO_SCALE,
  dinoArrival,
  dinoApproach,
  dinoApproachTurn,
  dinoCardPoint,
  dinoCardPose,
  dinoEase,
  dinoExit,
  dinoFrames,
  dinoLandingPoint,
  dinoStompLift,
  dinoTop,
  type DinoPlan,
} from './dinosaur-choreography';
export { makeDinosaur } from './dinosaur-model';

const hip = (i: number) => (i ? 5 : -6);
const world = (p: Point) => new THREE.Vector3(p.x, -p.y, 172);
export function dinoFootPoint(p: DinoPlan, ms: number, b: TargetBounds, facing: number, i: number) {
  const at = dinoCardPoint(
    p,
    ms,
    { x: b.left + b.width / 2 + facing * hip(i) * DINO_SCALE, y: b.top },
    b,
    facing,
  );
  const lift = i === p.foot ? dinoStompLift(p, ms) : 0;
  return { x: at.x + facing * lift * 3, y: at.y - lift * 14 * DINO_SCALE };
}

/** Distance-driven footprints remain fixed during stance, including the braking pause. */
function footprints(
  p: DinoPlan,
  path: (t: number) => Point,
  t: number,
  turn: (t: number) => number,
  facing: number,
  pause: number,
) {
  const knots: { point: Point; distance: number; t: number }[] = [];
  let distance = 0,
    previous = path(0);
  for (let i = 0; i <= 80; i++) {
    const at = path(i / 80);
    distance += Math.hypot(at.x - previous.x, at.y - previous.y);
    knots.push({ point: at, distance, t: i / 80 });
    previous = at;
  }
  const along = (u: number) => {
    const before = Math.floor(clamp(u) * 80),
      a = knots[before],
      c = knots[Math.min(80, before + 1)];
    return a && c ? a.distance + (c.distance - a.distance) * (clamp(u) * 80 - before) : 0;
  };
  const atDistance = (d: number) => {
    const first = knots[0],
      last = knots.at(-1);
    if (!first || !last) throw Error('Missing dinosaur path');
    if (d <= 0) return first;
    for (let i = 1; i < knots.length; i++) {
      const a = knots[i - 1],
        c = knots[i];
      if (a && c && c.distance >= d) {
        const q = clamp((d - a.distance) / Math.max(0.00001, c.distance - a.distance));
        return {
          point: {
            x: a.point.x + (c.point.x - a.point.x) * q,
            y: a.point.y + (c.point.y - a.point.y) * q,
          },
          t: a.t + (c.t - a.t) * q,
          distance: d,
        };
      }
    }
    return last;
  };
  const traveled = along(t),
    offset = 0.08 - ((along(pause) / p.gait) % 1);
  const goals = [0, 1].map((i) => {
    const phase = traveled / p.gait + i * 0.5 + offset,
      cycle = Math.floor(phase),
      fraction = phase - cycle;
    const planted = (cycle - i * 0.5 - offset + 0.18) * p.gait;
    const swing = clamp((fraction - 0.65) / 0.35),
      a = atDistance(planted),
      c = atDistance(planted + p.gait);
    const q = dinoEase(swing),
      bornTurn = turn(a.t);
    return world({
      x:
        a.point.x + (c.point.x - a.point.x) * q + facing * hip(i) * DINO_SCALE * Math.cos(bornTurn),
      y: a.point.y + (c.point.y - a.point.y) * q - Math.sin(swing * Math.PI) * p.lift,
    });
  });
  return { goals, distance: traveled };
}

export class DinosaurTrick {
  readonly object = new THREE.Group();
  readonly plan;
  readonly duration;
  private readonly waves: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly dust: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly chips: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly folds: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>[] = [];
  private readonly shock = new THREE.Mesh(new THREE.RingGeometry(1, 1.6, 32), ink(0xe2cca2));
  constructor(actor: THREE.Group) {
    this.plan = nativeDinoPlan(actor);
    this.duration = DINO_DURATION * this.plan.pace;
    this.object.name = 'dinosaur-tantrum';
    this.shock.name = 'stomp-shock';
    this.object.add(this.shock);
    for (let i = 0; i < 3; i++) {
      const wave = new THREE.Mesh(
        new THREE.RingGeometry(2.5, 3.2, 24, 1, -Math.PI / 3, (Math.PI * 2) / 3),
        ink(0xe7d79d),
      );
      wave.name = `mouth-wave-${i}`;
      this.waves.push(wave);
      this.object.add(wave);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(13 * 3), 3));
      const line = new THREE.Line(
        g,
        new THREE.LineBasicMaterial({
          color: i % 2 ? 0x9a895d : 0xffe6b9,
          transparent: true,
          depthWrite: false,
        }),
      );
      line.name = `stomp-fold-${i}`;
      this.folds.push(line);
      this.object.add(line);
    }
    for (let i = 0; i < 8; i++) {
      const puff = new THREE.Mesh(
        new THREE.CircleGeometry(1, 20),
        ink(i % 2 ? 0xc5b38d : 0xe3d2a9),
      );
      puff.name = `stomp-dust-${i}`;
      this.dust.push(puff);
      this.object.add(puff);
      const chip = new THREE.Mesh(
        new THREE.PlaneGeometry(2.5, 4),
        ink(i % 2 ? 0xe4d3ab : 0xffe9bd),
      );
      chip.name = `paper-chip-${i}`;
      this.chips.push(chip);
      this.object.add(chip);
    }
  }
  cardAnimation(facing: number) {
    return dinoFrames(this.plan, facing);
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
      ms = elapsed / p.pace;
    this.object.position.set(0, 0, 0);
    this.object.visible = ms < DINO_DURATION;
    // Sample each emission from the posed native mouth, then restore the current pose.
    this.waves.forEach((wave, i) => {
      const born = p.roar + i * 260,
        age = ms - born,
        t = clamp(age / 180);
      wave.visible = i < p.pulses && age >= 0 && age < 420;
      if (!wave.visible) return;
      this.pose(actor, born, start, b, view, facing);
      const mouth = dinoMouth(actor),
        target = world(
          dinoCardPoint(p, ms, { x: b.left + b.width / 2, y: b.top + b.height * 0.18 }, b, facing),
        );
      wave.position.copy(mouth).lerp(target, dinoEase(t));
      wave.rotation.z = Math.atan2(target.y - mouth.y, target.x - mouth.x);
      wave.scale.setScalar(1 + t * 5);
      wave.material.opacity = 0.8 * (1 - dinoEase((age - 180) / 240));
    });
    this.pose(actor, ms, start, b, view, facing);
    const age = ms - p.stomp,
      contact = world(dinoFootPoint(p, p.stomp, b, facing, p.foot));
    this.shock.visible = age >= 0 && age < 480;
    this.shock.position.copy(contact);
    this.shock.position.z = 174;
    this.shock.scale.set(1 + clamp(age / 480) * 25, 0.7 + clamp(age / 480) * 5, 1);
    this.shock.material.opacity = 0.8 * (1 - clamp(age / 480));
    this.dust.forEach((puff, i) => {
      const t = age / 900,
        x = Math.sin(i * 2.3 + p.phase);
      puff.visible = t >= 0 && t < 1;
      puff.position
        .copy(contact)
        .add(new THREE.Vector3(x * t * 32 * p.force, Math.sin(t * Math.PI) * (8 + (i % 3) * 4), 2));
      puff.scale.set(2 + clamp(t) * 6, 1 + clamp(t) * 3, 1);
      puff.material.opacity = 0.55 * (1 - clamp(t));
      const chip = this.chips[i];
      if (!chip) return;
      const s = age / 1000;
      chip.visible = s >= 0 && s < 1;
      chip.position
        .copy(contact)
        .add(new THREE.Vector3(x * s * 29, (24 + (i % 3) * 7) * s - 65 * s * s, 3));
      chip.rotation.z = s * (i % 2 ? 4 : -4);
      chip.material.opacity = 1 - dinoEase((s - 0.6) / 0.4);
    });
    this.folds.forEach((line, layer) => {
      const t = clamp(age / 65) * (1 - dinoEase((age - 650) / 500)),
        positions = line.geometry.getAttribute('position');
      for (let i = 0; i <= 12; i++) {
        const raw = {
          x: b.left + b.width * (0.12 + (0.76 * i) / 12),
          y: b.top + 3 + layer * 2 + Math.sin((i / 12) * Math.PI) * t * 4,
        };
        const at = dinoCardPoint(p, ms, raw, b, facing);
        positions.setXYZ(i, at.x, -at.y, 173 + layer * 0.1);
      }
      positions.needsUpdate = true;
      line.geometry.computeBoundingSphere();
      line.visible = age >= 0 && t > 0;
      line.material.opacity = t * 0.7;
    });
  }
  private pose(
    actor: THREE.Group,
    ms: number,
    start: Point,
    b: TargetBounds,
    view: Point,
    facing: number,
  ) {
    const p = this.plan,
      end = dinoLandingPoint(p, b, view, facing),
      arrival = dinoArrival(p);
    actor.scale.set(DINO_SCALE * facing, DINO_SCALE, DINO_SCALE);
    actor.rotation.set(0, 0, 0);
    actor.visible = ms < p.departure + 520 + p.exit;
    const body = requireSceneObject(actor, 'body');
    body.position.set(0, 0, 0);
    let goals: THREE.Vector3[],
      turn = 0,
      angle = 0,
      moving = 0;
    if (ms < p.travel) {
      const t = clamp(ms / p.travel),
        path = (q: number) => dinoApproach(p, start, end, b, view, q);
      const heading = (q: number) => dinoApproachTurn(p, start, end, facing, q);
      const at = path(t),
        walk = footprints(p, path, t, heading, facing, 0.7 + p.pause / 2);
      actor.position.set(at.x, -at.y, 168);
      turn = heading(t);
      actor.rotation.y = turn;
      const before = path(Math.max(0, t - 0.002)),
        after = path(Math.min(1, t + 0.002));
      moving = Math.min(1, Math.hypot(after.x - before.x, after.y - before.y));
      body.position.y = -Math.abs(Math.sin((walk.distance / p.gait) * Math.PI)) * moving * 1.2;
      actor.updateMatrixWorld(true);
      const settle = dinoEase((t - 0.88) / 0.12);
      goals = walk.goals.map((goal, i) =>
        goal.lerp(world({ x: end.x + facing * hip(i) * DINO_SCALE, y: end.y }), settle),
      );
    } else if (ms < arrival) {
      const u = clamp((ms - p.travel) / p.jump),
        q = dinoEase(u),
        top = dinoTop(p, ms, b, facing);
      actor.position.set(
        end.x + (top.x - end.x) * q,
        -(end.y + (top.y - end.y) * q - Math.sin(u * Math.PI) * p.rise),
        168,
      );
      goals = [0, 1].map(
        (i) =>
          new THREE.Vector3(
            actor.position.x + facing * hip(i) * DINO_SCALE,
            actor.position.y + Math.sin(u * Math.PI) * 9 * DINO_SCALE,
            172,
          ),
      );
      moving = Math.sin(u * Math.PI);
    } else if (ms < p.departure) {
      const top = dinoTop(p, ms, b, facing),
        pose = dinoCardPose(p, ms, facing);
      actor.position.set(top.x, -top.y, 168);
      angle = (-pose.angle * Math.PI) / 180;
      actor.rotation.z = angle;
      actor.rotation.y = Math.PI * dinoEase((ms - p.departure + 340) / 340);
      goals = [0, 1].map((i) => world(dinoFootPoint(p, ms, b, facing, i)));
      body.position.y = -Math.max(0, pose.y) * 0.2;
    } else if (ms < p.departure + 520) {
      const u = clamp((ms - p.departure) / 520),
        q = dinoEase(u),
        top = dinoTop(p, p.departure, b, facing);
      actor.position.set(
        top.x + (end.x - top.x) * q,
        -(top.y + (end.y - top.y) * q - Math.sin(u * Math.PI) * 25),
        168,
      );
      actor.rotation.y = Math.PI;
      turn = Math.PI * q;
      goals = [0, 1].map(
        (i) =>
          new THREE.Vector3(
            actor.position.x + facing * hip(i) * DINO_SCALE * (1 - 2 * q),
            actor.position.y + Math.sin(u * Math.PI) * 9 * DINO_SCALE,
            172,
          ),
      );
      moving = Math.sin(u * Math.PI);
    } else {
      const t = clamp((ms - p.departure - 520) / p.exit),
        path = (q: number) => dinoExit(p, end, view, facing, q);
      const at = path(t),
        walk = footprints(p, path, t, () => Math.PI, facing, 0);
      actor.position.set(at.x, -at.y, 168);
      actor.rotation.y = Math.PI;
      turn = Math.PI;
      moving = 1;
      const blend = dinoEase(t / 0.08);
      goals = walk.goals.map((goal, i) =>
        world({ x: end.x - facing * hip(i) * DINO_SCALE, y: end.y }).lerp(goal, blend),
      );
      body.position.y = -Math.abs(Math.sin((walk.distance / p.gait) * Math.PI)) * 1.2;
    }
    dinoPlant(actor, goals, angle, turn);
    const open =
      dinoEase((ms - p.roar + 180) / 180) *
      (1 - dinoEase((ms - p.roar - (p.pulses - 1) * 260 - 180) / 300)) *
      (0.8 + 0.2 * Math.cos(((ms - p.roar) / 260) * Math.PI * 2));
    const startled = p.startled
      ? dinoEase((ms - p.stomp - 70) / 100) * (1 - dinoEase((ms - p.stomp - 500) / 600))
      : 0;
    const look = p.startled
      ? dinoEase((ms - p.departure - 650) / 180) * (1 - dinoEase((ms - p.departure - 1400) / 280))
      : 0;
    dinoDetails(actor, ms, open, moving, startled, look);
    const proud = p.startled
      ? 0
      : dinoEase((ms - p.stomp - 200) / 220) * (1 - dinoEase((ms - p.departure + 500) / 240));
    requireSceneObject(actor, 'head').rotation.z += proud * 0.16;
    requireSceneObject(actor, 'torso').scale.set(15 + proud, 18 + proud * 0.7, 10 + proud * 0.6);
    actor.updateMatrixWorld(true);
  }
}
