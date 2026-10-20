import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { makeMoneyBag, MoneySpill } from './money-spill';
import { LandingEffect, landingKind } from './landing-effects';
import { disposeObject } from '../engine/throw-models';

describe('bursting money bag', () => {
  it('has rounded, lit volume from the front, side, and back', () => {
    const bag = makeMoneyBag();
    const shells: THREE.Mesh[] = [];
    bag.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name === 'bag-shell') shells.push(child);
    });
    expect(shells).toHaveLength(2);
    expect(shells.every((shell) => shell.material instanceof THREE.MeshStandardMaterial)).toBe(
      true,
    );
    for (const angle of [0, Math.PI / 2, Math.PI]) {
      bag.rotation.y = angle;
      const size = new THREE.Box3().setFromObject(bag).getSize(new THREE.Vector3());
      expect(size.x).toBeGreaterThan(30);
      expect(size.z).toBeGreaterThan(30);
    }
    disposeObject(bag);
  });

  it('splits before spilling bills and coins, then settles the money below it', () => {
    const bag = makeMoneyBag();
    const spill = new MoneySpill('test');
    expect(spill.object.children.filter((p) => p.name === 'dollar-bill')).toHaveLength(6);
    expect(spill.object.children.filter((p) => p.name === 'coin')).toHaveLength(8);
    spill.update(0, bag, -80, 1);
    expect(spill.object.children.every((p) => !p.visible)).toBe(true);
    spill.update(170, bag, -80, 1);
    expect(bag.getObjectByName('bag-left')?.position.x).toBeLessThan(-5);
    expect(bag.getObjectByName('bag-right')?.position.x).toBeGreaterThan(5);
    expect(spill.object.children.every((p) => !p.visible)).toBe(true);
    spill.update(600, bag, -80, 1);
    expect(spill.object.children.every((p) => p.visible)).toBe(true);
    expect(spill.object.children.some((p) => p.position.y > 0)).toBe(true);
    spill.update(2100, bag, -80, 1);
    for (const cash of spill.object.children) expect(cash.position.y).toBeLessThan(-75);
    spill.update(2200, bag, -80, 0);
    expect(spill.object.children.every((p) => !p.visible)).toBe(true);
    disposeObject(spill.object);
    disposeObject(bag);
  });
  it('reproduces a throw without stacking different throws into identical patterns', () => {
    const samples = ['one', 'one', 'two'].map((id) => {
      const bag = makeMoneyBag();
      const spill = new MoneySpill(id);
      spill.update(700, bag, -80, 1);
      const positions = spill.object.children.map((p) => p.position.toArray());
      disposeObject(spill.object);
      disposeObject(bag);
      return positions;
    });
    expect(samples[0]).toEqual(samples[1]);
    expect(samples[0]).not.toEqual(samples[2]);
  });
  it('registers the landing and cleans up at the end of the spill', () => {
    const bag = makeMoneyBag();
    const effect = new LandingEffect('💰', bag, 'test');
    expect(landingKind('💰')).toBe('💰');
    effect.update(
      effect.duration,
      { left: 100, top: 100, width: 100, height: 150 },
      { x: 140, y: 150 },
    );
    expect(effect.object.visible).toBe(false);
    expect(bag.scale.x).toBe(0);
    disposeObject(effect.object);
    disposeObject(bag);
  });
});
