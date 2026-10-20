import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LightningStorm, LIGHTNING_CONTACT_MS } from './lightning-storm';
import { disposeObject } from '../engine/throw-models';

describe('target lightning storm', () => {
  it('forms the cloud before releasing bolts and dissolves after the strike', () => {
    const storm = new LightningStorm('strike');
    const target = { x: 240, y: 220 };
    const bolts = storm.object.children.filter((child) => child instanceof THREE.Mesh);
    expect(bolts).toHaveLength(3);
    storm.update(200, target, 160);
    expect(bolts.every((bolt) => !bolt.visible)).toBe(true);
    storm.update(LIGHTNING_CONTACT_MS, target, 160);
    expect(bolts[0]?.visible).toBe(true);
    expect(bolts[2]?.visible).toBe(false);
    const first = bolts[0];
    if (!first) throw new Error('Missing first lightning bolt');
    storm.object.updateMatrixWorld(true);
    const tip = first.localToWorld(new THREE.Vector3(0, -1, 0));
    expect(tip.y).toBeCloseTo(-target.y);
    storm.update(1000, target, 160);
    expect(storm.object.visible).toBe(false);
    expect(bolts.every((bolt) => !bolt.visible)).toBe(true);
    disposeObject(storm.object);
  });

  it('tracks the target and keeps the cloud inside the top of the viewport', () => {
    const scene = new THREE.Scene();
    const storm = new LightningStorm('moving-strike');
    scene.add(storm.object);
    storm.update(100, { x: 200, y: 250 }, 190);
    expect(storm.object.position.x).toBe(200);
    storm.update(200, { x: 400, y: 80 }, 10);
    expect(storm.object.position.x).toBe(400);
    expect(storm.object.position.y).toBe(-26);
    disposeObject(storm.object);
    expect(scene.children).toHaveLength(0);
  });
});
