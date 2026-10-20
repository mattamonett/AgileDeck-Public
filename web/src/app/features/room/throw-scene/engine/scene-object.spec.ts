import { Group } from 'three';
import { requireSceneObject } from './scene-object';

describe('scene object contract', () => {
  it('resolves nested named parts and rejects incomplete models explicitly', () => {
    const root = new Group();
    const limb = new Group();
    limb.name = 'arm';
    const model = new Group();
    model.add(limb);
    root.add(model);
    expect(requireSceneObject(root, 'arm')).toBe(limb);
    expect(() => requireSceneObject(root, 'missing')).toThrow('Missing scene object: missing');
  });
});
