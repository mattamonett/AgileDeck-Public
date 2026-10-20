import { clamp } from '../../kit';
import * as THREE from 'three';
import { requireSceneObject } from '../../engine/scene-object';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { textSprite } from '../trump/trump-model';
import { babyArmTo, babyPose, wet } from './baby-model';
import {
  BABY_DURATION,
  BABY_SCALE,
  babyPlan,
  babyEase,
  babySob,
  babyCardPose,
  babyCardPoint,
} from './baby-choreography';
function headPose(head: THREE.Object3D, p: ReturnType<typeof babyPlan>, ms: number) {
  const sob = babySob(p, ms),
    start = babyEase(ms / 650);
  head.rotation.set(sob * 0.07, 0, Math.sin(ms / 160) * 0.035 * sob);
  head.position.y = 25 + sob * 0.7 * start;
}
export class BabyTrick {
  readonly object = new THREE.Group();
  readonly plan;
  private readonly bubble: THREE.Sprite;
  private readonly drops: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>[];
  private readonly stains: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>[];
  private readonly runoff: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>[];
  private readonly leak = wet('diaper-ooze', 0x694522);
  private readonly clumps = Array.from({ length: 4 }, () => wet('diaper-clump', 0x785027));
  private readonly puddle = wet('tear-puddle', 0x69c9ed);
  private readonly muck = wet('diaper-puddle', 0x54371c);
  private readonly rings = Array.from(
    { length: 3 },
    () =>
      new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.1, 6, 24),
        new THREE.MeshBasicMaterial({ color: 0xb4e9f4, transparent: true, depthWrite: false }),
      ),
  );
  get duration() {
    return BABY_DURATION * this.plan.pace;
  }
  constructor(id: string) {
    this.plan = babyPlan(id);
    this.bubble =
      textSprite(['Baby Brent says...', 'I pooped'], true) ??
      new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
    this.bubble.name = 'thought-bubble';
    this.bubble.userData['text'] = 'Baby Brent says... I pooped';
    // Each sob has three packets from each eye, with independently owned native resources.
    this.drops = Array.from({ length: this.plan.sobs.length * 6 }, () =>
      wet('tear-drop', 0x80e1ff),
    );
    this.stains = Array.from({ length: this.plan.sobs.length * 2 }, () =>
      wet('tear-mark', 0x5dc1df),
    );
    this.runoff = Array.from({ length: this.plan.sobs.length * 2 }, () =>
      wet('tear-runoff', 0x93dced),
    );
    this.object.add(
      this.bubble,
      this.leak,
      this.puddle,
      this.muck,
      ...this.clumps,
      ...this.drops,
      ...this.stains,
      ...this.runoff,
      ...this.rings,
    );
    this.object.children.forEach((part) => (part.visible = false));
  }
  cardAnimation(facing: number) {
    const frames: Keyframe[] = [];
    for (let ms = 0; ms <= BABY_DURATION; ms += 20) {
      const pose = babyCardPose(this.plan, ms, facing);
      frames.push({
        offset: ms / BABY_DURATION,
        translate: `${pose.x}px ${pose.y}px`,
        rotate: `${pose.angle}deg`,
      });
    }
    return { frames, options: { duration: this.duration, easing: 'linear' } };
  }
  update(ms: number, baby: THREE.Group, b: TargetBounds, end: Point, view = { x: 1024, y: 768 }) {
    ms = Math.round((ms / this.plan.pace) * 1e6) / 1e6;
    const p = this.plan;
    const facing = end.x < b.left + b.width / 2 ? 1 : -1,
      settle = babyEase(ms / 650);
    const back = babyEase((ms - p.departure) / 420),
      exit = babyEase((ms - p.departure - 420) / (1700 * p.exit));
    const x = end.x + ((-facing > 0 ? view.x + 85 : -85) - end.x) * exit;
    const prior = babyEase((ms - p.departure - 425) / (1700 * p.exit));
    const stride = Math.min(
      1,
      Math.abs((exit - prior) * ((-facing > 0 ? view.x + 85 : -85) - end.x)) * 2.5,
    );
    baby.position.set(x, -end.y, 165);
    baby.visible = ms < p.departure + 420 + 1700 * p.exit;
    babyPose(
      baby,
      settle * (1 - back),
      facing * (1 - 2 * back),
      Math.abs(x - end.x),
      stride,
      p.step,
    );
    const head = requireSceneObject(baby, 'head');
    if (back === 0) headPose(head, p, ms);
    const sob = babySob(p, ms),
      distress =
        babyEase((ms - p.discovery) / 240) * (1 - babyEase((ms - p.departure + 650) / 500));
    const mouth = requireSceneObject(baby, 'mouth');
    mouth.scale.y = 1 + distress * (2 + sob * 3);
    requireSceneObject(baby, 'lower-lip').position.y = -11.8 - Math.sin(ms / 45) * 0.3 * distress;
    requireSceneObject(baby, 'tongue').visible = distress > 0.5;
    requireSceneObject(baby, 'left-brow').rotation.z = 0.32 * distress;
    requireSceneObject(baby, 'right-brow').rotation.z = -0.32 * distress;
    for (const side of ['left', 'right']) {
      const blink = Math.abs(Math.sin(ms / 700 + p.step));
      requireSceneObject(baby, side + '-eye').scale.y =
        sob > 0.5 ? 0.35 : blink < 0.055 ? 0.15 + blink * 13 : 1;
      requireSceneObject(baby, side + '-tear-source').visible = distress > 0.1 && ms < p.departure;
    }
    const diaper = requireSceneObject(baby, 'diaper');
    diaper.scale.y = 1 + babyEase((ms - p.discovery + 200) / 400) * 0.12;
    requireSceneObject(baby, 'diaper-stain').visible = ms > p.discovery;
    baby.updateMatrixWorld(true);
    if (ms >= 650 && ms < p.departure) {
      const tap =
        ms <= p.pat ? babyEase((ms - 650) / (p.pat - 650)) : 1 - babyEase((ms - p.pat - 150) / 230);
      const palm = baby.localToWorld(new THREE.Vector3(facing * 14, -22, 7));
      palm.lerp(baby.localToWorld(new THREE.Vector3(facing * 25, 8, 12)), sob);
      const touch = babyCardPoint(
        p,
        ms,
        { x: facing > 0 ? b.left + 1 : b.left + b.width - 1, y: b.top + b.height * 0.91 },
        b,
        facing,
      );
      palm.lerp(new THREE.Vector3(touch.x, -touch.y, 172), tap);
      const last = p.sobs[p.sobs.length - 1] ?? p.discovery;
      const recovery =
        babyEase((ms - last - 420) / 180) * (1 - babyEase((ms - p.departure + 380) / 180));
      const self = p.wipe
        ? requireSceneObject(
            baby,
            facing > 0 ? 'right-tear-source' : 'left-tear-source',
          ).getWorldPosition(new THREE.Vector3())
        : requireSceneObject(baby, 'mouth').getWorldPosition(new THREE.Vector3());
      if (p.wipe) self.x += Math.sin(ms / 90) * recovery * 1.4;
      self.sub(
        new THREE.Vector3(p.wipe ? 0.85 : 4, p.wipe ? -4.5 : 3, p.wipe ? 3.8 : 0).multiplyScalar(
          BABY_SCALE,
        ),
      );
      palm.lerp(self, recovery);
      babyArmTo(baby, facing, palm);
      babyArmTo(
        baby,
        -facing,
        baby.localToWorld(
          new THREE.Vector3(-facing * (14 + sob * 11), -22 + sob * 30, 7 + sob * 5),
        ),
      );
    }
    baby.updateMatrixWorld(true);
    this.object.position.set(-end.x, end.y, 0);
    this.object.visible = ms < BABY_DURATION;
    const fade = clamp((BABY_DURATION - ms) / 550);
    for (const part of [
      ...this.drops,
      ...this.stains,
      ...this.runoff,
      this.leak,
      this.puddle,
      this.muck,
      ...this.clumps,
    ])
      part.material.opacity = fade;
    this.bubble.visible = ms > p.discovery + 280 && ms < p.departure - 100;
    const width = Math.min(174, view.x - 20);
    this.bubble.scale.set(width, width * 0.39, 1);
    this.bubble.position.set(
      Math.max(width / 2 + 8, Math.min(view.x - width / 2 - 8, end.x + facing * 20)),
      -Math.max(45, end.y - 98),
      115,
    );
    const floor = end.y + 26 * BABY_SCALE;
    const seam = requireSceneObject(baby, 'diaper-seam').getWorldPosition(new THREE.Vector3());
    this.leak.visible = ms > p.discovery && ms < p.departure - 100;
    const ooze = babyEase((ms - p.discovery) / 650);
    const leakY = -seam.y + (floor + seam.y) * ooze;
    this.leak.position.set(seam.x, (-seam.y + leakY) * -0.5, seam.z - 150);
    this.leak.scale.set(2.2, Math.max(0.01, (leakY + seam.y) / 2), 1.2);
    this.clumps.forEach((part, i) => {
      const age = ms - p.discovery - 120 - i * 180,
        q = clamp(age / 370);
      part.visible = age > 0 && age < 370;
      part.position.set(
        seam.x + Math.sin(i * 2) * q * 3,
        -(-seam.y + (floor + seam.y) * q * q),
        seam.z - 150,
      );
      part.scale.set(2.2, 3.4 - q, 1.8);
    });
    this.muck.visible = ms > p.discovery + 300;
    this.muck.position.set(end.x, -floor, 24);
    this.muck.scale.set(12 * ooze, 1.8, 5 * ooze);
    // Sample the native eye at its authored release time. Freeze inspection and live reflow need no frame history.
    const savedRotation = head.rotation.clone(),
      savedY = head.position.y;
    for (let i = 0; i < p.sobs.length; i++) {
      const release = p.sobs[i];
      if (release === undefined) continue;
      for (const side of [-1, 1]) {
        const index = i * 2 + (side > 0 ? 1 : 0);
        const stain = this.stains[index],
          run = this.runoff[index];
        if (!stain || !run) continue;
        headPose(head, p, release);
        baby.updateMatrixWorld(true);
        const source = requireSceneObject(
          baby,
          side > 0 ? 'right-tear-source' : 'left-tear-source',
        ).getWorldPosition(new THREE.Vector3());
        // Source always belongs to the seated performance, including after the actor has departed.
        source.x += end.x - x;
        const contact = {
          x: facing > 0 ? b.left + 2 + i * 2 : b.left + b.width - 2 - i * 2,
          y: b.top + b.height * (0.86 + side * 0.025),
        };
        const impact = babyCardPoint(p, ms, contact, b, facing);
        for (let j = 0; j < 3; j++) {
          const drop = this.drops[i * 6 + (side > 0 ? 3 : 0) + j];
          if (!drop) continue;
          const age = ms - release - j * 65,
            u = clamp(age / 500);
          drop.visible = age >= 0 && age < 500;
          drop.position.set(
            source.x + (impact.x - source.x) * u,
            -(-source.y + (impact.y + source.y) * u - 4 * Math.sin(u * Math.PI)),
            source.z + (172 - source.z) * u - 150,
          );
          drop.scale.set(1.1, 2.1, 1);
          drop.rotation.z = -facing * 0.25;
          if (j === 0 && age > 900 && ms < p.departure + 300) {
            const drip = ((age - 900) / 620) % 1;
            drop.visible = true;
            const edge = babyCardPoint(p, ms, { x: contact.x, y: b.top + b.height }, b, facing);
            drop.position.set(edge.x, -(edge.y + (floor - edge.y) * drip * drip), 22);
          }
        }
        const wetness = babyEase((ms - release - 500) / 220);
        stain.visible = wetness > 0;
        stain.position.set(impact.x, -impact.y, 22);
        stain.scale.set(2.4 * wetness, 4.5 * wetness, 0.3);
        const length = (b.top + b.height - contact.y) * babyEase((ms - release - 500) / 800);
        const middle = babyCardPoint(p, ms, { x: contact.x, y: contact.y + length / 2 }, b, facing);
        run.visible = length > 0;
        run.position.set(middle.x, -middle.y, 22);
        run.scale.set(0.8, length / 2, 0.35);
      }
    }
    head.rotation.copy(savedRotation);
    head.position.y = savedY;
    baby.updateMatrixWorld(true);
    this.puddle.visible = ms > (p.sobs[0] ?? p.discovery) + 750;
    this.puddle.position.set(end.x + facing * 14, -floor, 23);
    const pool = babyEase((ms - p.discovery - 700) / 1600);
    this.puddle.scale.set(25 * pool, 1.4, 7 * pool);
    this.rings.forEach((ring, i) => {
      const phase = ((ms - p.discovery - 750 + i * 200) / 650) % 1;
      ring.visible = this.puddle.visible && phase > 0 && ms < p.departure;
      ring.position.set(end.x + facing * 13, -floor + 0.6, 26);
      ring.scale.set(3 + phase * 13, 0.25 + phase * 0.5, 1);
      ring.material.opacity = (1 - phase) * fade * 0.6;
    });
  }
}
