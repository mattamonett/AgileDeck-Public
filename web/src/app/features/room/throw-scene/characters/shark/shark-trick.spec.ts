import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { makeShark, SharkTrick, sharkRoute, sharkPoint } from './shark-trick';
import { sharkTravel } from './shark-model';
import {
  sharkPlan,
  sharkLandingPoint,
  sharkApproach,
  sharkTangent,
  sharkActorPose,
  sharkTipWorld,
  sharkCardPoint,
  sharkCardPose,
  sharkBitePoint,
  SHARK_DURATION,
  SHARK_SCALE,
} from './shark-choreography';
import { LandingEffect, landingKind } from '../../landing/landing-effects';
import { requireSceneObject } from '../../engine/scene-object';
import { disposeObject } from '../../engine/throw-models';
import { approachPace } from '../../testing/approach-pace.testing';
import { sharkCharacter } from './shark-character';
const bounds = { left: 340, top: 220, width: 84, height: 122 };
const view = { x: 900, y: 700 };
function named(root: THREE.Object3D, name: string) {
  const result: THREE.Object3D[] = [];
  root.traverse((p) => {
    if (p.name === name) result.push(p);
  });
  return result;
}
function world(part: THREE.Object3D) {
  return part.getWorldPosition(new THREE.Vector3());
}
function near(a: { x: number; y: number }, b: { x: number; y: number }) {
  expect(a.x).toBeCloseTo(b.x, 5);
  expect(a.y).toBeCloseTo(b.y, 5);
}
describe('predatory shark', () => {
  it('retains varied compatible event plans, two or three bites, both sides and edge room', () => {
    const plans = Array.from({ length: 40 }, (_, i) => sharkPlan('shark-' + i));
    expect(plans[0]).toEqual(sharkPlan('shark-0'));
    expect(new Set(plans.map((p) => p.bites.length))).toEqual(new Set([2, 3]));
    for (const field of ['pace', 'force', 'bend', 'hover', 'tail', 'departure', 'exit'] as const)
      expect(new Set(plans.map((p) => p[field])).size).toBe(40);
    expect(plans.some((p) => p.spot.x < 0.5)).toBe(true);
    expect(plans.some((p) => p.spot.x > 0.5)).toBe(true);
    for (const p of plans) {
      expect((p.bites.at(-1) ?? 0) + 420).toBeLessThan(p.departure);
      expect(p.departure + 1500 * p.exit).toBeLessThan(SHARK_DURATION);
      const left = { ...bounds, left: 4 };
      const right = { ...bounds, left: view.x - bounds.width - 4 };
      expect(sharkLandingPoint(p, left, view).x).toBeGreaterThan(left.left + left.width);
      expect(sharkLandingPoint(p, right, view).x).toBeLessThan(right.left);
    }
  });
  it('circles slowly through its hunting beat without ever stopping dead on the approach', () => {
    for (let seed = 0; seed < 30; seed++)
      for (const [b, from, viewport] of [
        [bounds, { x: 120, y: 400 }, view],
        [bounds, { x: 820, y: 600 }, view],
        [
          { left: 160, top: 200, width: 58, height: 84 },
          { x: 189, y: 640 },
          { x: 390, y: 844 },
        ],
        [
          { left: 160, top: 560, width: 58, height: 84 },
          { x: 189, y: 240 },
          { x: 390, y: 844 },
        ],
      ] as const) {
        const p = sharkPlan('shark-' + seed),
          end = sharkLandingPoint(p, b, viewport),
          facing = end.x < b.left ? 1 : -1;
        const pace = approachPace((t) => sharkApproach(p, from, end, viewport, facing, t));
        expect(pace.slowest).toBeGreaterThan(0.3);
        expect(pace.pace(0.65 + p.hover / 2)).toBeLessThan(1);
      }
  });
  it('keeps default motion callers repeatable and follows a curved event route with continuous turning', () => {
    expect(sharkRoute('a')).toEqual(sharkRoute('a'));
    expect(sharkRoute('a')).not.toEqual(sharkRoute('b'));
    const start = { x: 120, y: 400 };
    const finish = { x: 300, y: 260 };
    expect(sharkPoint(start, finish, sharkRoute('a'), 0)).toEqual(start);
    expect(sharkPoint(start, finish, sharkRoute('a'), 1)).toEqual(finish);
    for (let seed = 0; seed < 12; seed++) {
      const p = sharkPlan('shark-' + seed);
      const end = sharkLandingPoint(p, bounds, view);
      const facing = end.x < bounds.left ? 1 : -1;
      const shark = makeShark();
      expect(sharkApproach(p, start, end, view, facing, 0)).toEqual(start);
      expect(sharkApproach(p, start, end, view, facing, 1)).toEqual(end);
      let previous: THREE.Quaternion | undefined;
      for (let i = 0; i <= 500; i++) {
        const t = i / 500;
        const point = sharkApproach(p, start, end, view, facing, t);
        expect(point.x).toBeGreaterThanOrEqual(45);
        expect(point.x).toBeLessThanOrEqual(view.x - 45);
        expect(point.y).toBeGreaterThanOrEqual(50);
        expect(point.y).toBeLessThanOrEqual(view.y - 45);
        sharkTravel(shark, p, t * 2100, t, sharkTangent(p, start, end, view, facing, t), facing);
        if (previous) expect(previous.angleTo(shark.quaternion)).toBeLessThan(0.2);
        previous = shark.quaternion.clone();
      }
      expect(shark.rotation.y).toBeCloseTo(facing > 0 ? 0 : Math.PI);
      expect(shark.rotation.z).toBeCloseTo(0);
      expect(shark.scale.y).toBe(SHARK_SCALE);
      disposeObject(shark);
    }
  });
  it('closes the actual hinged leading teeth on every reacting card contact on both sides and sizes', () => {
    for (let seed = 0; seed < 12; seed++) {
      const shark = makeShark();
      const trick = new SharkTrick('shark-' + seed);
      for (const size of [
        { width: 84, height: 122 },
        { width: 58, height: 84 },
      ])
        for (const facing of [-1, 1]) {
          const b = { ...bounds, ...size };
          const end = {
            x: facing > 0 ? b.left - 42 : b.left + b.width + 42,
            y: b.top + b.height * 0.5,
          };
          for (const [i, bite] of trick.plan.bites.entries()) {
            trick.update((bite - 140) * trick.plan.pace, shark, b, end, view);
            expect(requireSceneObject(shark, 'jaw').rotation.z).toBeLessThan(-0.3);
            trick.update(bite * trick.plan.pace, shark, b, end, view);
            expect(requireSceneObject(shark, 'jaw').rotation.z).toBeCloseTo(0);
            const tip = world(requireSceneObject(shark, 'shark-bite-tip'));
            near(
              { x: tip.x, y: -tip.y },
              sharkCardPoint(bite, sharkBitePoint(trick.plan, b, facing, i), b, trick.plan, facing),
            );
            const predicted = sharkTipWorld(sharkActorPose(bite, trick.plan, b, end, view, facing));
            near(predicted, { x: tip.x, y: -tip.y });
            expect(predicted.z).toBeCloseTo(tip.z, 5);
            expect(sharkCardPose(bite - 1, trick.plan, facing).angle).toBe(0);
            expect(Math.abs(sharkCardPose(bite + 100, trick.plan, facing).angle)).toBeGreaterThan(
              0,
            );
            const tooth = named(shark, 'lower-tooth').at(5);
            if (!tooth) throw new Error('Missing leading lower tooth');
            const toothTip = tooth.localToWorld(new THREE.Vector3(0, 2.5, 0));
            near({ x: toothTip.x, y: -toothTip.y }, { x: tip.x, y: -tip.y });
          }
        }
      disposeObject(shark);
      disposeObject(trick.object);
    }
  });
  it('stretches a continuous flesh strand from the wound into the real mouth, tears it free and carries the meal', () => {
    const shark = makeShark();
    const effect = new LandingEffect('🦈', shark, 'shark-0');
    const plan = effect.planOf(sharkCharacter);
    if (!plan) throw new Error('Missing shared shark plan');
    const end = sharkLandingPoint(plan, bounds, view);
    for (const [index, bite] of plan.bites.entries()) {
      effect.update((bite + 300) * plan.pace, bounds, end, view);
      effect.object.updateMatrixWorld(true);
      const segments = named(effect.object, 'shark-flesh-strand').slice(
        index * 12,
        index * 12 + 12,
      );
      const first = segments[0];
      const last = segments.at(-1);
      const wound = named(effect.object, 'shark-bite-wound')[index];
      if (!first || !last || !wound) throw new Error('Missing flesh strand');
      expect(segments.every((p) => p.visible)).toBe(true);
      const a = first.localToWorld(new THREE.Vector3(0, -0.5, 0));
      const z = last.localToWorld(new THREE.Vector3(0, 0.5, 0));
      const origin = world(wound);
      const grip = world(requireSceneObject(shark, 'shark-bite-tip'));
      expect(Math.hypot(a.x - origin.x, a.y - origin.y)).toBeLessThan(0.11);
      expect(Math.hypot(z.x - grip.x, z.y - grip.y)).toBeLessThan(0.11);
      const meal = requireSceneObject(effect.object, 'shark-held-flesh');
      near({ x: world(meal).x, y: -world(meal).y }, { x: grip.x, y: -grip.y });
      effect.update((bite + 351) * plan.pace, bounds, end, view);
      expect(segments.every((p) => !p.visible)).toBe(true);
      expect(named(effect.object, 'shark-hanging-entrail')[index]?.visible).toBe(true);
    }
    disposeObject(shark);
    disposeObject(effect.object);
  });
  it('follows resized card wounds and tooth contact without changing event choices or reveal transforms', () => {
    const shark = makeShark();
    const effect = new LandingEffect('🦈', shark, 'shark-1');
    const p = effect.planOf(sharkCharacter);
    if (!p) throw new Error('Missing event plan');
    const bite = p.bites[0];
    if (bite === undefined) throw new Error('Missing bite');
    const mobile = { left: 4, top: 380, width: 58, height: 84 };
    const chosenEnd = sharkLandingPoint(p, mobile, { x: 390, y: 844 });
    const chosenFacing = chosenEnd.x < mobile.left ? 1 : -1;
    for (const b of [mobile, bounds]) {
      const end = sharkLandingPoint(p, b, view, chosenFacing);
      const facing = end.x < b.left ? 1 : -1;
      expect(facing).toBe(chosenFacing);
      effect.update(bite * p.pace, b, end, view);
      const tip = world(requireSceneObject(shark, 'shark-bite-tip'));
      near({ x: tip.x, y: -tip.y }, sharkBitePoint(p, b, facing, 0));
      effect.update((bite + 130) * p.pace, b, end, view);
      effect.object.updateMatrixWorld(true);
      const wound = named(effect.object, 'shark-bite-wound')[0];
      if (!wound) throw new Error('Missing wound');
      near(
        { x: world(wound).x, y: -world(wound).y },
        sharkCardPoint(bite + 130, sharkBitePoint(p, b, facing, 0), b, p, facing),
      );
    }
    expect(effect.planOf(sharkCharacter)).toBe(p);
    expect(effect.cardAnimation(1)?.frames.every((f) => f['transform'] === undefined)).toBe(true);
    disposeObject(shark);
    disposeObject(effect.object);
  });
  it('banks continuously at full size, carries its scraps and leaves the viewport before hiding', () => {
    for (let seed = 0; seed < 12; seed++) {
      const shark = makeShark();
      const trick = new SharkTrick('shark-' + seed);
      const end = sharkLandingPoint(trick.plan, bounds, view);
      const facing = end.x < bounds.left ? 1 : -1;
      let previous: THREE.Quaternion | undefined;
      for (let step = 0; step <= 200; step++) {
        const ms = trick.plan.departure + (1500 * trick.plan.exit * step) / 200;
        trick.update(ms * trick.plan.pace, shark, bounds, end, view);
        expect(shark.scale.toArray()).toEqual([SHARK_SCALE, SHARK_SCALE, SHARK_SCALE]);
        if (previous) expect(previous.angleTo(shark.quaternion)).toBeLessThan(0.15);
        previous = shark.quaternion.clone();
        shark.traverse((p) => expect(p.matrixWorld.elements.every(Number.isFinite)).toBe(true));
        if (step === 199) expect(shark.visible).toBe(true);
      }
      expect(shark.visible).toBe(false);
      expect(facing > 0 ? shark.position.x : view.x - shark.position.x).toBeLessThan(-105);
      disposeObject(shark);
      disposeObject(trick.object);
    }
  });
  it('bounds and disposes native effects and restores the card after all variants', () => {
    expect(landingKind('🦈')).toBe('🦈');
    const shark = makeShark();
    const effect = new LandingEffect('🦈', shark, 'shark-0');
    const p = effect.planOf(sharkCharacter);
    if (!p) throw new Error('Missing event plan');
    const end = sharkLandingPoint(p, bounds, view);
    const geometry = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const collect = (part: THREE.Object3D) => {
      if (part instanceof THREE.Mesh) {
        geometry.add(part.geometry);
        materials.add(part.material);
      }
    };
    shark.traverse(collect);
    effect.object.traverse(collect);
    const count = geometry.size;
    for (let ms = 0; ms <= SHARK_DURATION; ms += 37) effect.update(ms * p.pace, bounds, end, view);
    shark.traverse(collect);
    effect.object.traverse(collect);
    expect(geometry.size).toBe(count);
    effect.update(effect.duration, bounds, end, view);
    expect(effect.object.visible).toBe(false);
    expect(shark.visible).toBe(false);
    expect(effect.cardAnimation(1)?.frames.at(-1)).toMatchObject({
      translate: '0px 0px',
      rotate: '0deg',
      scale: '1 1',
    });
    let disposed = 0;
    for (const resource of [...geometry, ...materials])
      resource.addEventListener('dispose', () => disposed++);
    disposeObject(shark);
    disposeObject(effect.object);
    expect(disposed).toBe(geometry.size + materials.size);
  });
});
