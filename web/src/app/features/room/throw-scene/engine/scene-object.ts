import type { Object3D } from 'three';

/** Named parts are a model/animation contract; fail clearly when a model is incomplete. */
export function requireSceneObject(root: Object3D, name: string): Object3D {
  const object = root.getObjectByName(name);
  if (!object) throw new Error(`Missing scene object: ${name}`);
  return object;
}
