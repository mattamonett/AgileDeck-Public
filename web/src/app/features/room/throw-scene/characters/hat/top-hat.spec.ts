import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { HatTrick, makeTopHat } from './top-hat';
import {
  HAT_DEPTH,
  HAT_DURATION,
  HAT_SCALE,
  hatPlan,
  hatApproach,
  hatLandingPoint,
  hatRabbitRise,
  hatCardPose,
} from './hat-choreography';
import { hatTravel } from './hat-model';
import { requireSceneObject } from '../../engine/scene-object';
import { disposeObject } from '../../engine/throw-models';
import { LandingEffect, landingKind } from '../../landing/landing-effects';
import { hatCharacter } from './hat-character';

const b = { left: 230, top: 240, width: 58, height: 84 };
function setup(id: string) {
  const hat = makeTopHat();
  const trick = new HatTrick(id);
  const parent = new THREE.Group();
  parent.add(trick.object);
  const scene = new THREE.Scene();
  scene.add(parent, hat);
  const update = (ms: number, bounds = b) => {
    const end = hatLandingPoint(trick.plan, bounds);
    parent.position.set(end.x, -end.y, 150);
    trick.update(ms * trick.plan.pace, hat, bounds, end);
    scene.updateMatrixWorld(true);
    return end;
  };
  return {
    hat,
    trick,
    update,
    dispose: () => {
      disposeObject(hat);
      disposeObject(trick.object);
    },
  };
}
const position = (object: THREE.Object3D) => object.getWorldPosition(new THREE.Vector3());
describe('rabbit stage magic', () => {
  it('reproduces an event and varies the route, anticipation, greeting, response and final bow', () => {
    const plans = Array.from({ length: 40 }, (_, i) => hatPlan('hat-' + i));
    for (const [i, plan] of plans.entries()) {
      expect(plan).toEqual(hatPlan('hat-' + i));
      const start = { x: 30, y: 330 };
      const end = hatLandingPoint(plan, b);
      expect(hatApproach(plan, start, end, { x: 390, y: 844 }, 0)).toEqual(start);
      expect(hatApproach(plan, start, end, { x: 390, y: 844 }, 1)).toEqual(end);
      for (let t = 0; t <= 1; t += 0.05) {
        const p = hatApproach(plan, start, end, { x: 390, y: 844 }, t);
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(390);
        expect(p.y).toBeGreaterThan(0);
      }
      const hat = makeTopHat();
      hatTravel(hat, plan, 1);
      expect(hat.rotation.z).toBeCloseTo(0);
      expect(hat.scale.x).toBe(HAT_SCALE);
      disposeObject(hat);
    }
    for (const key of [
      'pace',
      'detour',
      'wiggle',
      'peekPause',
      'strength',
      'bow',
      'vanish',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBeGreaterThan(30);
    expect(new Set(plans.map((p) => p.wave)).size).toBe(2);
    expect(new Set(plans.map((p) => p.flop)).size).toBe(2);
    const end = hatLandingPoint(plans[0] ?? hatPlan('hat-0'), b);
    expect(
      new Set(
        plans.map((plan) =>
          Math.sign(hatApproach(plan, { x: 30, y: 330 }, end, { x: 390, y: 844 }, 0.98).x - end.x),
        ),
      ).size,
    ).toBe(2);
  });
  it('keeps the closed base on the live card top through its weight shifts and farewell bow', () => {
    for (let i = 0; i < 24; i++) {
      const run = setup('hat-' + i);
      for (const bounds of [b, { left: 45, top: 340, width: 84, height: 122 }]) {
        for (const ms of [0, 140, 350, 900, 1200, 1350, 1800, 2500, 3100, 3350, 3540, 3690]) {
          const end = run.update(ms, bounds);
          const pose = hatCardPose(ms, run.trick.plan);
          const bottom = run.hat.localToWorld(new THREE.Vector3(0, -HAT_DEPTH, 0));
          expect(bottom.x).toBeCloseTo(end.x, 6);
          expect(-bottom.y).toBeCloseTo(
            bounds.top + pose.y + (bounds.height * (1 - pose.sy)) / 2,
            6,
          );
        }
      }
      run.dispose();
    }
  });
  it('reveals ears before the face, clips below the rim, and braces both paws on that rim', () => {
    const run = setup('hat-0');
    const rabbit = requireSceneObject(run.trick.object, 'rabbit');
    run.update(400);
    expect(rabbit.visible).toBe(false);
    run.update(950);
    expect(rabbit.visible).toBe(true);
    const peek = hatRabbitRise(950, run.trick.plan);
    expect(peek + 23 + 12).toBeCloseTo(0);
    expect(peek + 23 + 9 + 24).toBeGreaterThan(15);
    const ms = 950 + run.trick.plan.peekPause + 300;
    const end = run.update(ms);
    expect(rabbit.position.y).toBeCloseTo(0);
    for (const side of [-1, 1]) {
      const paw = requireSceneObject(rabbit, 'rabbit-arm-' + side).getObjectByName('rabbit-paw');
      if (!paw) throw new Error('Missing paw');
      expect(position(paw).y).toBeCloseTo(position(run.hat).y, 6);
      expect(Math.abs(position(paw).x - end.x)).toBeCloseTo(12 * HAT_SCALE);
    }
    rabbit.traverse((part) => {
      if (part instanceof THREE.Mesh) {
        const material = Array.isArray(part.material) ? part.material[0] : part.material;
        const plane = material?.clippingPlanes?.[0];
        if (!plane) throw new Error('Missing emergence clipping plane');
        expect(
          plane.distanceToPoint(new THREE.Vector3(end.x, position(run.hat).y - 5, 170)),
        ).toBeLessThan(0);
        expect(
          plane.distanceToPoint(new THREE.Vector3(end.x, position(run.hat).y + 5, 170)),
        ).toBeGreaterThan(0);
      }
    });
    run.dispose();
  });
  it('keeps both two-bone arms connected and fixed-length through every seeded reveal and gesture', () => {
    for (let i = 0; i < 24; i++) {
      const run = setup('hat-' + i);
      const rabbit = requireSceneObject(run.trick.object, 'rabbit');
      for (let ms = 550; ms < 2950; ms += 37) {
        run.update(ms);
        for (const side of [-1, 1]) {
          const arm = requireSceneObject(rabbit, 'rabbit-arm-' + side);
          const upper = requireSceneObject(arm, 'upper-arm');
          const lower = requireSceneObject(arm, 'forearm');
          const elbow = requireSceneObject(arm, 'elbow');
          const paw = requireSceneObject(arm, 'rabbit-paw');
          for (const bone of [upper, lower]) {
            const a = bone.localToWorld(new THREE.Vector3(0, -0.5, 0));
            const z = bone.localToWorld(new THREE.Vector3(0, 0.5, 0));
            expect(a.distanceTo(z)).toBeCloseTo(10 * HAT_SCALE, 6);
          }
          expect(
            upper.localToWorld(new THREE.Vector3(0, 0.5, 0)).distanceTo(position(elbow)),
          ).toBeLessThan(1e-6);
          expect(
            lower.localToWorld(new THREE.Vector3(0, -0.5, 0)).distanceTo(position(elbow)),
          ).toBeLessThan(1e-6);
          expect(
            lower.localToWorld(new THREE.Vector3(0, 0.5, 0)).distanceTo(position(paw)),
          ).toBeLessThan(1e-6);
        }
        rabbit.traverse((part) =>
          expect(part.matrixWorld.elements.every(Number.isFinite)).toBe(true),
        );
      }
      run.dispose();
    }
  });
  it('hides the rabbit before bowing, vanishes at full size into a bounded puff, then restores and disposes', () => {
    const run = setup('hat-3');
    const rabbit = requireSceneObject(run.trick.object, 'rabbit');
    run.update(3100);
    expect(rabbit.visible).toBe(false);
    run.update(3350);
    expect(Math.abs(run.hat.rotation.z)).toBeGreaterThan(0.2);
    run.update(run.trick.plan.vanish + 150);
    expect(run.hat.visible).toBe(false);
    expect(run.hat.scale.x).toBe(HAT_SCALE);
    expect(run.trick.object.children.filter((p) => p.visible).length).toBeGreaterThan(20);
    const first = run.trick.object.children.find((p) => p instanceof THREE.Mesh);
    if (!(first instanceof THREE.Mesh)) throw new Error('Missing magic geometry');
    const spy = vi.spyOn(first.geometry, 'dispose');
    run.update(HAT_DURATION);
    expect(run.trick.object.children.every((p) => !p.visible)).toBe(true);
    expect(hatCardPose(HAT_DURATION, run.trick.plan)).toEqual({ y: 0, sy: 1 });
    expect(run.trick.duration).toBe(HAT_DURATION * run.trick.plan.pace);
    run.dispose();
    expect(spy).toHaveBeenCalledOnce();
    const hat = makeTopHat();
    const effect = new LandingEffect('🎩', hat, 'hat-3');
    expect(landingKind('🎩')).toBe('🎩');
    expect(effect.planOf(hatCharacter)).toEqual(hatPlan('hat-3'));
    effect.update(effect.duration, b, hatLandingPoint(hatPlan('hat-3'), b));
    expect(effect.object.visible).toBe(false);
    expect(hat.visible).toBe(false);
    expect(hat.scale.x).toBe(HAT_SCALE);
    disposeObject(hat);
    disposeObject(effect.object);
  });
});
