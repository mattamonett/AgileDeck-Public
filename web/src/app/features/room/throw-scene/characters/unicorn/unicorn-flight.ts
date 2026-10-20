import { clamp } from '../../kit';
import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { requireSceneObject } from '../../engine/scene-object';
import { nativeUnicornPlan, unicornFoot, unicornDetails } from './unicorn-model';
import {
  UNICORN_COLORS,
  UNICORN_DURATION,
  UNICORN_SCALE,
  unicornEase,
  unicornArrival,
  unicornProgress,
  unicornRideParameter,
  unicornBridgePoint,
  unicornExitPoint,
  unicornCardPoint,
  unicornCardPose,
  unicornFrames,
  type UnicornPlan,
} from './unicorn-choreography';
export { makeUnicorn } from './unicorn-model';
const SEGMENTS = 56;
function light(color: number) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
function star(color: number, size: number) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 + Math.PI / 2,
      r = i % 2 ? size * 0.4 : size;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  return new THREE.Mesh(new THREE.ShapeGeometry(shape), light(color));
}
export function unicornCurveFoot(
  p: UnicornPlan,
  path: (t: number) => Point,
  progress: number,
  index: number,
  distance: number,
  stride: number,
) {
  const phase = distance * 0.18 * p.step + (index < 2 ? 0 : Math.PI) + (index % 2) * 0.3;
  const offset =
    ((index < 2 ? -13 : 13) + (index % 2 ? 1 : -1) + Math.sin(phase) * 3 * stride) * UNICORN_SCALE;
  const direction = Math.sign(offset) || 1;
  let u = progress,
    at = path(u),
    remaining = Math.abs(offset);
  for (let step = 0; step < 256 && remaining > 0.000001; step++) {
    const nextU = clamp(u + direction * 0.004);
    if (nextU === u) {
      const before = path(u - 0.0001),
        after = path(u + 0.0001),
        length = Math.hypot(after.x - before.x, after.y - before.y) || 1;
      at = {
        x: at.x + ((after.x - before.x) / length) * remaining * direction,
        y: at.y + ((after.y - before.y) / length) * remaining * direction,
      };
      break;
    }
    const next = path(nextU),
      length = Math.hypot(next.x - at.x, next.y - at.y);
    if (length >= remaining) {
      u += ((nextU - u) * remaining) / length;
      at = path(u);
      break;
    }
    remaining -= length;
    u = nextU;
    at = next;
  }
  const lift = Math.max(0, Math.sin(phase)) * 4 * stride;
  return { x: at.x, y: at.y - lift, parameter: u, lift };
}
function curveOrientation(p: UnicornPlan, path: (t: number) => Point, t: number) {
  const before = path(t - 0.0001),
    after = path(t + 0.0001);
  const forward = new THREE.Vector3(after.x - before.x, before.y - after.y, 0)
    .normalize()
    .multiplyScalar(p.side);
  const up = new THREE.Vector3(0, 1, 0.35 * (1 - unicornEase((t - 0.9) / 0.1)));
  up.addScaledVector(forward, -up.dot(forward)).normalize();
  const depth = new THREE.Vector3().crossVectors(forward, up).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(forward, up, depth),
  );
}
export class RainbowRide {
  readonly object = new THREE.Group();
  readonly plan;
  readonly duration;
  private readonly bands: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly clouds: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly wash: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly sparkles: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly packets: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly ribbon: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly halo: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  constructor(unicorn: THREE.Group) {
    this.plan = nativeUnicornPlan(unicorn);
    this.duration = UNICORN_DURATION * this.plan.pace;
    this.object.name = 'rainbow-ride';
    for (let i = 0; i < 12; i++) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(SEGMENTS * 18), 3),
      );
      const band = new THREE.Mesh(geometry, light(UNICORN_COLORS[i % 6] ?? 0xb69aff));
      band.name = `rainbow-band-${i}`;
      band.frustumCulled = false;
      this.bands.push(band);
      this.object.add(band);
    }
    for (let i = 0; i < 6; i++) {
      const cloud = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 10),
        light(i % 2 ? 0xf9edf9 : 0xffffff),
      );
      cloud.name = `cloud-${i}`;
      cloud.scale.set(i % 3 === 1 ? 12 : 8, 5, 3);
      this.clouds.push(cloud);
      this.object.add(cloud);
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        light(UNICORN_COLORS[i] ?? 0xb69aff),
      );
      face.name = `gift-stripe-${i}`;
      this.wash.push(face);
      this.object.add(face);
    }
    for (let i = 0; i < 18; i++) {
      const mesh = star(UNICORN_COLORS[i % 6] ?? 0xb69aff, i % 3 ? 2.5 : 3.5);
      mesh.name = `sparkle-${i}`;
      this.sparkles.push(mesh);
      this.object.add(mesh);
    }
    for (let i = 0; i < 3; i++) {
      const mesh = star(i % 2 ? 0xffe99a : 0xffffff, 4);
      mesh.name = `horn-packet-${i}`;
      this.packets.push(mesh);
      this.object.add(mesh);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(33 * 3), 3));
    this.ribbon = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: 0xffda8c, transparent: true, depthWrite: false }),
    );
    this.ribbon.name = 'horn-ribbon';
    this.object.add(this.ribbon);
    this.halo = new THREE.Mesh(new THREE.RingGeometry(3, 4, 24), light(0xffe4a0));
    this.halo.name = 'horn-halo';
    this.object.add(this.halo);
  }
  cardAnimation() {
    return unicornFrames(this.plan);
  }
  update(
    elapsed: number,
    unicorn: THREE.Group,
    start: Point,
    end: Point,
    b: TargetBounds,
    view: Point,
  ) {
    const p = this.plan,
      ms = elapsed / p.pace,
      arrival = unicornArrival(p),
      travel = unicornProgress(p, ms),
      progress = unicornRideParameter(p, start, end, view, ms),
      exit = unicornEase((ms - p.departure) / p.exit);
    this.object.visible = ms < UNICORN_DURATION;
    unicorn.visible = ms < p.departure + p.exit;
    unicorn.scale.set(UNICORN_SCALE * p.side, UNICORN_SCALE, UNICORN_SCALE);
    const exitStart = unicornCardPoint(p, p.departure, end, b);
    const inbound = (t: number) => unicornBridgePoint(p, start, end, view, t),
      outbound = (t: number) => unicornExitPoint(p, exitStart, view, t);
    const ride = ms < arrival,
      depart = ms >= p.departure,
      path = depart ? outbound : inbound,
      at = ride ? inbound(progress) : depart ? outbound(exit) : unicornCardPoint(p, ms, end, b);
    unicorn.position.set(at.x, -at.y, 168);
    const body = requireSceneObject(unicorn, 'body');
    body.position.y = ride
      ? -4 * (1 - unicornEase((ms - p.form) / 240))
      : -3 *
        unicornEase((ms - p.departure + 240) / 240) *
        (1 - unicornEase((ms - p.departure) / 180));
    if (ride || depart)
      unicorn.quaternion.copy(curveOrientation(p, path, depart ? exit : progress));
    else {
      const flat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        (-unicornCardPose(p, ms).angle * Math.PI) / 180,
      );
      unicorn.quaternion.slerpQuaternions(
        flat,
        curveOrientation(p, outbound, 0),
        unicornEase((ms - p.departure + 240) / 240),
      );
    }
    const before = ride
      ? unicornRideParameter(p, start, end, view, ms - 15)
      : depart
        ? unicornEase((ms - p.departure - 15) / p.exit)
        : 0;
    const prior = path(before),
      moving = ride || depart ? clamp(Math.hypot(at.x - prior.x, at.y - prior.y) / 1.8) : 0;
    const bow =
      unicornEase((ms - p.magic + 320) / 320) * (1 - unicornEase((ms - p.magic - 780) / 350));
    const wink = p.wink ? Math.sin(Math.PI * clamp((ms - p.magic - 1150) / 400)) ** 2 : 0;
    unicornDetails(unicorn, ms, bow, moving, wink);
    unicorn.updateMatrixWorld(true);
    const goals: { target: THREE.Vector3; angle: number }[] = [];
    for (let i = 0; i < 4; i++) {
      let foot: Point;
      if (ride && ms < p.form) {
        const native = unicorn.localToWorld(
          new THREE.Vector3((i < 2 ? -13 : 13) + (i % 2 ? 1 : -1), 0, 0),
        );
        foot = { x: native.x, y: start.y };
      } else if (ride || depart) {
        const q = unicornCurveFoot(
          p,
          path,
          depart ? exit : progress,
          i,
          (depart ? exit : travel) * Math.hypot(end.x - start.x, end.y - start.y),
          moving,
        );
        foot = q;
        if (ride && ms < p.form + 200) {
          const native = unicorn.localToWorld(
              new THREE.Vector3((i < 2 ? -13 : 13) + (i % 2 ? 1 : -1), 0, 0),
            ),
            entry = unicornEase((ms - p.form) / 200);
          foot = { x: native.x + (q.x - native.x) * entry, y: start.y + (q.y - start.y) * entry };
        }
      } else {
        foot = unicornCardPoint(
          p,
          ms,
          { x: end.x + p.side * ((i < 2 ? -13 : 13) + (i % 2 ? 1 : -1)) * UNICORN_SCALE, y: b.top },
          b,
        );
        const prance =
          !p.wink && i === 3 ? Math.sin(Math.PI * clamp((ms - p.magic - 1050) / 400)) * 7 : 0;
        foot.y -= prance;
      }
      goals.push({
        target: new THREE.Vector3(foot.x, -foot.y, 172),
        angle: ride || depart ? 0 : (-unicornCardPose(p, ms).angle * Math.PI) / 180,
      });
    }
    // The pelvis yields to the terrain; the fixed bones never stretch to reach a hoof contact.
    let suspension = 0;
    goals.forEach((goal, i) => {
      const leg = requireSceneObject(unicorn, `leg-${i}`),
        local = leg.worldToLocal(goal.target.clone());
      const vertical = Math.sqrt(Math.max(0, 23.95 ** 2 - local.x ** 2 - local.z ** 2));
      if (local.y < 0) suspension = Math.min(suspension, local.y + vertical);
    });
    body.position.y += suspension;
    unicorn.updateMatrixWorld(true);
    goals.forEach((goal, i) => unicornFoot(unicorn, i, goal.target, goal.angle));
    unicorn.updateMatrixWorld(true);
    this.bands.forEach((band, i) => {
      const outgoing = i >= 6,
        stripe = i % 6,
        formed = outgoing ? clamp((ms - p.departure + 200) / 600) : clamp(ms / p.form);
      const cut = outgoing ? Math.max(0, exit - 0.12) : clamp((ms - p.departure - 100) / 850);
      const alpha = outgoing
        ? 1 - unicornEase((ms - p.departure - p.exit) / 650)
        : 1 - unicornEase((ms - p.departure - 300) / 900);
      const curve = outgoing ? outbound : inbound,
        positions = band.geometry.getAttribute('position');
      for (let segment = 0; segment < SEGMENTS; segment++) {
        const a = curve(Math.min(formed, Math.max(cut, segment / SEGMENTS))),
          c = curve(Math.min(formed, Math.max(cut, (segment + 1) / SEGMENTS))),
          y = stripe * 3.2;
        const base = segment * 6;
        positions.setXYZ(base, a.x, -a.y - y, 172);
        positions.setXYZ(base + 1, c.x, -c.y - y, 172);
        positions.setXYZ(base + 2, a.x, -a.y - y - 3.2, 172);
        positions.setXYZ(base + 3, a.x, -a.y - y - 3.2, 172);
        positions.setXYZ(base + 4, c.x, -c.y - y, 172);
        positions.setXYZ(base + 5, c.x, -c.y - y - 3.2, 172);
      }
      positions.needsUpdate = true;
      band.visible = formed > 0 && alpha > 0;
      band.material.opacity = alpha * 0.7;
    });
    this.clouds.forEach((cloud, i) => {
      const point = i < 3 ? start : unicornCardPoint(p, ms, end, b),
        offset = ((i % 3) - 1) * 11;
      cloud.position.set(point.x + offset, -point.y - 5, 171);
      cloud.visible = ms < p.departure + 650;
      cloud.material.opacity = (1 - unicornEase((ms - p.departure) / 650)) * 0.8;
    });
    const gift =
      unicornEase((ms - p.magic - 450) / 260) * (1 - unicornEase((ms - p.departure) / 450));
    this.wash.forEach((stripe, i) => {
      const center = unicornCardPoint(
        p,
        ms,
        { x: b.left + b.width / 2, y: b.top + (b.height * (i + 0.5)) / 6 },
        b,
      );
      stripe.position.set(center.x, -center.y, 173);
      stripe.scale.set(b.width, b.height / 6, 1);
      stripe.rotation.z = (-unicornCardPose(p, ms).angle * Math.PI) / 180;
      stripe.visible = gift > 0;
      stripe.material.opacity = gift * (0.18 + 0.04 * Math.sin(ms / 240 + i + p.phase));
    });
    const tip = requireSceneObject(unicorn, 'horn-tip').getWorldPosition(new THREE.Vector3()),
      target = unicornCardPoint(p, ms, { x: b.left + b.width / 2, y: b.top + b.height * 0.28 }, b);
    const to = new THREE.Vector3(target.x, -target.y, 174),
      control = tip
        .clone()
        .lerp(to, 0.5)
        .add(new THREE.Vector3(p.side * 16, 18, 0));
    const ray = (t: number) =>
      tip
        .clone()
        .multiplyScalar((1 - t) ** 2)
        .addScaledVector(control, 2 * (1 - t) * t)
        .addScaledVector(to, t * t);
    const reach = clamp((ms - p.magic) / 450),
      attribute = this.ribbon.geometry.getAttribute('position');
    for (let i = 0; i <= 32; i++) {
      const point = ray((i / 32) * reach);
      attribute.setXYZ(i, point.x, point.y, point.z);
    }
    attribute.needsUpdate = true;
    this.ribbon.geometry.computeBoundingSphere();
    this.ribbon.visible = ms >= p.magic && ms < p.magic + 450 + (p.pulses - 1) * 220 + 160;
    this.ribbon.material.opacity =
      1 - unicornEase((ms - p.magic - 450 - (p.pulses - 1) * 220) / 160);
    this.packets.forEach((packet, i) => {
      const t = (ms - p.magic - i * 220) / 450,
        point = ray(clamp(t));
      packet.visible = i < p.pulses && t >= 0 && t <= 1;
      packet.position.copy(point);
      packet.rotation.z = ms / 170 + i;
      packet.material.opacity = 1;
    });
    this.halo.position.copy(tip);
    this.halo.visible = ms >= p.magic - 180 && ms < p.magic + 650;
    this.halo.scale.setScalar(1 + Math.sin(ms / 90) ** 2);
    this.halo.material.opacity =
      unicornEase((ms - p.magic + 180) / 180) * (1 - unicornEase((ms - p.magic - 450) / 200));
    this.sparkles.forEach((spark, i) => {
      const onCard = i >= 12 && !depart;
      let point: Point;
      if (onCard)
        point = unicornCardPoint(
          p,
          ms,
          { x: b.left + (i % 2 ? b.width : 0), y: b.top + b.height * (0.12 + (i % 3) * 0.34) },
          b,
        );
      else
        point = (depart ? outbound : inbound)(
          depart ? Math.max(0, exit - 0.1 + (i / 18) * 0.2) : i / 18,
        );
      spark.position.set(point.x, -point.y + (onCard ? 0 : 8 + Math.sin(ms / 200 + i) * 2), 175);
      spark.rotation.z = ms / 900 + i;
      const alpha =
        (0.3 + 0.7 * Math.sin(ms / 210 + i + p.phase) ** 2) *
        (onCard ? gift : clamp(ms / p.form) * (1 - unicornEase((ms - p.departure - p.exit) / 650)));
      spark.scale.setScalar(0.7 + 0.3 * Math.sin(ms / 250 + i) ** 2);
      spark.visible = alpha > 0 && (onCard || depart || i / 18 < clamp(ms / p.form));
      spark.material.opacity = alpha;
    });
  }
}
