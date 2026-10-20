import { clamp } from '../../kit';
import * as THREE from 'three';
import { requireSceneObject } from '../../engine/scene-object';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  REAPER_DURATION,
  REAPER_SLICE_START,
  REAPER_SLICE_END,
  reaperPlan,
  reaperEase,
  reaperStrikeAngle,
  reaperWoundPoint,
  reaperCardPose,
  type ReaperPlan,
} from './reaper-choreography';
import { reaperHand, reaperPortalClip, reaperWalk } from './reaper-model';
import { ReaperHarvest } from './reaper-harvest';
export { makeGrimReaper, reaperWalk } from './reaper-model';
export {
  REAPER_DURATION,
  REAPER_SLICE_START,
  REAPER_SLICE_END,
  reaperStrikeAngle,
  reaperBladePoint,
} from './reaper-choreography';

export const REAPER_THOUGHT = 'I am death, and I come to all, in the end.';
function blood(geometry: THREE.BufferGeometry, color: number) {
  const part = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false, depthWrite: false }),
  );
  part.userData['cardSurface'] = true;
  return part;
}
function thoughtBubble() {
  const bubble = new THREE.Sprite(
    new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }),
  );
  bubble.name = 'reaper-thought';
  bubble.userData['text'] = REAPER_THOUGHT;
  bubble.visible = false;
  if (typeof document === 'undefined') return bubble;
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 330;
  const ctx = canvas.getContext('2d');
  if (!ctx) return bubble;
  ctx.fillStyle = '#fffbed';
  ctx.strokeStyle = '#282b36';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(4, 4, 892, 270, 50);
  ctx.fill();
  ctx.stroke();
  for (const [x, y, r] of [
    [450, 293, 13],
    [439, 321, 6],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#252532';
  ctx.font = '600 53px Georgia';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ['I am death,', 'and I come to all,', 'in the end.'].forEach((line, i) =>
    ctx.fillText(line, 450, 66 + i * 76),
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  bubble.material.map = texture;
  return bubble;
}
export class ReaperTrick {
  readonly object = new THREE.Group();
  readonly plan: ReaperPlan;
  get duration() {
    return REAPER_DURATION * this.plan.pace;
  }
  private readonly cuts = Array.from({ length: 40 }, () =>
    blood(new THREE.PlaneGeometry(1, 1), 0x26060f),
  );
  private readonly lips = Array.from({ length: 80 }, (_, i) =>
    blood(new THREE.PlaneGeometry(1, 1), i % 2 ? 0xa52c48 : 0xe38996),
  );
  private readonly drips = Array.from({ length: 7 }, () =>
    blood(new THREE.PlaneGeometry(2, 1), 0xaf1835),
  );
  private readonly drops = Array.from({ length: 7 }, () =>
    blood(new THREE.CircleGeometry(2, 12), 0xd83a4c),
  );
  private readonly bubble = thoughtBubble();
  private readonly harvest: ReaperHarvest;
  private readonly grip = new THREE.Vector3();
  constructor(id = 'landing') {
    this.plan = reaperPlan(id);
    this.harvest = new ReaperHarvest(id);
    this.object.add(
      ...this.cuts,
      ...this.lips,
      ...this.drips,
      ...this.drops,
      this.harvest.object,
      this.bubble,
    );
  }
  cardAnimation(facing: number) {
    const frames: Keyframe[] = [];
    for (let ms = 0; ms <= REAPER_DURATION; ms += 40) {
      const pose = reaperCardPose(ms, this.plan, facing);
      const pallor = reaperEase((ms - 1100) / 600) * (1 - reaperEase((ms - 4700) / 600));
      frames.push({
        offset: ms / REAPER_DURATION,
        translate: pose.x + 'px ' + pose.y + 'px',
        scale: '1 ' + pose.sy,
        filter: 'saturate(' + (1 - pallor * 0.65) + ') brightness(' + (1 - pallor * 0.08) + ')',
      });
    }
    return { frames, options: { duration: this.duration, easing: 'linear' } };
  }
  update(
    ms: number,
    reaper: THREE.Group,
    b: TargetBounds,
    end: Point,
    viewport = {
      x: typeof window === 'undefined' ? 1024 : window.innerWidth,
      y: typeof window === 'undefined' ? 768 : window.innerHeight,
    },
  ) {
    ms = Math.round((ms / this.plan.pace) * 1e6) / 1e6;
    const facing = end.x < b.left + b.width / 2 ? 1 : -1;
    const fade = clamp((REAPER_DURATION - ms) / 350);
    const withdraw = reaperEase((ms - 3500) / 600);
    const sink = reaperEase((ms - 4280 - this.plan.departure) / 750);
    reaperWalk(reaper, withdraw + sink, facing);
    reaper.visible = ms < 5200 + this.plan.departure;
    reaper.position.set(
      end.x + facing * (12 * reaperEase(ms / 500) - this.plan.withdraw * withdraw),
      -end.y - sink * 120,
      160,
    );
    reaper.rotation.y = -0.18 * withdraw;
    reaperHand(reaper, ms, this.plan.collect);
    reaper.traverse((part) => {
      if (part.name === 'scythe-blood') part.visible = ms >= 920;
    });
    requireSceneObject(reaper, 'sickle-arm').rotation.z = reaperStrikeAngle(ms, this.plan);
    const portalFloor = end.y + 40;
    reaperPortalClip(reaper, portalFloor, ms >= 3950 + this.plan.departure);
    reaper.updateMatrixWorld(true);
    requireSceneObject(reaper, 'harvest-hand').getWorldPosition(this.grip);
    this.object.position.set(-end.x, end.y, 0);
    const inside = (p: Point, inset = 4) =>
      p.x >= b.left + inset &&
      p.x <= b.left + b.width - inset &&
      p.y >= b.top + inset &&
      p.y <= b.top + b.height - inset;
    this.cuts.forEach((cut, i) => {
      const start =
        REAPER_SLICE_START + (i / this.cuts.length) * (REAPER_SLICE_END - REAPER_SLICE_START);
      const finish = Math.min(ms, start + 350 / this.cuts.length);
      const a = reaperWoundPoint(start, ms, end, b, facing, this.plan);
      const z = reaperWoundPoint(finish, ms, end, b, facing, this.plan);
      cut.visible = ms >= start && inside(a) && inside(z);
      const length = Math.hypot(z.x - a.x, z.y - a.y);
      const angle = Math.atan2(a.y - z.y, z.x - a.x);
      cut.position.set((a.x + z.x) / 2, -(a.y + z.y) / 2, 10);
      cut.rotation.z = angle;
      const width = (4.5 + Math.sin((i / 40) * Math.PI) * 4.5) * this.plan.strength;
      cut.scale.set(length + 1.2, width, 1);
      cut.material.opacity = fade;
      for (const [edge, side] of [
        [0, -1],
        [1, 1],
      ] as const) {
        const lip = this.lips[i * 2 + edge];
        if (!lip) continue;
        lip.visible = cut.visible;
        lip.position.copy(cut.position);
        lip.position.z = 12;
        lip.position.x -= Math.sin(angle) * side * width * 0.46;
        lip.position.y += Math.cos(angle) * side * width * 0.46;
        lip.rotation.z = angle + Math.sin(i * 4) * 0.13;
        lip.scale.set(length + 1.8, 1.7 + (i % 3) * 0.4, 1);
        lip.material.opacity = fade;
      }
    });
    this.drips.forEach((drip, i) => {
      const contact = 875 + i * 38;
      const point = reaperWoundPoint(contact, ms, end, b, facing, this.plan);
      const age = Math.max(0, (ms - contact - 160) / 1000);
      const length = Math.max(
        0,
        Math.min(b.top + b.height - point.y - 4, age * (15 + (i % 3) * 6) * this.plan.strength),
      );
      drip.visible = age > 0 && inside(point) && length > 0;
      drip.position.set(point.x, -point.y - length / 2, 13);
      drip.scale.y = length;
      drip.material.opacity = fade;
      const drop = this.drops[i];
      if (!drop) return;
      drop.visible = drip.visible;
      drop.position.set(point.x, -point.y - length, 14);
      drop.scale.set(0.75, 1.3, 1);
      drop.material.opacity = fade;
    });
    let contact = 1000;
    let best = Infinity;
    for (let time = 820; time <= Math.min(ms, 1130); time += 10) {
      const point = reaperWoundPoint(time, ms, end, b, facing, this.plan);
      const score = Math.abs(point.y - b.top - b.height * 0.57);
      if (inside(point, 8) && score < best) {
        best = score;
        contact = time;
      }
    }
    const origin = reaperWoundPoint(contact, ms, end, b, facing, this.plan);
    this.harvest.update(
      ms,
      origin,
      { x: this.grip.x, y: -this.grip.y },
      b.top + b.height,
      facing,
      end.x + facing * (12 - this.plan.withdraw),
      portalFloor,
      this.plan,
      fade,
    );
    const bubbleWidth = Math.min(240, Math.max(120, viewport.x - 16));
    const bubbleHeight = (bubbleWidth * 330) / 900;
    this.bubble.visible = ms >= 300 && ms < 3500;
    this.bubble.scale.set(bubbleWidth, bubbleHeight, 1);
    this.bubble.position.set(
      Math.max(bubbleWidth / 2 + 8, Math.min(viewport.x - bubbleWidth / 2 - 8, reaper.position.x)),
      -Math.max(
        bubbleHeight / 2 + 8,
        Math.min(
          viewport.y - bubbleHeight / 2 - 8,
          Math.min(end.y - 100, b.top - bubbleHeight / 2 - 12),
        ),
      ),
      60,
    );
    this.bubble.material.opacity = clamp((ms - 300) / 180) * clamp((3500 - ms) / 250);
  }
}
