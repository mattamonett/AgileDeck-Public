import { clamp } from '../../kit';
import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { requireSceneObject } from '../../engine/scene-object';
import { architectArmTo, architectProps, architectLegs, architectWalk } from './architect-model';
import { architectStrokes, strokeLength, strokePoint } from './architect-drawing';
import {
  ARCHITECT_DURATION,
  ARCHITECT_SCALE,
  architectPlan,
  architectEase,
  architectInkPoint,
  architectPen,
  architectWipe,
  architectCardPose,
  architectCardPoint,
} from './architect-choreography';
export { makeArchitect, architectWalk } from './architect-model';
export { ARCHITECT_DURATION, ARCHITECT_WIPE_MS } from './architect-choreography';
const up = new THREE.Vector3(0, 1, 0);
export class ArchitectTrick {
  readonly object = new THREE.Group();
  readonly plan;
  private readonly rows = Array.from(
    { length: 6 },
    () =>
      new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ color: 0xfffef5, transparent: true, depthWrite: false }),
      ),
  );
  private readonly lines = architectStrokes.flatMap((stroke, index) => {
    let before = 0;
    const total = strokeLength(stroke);
    return stroke.slice(1).flatMap((to, i) => {
      const from = stroke[i];
      if (!from) return [];
      const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const item = {
        stroke: index,
        from,
        to,
        before,
        length,
        total,
        mesh: new THREE.Mesh(
          new THREE.CylinderGeometry(0.45, 0.45, 1, 8),
          new THREE.MeshBasicMaterial({ color: 0x18744f, transparent: true, depthWrite: false }),
        ),
        dot: new THREE.Mesh(
          new THREE.SphereGeometry(0.48, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0x18744f, transparent: true, depthWrite: false }),
        ),
      };
      before += length;
      return [item];
    });
  });
  get duration() {
    return ARCHITECT_DURATION * this.plan.pace;
  }
  constructor(id = 'landing') {
    this.plan = architectPlan(id);
    this.rows.forEach((row, i) => {
      row.name = 'whiteboard-row-' + i;
      this.object.add(row);
    });
    this.lines.forEach((line, i) => {
      line.dot.name = 'architect-ink-tip-' + line.stroke + '-' + i;
      this.object.add(line.mesh, line.dot);
    });
  }
  cardAnimation(facing: number) {
    const frames: Keyframe[] = [];
    for (let ms = 0; ms <= ARCHITECT_DURATION; ms += 20) {
      const pose = architectCardPose(ms, this.plan, facing);
      frames.push({
        offset: ms / ARCHITECT_DURATION,
        translate: `${pose.x}px ${pose.y}px`,
        rotate: `${pose.angle}deg`,
      });
    }
    return { frames, options: { duration: this.duration, easing: 'linear' } };
  }
  private aim(man: THREE.Group, side: number, tip: Point, eraser: boolean) {
    const arm = requireSceneObject(man, side > 0 ? 'right-arm' : 'left-arm');
    const shoulder = arm.getWorldPosition(new THREE.Vector3());
    const direction = new THREE.Vector3(tip.x - shoulder.x, -tip.y - shoulder.y, 0).normalize();
    const length = (eraser ? 23 : 12) * ARCHITECT_SCALE;
    return {
      palm: new THREE.Vector3(
        tip.x,
        -tip.y,
        172 - (eraser ? 5 : 3) * ARCHITECT_SCALE,
      ).addScaledVector(direction, -length),
      angle: Math.atan2(-direction.x, direction.y),
    };
  }
  update(
    ms: number,
    man: THREE.Group,
    b: TargetBounds,
    end: Point,
    view = {
      x: typeof window === 'undefined' ? 1024 : window.innerWidth,
      y: typeof window === 'undefined' ? 768 : window.innerHeight,
    },
  ) {
    ms = Math.round((ms / this.plan.pace) * 1e6) / 1e6;
    const p = this.plan;
    const facing = end.x < b.left + b.width / 2 ? 1 : -1;
    const wipe = architectWipe(ms, p);
    const pen = architectPen(p, ms);
    const first = architectStrokes[0];
    if (!first) throw new Error('Missing architect diagram');
    const raw =
      ms < p.wipe
        ? {
            x: b.left + 4 + (facing > 0 ? wipe.point[0] : 1 - wipe.point[0]) * (b.width - 8),
            y: b.top + 4 + wipe.point[1] * (b.height - 8),
          }
        : architectInkPoint(pen.point, b);
    const point = architectCardPoint(ms, raw, p, b, facing);
    const lastWipe = architectCardPoint(
      ms,
      {
        x: facing > 0 ? b.left + 4 : b.left + b.width - 4,
        y: b.top + 4 + (5.5 / 6) * (b.height - 8),
      },
      p,
      b,
      facing,
    );
    const firstPen = architectInkPoint(strokePoint(first, 0), b);
    const transfer = architectEase((ms - p.wipe) / 520);
    const finish = architectEase((ms - p.drawEnd) / 450);
    let x = point.x - facing * 27;
    if (ms < p.wipe) x = end.x + (x - end.x) * architectEase(ms / 120);
    else if (ms < p.drawStart) x = lastWipe.x - facing * 27 + (firstPen.x - lastWipe.x) * transfer;
    else if (ms > p.drawEnd) x = x + (end.x - x) * finish;
    const q = architectEase((ms - p.departure - 180) / (1300 * p.exit));
    const exitX = facing > 0 ? -100 : view.x + 100;
    x += (exitX - end.x) * q;
    const y = end.y + Math.sin(q * Math.PI) * (p.spot.y - 0.5) * 12;
    man.position.set(x, -y, 165);
    man.scale.setScalar(ARCHITECT_SCALE);
    man.rotation.set(0, 0, 0);
    man.updateMatrixWorld(true);
    const head = requireSceneObject(man, 'head');
    const proudHead = Math.sin(clamp((ms - p.drawEnd - 650) / 500) * Math.PI);
    head.rotation.set(
      ms < p.drawEnd
        ? clamp((point.y - b.top) / b.height) * 0.1
        : proudHead * (p.glasses ? 0.06 : 0.14),
      facing * 0.1,
      0,
    );
    man.updateMatrixWorld(true);
    if (ms >= p.departure) {
      const previous = architectEase((ms - p.departure - 185) / (1300 * p.exit));
      const stride = Math.min(1, Math.abs(q - previous) * Math.abs(exitX - end.x) * 1.5);
      architectWalk(man, (exitX - end.x) * q, -facing, stride, p.step, true);
      man.rotation.y = -facing * architectEase((ms - p.departure) / 180) * 0.35;
      architectLegs(man, (exitX - end.x) * q, stride, p.step);
    } else {
      const rest = man.localToWorld(new THREE.Vector3(-facing * 17, -12, 7));
      let active = this.aim(man, facing, point, ms < p.wipe);
      let other = { palm: rest, angle: 0 };
      if (ms >= p.wipe && ms < p.drawStart) {
        const u = clamp((ms - p.wipe) / 520);
        const exchange = man.localToWorld(new THREE.Vector3(0, -16, 12));
        const from = this.aim(man, facing, lastWipe, true),
          to = this.aim(man, facing, firstPen, false);
        if (u < 0.5) {
          const t = architectEase(u * 2);
          active = { palm: from.palm.lerp(exchange, t), angle: from.angle * (1 - t) };
          other = { palm: rest.lerp(exchange, t), angle: 0 };
        } else {
          const t = architectEase((u - 0.5) * 2);
          active = { palm: exchange.clone().lerp(to.palm, t), angle: to.angle * t };
          other = { palm: exchange.clone().lerp(rest, t), angle: 0 };
        }
      } else if (ms >= p.drawEnd) {
        const markerPocket = man.localToWorld(new THREE.Vector3(-7, -2, 7)),
          holster = man.localToWorld(new THREE.Vector3(7, -2, 7));
        active = {
          palm: active.palm.lerp(markerPocket, finish),
          angle: active.angle * (1 - finish),
        };
        other = { palm: rest.lerp(holster, finish), angle: Math.PI * finish };
        if (ms >= p.drawEnd + 450) {
          active = { palm: markerPocket, angle: 0 };
          other = { palm: holster, angle: Math.PI };
        }
      }
      const stowed = ms >= p.drawEnd + 450;
      const proud = Math.sin(clamp((ms - p.drawEnd - 600) / 500) * Math.PI);
      if (stowed) {
        active.palm.lerp(
          man.localToWorld(new THREE.Vector3(facing * 18, -12, 9)),
          architectEase((ms - p.drawEnd - 450) / 180),
        );
        other.palm.lerp(
          man.localToWorld(new THREE.Vector3(-facing * 18, -12, 9)),
          architectEase((ms - p.drawEnd - 450) / 180),
        );
        if (p.glasses) {
          const frame = requireSceneObject(man, facing > 0 ? 'left-glasses' : 'right-glasses');
          const glasses = frame.localToWorld(new THREE.Vector3(-facing * 4.5, 0, 0));
          other.palm.lerp(glasses, proud);
          other.angle = 0;
        }
      }
      architectArmTo(man, facing, active.palm, active.angle);
      architectArmTo(man, -facing, other.palm, other.angle);
      architectProps(man, facing, ms >= p.wipe + 260, stowed);
      const priorMs = Math.max(0, ms - 5);
      let priorX;
      if (ms < p.wipe) {
        const prior = architectWipe(priorMs, p);
        const to =
          b.left +
          4 +
          (facing > 0 ? prior.point[0] : 1 - prior.point[0]) * (b.width - 8) -
          facing * 27;
        priorX = end.x + (to - end.x) * architectEase(priorMs / 120);
      } else if (ms < p.drawStart)
        priorX =
          lastWipe.x -
          facing * 27 +
          (firstPen.x - lastWipe.x) * architectEase((priorMs - p.wipe) / 520);
      else {
        const prior = architectInkPoint(architectPen(p, priorMs).point, b);
        priorX = prior.x - facing * 27;
        if (ms > p.drawEnd) priorX += (end.x - priorX) * architectEase((priorMs - p.drawEnd) / 450);
      }
      const stride = Math.min(1, Math.abs(x - priorX) * 1.5);
      const moving = ms < p.drawEnd + 450;
      architectLegs(man, x - end.x, moving ? stride : 0, p.step, moving ? undefined : end);
    }
    man.visible = ms < Math.round((p.departure + 180 + 1300 * p.exit) * 1e6) / 1e6;
    for (const side of [-1, 1]) {
      const eye = requireSceneObject(man, side < 0 ? 'left-eye' : 'right-eye');
      const blink = Math.abs(Math.sin(ms / 680 + p.pressure));
      eye.scale.y = blink < 0.06 ? 0.15 + blink * 12 : 1;
    }
    man.updateMatrixWorld(true);
    this.object.position.set(-end.x, end.y, 0);
    this.object.visible = ms < ARCHITECT_DURATION;
    const fade = clamp((ARCHITECT_DURATION - ms) / 650);
    const pose = architectCardPose(ms, p, facing);
    this.rows.forEach((row, i) => {
      const amount = ms >= p.wipe ? 1 : i < wipe.row ? 1 : i === wipe.row ? wipe.across : 0;
      const width = (b.width - 8) * amount;
      const rightward = (i % 2 === 0) === facing > 0;
      const rawX = b.left + 4 + (rightward ? width / 2 : b.width - 8 - width / 2);
      const rawY = b.top + 4 + ((i + 0.5) * (b.height - 8)) / 6;
      const at = architectCardPoint(ms, { x: rawX, y: rawY }, p, b, facing);
      row.visible = amount > 0;
      row.position.set(at.x, -at.y, 20);
      row.scale.set(width, (b.height - 8) / 6 + 0.3, 1);
      row.rotation.z = (-pose.angle * Math.PI) / 180;
      row.material.opacity = fade;
    });
    this.lines.forEach((line) => {
      const timing = p.strokes[line.stroke];
      const progress = timing ? clamp((ms - timing.start) / (timing.end - timing.start)) : 0;
      const t = clamp((progress * line.total - line.before) / line.length);
      line.mesh.visible = line.dot.visible = t > 0;
      line.mesh.material.opacity = line.dot.material.opacity = fade;
      const from = architectCardPoint(ms, architectInkPoint(line.from, b), p, b, facing);
      const toRaw = [
        line.from[0] + (line.to[0] - line.from[0]) * t,
        line.from[1] + (line.to[1] - line.from[1]) * t,
      ] as const;
      const to = architectCardPoint(ms, architectInkPoint(toRaw, b), p, b, facing);
      const a = new THREE.Vector3(from.x, -from.y, 22),
        z = new THREE.Vector3(to.x, -to.y, 22),
        delta = z.clone().sub(a);
      line.mesh.position.copy(a).add(z).multiplyScalar(0.5);
      line.mesh.scale.y = delta.length();
      if (delta.lengthSq() > 1e-8) line.mesh.quaternion.setFromUnitVectors(up, delta.normalize());
      line.dot.position.copy(z);
    });
  }
}
