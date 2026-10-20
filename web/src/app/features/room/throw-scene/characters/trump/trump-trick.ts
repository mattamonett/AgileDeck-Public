import { clamp } from '../../kit';
import * as THREE from 'three';
import { requireSceneObject } from '../../engine/scene-object';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { textSprite, trumpArmTo, trumpLegs, trumpWalk } from './trump-model';
import {
  TRUMP_DURATION,
  TRUMP_SCALE,
  TRUMP_PHRASES,
  trumpPlan,
  trumpEase,
  trumpCardPose,
  trumpContact,
  trumpCardPoint,
  trumpHandPoint,
  trumpExit,
} from './trump-choreography';
export { makeTrump, trumpWalk } from './trump-model';
export { TRUMP_DURATION, TRUMP_PAT_MS, TRUMP_PHRASES, trumpPhrase } from './trump-choreography';
export class TrumpTrick {
  readonly object = new THREE.Group();
  readonly plan;
  private readonly bubble: THREE.Sprite;
  private readonly ticks = Array.from(
    { length: 4 },
    () =>
      new THREE.Mesh(
        new THREE.PlaneGeometry(1, 4),
        new THREE.MeshBasicMaterial({
          color: 0xe8c783,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        }),
      ),
  );
  get duration() {
    return TRUMP_DURATION * this.plan.pace;
  }
  constructor(id: string) {
    this.plan = trumpPlan(id);
    const phrase = this.plan.phrase;
    const lines =
      phrase === TRUMP_PHRASES[0]
        ? ['Yuge, nothing', 'quite like it.']
        : phrase === TRUMP_PHRASES[1]
          ? ['Get outta here,', "you're fired"]
          : ['Loser'];
    this.bubble =
      textSprite(lines, true) ?? new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
    this.bubble.name = 'trump-dialogue';
    this.bubble.userData['text'] = phrase;
    this.object.add(this.bubble, ...this.ticks);
    this.object.children.forEach((part) => (part.visible = false));
  }
  cardAnimation(facing: number) {
    const frames: Keyframe[] = [];
    for (let ms = 0; ms <= TRUMP_DURATION; ms += 20) {
      const pose = trumpCardPose(ms, this.plan, facing);
      frames.push({
        offset: ms / TRUMP_DURATION,
        translate: `${pose.x}px ${pose.y}px`,
        rotate: `${pose.angle}deg`,
        scale: `${pose.sx} 1`,
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
    const p = this.plan;
    const facing = end.x < b.left + b.width / 2 ? 1 : -1;
    const pose = trumpCardPose(ms, p, facing);
    const exit = trumpExit(ms, p, b, end, viewport, facing);
    man.position.set(exit.x + pose.x, -exit.y, 160);
    man.scale.setScalar(TRUMP_SCALE);
    const moving = ms > p.departure;
    if (moving) {
      const prior = trumpExit(ms - 5, p, b, end, viewport, facing);
      const distance = Math.hypot(exit.x - end.x, exit.y - end.y) * facing;
      const stride = Math.min(1, Math.hypot(exit.x - prior.x, exit.y - prior.y) * 1.5);
      trumpWalk(man, distance, facing, stride, p.step);
      man.rotation.y = facing * (0.18 + trumpEase((ms - p.departure) / 250) * 0.18);
      trumpLegs(man, distance, stride, p.step);
    } else {
      man.rotation.set(0, facing * 0.18, 0);
      man.updateMatrixWorld(true);
      const hand = trumpHandPoint(ms, p, b, end, facing);
      const gesturing = (ms >= 900 && ms < p.pat - 500) || ms > p.pat + 530;
      const gestureAge = ms < p.pat ? ms - 900 : ms - p.pat - 530;
      const gesture = gesturing
        ? trumpEase(gestureAge / 150) * (ms < p.pat ? 1 - trumpEase((ms - p.pat + 700) / 200) : 1)
        : 0;
      const isYuge = p.phrase === TRUMP_PHRASES[0];
      const isFired = p.phrase === TRUMP_PHRASES[1];
      const local = isYuge
        ? new THREE.Vector3(facing * 12, 9, 14)
        : isFired
          ? new THREE.Vector3(facing * 33, 12, 14)
          : new THREE.Vector3(facing * (29 + Math.sin(gestureAge / 140) * 3), 5, 14);
      const active = new THREE.Vector3(hand.x, -hand.y, 174).lerp(man.localToWorld(local), gesture);
      trumpArmTo(man, facing, active, isYuge || isFired ? gesture : 0);
      const palm = requireSceneObject(
        requireSceneObject(man, facing > 0 ? 'right-arm' : 'left-arm'),
        'open-hand',
      );
      palm.rotation.z += isYuge
        ? -facing * gesture * 0.4
        : isFired
          ? (facing * gesture * Math.PI) / 2
          : 0;
      requireSceneObject(palm, 'thumb').rotation.x = isYuge ? gesture * 0.85 : 0;
      if (isYuge && gesture > 0.8) {
        requireSceneObject(palm, 'pinch-loop').visible = true;
        requireSceneObject(palm, 'finger-0').visible = false;
        requireSceneObject(palm, 'thumb').visible = false;
      }
      trumpArmTo(man, -facing, man.localToWorld(new THREE.Vector3(-facing * 17, -12, 9)));
      trumpLegs(man, 0, 0, p.step, end);
    }
    man.visible = ms < Math.round((p.departure + 1450 * p.exit) * 1e6) / 1e6;
    const speaking = ms >= 900 && ms < p.departure;
    const head = requireSceneObject(man, 'head');
    const scan = ms < p.pat - 400 ? Math.sin(trumpEase(ms / (p.pat - 400)) * Math.PI * 2) : 0;
    head.rotation.set(
      scan * 0.22 * p.inspect,
      facing * (speaking ? 0.13 : 0.06),
      speaking ? Math.sin(ms / 170) * 0.015 : 0,
    );
    requireSceneObject(man, 'mouth-opening').scale.y = speaking
      ? 0.5 + Math.abs(Math.sin(ms / 100)) * 1.3
      : 0.5;
    for (const child of head.children)
      if (child.name === 'eye') {
        const blink = Math.abs(Math.sin(ms / 700 + p.inspect));
        child.scale.y = blink < 0.055 ? 0.15 + blink * 13 : 1;
      }
    requireSceneObject(man, 'long-red-tie').rotation.z = moving
      ? Math.sin(Math.hypot(exit.x - end.x, exit.y - end.y) * 0.1) * 0.025
      : 0;
    man.updateMatrixWorld(true);
    this.object.position.set(-end.x, end.y, 0);
    this.object.visible = ms < TRUMP_DURATION;
    this.bubble.visible = speaking;
    const width = Math.min(192, viewport.x - 20);
    this.bubble.scale.set(width, (width * 77) / 192, 1);
    this.bubble.position.set(
      Math.max(width / 2 + 8, Math.min(viewport.x - width / 2 - 8, exit.x + facing * 18)),
      -Math.max(42, exit.y - 104),
      110,
    );
    this.ticks.forEach((tick, i) => {
      const age = ms - p.pat;
      const t = clamp(age / 130);
      const point = trumpCardPoint(ms, trumpContact(p, b, facing), p, b, facing);
      const a = (i * Math.PI) / 2 + 0.2;
      tick.visible = age >= 0 && age < 130;
      tick.position.set(
        point.x + Math.cos(a) * (5 + t * 5),
        -point.y + Math.sin(a) * (5 + t * 5),
        35,
      );
      tick.rotation.z = a - Math.PI / 2;
      tick.material.opacity = (1 - t) * 0.75;
    });
  }
}
