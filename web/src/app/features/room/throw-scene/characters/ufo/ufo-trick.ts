import * as THREE from 'three';
import { requireSceneObject } from '../../engine/scene-object';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { ufoDetails } from './ufo-model';
import {
  UFO_DURATION,
  UFO_SCALE,
  ufoPlan,
  ufoBeam,
  ufoCardPoint,
  ufoCardPose,
  ufoRoot,
  ufoFrames,
  ufoEase,
} from './ufo-choreography';
export class UfoTrick {
  readonly object = new THREE.Group();
  readonly plan;
  readonly duration;
  private readonly beam: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly rails: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>[] = [];
  private readonly wake: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>[] = [];
  private readonly motes: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly brackets: THREE.Group[] = [];
  private readonly wash: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly band: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  constructor(id: string) {
    this.plan = ufoPlan(id);
    this.duration = UFO_DURATION * this.plan.pace;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    this.beam = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: 0x7affcd,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.beam.name = 'tractor-beam';
    this.object.add(this.beam);
    for (let i = 0; i < 2; i++) {
      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const rail = new THREE.Line(
        lineGeometry,
        new THREE.LineBasicMaterial({
          color: i ? 0xbcffed : 0x41ab99,
          transparent: true,
          depthWrite: false,
        }),
      );
      this.rails.push(rail);
      this.object.add(rail);
    }
    for (let i = 0; i < 3; i++) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color: i % 2 ? 0xe8ffff : 0x71c8e7,
          transparent: true,
          depthWrite: false,
        }),
      );
      this.wake.push(line);
      this.object.add(line);
    }
    for (let i = 0; i < 8; i++) {
      const mote = new THREE.Mesh(
        new THREE.SphereGeometry(1.2, 8, 6),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? 0xeefff9 : 0x5ee7ce,
          transparent: true,
          depthWrite: false,
        }),
      );
      mote.name = 'mote-' + i;
      this.motes.push(mote);
      this.object.add(mote);
    }
    this.wash = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0x76efcc,
        transparent: true,
        depthWrite: false,
        opacity: 0.09,
      }),
    );
    this.object.add(this.wash);
    this.band = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xc1fff0, transparent: true, depthWrite: false }),
    );
    this.object.add(this.band);
    for (let i = 0; i < 4; i++) {
      const group = new THREE.Group(),
        x = i % 2 ? 1 : -1,
        y = i < 2 ? 1 : -1;
      for (const horizontal of [false, true]) {
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(horizontal ? 10 : 1.5, horizontal ? 1.5 : 10),
          new THREE.MeshBasicMaterial({ color: 0x80f5d2, transparent: true, depthWrite: false }),
        );
        mesh.position.set(horizontal ? -x * 4 : 0, horizontal ? 0 : -y * 4, 0);
        group.add(mesh);
      }
      this.brackets.push(group);
      this.object.add(group);
    }
  }
  cardAnimation(b: TargetBounds = { left: 200, top: 130, width: 84, height: 122 }) {
    return ufoFrames(this.plan, b);
  }
  update(
    elapsed: number,
    craft: THREE.Group,
    b: TargetBounds,
    end: Point,
    view: Point = { x: window.innerWidth, y: window.innerHeight },
  ) {
    const ms = elapsed / this.plan.pace,
      p = this.plan,
      beam = ufoBeam(p, ms),
      root = ufoRoot(p, ms, end, view);
    craft.visible = ms < p.release + 1100 + 1200 * p.exit;
    craft.scale.setScalar(UFO_SCALE);
    craft.position.set(root.x, -root.y, 162);
    const depart = ufoEase((ms - p.release - 1100) / (1200 * p.exit));
    craft.rotation.set(0.04 * Math.sin(ms / 400) * ufoEase(ms / 300), 0, -p.side * depart * 0.4);
    ufoDetails(craft, p, ms, beam);
    craft.updateMatrixWorld(true);
    const contact = ufoCardPoint(p, ms, { x: b.left + b.width / 2, y: b.top + b.height * 0.62 }, b),
      emitter = requireSceneObject(craft, 'emitter');
    const aim = craft.worldToLocal(new THREE.Vector3(contact.x, -contact.y, 162));
    emitter.rotation.z =
      Math.atan2(aim.x - emitter.position.x, -(aim.y - emitter.position.y)) * ufoEase(ms / 300);
    craft.updateMatrixWorld(true);
    const apex = requireSceneObject(craft, 'beam-origin').getWorldPosition(new THREE.Vector3());
    this.object.position.set(-end.x, end.y, 0);
    this.object.visible = ms < UFO_DURATION;
    const left = ufoCardPoint(p, ms, { x: b.left + 2, y: b.top + b.height * 0.62 }, b),
      right = ufoCardPoint(p, ms, { x: b.left + b.width - 2, y: b.top + b.height * 0.62 }, b);
    const positions = this.beam.geometry.getAttribute('position');
    positions.setXYZ(0, apex.x, apex.y, apex.z - 150);
    positions.setXYZ(1, left.x, -left.y, 22);
    positions.setXYZ(2, right.x, -right.y, 22);
    positions.needsUpdate = true;
    this.beam.geometry.computeBoundingSphere();
    this.beam.visible = beam > 0;
    this.beam.material.opacity = beam * 0.13;
    this.rails.forEach((rail, i) => {
      const edge = i ? right : left,
        points = rail.geometry.getAttribute('position');
      points.setXYZ(0, apex.x, apex.y, apex.z - 150);
      points.setXYZ(1, edge.x, -edge.y, 22);
      points.needsUpdate = true;
      rail.geometry.computeBoundingSphere();
      rail.visible = beam > 0;
      rail.material.opacity = beam * 0.75;
    });
    this.wake.forEach((line, i) => {
      const from = craft.localToWorld(new THREE.Vector3(-p.side * 34, -3 + i * 2, 5)),
        previous = ufoRoot(p, Math.max(p.release + 1100, ms - 70 - i * 25), end, view),
        points = line.geometry.getAttribute('position');
      points.setXYZ(0, from.x, from.y, from.z - 150);
      points.setXYZ(1, from.x + previous.x - root.x, from.y + root.y - previous.y, from.z - 150);
      points.needsUpdate = true;
      line.geometry.computeBoundingSphere();
      line.visible = ms > p.release + 1180 && craft.visible;
      line.material.opacity = depart * 0.7;
    });
    const pose = ufoCardPose(p, ms, b),
      center = ufoCardPoint(p, ms, { x: b.left + b.width / 2, y: b.top + b.height / 2 }, b);
    this.wash.position.set(center.x, -center.y, 22);
    this.wash.scale.set(b.width, b.height, 1);
    this.wash.rotation.z = (-pose.angle * Math.PI) / 180;
    this.wash.material.opacity = beam * 0.08;
    this.wash.visible = beam > 0;
    const scan = ufoEase((ms - 1200) / 180) * (1 - ufoEase((ms - p.release) / 450)),
      cycle = Math.max(0, Math.min(1, (ms - 1200) / (p.release - 1200))),
      wave = (cycle * p.scans) % 1;
    const at = ufoCardPoint(
      p,
      ms,
      { x: b.left + b.width / 2, y: b.top + b.height * (0.08 + 0.84 * wave) },
      b,
    );
    this.band.position.set(at.x, -at.y, 23);
    this.band.scale.set(b.width * 0.94, 2, 1);
    this.band.rotation.z = (-pose.angle * Math.PI) / 180;
    this.band.material.opacity = Math.sin(wave * Math.PI) * scan * 0.8;
    this.band.visible = scan > 0;
    this.brackets.forEach((group, i) => {
      const point = ufoCardPoint(
        p,
        ms,
        { x: b.left + (i % 2 ? b.width - 3 : 3), y: b.top + (i < 2 ? 3 : b.height - 3) },
        b,
      );
      group.position.set(point.x, -point.y, 24);
      group.rotation.z = (-pose.angle * Math.PI) / 180;
      group.visible = beam > 0;
      for (const mesh of group.children)
        if (mesh instanceof THREE.Mesh && mesh.material instanceof THREE.MeshBasicMaterial)
          mesh.material.opacity = beam * 0.9;
    });
    this.motes.forEach((mote, i) => {
      const q = ((ms - 600) / 1100 + i / 8 + p.phase) % 1,
        age = Math.max(0, q),
        from = ufoCardPoint(
          p,
          ms,
          {
            x: b.left + b.width * (0.16 + i * 0.095),
            y: b.top + b.height * (0.65 + (i % 3) * 0.08),
          },
          b,
        ),
        u = ufoEase(age);
      mote.visible = beam > 0 && ms > 600;
      mote.position.set(
        from.x + (apex.x - from.x) * u,
        -from.y + (apex.y + from.y) * u,
        22 + (apex.z - 172) * u,
      );
      mote.material.opacity = Math.sin(age * Math.PI) * beam;
    });
  }
}
