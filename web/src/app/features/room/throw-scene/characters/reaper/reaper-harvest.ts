import { clamp } from '../../kit';
import * as THREE from 'three';
import { seededRandom, type Point } from '../../flight/flight-math';
import { reaperEase, type ReaperPlan } from './reaper-choreography';

function wet(color: number) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.2,
    metalness: 0.04,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
function glow(color: number) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
}
const up = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
/** Flesh falls from the incision while its spirit is drawn into the Reaper's palm. */
export class ReaperHarvest {
  readonly object = new THREE.Group();
  private readonly cavity = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), wet(0x220710));
  private readonly rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.15, 8, 24), wet(0xa82c43));
  private readonly bowels = Array.from({ length: 3 }, (_, index) => {
    const points = Array.from({ length: 25 }, (_, i) => {
      const t = i / 24;
      return new THREE.Vector3(
        Math.sin(t * Math.PI * 6 + index * 0.7) * 0.3 * Math.sin(t * Math.PI),
        -t + Math.cos(t * Math.PI * 6) * 0.12 * Math.sin(t * Math.PI),
        0.03 * Math.sin(t * Math.PI * 8),
      );
    });
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, 0.075, 8, false),
      wet(index % 2 ? 0xae3b59 : 0xe78c99),
    );
    mesh.name = 'reaper-bowel';
    return mesh;
  });
  private readonly spray = Array.from(
    { length: 24 },
    (_, i) => new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), wet(i % 4 ? 0x9f1935 : 0xd97183)),
  );
  private readonly pools = Array.from(
    { length: 5 },
    () => new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), wet(0x701026)),
  );
  private readonly tether = Array.from(
    { length: 14 },
    () => new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 1, 6), glow(0x9de7de)),
  );
  private readonly spirit = new THREE.Group();
  private readonly portal = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), glow(0x080912));
  private readonly rings = Array.from(
    { length: 3 },
    (_, i) =>
      new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 40), glow(i % 2 ? 0x729293 : 0x424559)),
  );
  private readonly mist = Array.from(
    { length: 10 },
    () => new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), glow(0x627779)),
  );
  private readonly phase: number;
  private readonly velocities: readonly { x: number; y: number; delay: number }[];
  constructor(id: string) {
    const random = seededRandom(id + ':death-spill');
    this.phase = random() * Math.PI * 2;
    this.velocities = this.spray.map(() => ({
      x: random() * 100 - 35,
      y: 45 + random() * 95,
      delay: random() * 300,
    }));
    const head = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), glow(0xd0fff0));
    head.scale.set(5, 7, 3);
    head.position.y = 7;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(5.5, 18, 12), glow(0x9de6d6));
    tail.rotation.z = Math.PI;
    tail.position.y = -2;
    this.spirit.add(head, tail);
    for (const x of [-1.8, 1.8]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), glow(0x1a333d));
      eye.position.set(x, 8, 3);
      eye.scale.set(0.8, 1.5, 0.6);
      this.spirit.add(eye);
    }
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), glow(0x1a333d));
    mouth.position.set(0, 4.2, 3);
    mouth.scale.set(1.2, 2, 0.6);
    this.spirit.add(mouth);
    this.spirit.name = 'card-spirit';
    this.portal.name = 'death-portal';
    this.object.add(
      this.cavity,
      this.rim,
      ...this.bowels,
      ...this.spray,
      ...this.pools,
      ...this.tether,
      this.spirit,
      this.portal,
      ...this.rings,
      ...this.mist,
    );
    for (const part of this.object.children) part.visible = false;
  }
  update(
    ms: number,
    origin: Point,
    grip: Point,
    floor: number,
    facing: number,
    actorX: number,
    portalFloor: number,
    plan: ReaperPlan,
    fade: number,
  ) {
    const emerge = reaperEase((ms - 1110) / 650);
    this.cavity.visible = this.rim.visible = emerge > 0 && fade > 0;
    this.cavity.position.set(origin.x, -origin.y, 22);
    this.cavity.scale.set(7 * emerge, 14 * emerge, 1);
    this.rim.position.set(origin.x, -origin.y, 23);
    this.rim.scale.set(7 * emerge, 14 * emerge, 1);
    this.cavity.material.opacity = this.rim.material.opacity = fade;
    this.bowels.forEach((bowel, i) => {
      const spill = reaperEase((ms - 1170 - i * 130) / (650 * plan.strength));
      bowel.visible = spill > 0 && fade > 0;
      bowel.position.set(origin.x + (i - 1) * 3, -origin.y - i * 2, 26 + i * 2);
      bowel.rotation.z =
        facing *
        (0.12 +
          Math.sin((ms - 1200) / 260 + i + this.phase) *
            0.12 *
            Math.exp(-Math.max(0, ms - 1500) / 900));
      bowel.scale.set(
        17 * plan.strength * spill,
        (floor - origin.y + 10 - i * 8) * spill,
        15 * spill,
      );
      bowel.material.opacity = fade;
    });
    this.spray.forEach((drop, i) => {
      const velocity = this.velocities[i];
      if (!velocity) return;
      const age = (ms - 900 - velocity.delay) / 1000;
      drop.visible = age > 0 && age < 3.5 && fade > 0;
      const hit = Math.min(Math.max(0, age), 1.6);
      drop.position.set(
        origin.x + facing * velocity.x * hit * plan.strength,
        -Math.min(floor + 8, origin.y - hit * velocity.y + hit * hit * 180),
        28,
      );
      drop.scale.set(i % 4 ? 1.4 : 2.6, age > 1.2 ? 0.7 : 2.2, 1);
      drop.rotation.z = age * (i - 12) * 0.2;
      drop.material.opacity = fade * clamp((3.5 - age) / 0.7);
    });
    this.pools.forEach((pool, i) => {
      const spread = reaperEase((ms - 1850 - i * 90) / 1000);
      pool.visible = spread > 0 && fade > 0;
      pool.position.set(origin.x + (i - 2) * 7, -floor - 8, 18);
      pool.scale.set((5 + (i % 3) * 2) * spread, (1.5 + (i % 2)) * spread, 0.5);
      pool.material.opacity = fade;
    });
    const lift = reaperEase((ms - 1950) / 700);
    const draw = reaperEase((ms - 2600) / (650 * plan.collect));
    const absorb = reaperEase((ms - 3550) / 350);
    const soul = {
      x: origin.x + (grip.x - origin.x) * draw + Math.sin(lift * Math.PI) * facing * 8,
      y: origin.y - lift * 28 + (grip.y - origin.y + lift * 28) * draw,
    };
    this.spirit.visible = ms > 1950 && ms < 3900;
    this.spirit.position.set(soul.x, -soul.y, 38);
    this.spirit.scale.setScalar(lift * (1 - absorb));
    this.spirit.rotation.z = facing * Math.sin(ms / 230 + this.phase) * 0.08 * (1 - draw);
    this.tether.forEach((thread, i) => {
      const t = i / this.tether.length;
      const t2 = (i + 1) / this.tether.length;
      const x =
        origin.x +
        (soul.x - origin.x) * t +
        Math.sin(t * Math.PI * 3 + ms / 250) * Math.sin(t * Math.PI) * 2;
      const y = origin.y + (soul.y - origin.y) * t;
      const xx =
        origin.x +
        (soul.x - origin.x) * t2 +
        Math.sin(t2 * Math.PI * 3 + ms / 250) * Math.sin(t2 * Math.PI) * 2;
      const yy = origin.y + (soul.y - origin.y) * t2;
      thread.visible = ms > 1950 && ms < 3300;
      direction.set(xx - x, y - yy, 0);
      thread.position.set((x + xx) / 2, -(y + yy) / 2, 35);
      thread.scale.y = direction.length();
      thread.quaternion.setFromUnitVectors(up, direction.normalize());
      thread.material.opacity = lift * (1 - reaperEase((ms - 3000) / 300)) * 0.45;
    });
    const portal =
      reaperEase((ms - 3950 - plan.departure) / 350) *
      (1 - reaperEase((ms - 5220 - plan.departure) / 260));
    this.portal.visible = portal > 0;
    this.portal.position.set(actorX, -portalFloor, 50);
    this.portal.scale.set(27 * portal, 5.5 * portal, 2);
    this.portal.material.opacity = portal;
    this.rings.forEach((ring, i) => {
      ring.visible = portal > 0;
      ring.position.set(actorX, -portalFloor, 52 + i);
      ring.scale.set((28 + i * 3) * portal, (6 + i * 1.3) * portal, 1);
      ring.rotation.z = Math.sin(ms / 250 + i) * 0.02;
      ring.material.opacity = portal * (0.65 - i * 0.15);
    });
    this.mist.forEach((puff, i) => {
      const phase = (ms / 800 + i / 10 + this.phase) % 1;
      puff.visible = portal > 0;
      puff.position.set(
        actorX + Math.sin(i * 4 + ms / 1100) * (22 + phase * 6),
        -portalFloor + phase * 28,
        54,
      );
      puff.scale.set((4 + phase * 5) * portal, (2 + phase * 5) * portal, 1);
      puff.material.opacity = portal * Math.sin(phase * Math.PI) * 0.22;
    });
  }
}
