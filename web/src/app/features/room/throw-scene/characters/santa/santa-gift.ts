import * as THREE from 'three';
import { glossy, part } from '../../kit';
import { GIFT_D, GIFT_H, GIFT_W, LID_H } from './santa-choreography';
import { helix } from './santa-model';

const WRAPS = [
  { paper: 0x23875f, lid: 0x2f9c70, ribbon: 0xf2c94c },
  { paper: 0x2b5fb3, lid: 0x3a72c8, ribbon: 0xf4f1e6 },
  { paper: 0xd8b13c, lid: 0xe6c253, ribbon: 0xc8202f },
] as const;

export interface Gift {
  readonly group: THREE.Group;
  readonly lid: THREE.Group;
  readonly spring: THREE.Mesh;
  readonly bow: THREE.Group;
  readonly tail: THREE.Group;
  readonly materials: readonly THREE.Material[];
}

export function buildGift(parent: THREE.Object3D, wrap: number): Gift {
  const colors = WRAPS[wrap] ?? WRAPS[0];
  const materials: THREE.Material[] = [];
  const own = <M extends THREE.Material>(m: M) => {
    materials.push(m);
    return m;
  };
  const group = new THREE.Group();
  group.name = 'santa-gift';
  group.visible = false;
  parent.add(group);
  part(
    group,
    'gift-box',
    new THREE.BoxGeometry(GIFT_W, GIFT_H, GIFT_D),
    own(glossy(colors.paper, 0.5)),
    0,
    GIFT_H / 2,
    0,
  );
  part(
    group,
    'gift-band-x',
    new THREE.BoxGeometry(2.4, GIFT_H, GIFT_D + 0.3),
    own(glossy(colors.ribbon, 0.3)),
    0,
    GIFT_H / 2,
    0,
  );
  part(
    group,
    'gift-band-z',
    new THREE.BoxGeometry(GIFT_W + 0.3, GIFT_H, 2.4),
    own(glossy(colors.ribbon, 0.3)),
    0,
    GIFT_H / 2,
    0,
  );
  const spring = part(parent, 'gift-spring', helix(), own(glossy(0xd9dde3, 0.2)));
  spring.visible = false;
  // The lid's origin is the centre of its top surface: the point the card corner rests on.
  const lid = new THREE.Group();
  lid.name = 'gift-lid';
  lid.visible = false;
  parent.add(lid);
  part(
    lid,
    'gift-lid-cap',
    new THREE.BoxGeometry(GIFT_W + 1, LID_H, GIFT_D + 1),
    own(glossy(colors.lid, 0.45)),
    0,
    -LID_H / 2,
    0,
  );
  part(
    lid,
    'gift-lid-band',
    new THREE.BoxGeometry(2.4, LID_H + 0.2, GIFT_D + 1.3),
    own(glossy(colors.ribbon, 0.3)),
    0,
    -LID_H / 2,
    0,
  );
  const bow = new THREE.Group();
  bow.name = 'gift-bow';
  lid.add(bow);
  for (const s of [-1, 1]) {
    const loop = part(
      bow,
      'gift-bow-loop',
      new THREE.TorusGeometry(1.6, 0.55, 6, 14),
      own(glossy(colors.ribbon, 0.3)),
      s * 1.9,
      0.4,
      0,
    );
    loop.scale.set(1.2, 0.8, 1);
    loop.rotation.z = s * 0.35;
  }
  part(
    bow,
    'gift-bow-knot',
    new THREE.SphereGeometry(1, 10, 8),
    own(glossy(colors.ribbon, 0.3)),
    0,
    0,
    0.3,
  );
  const tail = new THREE.Group();
  tail.name = 'gift-bow-tail';
  bow.add(tail);
  part(
    tail,
    'gift-bow-tail-strip',
    new THREE.BoxGeometry(1, 5, 0.3),
    own(glossy(colors.ribbon, 0.3)),
    0,
    -2.5,
    0,
  );
  bow.position.set(0, -LID_H / 2, GIFT_D / 2 + 0.8);
  tail.position.set(0.6, -0.4, 0.2);
  tail.rotation.z = 0.25;
  return { group, lid, spring, bow, tail, materials };
}
