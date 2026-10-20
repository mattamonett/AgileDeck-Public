import { characterFor } from '../characters';
import { makeMoneyBag } from '../landing/money-spill';
import * as THREE from 'three';
import { impactKind, seededRandom, type ImpactKind } from '../flight/flight-math';
import { makeSlotMachine } from '../landing/landing-effects';

export const IMPACT_COLORS: Record<ImpactKind, readonly number[]> = {
  paper: [0xfff5df, 0xe0d6bd, 0xffffff],
  tomato: [0xe63825, 0xff6944, 0xa31e10],
  cream: [0xfff5df, 0xffffff, 0xe5b975],
  petals: [0xf1a998, 0xffd7b5, 0x75a46d],
  liquid: [0xe9a632, 0xffd978, 0xfff0c5],
  dust: [0x81503a, 0xb48350, 0x593723],
  spark: [0xffd988, 0xffedc5, 0xf2ac80],
};

function material(color: number, roughness = 0.6) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04 });
}

export function makeProjectile(emoji: string, id: string): THREE.Group {
  const character = characterFor(emoji);
  if (character) return character.makeModel(id);
  if (emoji === '🎰') return makeSlotMachine();
  if (emoji === '💰') return makeMoneyBag();
  const group = new THREE.Group();
  const kind = impactKind(emoji);
  const random = seededRandom(id);
  if (emoji === '💣') {
    group.add(new THREE.Mesh(new THREE.SphereGeometry(14, 20, 12), material(0x292935, 0.35)));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 5, 10), material(0x77717a));
    cap.position.set(5, 13, 0);
    cap.rotation.z = -0.3;
    group.add(cap);
  } else if (kind === 'paper') {
    const geometry = new THREE.IcosahedronGeometry(13, 1);
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const factor =
        0.9 +
        Math.sin(positions.getX(i) * 4 + positions.getY(i) * 5 + positions.getZ(i) * 2) * 0.12;
      positions.setXYZ(
        i,
        positions.getX(i) * factor,
        positions.getY(i) * factor,
        positions.getZ(i) * factor,
      );
    }
    geometry.computeVertexNormals();
    const paper = material(0xf6f0df, 0.95);
    paper.flatShading = true;
    group.add(new THREE.Mesh(geometry, paper));
  } else if (emoji === '🥧') {
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(15, 11, 7, 24), material(0xc79858)));
    const cream = new THREE.Mesh(new THREE.SphereGeometry(12, 20, 12), material(0xfff7e4));
    cream.scale.y = 0.32;
    cream.position.y = 5;
    group.add(cream);
    for (let i = 0; i < 9; i++) {
      const dollop = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), material(0xfff7e4));
      dollop.position.set(Math.cos(i * 0.698) * 10, 7, Math.sin(i * 0.698) * 10);
      group.add(dollop);
    }
    group.rotation.x = 0.65;
  } else if (emoji === '🍺') {
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(10, 8, 24, 20),
      new THREE.MeshPhysicalMaterial({
        color: 0xf2d7a2,
        roughness: 0.15,
        transparent: true,
        opacity: 0.55,
        metalness: 0.05,
      }),
    );
    const beer = new THREE.Mesh(new THREE.CylinderGeometry(8, 7, 19, 20), material(0xd68c1d, 0.22));
    beer.position.y = -2;
    group.add(beer, glass);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(7, 2, 8, 16), material(0xe8dabc, 0.18));
    handle.position.x = 11;
    handle.scale.y = 1.2;
    group.add(handle);
    for (let i = 0; i < 10; i++) {
      const foam = new THREE.Mesh(
        new THREE.SphereGeometry(3 + random() * 2, 8, 6),
        material(0xfff8e7),
      );
      foam.position.set((random() - 0.5) * 12, 11 + random() * 3, (random() - 0.5) * 12);
      group.add(foam);
    }
  } else if (emoji === '💩') {
    for (let i = 0; i < 4; i++) {
      const coil = new THREE.Mesh(
        new THREE.SphereGeometry(12 - i * 2.5, 16, 10),
        material(0x77513a, 0.7),
      );
      coil.scale.y = 0.55;
      coil.position.set(i * 0.7, i * 5 - 8, 0);
      group.add(coil);
    }
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    if (context) {
      context.font = '96px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(emoji, 64, 69);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
    );
    sprite.scale.set(43, 43, 1);
    group.add(sprite);
  }
  return group;
}

export function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (
      child instanceof THREE.Mesh ||
      child instanceof THREE.Sprite ||
      child instanceof THREE.Line
    ) {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const item of materials) {
        if ('map' in item && item.map instanceof THREE.Texture) item.map.dispose();
        item.dispose();
      }
    }
  });
  object.removeFromParent();
}
