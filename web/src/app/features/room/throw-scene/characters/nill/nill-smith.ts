import { clamp } from '../../kit';
import * as THREE from 'three';
import { requireSceneObject } from '../../engine/scene-object';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { nillArmTo, nillLegs, nillWalk } from './nill-model';
import {
  NILL_DURATION,
  NILL_SCALE,
  nillPlan,
  nillEase,
  nillCardPose,
  nillCardPoint,
  nillContact,
  nillHandPoint,
  nillBodyLean,
  nillBackhandWeight,
  nillExitProgress,
} from './nill-choreography';
export { makeNillSmith, nillWalk } from './nill-model';
export { NILL_DURATION, NILL_SLAP_MS, NILL_BACKHAND_MS } from './nill-choreography';
export const NILL_THOUGHT = 'Keep my name out yo mouth';
function thoughtBubble() {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }),
  );
  sprite.name = 'thought-bubble';
  sprite.userData['text'] = 'Nill Smith says... ' + NILL_THOUGHT;
  if (typeof document === 'undefined') return sprite;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 280;
  const ctx = canvas.getContext('2d');
  if (!ctx) return sprite;
  ctx.fillStyle = '#fffdf5';
  ctx.strokeStyle = '#343b44';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(6, 6, 1012, 208, 64);
  ctx.fill();
  ctx.stroke();
  for (const [x, y, r] of [
    [500, 234, 14],
    [512, 264, 7],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#242d36';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 49px Arial';
  ctx.fillText('Nill Smith says...', 512, 76);
  ctx.font = '800 55px Arial';
  ctx.fillText(NILL_THOUGHT, 512, 149);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  sprite.material.map = map;
  return sprite;
}
function flash(color: number) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false, depthWrite: false }),
  );
}
export class NillTrick {
  readonly object = new THREE.Group();
  readonly plan;
  get duration() {
    return NILL_DURATION * this.plan.pace;
  }
  private readonly bubble = thoughtBubble();
  private readonly marks = Array.from({ length: 2 }, () => {
    const group = new THREE.Group();
    group.name = 'nill-handprint';
    const palm = flash(0xce8b78);
    palm.scale.set(3.1, 4, 0.3);
    group.add(palm);
    for (let i = 0; i < 4; i++) {
      const finger = flash(0xce8b78);
      finger.position.set((i - 1.5) * 1.65, -4.8, 0.2);
      finger.scale.set(0.7, 2.2, 0.3);
      group.add(finger);
    }
    return group;
  });
  private readonly rays = Array.from(
    { length: 12 },
    () =>
      new THREE.Mesh(
        new THREE.PlaneGeometry(1.3, 7),
        new THREE.MeshBasicMaterial({
          color: 0xffe6a7,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        }),
      ),
  );
  constructor(id: string) {
    this.plan = nillPlan(id);
    this.object.add(this.bubble, ...this.marks, ...this.rays);
    for (const part of this.object.children) part.visible = false;
  }
  cardAnimation(facing: number) {
    const frames: Keyframe[] = [];
    for (let ms = 0; ms <= NILL_DURATION; ms += 20) {
      const pose = nillCardPose(ms, this.plan, facing);
      frames.push({
        offset: ms / NILL_DURATION,
        translate: pose.x + 'px ' + pose.y + 'px',
        rotate: pose.angle + 'deg',
        scale: pose.sx + ' 1',
      });
    }
    return { frames, options: { duration: this.duration, easing: 'linear' } };
  }
  update(
    ms: number,
    man: THREE.Group,
    b: TargetBounds,
    end: Point,
    viewport = {
      x: typeof window === 'undefined' ? 1024 : window.innerWidth,
      y: typeof window === 'undefined' ? 768 : window.innerHeight,
    },
  ) {
    ms = Math.round((ms / this.plan.pace) * 1e6) / 1e6;
    const facing = end.x < b.left + b.width / 2 ? 1 : -1;
    const p = this.plan;
    const departure = nillExitProgress(ms, p);
    const turn = nillEase((ms - p.departure) / 220);
    const exitX = facing > 0 ? -105 : viewport.x + 105;
    const cardPose = nillCardPose(ms, p, facing);
    const x = end.x + cardPose.x + nillBackhandWeight(ms, p, facing) + (exitX - end.x) * departure;
    const y = end.y + Math.sin(departure * Math.PI) * p.detour * 0.5;
    const previous = nillExitProgress(Math.max(0, ms - 5), p);
    const distance = (exitX - end.x) * departure;
    const stride = Math.min(1, Math.abs((departure - previous) * (exitX - end.x)) * 2);
    man.position.set(x, -y, 160);
    man.scale.setScalar(NILL_SCALE);
    if (ms >= p.departure) {
      nillWalk(man, distance, -facing, stride, p.step);
      man.rotation.y = facing * (0.18 - turn * 0.73);
      nillLegs(man, distance, stride, p.step);
    } else {
      man.rotation.set(0, facing * 0.18, 0);
      const body = requireSceneObject(man, 'nill-body');
      body.rotation.set(0, 0, nillBodyLean(ms, p, facing));
      body.position.x = 0;
      man.updateMatrixWorld(true);
      const gesture =
        ms > p.backhand + 480 ? Math.sin(clamp((ms - p.backhand - 480) / 800) * Math.PI) : 0;
      const hand = nillHandPoint(ms, p, b, end, facing);
      const handYaw =
        Math.PI * nillEase((ms - p.slap - 200) / Math.max(100, p.backhand - p.slap - 400));
      const active = new THREE.Vector3(hand.x, -hand.y, 174);
      if (!p.tie) active.lerp(body.localToWorld(new THREE.Vector3(facing * 7, -6, 12)), gesture);
      nillArmTo(man, facing, active, handYaw);
      const rest = body.localToWorld(new THREE.Vector3(-facing * 18, -12, 10));
      const to = p.tie
        ? body.localToWorld(new THREE.Vector3(0, 14, 12))
        : requireSceneObject(
            requireSceneObject(man, facing > 0 ? 'right-arm' : 'left-arm'),
            'open-hand',
          ).getWorldPosition(new THREE.Vector3());
      const other = rest.lerp(to, gesture);
      nillArmTo(man, -facing, other, 0);
      nillLegs(man, 0, 0, p.step, end);
    }
    man.visible = ms < Math.round((p.departure + 220 + 1500 * p.exit) * 1e6) / 1e6;
    const speaking = ms >= p.backhand + 350 && ms < p.departure + 220;
    const head = requireSceneObject(man, 'nill-head');
    head.rotation.set(
      0,
      ms >= p.departure ? facing * turn * 0.75 * (departure < 0.29 ? 1 : 0.2) : facing * 0.08,
      speaking ? Math.sin(ms / 135) * 0.025 : 0,
    );
    requireSceneObject(man, 'mouth-opening').scale.y = speaking
      ? 0.6 + Math.abs(Math.sin(ms / 90)) * 0.9
      : 0.6;
    for (const side of [-1, 1]) {
      const eye = requireSceneObject(man, side < 0 ? 'left-eye' : 'right-eye');
      const blink = Math.abs(Math.sin(ms / 630 + p.force));
      eye.scale.y = 1.5 * (blink < 0.06 ? 0.15 + blink * 12 : speaking ? 0.8 : 1);
    }
    man.updateMatrixWorld(true);
    this.object.position.set(-end.x, end.y, 0);
    this.object.visible = ms < NILL_DURATION;
    this.bubble.visible = speaking;
    this.bubble.scale.set(
      Math.min(280, viewport.x - 20),
      Math.min(280, viewport.x - 20) * 0.273,
      1,
    );
    const half = this.bubble.scale.x / 2;
    this.bubble.position.set(
      Math.max(half + 8, Math.min(viewport.x - half - 8, x)),
      -Math.max(45, y - 88),
      100,
    );
    this.marks.forEach((mark, i) => {
      const contact = i ? p.backhand : p.slap;
      const age = ms - contact;
      const point = nillCardPoint(ms, nillContact(p, b, facing, i > 0), b, p, facing);
      mark.visible = age >= 0 && age < 1100;
      mark.position.set(point.x, -point.y, 29);
      mark.rotation.z = (-cardPose.angle * Math.PI) / 180;
      mark.scale.x = i ? -1 : 1;
      mark.traverse((part) => {
        if (part instanceof THREE.Mesh)
          part.material.opacity = 0.32 * clamp(age / 45) * clamp((1100 - age) / 700);
      });
    });
    this.rays.forEach((ray, i) => {
      const hit = i < 6 ? p.slap : p.backhand;
      const age = ms - hit;
      const t = clamp(age / 160);
      const point = nillCardPoint(ms, nillContact(p, b, facing, i >= 6), b, p, facing);
      const a = ((i % 6) / 6) * Math.PI * 2;
      ray.visible = age >= 0 && age < 160;
      ray.position.set(
        point.x + Math.cos(a) * (5 + t * 10),
        -point.y + Math.sin(a) * (5 + t * 10),
        32,
      );
      ray.rotation.z = a - Math.PI / 2;
      ray.scale.y = 1 - t * 0.7;
      ray.material.opacity = (1 - t) * 0.85;
    });
  }
}
