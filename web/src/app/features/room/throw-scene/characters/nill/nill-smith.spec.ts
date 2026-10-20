import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { makeNillSmith, nillWalk, NillTrick } from './nill-smith';
import {
  nillPlan,
  nillLandingPoint,
  nillApproach,
  nillContact,
  nillCardPoint,
  nillCardPose,
  nillHandPoint,
  nillExitProgress,
  NILL_DURATION,
  NILL_SCALE,
} from './nill-choreography';
import { LandingEffect } from '../../landing/landing-effects';
import { requireSceneObject } from '../../engine/scene-object';
import { disposeObject } from '../../engine/throw-models';
import { approachPace } from '../../testing/approach-pace.testing';
import { nillCharacter } from './nill-character';
const bounds = { left: 340, top: 220, width: 84, height: 122 };
const view = { x: 900, y: 700 };
function world(part: THREE.Object3D) {
  return part.getWorldPosition(new THREE.Vector3());
}
function named(root: THREE.Object3D, name: string) {
  const parts: THREE.Object3D[] = [];
  root.traverse((part) => {
    if (part.name === name) parts.push(part);
  });
  return parts;
}
function near(a: THREE.Vector3, b: THREE.Vector3) {
  expect(a.distanceTo(b)).toBeLessThan(0.00001);
}
function bones(man: THREE.Group, context = '') {
  man.updateMatrixWorld(true);
  for (const side of ['left', 'right'])
    for (const arm of [true, false]) {
      const root = requireSceneObject(man, side + (arm ? '-arm' : '-leg'));
      const first = requireSceneObject(root, arm ? 'upper-arm' : 'thigh');
      const second = requireSceneObject(root, arm ? 'forearm' : 'shin');
      const joint = requireSceneObject(root, arm ? 'elbow' : 'knee');
      const tip = requireSceneObject(root, arm ? 'open-hand' : 'dress-shoe');
      const a = first.localToWorld(new THREE.Vector3(0, -0.5, 0));
      const b = first.localToWorld(new THREE.Vector3(0, 0.5, 0));
      const c = second.localToWorld(new THREE.Vector3(0, -0.5, 0));
      const d = second.localToWorld(new THREE.Vector3(0, 0.5, 0));
      near(a, world(root));
      near(b, world(joint));
      near(c, world(joint));
      near(d, world(tip));
      expect(a.distanceTo(b), context + ' ' + side + (arm ? ' upper arm' : ' thigh')).toBeCloseTo(
        (arm ? 18 : 17) * NILL_SCALE,
        5,
      );
      expect(c.distanceTo(d), side + (arm ? ' forearm' : ' shin')).toBeCloseTo(
        (arm ? 18 : 17) * NILL_SCALE,
        5,
      );
    }
}
describe('Nill Smith confrontation', () => {
  it('retains compatible plans with variation in every stage and room at either edge', () => {
    const plans = Array.from({ length: 40 }, (_, i) => nillPlan('nill-' + i));
    expect(plans[0]).toEqual(nillPlan('nill-0'));
    expect(new Set(plans.map((p) => p.tie))).toEqual(new Set([false, true]));
    expect(
      new Set(
        plans.map((p) =>
          Math.sign(
            bounds.left + bounds.width / 2 - nillLandingPoint(p, bounds, view, { x: 0, y: 300 }).x,
          ),
        ),
      ),
    ).toEqual(new Set([-1, 1]));
    for (const field of [
      'pace',
      'slap',
      'backhand',
      'force',
      'detour',
      'pause',
      'step',
      'departure',
      'glance',
      'exit',
    ] as const)
      expect(new Set(plans.map((p) => p[field])).size).toBe(40);
    for (const p of plans) {
      expect(p.slap + 400).toBeLessThan(p.backhand - 140);
      expect(p.backhand + 1280).toBeLessThan(p.departure);
      expect(p.departure + 220 + 1500 * p.exit).toBeLessThan(NILL_DURATION);
      const left = { ...bounds, left: 4 };
      const right = { ...bounds, left: view.x - bounds.width - 4 };
      expect(nillLandingPoint(p, left, view, { x: 0, y: 300 }).x).toBeGreaterThan(
        left.left + left.width,
      );
      expect(nillLandingPoint(p, right, view, { x: view.x, y: 300 }).x).toBeLessThan(right.left);
    }
  });
  it('walks continuously from the source, slows without stopping dead and keeps stride-free limbs still', () => {
    const start = { x: 120, y: 400 };
    const man = makeNillSmith();
    for (let seed = 0; seed < 12; seed++) {
      const p = nillPlan('nill-' + seed);
      const end = nillLandingPoint(p, bounds, view, start);
      expect(nillApproach(p, start, end, view, 0)).toEqual(start);
      expect(nillApproach(p, start, end, view, 1).x).toBeCloseTo(end.x, 8);
      expect(nillApproach(p, start, end, view, 1).y).toBeCloseTo(end.y, 8);
      for (const from of [start, { x: view.x - 60, y: 120 }]) {
        const to = nillLandingPoint(p, bounds, view, from);
        const pace = approachPace((t) => nillApproach(p, from, to, view, t));
        expect(pace.slowest).toBeGreaterThan(0.3);
        expect(pace.pace(0.72 + p.pause / 2)).toBeLessThan(1);
      }
      let previous = start;
      for (let i = 1; i <= 500; i++) {
        const point = nillApproach(p, start, end, view, i / 500);
        expect(Math.hypot(point.x - previous.x, point.y - previous.y)).toBeLessThan(3);
        expect(point.y).toBeGreaterThanOrEqual(42);
        expect(point.y).toBeLessThanOrEqual(view.y - 42);
        previous = point;
      }
      nillWalk(man, 10, 1, 0, p.step);
      man.updateMatrixWorld(true);
      const feet = named(man, 'dress-shoe').map(world);
      const hands = named(man, 'open-hand').map(world);
      nillWalk(man, 700, 1, 0, p.step);
      man.updateMatrixWorld(true);
      named(man, 'dress-shoe').forEach((part, i) => {
        const point = feet[i];
        if (point) near(world(part), point);
      });
      named(man, 'open-hand').forEach((part, i) => {
        const point = hands[i];
        if (point) near(world(part), point);
      });
      bones(man);
    }
    disposeObject(man);
  });
  it('puts the actual palm on both card hits, returns the backhand from the opposite direction and synchronizes recoil', () => {
    for (let seed = 0; seed < 12; seed++) {
      const man = makeNillSmith();
      const trick = new NillTrick('nill-' + seed);
      const p = trick.plan;
      for (const size of [
        { width: 84, height: 122 },
        { width: 58, height: 84 },
      ])
        for (const facing of [-1, 1]) {
          const b = { ...bounds, ...size };
          const end = nillLandingPoint(p, b, view, { x: 0, y: 300 }, facing);
          const arm = requireSceneObject(man, facing > 0 ? 'right-arm' : 'left-arm');
          for (const [contact, back] of [
            [p.slap, false],
            [p.backhand, true],
          ] as const) {
            const before = nillHandPoint(contact - 80, p, b, end, facing);
            const almost = nillHandPoint(contact - 10, p, b, end, facing);
            expect((almost.x - before.x) * facing * (back ? -1 : 1)).toBeGreaterThan(1);
            trick.update(contact * p.pace, man, b, end, view);
            const hit = nillContact(p, b, facing, back);
            const palm = world(requireSceneObject(arm, 'palm-contact'));
            expect(palm.x).toBeCloseTo(hit.x, 5);
            expect(-palm.y).toBeCloseTo(hit.y, 5);
            expect(requireSceneObject(arm, 'open-hand').rotation.y).toBeCloseTo(
              back ? Math.PI : 0,
              5,
            );
            expect(nillCardPose(contact - 1, p, facing).angle).toBe(0);
            expect(
              nillCardPose(contact + 90, p, facing).angle * facing * (back ? -1 : 1),
            ).toBeGreaterThan(1);
            bones(man);
          }
        }
      disposeObject(man);
      disposeObject(trick.object);
    }
  });
  it('keeps joined fixed-length limbs and planted shoes through every hit and suit adjustment', () => {
    for (let seed = 0; seed < 16; seed++) {
      const man = makeNillSmith();
      const trick = new NillTrick('nill-' + seed);
      const p = trick.plan;
      for (const size of [
        { width: 84, height: 122 },
        { width: 58, height: 84 },
      ])
        for (const facing of [-1, 1]) {
          const b = { ...bounds, ...size };
          const end = nillLandingPoint(p, b, view, { x: 0, y: 300 }, facing);
          trick.update(0, man, b, end, view);
          const feet = named(man, 'dress-shoe').map(world);
          for (let ms = 0; ms < p.departure; ms += 25) {
            trick.update(ms * p.pace, man, b, end, view);
            bones(man, seed + '/' + facing + '/' + size.width + '/' + ms);
            named(man, 'dress-shoe').forEach((part, i) => {
              const point = feet[i];
              if (point) near(world(part), point);
            });
            let finite = true;
            man.traverse((part) => {
              finite &&= part.matrixWorld.elements.every(Number.isFinite);
            });
            expect(finite).toBe(true);
          }
          trick.update((p.backhand + 880) * p.pace, man, b, end, view);
          const other = world(
            requireSceneObject(
              requireSceneObject(man, facing > 0 ? 'left-arm' : 'right-arm'),
              'palm-contact',
            ),
          );
          const to = p.tie
            ? requireSceneObject(man, 'nill-body').localToWorld(new THREE.Vector3(0, 14, 12))
            : world(
                requireSceneObject(
                  requireSceneObject(man, facing > 0 ? 'right-arm' : 'left-arm'),
                  'palm-contact',
                ),
              );
          near(other, to);
          bones(man);
        }
      disposeObject(man);
      disposeObject(trick.object);
    }
  }, 20000);
  it('retains the edge through reflow, follows live handprints and keeps dialogue inside the viewport', () => {
    const man = makeNillSmith();
    const effect = new LandingEffect('✋', man, 'nill-1');
    const p = effect.planOf(nillCharacter);
    if (!p) throw new Error('Missing Nill plan');
    const source = { x: 0, y: 400 };
    const mobile = { left: 4, top: 380, width: 58, height: 84 };
    const chosenEnd = nillLandingPoint(p, mobile, { x: 390, y: 844 }, source);
    const facing = chosenEnd.x < mobile.left ? 1 : -1;
    for (const [b, viewport] of [
      [mobile, { x: 390, y: 844 }],
      [bounds, view],
    ] as const) {
      const end = nillLandingPoint(p, b, viewport, source, facing);
      expect(end.x < b.left ? 1 : -1).toBe(facing);
      effect.update(p.slap * p.pace, b, end, viewport);
      const palm = world(
        requireSceneObject(
          requireSceneObject(man, facing > 0 ? 'right-arm' : 'left-arm'),
          'palm-contact',
        ),
      );
      const hit = nillContact(p, b, facing, false);
      expect(palm.x).toBeCloseTo(hit.x, 5);
      expect(-palm.y).toBeCloseTo(hit.y, 5);
      effect.update((p.slap + 130) * p.pace, b, end, viewport);
      effect.object.updateMatrixWorld(true);
      const mark = named(effect.object, 'nill-handprint')[0];
      if (!mark) throw new Error('Missing handprint');
      const point = nillCardPoint(p.slap + 130, hit, b, p, facing);
      expect(world(mark).x).toBeCloseTo(point.x, 5);
      expect(-world(mark).y).toBeCloseTo(point.y, 5);
      effect.update((p.backhand + 880) * p.pace, b, end, viewport);
      effect.object.updateMatrixWorld(true);
      const bubble = requireSceneObject(effect.object, 'thought-bubble');
      expect(bubble.visible).toBe(true);
      expect(world(bubble).x - bubble.scale.x / 2).toBeGreaterThanOrEqual(8);
      expect(world(bubble).x + bubble.scale.x / 2).toBeLessThanOrEqual(viewport.x - 8);
      expect(bubble.scale.x).toBeGreaterThan(0);
      expect(bubble.rotation.y).toBe(0);
    }
    expect(effect.planOf(nillCharacter)).toBe(p);
    expect(effect.cardAnimation(1)?.frames.every((frame) => frame['transform'] === undefined)).toBe(
      true,
    );
    disposeObject(man);
    disposeObject(effect.object);
  });
  it('turns and walks away at full size, pauses for a glance and leaves before hiding', () => {
    for (let seed = 0; seed < 12; seed++) {
      const man = makeNillSmith();
      const trick = new NillTrick('nill-' + seed);
      const p = trick.plan;
      for (const facing of [-1, 1]) {
        const end = nillLandingPoint(p, bounds, view, { x: 0, y: 300 }, facing);
        const pauseMs = p.departure + 220 + 1500 * p.exit * (0.32 + p.glance / 2);
        trick.update(pauseMs * p.pace, man, bounds, end, view);
        const feet = named(man, 'dress-shoe').map(world);
        const position = man.position.clone();
        trick.update((pauseMs + 10) * p.pace, man, bounds, end, view);
        near(man.position, position);
        named(man, 'dress-shoe').forEach((part, i) => {
          const point = feet[i];
          if (point) near(world(part), point);
        });
        let previous: THREE.Quaternion | undefined;
        for (let i = 0; i <= 200; i++) {
          const ms = p.departure + ((220 + 1500 * p.exit) * i) / 200;
          trick.update(ms * p.pace, man, bounds, end, view);
          bones(man);
          expect(man.scale.toArray()).toEqual([NILL_SCALE, NILL_SCALE, NILL_SCALE]);
          if (previous) expect(previous.angleTo(man.quaternion)).toBeLessThan(0.15);
          previous = man.quaternion.clone();
          if (i === 199) expect(man.visible).toBe(true);
        }
        expect(man.visible).toBe(false);
        expect(facing > 0 ? man.position.x : view.x - man.position.x).toBeLessThan(-100);
        expect(nillExitProgress(NILL_DURATION, p)).toBe(1);
      }
      disposeObject(man);
      disposeObject(trick.object);
    }
  });
  it('bounds and disposes native resources and restores the card', () => {
    const man = makeNillSmith();
    const effect = new LandingEffect('✋', man, 'nill-0');
    const p = effect.planOf(nillCharacter);
    if (!p) throw new Error('Missing Nill plan');
    const end = nillLandingPoint(p, bounds, view, { x: 0, y: 300 });
    const geometry = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    const collect = (part: THREE.Object3D) => {
      if (part instanceof THREE.Mesh) {
        geometry.add(part.geometry);
        materials.add(part.material);
      }
      if (part instanceof THREE.Sprite) {
        materials.add(part.material);
        if (part.material.map) textures.add(part.material.map);
      }
    };
    man.traverse(collect);
    effect.object.traverse(collect);
    const count = geometry.size;
    for (let ms = 0; ms <= NILL_DURATION; ms += 37) effect.update(ms * p.pace, bounds, end, view);
    man.traverse(collect);
    effect.object.traverse(collect);
    expect(geometry.size).toBe(count);
    effect.update(effect.duration, bounds, end, view);
    expect(man.visible).toBe(false);
    expect(effect.object.visible).toBe(false);
    expect(effect.cardAnimation(1)?.frames.at(-1)).toMatchObject({
      translate: '0px 0px',
      rotate: '0deg',
      scale: '1 1',
    });
    let disposed = 0;
    for (const resource of [...geometry, ...materials, ...textures])
      resource.addEventListener('dispose', () => disposed++);
    disposeObject(man);
    disposeObject(effect.object);
    expect(disposed).toBe(geometry.size + materials.size + textures.size);
  });
});
