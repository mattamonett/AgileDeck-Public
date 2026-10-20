import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  bouquetModel,
  bouquetDetails,
  bouquetPetalShape,
  type BouquetModel,
  type BouquetPetal,
  ink,
} from './bouquet-model';
import {
  BOUQUET_DEPTH,
  BOUQUET_DURATION,
  BOUQUET_SCALE,
  bouquetEase,
  bouquetFrames,
  bouquetPose,
  bouquetBranch,
  bouquetOpen,
  bouquetFold,
  bouquetCardPoint,
  bouquetLandingPoint,
  type BouquetPlan,
} from './bouquet-choreography';
const unit = new THREE.Vector3(1, 1, 1),
  scale = new THREE.Vector3(BOUQUET_SCALE, BOUQUET_SCALE, BOUQUET_SCALE);
const vertex = new THREE.Vector3(),
  inverse = new THREE.Matrix4(),
  relative = new THREE.Matrix4();
export function bouquetLowest(root: THREE.Group, rotation: THREE.Euler) {
  root.updateMatrixWorld(true);
  inverse.copy(root.matrixWorld).invert();
  let lowest = Infinity;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.visible) {
      relative.multiplyMatrices(inverse, o.matrixWorld);
      const points = o.geometry.getAttribute('position');
      for (let i = 0; i < points.count; i++) {
        vertex
          .fromBufferAttribute(points, i)
          .applyMatrix4(relative)
          .multiplyScalar(BOUQUET_SCALE)
          .applyEuler(rotation);
        lowest = Math.min(lowest, vertex.y);
      }
    }
  });
  return lowest;
}
export function bouquetPetalMatrix(
  model: BouquetModel,
  source: BouquetPetal,
  ms: number,
  start: Point,
  b: TargetBounds,
  view: Point,
  facing: number,
) {
  const p = model.plan,
    q = bouquetPose(p, ms, start, b, view, facing),
    flower = model.flowers[source.flower];
  if (!flower) throw Error('Missing bouquet flower');
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(q.point.x, -q.point.y, q.depth),
    new THREE.Quaternion().setFromEuler(q.rotation),
    scale,
  );
  m.multiply(
    new THREE.Matrix4().compose(
      flower.branch.position,
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, 0, bouquetBranch(p, ms, source.flower)),
      ),
      unit,
    ),
  );
  m.multiply(new THREE.Matrix4().makeTranslation(0, flower.length, 0));
  return m.multiply(
    new THREE.Matrix4().compose(
      source.hinge.position,
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          bouquetFold(bouquetOpen(p, ms, source.flower), source.layer, source.daisy),
          0,
          -source.angle,
        ),
      ),
      unit,
    ),
  );
}
export function bouquetVinePoint(
  p: BouquetPlan,
  t: number,
  branch: number,
  b: TargetBounds,
  view: Point,
  facing: number,
): Point {
  const anchor = bouquetLandingPoint(p, b, view, facing),
    edge = branch ? b.left + b.width - 3 : b.left + 3;
  return {
    x: anchor.x + (edge - anchor.x) * bouquetEase(t / 0.6),
    y: anchor.y - 3 * bouquetEase(t / 0.6) - b.height * 0.23 * bouquetEase((t - 0.6) / 0.4),
  };
}
function petalLowest(g: THREE.BufferGeometry, rotation: THREE.Quaternion) {
  let lowest = Infinity;
  const points = g.getAttribute('position');
  for (let n = 0; n < points.count; n++) {
    vertex.fromBufferAttribute(points, n).multiplyScalar(BOUQUET_SCALE).applyQuaternion(rotation);
    lowest = Math.min(lowest, vertex.y);
  }
  return lowest;
}
interface DriftingPetal {
  readonly mesh: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshStandardMaterial>;
  readonly source: BouquetPetal;
  readonly born: number;
  readonly at: THREE.Vector3;
  readonly birthRotation: THREE.Quaternion;
  readonly finalRotation: THREE.Quaternion;
  readonly rotation: THREE.Quaternion;
  readonly flutter: THREE.Quaternion;
}
export class BouquetTrick {
  readonly object = new THREE.Group();
  readonly plan;
  readonly duration;
  private readonly model;
  private readonly petals: DriftingPetal[] = [];
  private readonly vines: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>[] = [];
  private readonly leaves: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly buds: THREE.Group[] = [];
  private birthLayout: (TargetBounds & { viewX: number; viewY: number; facing: number }) | null =
    null;
  private readonly birthSize = new THREE.Vector3();
  private readonly flutterAngles = new THREE.Euler();
  private readonly shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 32), ink(0x253d2e));
  constructor(actor: THREE.Group) {
    this.model = bouquetModel(actor);
    this.plan = this.model.plan;
    this.duration = BOUQUET_DURATION * this.plan.pace;
    this.object.name = 'bouquet-gift';
    this.model.sources.forEach((source, i) => {
      const mesh = new THREE.Mesh(source.mesh.geometry.clone(), source.mesh.material.clone()),
        born = this.plan.petals[i];
      if (born === undefined) throw Error('Missing petal release');
      mesh.name = `drifting-petal-${i}`;
      mesh.material.transparent = true;
      mesh.scale.setScalar(BOUQUET_SCALE);
      this.petals.push({
        mesh,
        source,
        born,
        at: new THREE.Vector3(),
        birthRotation: new THREE.Quaternion(),
        finalRotation: new THREE.Quaternion(),
        rotation: new THREE.Quaternion(),
        flutter: new THREE.Quaternion(),
      });
      this.object.add(mesh);
    });
    for (let i = 0; i < 2; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(65 * 3), 3));
      const line = new THREE.Line(
        g,
        new THREE.LineBasicMaterial({ color: 0x8cac69, transparent: true, depthWrite: false }),
      );
      line.name = `gift-vine-${i}`;
      this.vines.push(line);
      this.object.add(line);
    }
    const leaf = new THREE.Shape();
    leaf.moveTo(0, 0);
    leaf.quadraticCurveTo(-1.5, 1, 0, 3.5);
    leaf.quadraticCurveTo(1.5, 1, 0, 0);
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(leaf), ink(i % 2 ? 0x98ba78 : 0x6f9b58));
      mesh.name = `gift-leaf-${i}`;
      this.leaves.push(mesh);
      this.object.add(mesh);
    }
    for (let i = 0; i < 4; i++) {
      const bud = new THREE.Group();
      bud.name = `card-bloom-${i}`;
      this.buds.push(bud);
      this.object.add(bud);
      for (let k = 0; k < 5; k++) {
        const petal = new THREE.Mesh(
          new THREE.ShapeGeometry(bouquetPetalShape(2.8)),
          ink(i % 2 ? 0xffe5bb : this.plan.lilac ? 0xd3b1d9 : 0xf5b7b4),
        );
        petal.rotation.z = (k / 5) * Math.PI * 2;
        bud.add(petal);
      }
      const center = new THREE.Mesh(new THREE.CircleGeometry(0.65, 10), ink(0xe5bf68));
      center.position.z = 0.1;
      bud.add(center);
    }
    this.shadow.name = 'resting-bouquet-shadow';
    this.object.add(this.shadow);
  }
  cardAnimation(facing: number) {
    return bouquetFrames(this.plan, facing);
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
      ms = elapsed / p.pace,
      fade = 1 - bouquetEase((ms - p.cleanup) / 800);
    this.object.position.set(0, 0, 0);
    this.object.visible = ms < BOUQUET_DURATION;
    bouquetDetails(actor, ms);
    this.petals.forEach((petal) => {
      petal.source.mesh.visible = ms < petal.born;
    });
    const q = bouquetPose(p, ms, start, b, view, facing),
      floor = b.top + b.height + 23;
    const lowest = q.lay > 0 ? bouquetLowest(actor, q.rotation) : 0,
      support = floor + lowest;
    const y = q.lay > 0 ? Math.min(support, q.point.y + (support - q.point.y) * q.lay) : q.point.y;
    actor.position.set(q.point.x, -y, q.depth);
    actor.rotation.copy(q.rotation);
    actor.scale.setScalar(BOUQUET_SCALE);
    actor.visible = fade > 0;
    actor.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line)
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          m.transparent = true;
          m.opacity = fade;
        }
    });
    this.shadow.visible = q.lay > 0 && fade > 0;
    this.shadow.position.set(q.point.x, -floor, BOUQUET_DEPTH - 1);
    this.shadow.scale.set(14 + q.lay * 8, 2.2, 1);
    this.shadow.material.opacity = 0.15 * q.lay * fade;
    const layout = this.birthLayout;
    if (
      !layout ||
      layout.left !== b.left ||
      layout.top !== b.top ||
      layout.width !== b.width ||
      layout.height !== b.height ||
      layout.viewX !== view.x ||
      layout.viewY !== view.y ||
      layout.facing !== facing
    ) {
      this.birthLayout = {
        left: b.left,
        top: b.top,
        width: b.width,
        height: b.height,
        viewX: view.x,
        viewY: view.y,
        facing,
      };
      this.petals.forEach((petal, i) => {
        bouquetPetalMatrix(this.model, petal.source, petal.born, start, b, view, facing).decompose(
          petal.at,
          petal.birthRotation,
          this.birthSize,
        );
        petal.finalRotation.setFromEuler(
          new THREE.Euler(0, 0, p.phase * 0.2 + facing * (0.5 + i * 0.2)),
        );
      });
    }
    this.petals.forEach((petal, i) => {
      const t = Math.max(0, ms - petal.born) / 1000,
        at = petal.at,
        final = petal.finalRotation;
      const rotation = petal.rotation.copy(petal.birthRotation).slerp(final, bouquetEase(t / 1.3));
      this.flutterAngles.set(
        Math.sin(t * 5 + i) * 0.45 * bouquetEase(t / 0.25) * (1 - bouquetEase(t / 1.3)),
        0,
        0,
      );
      rotation.multiply(petal.flutter.setFromEuler(this.flutterAngles));
      const lowest = petalLowest(petal.mesh.geometry, rotation),
        rest = petalLowest(petal.mesh.geometry, final);
      const distance = Math.max(0, floor + rest + at.y),
        landing = (-20 + Math.sqrt(400 + 20 * distance)) / 10,
        drift = Math.min(t, landing);
      const free = -at.y + 20 * t + 5 * t * t,
        y = Math.min(floor + lowest, free);
      const vx = Math.min(
        p.breeze,
        Math.max(0, facing > 0 ? view.x - 16 - at.x : at.x - 16) / (landing + 0.01),
      );
      petal.mesh.visible = ms >= petal.born && fade > 0;
      petal.mesh.position.set(
        at.x +
          facing * vx * drift +
          Math.sin(drift * 3 + p.phase + i) * 4 * bouquetEase(drift / 0.5),
        -y,
        at.z + drift * 0.6,
      );
      petal.mesh.quaternion.copy(rotation);
      petal.mesh.material.opacity = fade;
    });
    this.updateGift(ms, b, view, facing, fade);
    if (ms >= BOUQUET_DURATION) actor.visible = false;
    actor.updateMatrixWorld(true);
  }
  private updateGift(ms: number, b: TargetBounds, view: Point, facing: number, fade: number) {
    const p = this.plan,
      growth = bouquetEase((ms - p.land) / 900),
      card = bouquetCardPoint(p, ms, { x: b.left, y: b.top }, b, facing);
    // The shared affine helper supplies the live card rotation without touching its reveal transform.
    const next = bouquetCardPoint(p, ms, { x: b.left + 1, y: b.top }, b, facing),
      angle = -Math.atan2(next.y - card.y, next.x - card.x);
    this.vines.forEach((line, branch) => {
      const positions = line.geometry.getAttribute('position');
      for (let n = 0; n <= 64; n++) {
        const raw = bouquetVinePoint(p, Math.min(n / 64, growth), branch, b, view, facing),
          at = bouquetCardPoint(p, ms, raw, b, facing);
        positions.setXYZ(n, at.x, -at.y, BOUQUET_DEPTH + 0.1);
      }
      positions.needsUpdate = true;
      line.geometry.computeBoundingSphere();
      line.visible = ms >= p.land && fade > 0;
      line.material.opacity = 0.7 * fade;
    });
    this.leaves.forEach((leaf, i) => {
      const t = 0.25 + (i % 4) * 0.18,
        branch = Math.floor(i / 4),
        grow = bouquetEase((growth - t) / 0.13);
      const at = bouquetCardPoint(
        p,
        ms,
        bouquetVinePoint(p, t, branch, b, view, facing),
        b,
        facing,
      );
      leaf.visible = grow > 0 && fade > 0;
      leaf.position.set(at.x, -at.y, BOUQUET_DEPTH + 0.2);
      leaf.rotation.z = angle + (branch ? -0.6 : 0.6);
      leaf.scale.setScalar(grow);
      leaf.material.opacity = fade;
    });
    this.buds.forEach((bud, i) => {
      const branch = i % 2,
        t = i < 2 ? 0.76 : 0.98,
        grow = bouquetEase((growth - t) / 0.14);
      const at = bouquetCardPoint(
        p,
        ms,
        bouquetVinePoint(p, t, branch, b, view, facing),
        b,
        facing,
      );
      bud.visible = grow > 0 && fade > 0;
      bud.position.set(at.x, -at.y, BOUQUET_DEPTH + 0.3);
      bud.rotation.z = angle;
      bud.scale.setScalar(grow);
      bud.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial)
          o.material.opacity = fade;
      });
    });
  }
}
