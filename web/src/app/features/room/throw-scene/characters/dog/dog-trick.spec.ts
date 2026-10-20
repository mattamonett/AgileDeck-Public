import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { makePet } from '../pet/pet-trick';
import { dogRun } from './dog-model';
import {
  DOG_DURATION,
  dogPlan,
  dogApproach,
  dogLandingPoint,
  dogSplashPoint,
} from './dog-choreography';
import { LandingEffect } from '../../landing/landing-effects';
import { requireSceneObject } from '../../engine/scene-object';
import { disposeObject } from '../../engine/throw-models';
import { approachPace } from '../../testing/approach-pace.testing';
import { dogCharacter } from './dog-character';

const bounds = { left: 150, top: 200, width: 58, height: 84 };
const viewport = { x: 390, y: 844 };
const world = (object: THREE.Object3D) => object.getWorldPosition(new THREE.Vector3());
describe('puppy marking routine', () => {
  it('varies each stage per event and preserves continuous approaches and edge-safe sides', () => {
    const plans = Array.from({ length: 40 }, (_, i) => dogPlan('puppy-' + i));
    for (const [i, plan] of plans.entries()) {
      expect(plan).toEqual(dogPlan('puppy-' + i));
      for (const b of [bounds, { ...bounds, left: 4 }, { ...bounds, left: 326 }]) {
        const end = dogLandingPoint(plan, b, viewport);
        const start = { x: 170, y: 340 };
        expect(end.x).toBeGreaterThan(42);
        expect(end.x).toBeLessThan(viewport.x - 42);
        expect(dogApproach(plan, start, end, viewport, 0)).toEqual(start);
        expect(dogApproach(plan, start, end, viewport, 1).x).toBeCloseTo(end.x);
        expect(dogApproach(plan, start, end, viewport, 1).y).toBeCloseTo(end.y);
        let previous = start;
        for (let t = 0; t <= 1; t += 0.005) {
          const point = dogApproach(plan, start, end, viewport, t);
          expect(Math.hypot(point.x - previous.x, point.y - previous.y)).toBeLessThan(7);
          previous = point;
        }
      }
    }
    for (const key of ['pace', 'pressure', 'lift', 'wag', 'detour', 'pause', 'exit'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(40);
    expect(new Set(plans.map((p) => p.hop)).size).toBe(2);
    expect(new Set(plans.map((p) => p.sniffs)).size).toBe(2);
    expect(plans.some((p) => p.spot.x < 0.5)).toBe(true);
    expect(plans.some((p) => p.spot.x >= 0.5)).toBe(true);
  });
  it('slows into the sniff beat without ever stopping dead on the approach', () => {
    for (let i = 0; i < 40; i++) {
      const plan = dogPlan('puppy-' + i);
      for (const [b, start] of [
        [bounds, { x: 170, y: 340 }],
        [
          { ...bounds, left: 4 },
          { x: 300, y: 600 },
        ],
        [
          { ...bounds, left: 326 },
          { x: 60, y: 120 },
        ],
      ] as const) {
        const end = dogLandingPoint(plan, b, viewport);
        const pace = approachPace((t) => dogApproach(plan, start, end, viewport, t));
        expect(pace.slowest).toBeGreaterThan(0.3);
        expect(pace.pace(0.44 + plan.pause / 2)).toBeLessThan(1);
      }
    }
  });
  it.each([1, -1])(
    'lifts the correct rear paw while planting three paws, and connects the jet to the body and card (side %s)',
    (facing) => {
      const id = 'puppy-contact-' + facing;
      const plan = dogPlan(id);
      const dog = makePet(true);
      const effect = new LandingEffect('🐶', dog, id);
      const end = {
        x: facing > 0 ? bounds.left - 42 : bounds.left + bounds.width + 42,
        y: bounds.top + bounds.height - 14,
      };
      const update = (ms: number) => {
        effect.update(ms * plan.pace, bounds, end, viewport);
        dog.updateMatrixWorld(true);
        effect.object.updateMatrixWorld(true);
      };
      update(1400);
      const planted = [0, 2, 3].map((i) =>
        world(requireSceneObject(requireSceneObject(dog, 'puppy-leg-' + i), 'paw')),
      );
      const lifted = world(requireSceneObject(requireSceneObject(dog, 'puppy-leg-1'), 'paw'));
      expect(requireSceneObject(effect.object, 'pee-stream').visible).toBe(false);
      update(2200);
      expect(dog.rotation.y).toBe(Math.PI);
      const raised = world(requireSceneObject(requireSceneObject(dog, 'puppy-leg-1'), 'paw'));
      expect(raised.y - lifted.y).toBeGreaterThan(6);
      for (const [index, i] of [0, 2, 3].entries()) {
        const before = planted[index];
        if (!before) throw new Error('Missing planted paw');
        expect(
          world(requireSceneObject(requireSceneObject(dog, 'puppy-leg-' + i), 'paw')).distanceTo(
            before,
          ),
        ).toBeLessThan(1e-7);
      }
      const stream = requireSceneObject(effect.object, 'pee-stream');
      expect(stream.visible).toBe(true);
      const first = stream.children[0];
      const last = stream.children.at(-1);
      if (!first || !last) throw new Error('Missing continuous pee jet');
      const start = first.localToWorld(new THREE.Vector3(0, -0.5, 0));
      const origin = world(requireSceneObject(dog, 'pee-origin'));
      expect(Math.hypot(start.x - origin.x, start.y - origin.y)).toBeCloseTo(0.2);
      const hit = last.localToWorld(new THREE.Vector3(0, 0.5, 0));
      const splash = dogSplashPoint(2200, plan, bounds, facing);
      expect(Math.hypot(hit.x - splash.x, -hit.y - splash.y)).toBeCloseTo(0.2);
      expect(splash.x).toBeGreaterThan(bounds.left);
      expect(splash.x).toBeLessThan(bounds.left + bounds.width);
      expect(splash.y).toBeGreaterThan(bounds.top);
      expect(splash.y).toBeLessThan(bounds.top + bounds.height);
      const paw = world(requireSceneObject(requireSceneObject(dog, 'puppy-leg-1'), 'paw'));
      expect(origin.y).toBeLessThan(dog.position.y);
      expect(Math.abs(origin.x - splash.x)).toBeLessThan(45);
      expect(paw.y).toBeGreaterThan(
        world(requireSceneObject(requireSceneObject(dog, 'puppy-leg-0'), 'paw')).y,
      );
      expect(requireSceneObject(effect.object, 'pee-puddle').visible).toBe(true);
      update(3100);
      expect(stream.visible).toBe(false);
      update(3550);
      expect(Math.abs(requireSceneObject(dog, 'puppy-leg-1').rotation.x)).toBe(0);
      disposeObject(effect.object);
      disposeObject(dog);
    },
  );
  it('keeps all leg bones joined at fixed lengths through both sides, turns, lifted poses and locomotion', () => {
    const dog = makePet(true);
    const effect = new LandingEffect('🐶', dog, 'puppy-bones');
    const plan = dogPlan('puppy-bones');
    for (const facing of [1, -1])
      for (const ms of [0, 650, 1120, 1400, 2200, 3350, 3900, 4250, 4500]) {
        const end = { x: facing > 0 ? 108 : 250, y: 270 };
        effect.update(ms * plan.pace, bounds, end, viewport);
        dog.updateMatrixWorld(true);
        for (let i = 0; i < 4; i++) {
          const leg = requireSceneObject(dog, 'puppy-leg-' + i);
          const upper = requireSceneObject(leg, 'upper-leg');
          const lower = requireSceneObject(leg, 'lower-leg');
          const shoulder = upper.localToWorld(new THREE.Vector3(0, -0.5, 0));
          const knee = upper.localToWorld(new THREE.Vector3(0, 0.5, 0));
          const knee2 = lower.localToWorld(new THREE.Vector3(0, -0.5, 0));
          const heel = lower.localToWorld(new THREE.Vector3(0, 0.5, 0));
          expect(knee.distanceTo(knee2)).toBeLessThan(1e-7);
          expect(shoulder.distanceTo(knee)).toBeCloseTo(9);
          expect(knee.distanceTo(heel)).toBeCloseTo(9);
        }
        dog.traverse((part) => {
          expect(part.matrixWorld.elements.every(Number.isFinite)).toBe(true);
        });
      }
    dogRun(dog, 100, -1, 1500, 0);
    dog.updateMatrixWorld(true);
    const leg = requireSceneObject(dog, 'puppy-leg-0');
    const before = world(requireSceneObject(leg, 'paw'));
    dogRun(dog, 170, -1, 1800, 0);
    dog.updateMatrixWorld(true);
    expect(world(requireSceneObject(leg, 'paw'))).toEqual(before);
    disposeObject(effect.object);
    disposeObject(dog);
  });
  it('preserves the plan across reflow and physically leaves before hiding, with a neutral card at completion', () => {
    for (let i = 0; i < 24; i++) {
      const id = 'puppy-exit-' + i;
      const dog = makePet(true);
      const effect = new LandingEffect('🐶', dog, id);
      const plan = dogPlan(id);
      const end = dogLandingPoint(plan, bounds, viewport);
      effect.update(2200 * plan.pace, bounds, end, viewport);
      const before = dog.position.clone();
      const geometry = requireSceneObject(effect.object, 'pee-stream').children[0];
      const meshes: THREE.Mesh[] = [];
      effect.object.traverse((part) => {
        if (part instanceof THREE.Mesh) meshes.push(part);
      });
      const geometries = meshes.map((p) => p.geometry);
      const moved = {
        ...bounds,
        left: bounds.left + 30,
        top: bounds.top + 18,
        width: 84,
        height: 122,
      };
      const shifted = { x: end.x + 30, y: end.y + 18 };
      effect.update(2200 * plan.pace, moved, shifted, { x: 1200, y: 850 });
      expect(dog.position.x - before.x).toBe(30);
      expect(dog.position.y - before.y).toBe(-18);
      expect(effect.planOf(dogCharacter)).toEqual(plan);
      expect(meshes.map((p) => p.geometry)).toEqual(geometries);
      effect.update(4620 * plan.pace, bounds, end, viewport);
      expect(dog.position.x < -60 || dog.position.x > viewport.x + 60).toBe(true);
      expect(Math.abs(dog.scale.x)).toBe(0.9);
      effect.update(effect.duration, bounds, end, viewport);
      expect(dog.visible).toBe(false);
      expect(effect.object.visible).toBe(false);
      expect(effect.cardAnimation()?.frames.at(-1)).toMatchObject({ translate: '0px 0px' });
      expect(effect.duration).toBe(DOG_DURATION * plan.pace);
      if (!(geometry instanceof THREE.Mesh)) throw new Error('Missing native pee stream');
      const cleanup = vi.spyOn(geometry.geometry, 'dispose');
      disposeObject(effect.object);
      disposeObject(dog);
      expect(cleanup).toHaveBeenCalledOnce();
    }
  });
});
