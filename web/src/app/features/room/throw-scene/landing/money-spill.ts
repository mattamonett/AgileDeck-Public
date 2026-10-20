import * as THREE from 'three';
import { seededRandom } from '../flight/flight-math';

function mesh<T extends THREE.BufferGeometry>(geometry: T, color: number) {
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
}
function dollar(color: number): THREE.Group {
  const symbol = new THREE.Group();
  const top = mesh(new THREE.TorusGeometry(3, 0.9, 5, 14, Math.PI * 1.5), color);
  top.position.y = 2.5;
  top.rotation.z = Math.PI / 4;
  const bottom = mesh(new THREE.TorusGeometry(3, 0.9, 5, 14, Math.PI * 1.5), color);
  bottom.position.y = -2.5;
  bottom.rotation.z = Math.PI * 1.25;
  symbol.add(top, bottom, mesh(new THREE.PlaneGeometry(1, 14), color));
  return symbol;
}
function fabric(color = 0xdfb367) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  });
}

export function makeMoneyBag(): THREE.Group {
  const bag = new THREE.Group();
  const profile = new THREE.SplineCurve([
    new THREE.Vector2(0, -17),
    new THREE.Vector2(9, -16),
    new THREE.Vector2(15, -12),
    new THREE.Vector2(18, -5),
    new THREE.Vector2(17, 2),
    new THREE.Vector2(13, 8),
    new THREE.Vector2(7, 12),
    new THREE.Vector2(5, 14),
  ]).getPoints(32);
  for (const side of [-1, 1]) {
    const half = new THREE.Group();
    half.name = side < 0 ? 'bag-left' : 'bag-right';
    // Two rounded shells share a closed seam and separate when the bag bursts.
    const shell = new THREE.Mesh(
      new THREE.LatheGeometry(profile, 28, side < 0 ? Math.PI : 0, Math.PI),
      fabric(),
    );
    shell.name = 'bag-shell';
    const cut = new THREE.Shape();
    profile.forEach((point, index) => {
      if (index === 0) cut.moveTo(point.x, point.y);
      else cut.lineTo(point.x, point.y);
    });
    for (const point of [...profile].reverse()) cut.lineTo(-point.x, point.y);
    cut.closePath();
    const lining = new THREE.Mesh(new THREE.ShapeGeometry(cut), fabric(0xb58b4c));
    lining.rotation.y = Math.PI / 2;
    half.add(shell, lining);
    bag.add(half);
  }
  const top = new THREE.Group();
  top.name = 'bag-tie';
  const gathered = new THREE.CylinderGeometry(9, 5, 8, 24, 3);
  const positions = gathered.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const angle = Math.atan2(positions.getZ(i), positions.getX(i));
    const fold = 1 + Math.cos(angle * 6) * 0.12;
    positions.setX(i, positions.getX(i) * fold);
    positions.setZ(i, positions.getZ(i) * fold);
  }
  gathered.computeVertexNormals();
  const ruffle = new THREE.Mesh(gathered, fabric());
  ruffle.position.y = 18;
  const rope = new THREE.Mesh(new THREE.TorusGeometry(5.6, 1.2, 8, 24), fabric(0x8c6035));
  rope.rotation.x = Math.PI / 2;
  rope.position.y = 13.5;
  const knot = new THREE.Mesh(new THREE.SphereGeometry(1.8, 10, 8), fabric(0x8c6035));
  knot.position.set(2, 13.5, 5.5);
  top.add(ruffle, rope, knot);
  bag.add(top);
  const emblem = new THREE.Group();
  emblem.name = 'bag-dollar';
  for (const side of [-1, 1]) {
    const stamp = dollar(0x655538);
    stamp.position.set(0, -3, side * 18.2);
    stamp.rotation.y = side < 0 ? Math.PI : 0;
    stamp.scale.setScalar(0.85);
    stamp.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material.dispose();
        child.material = fabric(0x655538);
      }
    });
    emblem.add(stamp);
  }
  bag.add(emblem);
  return bag;
}
interface CashPiece {
  object: THREE.Group;
  bill: boolean;
  vx: number;
  vy: number;
  delay: number;
  spin: number;
}
export class MoneySpill {
  readonly object = new THREE.Group();
  private readonly cash: CashPiece[] = [];
  constructor(id: string) {
    const random = seededRandom(id + ':cash');
    for (let i = 0; i < 14; i++) {
      const bill = i < 6;
      const object = new THREE.Group();
      object.name = bill ? 'dollar-bill' : 'coin';
      object.visible = false;
      if (bill) {
        object.add(mesh(new THREE.PlaneGeometry(19, 10), 0x97c286));
        const inset = mesh(new THREE.PlaneGeometry(16, 7), 0xc8dfaa);
        inset.position.z = 0.2;
        object.add(inset);
        const mark = dollar(0x487a50);
        mark.scale.setScalar(0.45);
        mark.position.z = 0.5;
        object.add(mark);
      } else {
        object.add(mesh(new THREE.CircleGeometry(4, 16), 0xf5c652));
        const rim = mesh(new THREE.RingGeometry(2.8, 3.3, 16), 0xffeb99);
        rim.position.z = 0.2;
        object.add(rim);
      }
      this.object.add(object);
      this.cash.push({
        object,
        bill,
        vx: (random() - 0.5) * 130,
        vy: 35 + random() * 65,
        delay: 180 + random() * 150,
        spin: (random() - 0.5) * 9,
      });
    }
  }
  update(ms: number, bag: THREE.Group, floor: number, fade: number) {
    const split = Math.max(0, Math.min(1, (ms - 80) / 160));
    for (const side of [-1, 1]) {
      const half = bag.getObjectByName(side < 0 ? 'bag-left' : 'bag-right');
      if (half) {
        half.position.set(side * split * 12, -split * 5, 0);
        half.rotation.z = -side * split * 0.35;
      }
    }
    const tie = bag.getObjectByName('bag-tie');
    if (tie) {
      tie.position.y = split * 10;
      tie.rotation.z = split * 0.6;
      tie.visible = ms < 650;
    }
    const emblem = bag.getObjectByName('bag-dollar');
    if (emblem) emblem.visible = split < 0.25;
    bag.scale.setScalar(0.8 * fade * (1 - Math.max(0, Math.min(1, (ms - 850) / 500)) * 0.45));
    for (const piece of this.cash) {
      const age = (ms - piece.delay) / 1000;
      piece.object.visible = age >= 0 && fade > 0;
      const landing = (piece.vy + Math.sqrt(piece.vy ** 2 + 600 * (14 - floor))) / 300;
      const settled = Math.max(0, age - landing);
      const x = piece.vx * Math.min(Math.max(0, age), landing + 0.12);
      const y =
        age < landing
          ? 14 + piece.vy * age - 150 * age * age
          : floor +
            (piece.bill ? 0 : Math.abs(Math.sin(settled * 13)) * 8 * Math.exp(-settled * 7));
      piece.object.position.set(
        x + (piece.bill && age < landing ? Math.sin(age * 9 + piece.spin) * 6 : 0),
        y,
        20,
      );
      piece.object.rotation.z = piece.bill
        ? Math.sin(Math.min(age, landing) * 6 + piece.spin) * 0.55
        : age * piece.spin;
      piece.object.scale.set(
        1,
        piece.bill
          ? 0.7 + Math.abs(Math.cos(Math.min(age, landing) * 8)) * 0.3
          : Math.max(0.2, Math.abs(Math.cos(age * 10))),
        1,
      );
      piece.object.traverse((child) => {
        if (child instanceof THREE.Mesh) child.material.opacity = fade;
      });
    }
  }
}
