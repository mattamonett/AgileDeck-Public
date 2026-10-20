import { Scene, Mesh } from 'three';
import { ImpactFragments } from './impact-fragments';

describe('impact fragments', () => {
  function setup() {
    const scene = new Scene();
    const fragments = new ImpactFragments(scene);
    const target = document.createElement('div');
    const bounds = new DOMRect(100, 200, 80, 120);
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(bounds);
    return { scene, fragments, target, bounds };
  }

  it('bounds repeated impacts and disposes all expired geometry', () => {
    const { scene, fragments, target, bounds } = setup();
    for (let i = 0; i < 30; i++)
      fragments.emit(
        { emoji: '🍅', id: `impact-${i}`, end: { x: 110, y: 220 }, direction: 1, target },
        100,
      );
    expect(scene.children.length).toBeLessThanOrEqual(450);
    expect(fragments.active).toBe(true);
    const first = scene.children[0];
    if (!(first instanceof Mesh)) throw new Error('Expected fragment mesh');
    const dispose = vi.spyOn(first.geometry, 'dispose');
    fragments.update(3000, () => bounds);
    expect(fragments.active).toBe(false);
    expect(scene.children).toHaveLength(0);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('keeps stains attached to moving cards and clears resources on demand', () => {
    const { scene, fragments, target, bounds } = setup();
    fragments.emit(
      { emoji: '🍅', id: 'impact', end: { x: 110, y: 220 }, direction: 1, target },
      100,
    );
    fragments.update(200, () => bounds);
    const stain = scene.children[0];
    if (!stain) throw new Error('Expected stain');
    const position = stain.position.clone();
    fragments.update(200, () => new DOMRect(150, 250, 80, 120));
    expect(stain.position.x).toBeCloseTo(position.x + 50);
    expect(stain.position.y).toBeCloseTo(position.y - 50);
    fragments.clear();
    expect(scene.children).toHaveLength(0);
    expect(fragments.active).toBe(false);
  });
});
