import * as THREE from 'three';
import { requireSceneObject } from '../../engine/scene-object';
import { UFO_SCALE, ufoFault, type UfoPlan } from './ufo-choreography';
function oval(
  parent: THREE.Object3D,
  name: string,
  color: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  metalness = 0,
) {
  const part = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 14),
    new THREE.MeshStandardMaterial({ color, metalness, roughness: metalness ? 0.27 : 0.65 }),
  );
  part.name = name;
  part.position.set(x, y, z);
  part.scale.set(sx, sy, sz);
  parent.add(part);
  return part;
}
export function makeUfo(): THREE.Group {
  const craft = new THREE.Group();
  craft.name = 'flying-saucer';
  oval(craft, 'silver-hull', 0xb6c5cf, 0, 0, 0, 38, 7, 20, 0.7);
  oval(craft, 'lower-keel', 0x465464, 0, -5, 0, 30, 4, 15, 0.65);
  oval(craft, 'upper-deck', 0xdbe6eb, 0, 5, 0, 29, 2, 16, 0.7);
  const rim = new THREE.Group();
  rim.name = 'rim';
  craft.add(rim);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(35.5, 1.3, 8, 48),
    new THREE.MeshStandardMaterial({ color: 0x324252, metalness: 0.8, roughness: 0.27 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.scale.y = 0.55;
  rim.add(ring);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6,
      light = new THREE.Mesh(
        new THREE.SphereGeometry(2.2, 12, 8),
        new THREE.MeshStandardMaterial({
          color: 0x80f8e1,
          emissive: 0x50d7bb,
          emissiveIntensity: 1.5,
          roughness: 0.25,
        }),
      );
    light.name = `rim-light-${i}`;
    light.position.set(Math.cos(a) * 35, 0, Math.sin(a) * 18);
    rim.add(light);
  }
  for (let i = 0; i < 7; i++)
    oval(craft, 'keel-vent', 0x182632, (i - 3) * 6, -5.5, 13, 1.4, 1.4, 0.5, 0.4);
  oval(craft, 'pilot-seat', 0x243747, 0, 10, -1, 6, 5, 5);
  oval(craft, 'pilot-torso', 0x92c5a2, 0, 12, 3, 5, 4, 4);
  const pilot = new THREE.Group();
  pilot.name = 'pilot';
  pilot.position.set(0, 17, 2);
  craft.add(pilot);
  oval(pilot, 'pilot-head', 0x92c5a2, 0, 0, 0, 6, 5.7, 4.5);
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.name = side < 0 ? 'left-eye' : 'right-eye';
    eye.position.set(side * 2.5, 1, 4);
    pilot.add(eye);
    oval(eye, 'black-eye', 0x13252a, 0, 0, 0, 2.1, 2.8, 0.7);
    oval(eye, 'glint', 0xd5fff2, -0.5, 0.8, 0.8, 0.55, 0.5, 0.2);
  }
  oval(pilot, 'mouth', 0x426858, 0, -2.3, 4.3, 1.3, 0.3, 0.2);
  oval(craft, 'control-panel', 0x293f4d, 0, 9, 8, 8, 2.5, 2);
  for (const side of [-1, 0, 1])
    oval(craft, 'panel-light', 0xaafbdd, side * 3, 10, 10, 0.9, 0.6, 0.5);
  for (const side of [-1, 1]) {
    oval(craft, 'pilot-upper-arm', 0x92c5a2, side * 4, 12, 4.5, 1.5, 2.5, 1.5).rotation.x = -0.55;
    oval(craft, 'pilot-elbow', 0x92c5a2, side * 4, 10.5, 6, 1.5, 1.5, 1.5);
    oval(craft, 'pilot-forearm', 0x92c5a2, side * 3.5, 10.8, 8, 1.2, 1.2, 2.4);
    oval(craft, 'pilot-hand', 0x92c5a2, side * 3, 11, 10, 1.6, 1, 1.3);
  }
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(17, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: 0x97dce4,
      metalness: 0.2,
      roughness: 0.08,
      transparent: true,
      opacity: 0.23,
      depthWrite: false,
    }),
  );
  dome.name = 'glass-dome';
  dome.position.y = 6;
  craft.add(dome);
  oval(craft, 'glass-highlight', 0xe8fffb, -9, 16, 10, 1, 5, 0.4).rotation.z = -0.5;
  const emitter = new THREE.Group();
  emitter.name = 'emitter';
  emitter.position.y = -8;
  craft.add(emitter);
  oval(emitter, 'gimbal', 0x2e424f, 0, 0, 0, 6, 3, 5, 0.65);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 10),
    new THREE.MeshStandardMaterial({
      color: 0xa1ffe7,
      emissive: 0x46ddac,
      emissiveIntensity: 1.5,
      roughness: 0.18,
    }),
  );
  bulb.name = 'aperture';
  bulb.position.y = -1.5;
  bulb.scale.set(4.5, 1.5, 3);
  emitter.add(bulb);
  const tip = new THREE.Object3D();
  tip.name = 'beam-origin';
  tip.position.y = -3;
  emitter.add(tip);
  craft.scale.setScalar(UFO_SCALE);
  return craft;
}
export function ufoDetails(craft: THREE.Group, p: UfoPlan, ms: number, active: number) {
  const fault = ufoFault(p, ms),
    rim = requireSceneObject(craft, 'rim');
  rim.rotation.y = (ms + 1200) * 0.004;
  for (let i = 0; i < 12; i++) {
    const bulb = requireSceneObject(rim, `rim-light-${i}`);
    if (bulb instanceof THREE.Mesh && bulb.material instanceof THREE.MeshStandardMaterial) {
      bulb.material.color.setHex(fault > 0.3 ? 0xffb75e : 0x80f8e1);
      bulb.material.emissive.setHex(fault > 0.3 ? 0xff841e : 0x50d7bb);
      bulb.material.emissiveIntensity = 0.7 + active + Math.sin((ms + 1200) / 80 + i * 0.8) * 0.25;
    }
  }
  const blink = (ms + 1200 + p.phase * 900) % 2800;
  for (const name of ['left-eye', 'right-eye'])
    requireSceneObject(craft, name).scale.y =
      blink > 2600 ? Math.max(0.08, Math.abs(blink - 2700) / 100) : 1;
  const aperture = requireSceneObject(craft, 'aperture');
  if (aperture instanceof THREE.Mesh && aperture.material instanceof THREE.MeshStandardMaterial) {
    aperture.material.emissiveIntensity = 0.4 + active * 2 - fault;
    aperture.material.color.setHex(fault > 0.3 ? 0xffc777 : 0xa1ffe7);
  }
}
