import { clamp } from '../../kit';
import * as THREE from 'three';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { requireSceneObject } from '../../engine/scene-object';
import { catRig, CAT_CLAW_REACH, paper } from './cat-model';
import {
  CAT_DURATION,
  CAT_SWIPE_START,
  CAT_SWIPE_STEP,
  catPlan,
  catEase,
  catCardPose,
  catCardPoint,
  catClawPoint,
  catWoundPoint,
  catExitProgress,
  type CatPlan,
} from './cat-choreography';

const SEGMENTS = 10;
export class CatTrick {
  readonly object = new THREE.Group();
  readonly plan: CatPlan;
  get duration() {
    return CAT_DURATION * this.plan.pace;
  }
  private readonly scratches: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[];
  private readonly shadows: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[];
  private readonly curls = Array.from({ length: 12 }, () =>
    paper(0xffeacc, new THREE.RingGeometry(1.2, 1.8, 10, 1, 0, Math.PI * 1.6)),
  );
  private readonly debris: readonly { dx: number; lift: number; spin: number }[];
  constructor(id = 'landing') {
    this.plan = catPlan(id);
    const random = seededRandom(id + ':paper-claws');
    this.scratches = Array.from({ length: this.plan.strokes * 3 * SEGMENTS }, () =>
      paper(0xf8dfb5, new THREE.PlaneGeometry(1, 1)),
    );
    this.shadows = this.scratches.map(() => paper(0x594137, new THREE.PlaneGeometry(1, 1)));
    this.debris = this.curls.map(() => ({
      dx: random() * 45 - 22,
      lift: 20 + random() * 35,
      spin: random() * 8 - 4,
    }));
    for (const part of [...this.scratches, ...this.shadows]) part.userData['cardSurface'] = true;
    this.object.add(...this.shadows, ...this.scratches, ...this.curls);
    for (const part of this.object.children) part.visible = false;
  }
  cardAnimation(facing: number) {
    const frames: Keyframe[] = [];
    for (let ms = 0; ms <= CAT_DURATION; ms += 20) {
      const pose = catCardPose(ms, this.plan, facing);
      frames.push({
        offset: ms / CAT_DURATION,
        translate: pose.x + 'px ' + pose.y + 'px',
        rotate: pose.angle + 'deg',
        scale: pose.sx + ' 1',
      });
    }
    return { frames, options: { duration: this.duration, easing: 'linear' } };
  }
  update(
    ms: number,
    cat: THREE.Group,
    b: TargetBounds,
    end: Point,
    viewport = {
      x: typeof window === 'undefined' ? 1024 : window.innerWidth,
      y: typeof window === 'undefined' ? 768 : window.innerHeight,
    },
  ) {
    ms = Math.round((ms / this.plan.pace) * 1e6) / 1e6;
    const facing = end.x < b.left + b.width / 2 ? 1 : -1;
    const crouch = catEase(ms / 220) * (1 - catEase((ms - 650) / 300));
    const pounce = catEase((ms - 650) / 350);
    const release = catEase((ms - 2090) / 310);
    const reach = pounce * (1 - release);
    const airborne = Math.sin(pounce * Math.PI) * 14;
    const wiggle = ms > 220 && ms < 650 ? Math.sin((ms - 220) / 48) * this.plan.wiggle * crouch : 0;
    const bodyY = crouch * 6 - reach * 4 - airborne;
    const depart = catExitProgress(ms, this.plan);
    const exitX = facing > 0 ? -90 : viewport.x + 90;
    const startX = end.x + facing * (18 * reach + wiggle);
    const x = startX + (exitX - startX) * depart;
    const y = end.y + bodyY + Math.sin(depart * Math.PI) * this.plan.detour * 0.15;
    const previous = catExitProgress(ms - 5, this.plan);
    const stride = clamp(((Math.abs(depart - previous) * Math.abs(exitX - end.x)) / 5) * 7);
    const turn = catEase((ms - 3750) / 300);
    cat.scale.set(0.9 * facing, 0.9, 0.9);
    cat.rotation.set(0, turn * Math.PI, 0);
    cat.position.set(x, -y, 160);
    cat.visible = ms < 5340 && depart < 1;
    const rest = -17 + bodyY / 0.9;
    const targets: (Point | null)[] = Array.from({ length: 4 }, () => ({
      x: 1 - wiggle / 0.9,
      y: rest,
    }));
    if (airborne > 0.1) for (let i = 0; i < 4; i++) targets[i] = null;
    const stroke = Math.max(
      0,
      Math.min(this.plan.strokes - 1, Math.floor((ms - CAT_SWIPE_START) / CAT_SWIPE_STEP)),
    );
    if (reach > 0) {
      const tip = catClawPoint(ms, stroke, 1, b, this.plan, facing);
      const local = {
        x: (tip.x - x) / (0.9 * facing) - 13,
        y: (y - tip.y) / 0.9 + 3 + CAT_CLAW_REACH,
      };
      targets[2] = { x: 1 + (local.x - 1) * reach, y: rest + (local.y - rest) * reach };
      const brace = catCardPoint(
        ms,
        { x: facing > 0 ? b.left + 3 : b.left + b.width - 3, y: b.top + b.height - 10 },
        b,
        this.plan,
        facing,
      );
      const far = {
        x: (brace.x - x) / (0.9 * facing) - 13,
        y: (y - brace.y) / 0.9 + 3 + CAT_CLAW_REACH,
      };
      targets[3] = { x: 1 + (far.x - 1) * reach, y: rest + (far.y - rest) * reach };
    }
    const grooming = catEase((ms - 2650) / 180) * (1 - catEase((ms - 3470) / 200));
    const lickPhase = clamp((ms - 2830) / 640);
    const lick = Math.max(0, Math.sin(lickPhase * Math.PI * this.plan.licks * 2));
    const wipe = this.plan.wipe ? catEase((ms - 3130) / 220) * (1 - catEase((ms - 3430) / 200)) : 0;
    const headTilt = -0.1 - crouch * 0.16 + grooming * (-0.08 - lick * 0.06) + wipe * 0.18;
    if (grooming > 0) {
      const gx = 17 + 11 * Math.cos(headTilt) + 10 * Math.sin(headTilt);
      const gy = 14 + 11 * Math.sin(headTilt) - 10 * Math.cos(headTilt);
      targets[2] = {
        x: 1 + (gx - 13 - 1 - wipe * 6) * grooming,
        y: rest + (gy + 3 + wipe * 15 - rest) * grooming,
      };
    }
    if (depart > 0) for (let i = 0; i < 4; i++) targets[i] = null;
    const attack =
      ms >= CAT_SWIPE_START && ms < CAT_SWIPE_START + this.plan.strokes * CAT_SWIPE_STEP;
    const blink = Math.abs(Math.sin(ms / 510 + this.plan.spot.y * 3));
    const eyes =
      blink < 0.07
        ? 0.15 + blink * 11
        : attack
          ? 0.6
          : ms > 2320 && ms < 2700
            ? 1.06
            : 1 - crouch * 0.35;
    catRig(
      cat,
      targets,
      Math.abs(x - end.x),
      stride,
      0,
      Math.max(reach, grooming),
      eyes,
      headTilt,
      ms * this.plan.strength,
      attack,
      reach,
    );
    const tongue = requireSceneObject(cat, 'kitten-tongue');
    tongue.visible = grooming > 0.8 && lick > 0.2 && wipe < 0.5;
    tongue.scale.y = 1 + lick * 3;
    cat.updateMatrixWorld(true);
    this.object.position.set(-end.x, end.y, 0);
    const fade = clamp((CAT_DURATION - ms) / 450);
    this.scratches.forEach((scratch, i) => {
      const stroke = Math.floor(i / (3 * SEGMENTS));
      const claw = Math.floor(i / SEGMENTS) % 3;
      const segment = i % SEGMENTS;
      const start = CAT_SWIPE_START + stroke * CAT_SWIPE_STEP + 50 + (segment / SEGMENTS) * 110;
      const finish = Math.max(start, Math.min(ms, start + 110 / SEGMENTS));
      const a = catWoundPoint(start, ms, stroke, claw, b, this.plan, facing);
      const z = catWoundPoint(finish, ms, stroke, claw, b, this.plan, facing);
      const inside = (p: Point) =>
        p.x > b.left + 1 &&
        p.x < b.left + b.width - 1 &&
        p.y > b.top + 1 &&
        p.y < b.top + b.height - 1;
      scratch.visible = ms >= start && inside(a) && inside(z);
      scratch.position.set((a.x + z.x) / 2, -(a.y + z.y) / 2, 12);
      scratch.rotation.z = Math.atan2(a.y - z.y, z.x - a.x);
      scratch.scale.set(Math.hypot(z.x - a.x, z.y - a.y) + 0.45, 0.85 * this.plan.strength, 1);
      scratch.material.opacity = fade;
      const shadow = this.shadows[i];
      if (!shadow) return;
      shadow.visible = scratch.visible;
      shadow.position.copy(scratch.position);
      shadow.position.z = 11;
      shadow.position.x += facing * 0.6;
      shadow.rotation.copy(scratch.rotation);
      shadow.scale.copy(scratch.scale);
      shadow.scale.y = 1.4 * this.plan.strength;
      shadow.material.opacity = fade;
    });
    this.curls.forEach((curl, i) => {
      const stroke = i % this.plan.strokes;
      const claw = i % 3;
      const contact = CAT_SWIPE_START + stroke * CAT_SWIPE_STEP + 145;
      const point = catWoundPoint(contact, ms, stroke, claw, b, this.plan, facing);
      const age = Math.max(0, (ms - contact) / 1000);
      const motion = this.debris[i];
      if (!motion) return;
      curl.visible = ms >= contact && age < 3.5 && fade > 0;
      curl.position.set(
        point.x + facing * motion.dx * Math.min(age, 0.65),
        -Math.min(b.top + b.height + 8, point.y - motion.lift * age + 90 * age * age),
        24,
      );
      curl.rotation.set(age * 2, age * 3, age * motion.spin);
      curl.material.opacity = fade * clamp((3.5 - age) / 0.6);
    });
  }
}
