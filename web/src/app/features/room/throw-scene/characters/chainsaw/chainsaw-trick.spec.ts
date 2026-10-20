import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { VALID_INTERACTION_CHARACTERS } from '@poker/shared';
import { makeChainsawCharacter, chainsawContact, chainsawWalk } from './chainsaw-trick';
import { LandingEffect, landingPoint, landingVariation } from '../../landing/landing-effects';
import { disposeObject } from '../../engine/throw-models';
import { projectileName } from '@features/room/projectile-names';
import {
  chainsawPlan,
  chainsawApproach,
  chainsawLandingPoint,
  sawProgress,
} from './chainsaw-choreography';
import { requireSceneObject } from '../../engine/scene-object';
import { approachPace } from '../../testing/approach-pace.testing';
import { chainsawCharacter } from './chainsaw-character';

const bounds = { left: 150, top: 100, width: 105, height: 154 };

describe('Texas Chainsaw Massacre', () => {
  it('registers the saw emoji and samples either side independently per throw', () => {
    expect(VALID_INTERACTION_CHARACTERS.has('🪚')).toBe(true);
    expect(projectileName('🪚')).toBe('Texas Chainsaw Massacre');
    const sides = new Set(
      Array.from(
        { length: 30 },
        (_, i) => landingPoint('🪚', bounds, landingVariation(`chainsaw-${i}`)).x < bounds.left,
      ),
    );
    expect(sides.size).toBe(2);
  });
  it.each([1, -1])('aligns the sawing cut with the attached blade (side %s)', (facing) => {
    const model = makeChainsawCharacter();
    model.userData['chainsawFacing'] = facing;
    const effect = new LandingEffect('🪚', model);
    const plan = effect.planOf(chainsawCharacter);
    if (!plan) throw new Error('Missing chainsaw plan');
    const update = (ms: number) => effect.update(ms * plan.pace, bounds, end);
    const end = landingPoint('🪚', bounds, { x: facing > 0 ? 0.2 : 0.8, y: 0.5 });
    const meshes: THREE.Mesh[] = [];
    effect.object.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    update(999);
    expect(meshes.every((m) => !m.visible)).toBe(true);
    for (const ms of [1000, 1500, 2100, 2590]) {
      update(ms);
      model.updateMatrixWorld(true);
      const tip = model.getObjectByName('saw-tip')!.getWorldPosition(new THREE.Vector3());
      const expected = chainsawContact(ms, end, facing, plan);
      expect(tip.x).toBeCloseTo(expected.x);
      expect(-tip.y).toBeCloseTo(expected.y);
    }
    expect(meshes.filter((m) => m.visible).length).toBeGreaterThan(30);
    const tooth = model.getObjectByName('chain-tooth')!;
    const before = tooth.position.clone();
    update(2200);
    expect(tooth.position).not.toEqual(before);
    update(2590);
    expect(tooth.position).toEqual(before);
    let bubbles = 0;
    effect.object.traverse((o) => {
      if (o instanceof THREE.Sprite) bubbles++;
    });
    expect(bubbles).toBe(0);
    effect.update(effect.duration, bounds, end);
    expect(effect.object.visible).toBe(false);
    expect(model.visible).toBe(false);
    expect(model.scale.length()).toBeCloseTo(0.9 * Math.sqrt(3));
    const cleanup = vi.spyOn(meshes[0]!.geometry, 'dispose');
    disposeObject(model);
    disposeObject(effect.object);
    expect(cleanup).toHaveBeenCalledOnce();
  });
  it('walks with alternating legs and keeps extreme cuts inside resized cards', () => {
    const model = makeChainsawCharacter();
    chainsawWalk(model, 0.1, 1);
    expect(model.getObjectByName('left-leg')!.rotation.z).toBeCloseTo(
      -model.getObjectByName('right-leg')!.rotation.z,
    );
    const effect = new LandingEffect('🪚', model);
    const plan = effect.planOf(chainsawCharacter);
    if (!plan) throw new Error('Missing chainsaw plan');
    for (const width of [84, 105])
      for (const x of [0, 0.49, 0.5, 1])
        for (const y of [0, 1]) {
          const b = { ...bounds, width, height: width === 84 ? 122 : 154 };
          model.userData['chainsawFacing'] = x < 0.5 ? 1 : -1;
          effect.update(3000 * plan.pace, b, landingPoint('🪚', b, { x, y }));
          effect.object.updateMatrixWorld(true);
          let visible = 0;
          effect.object.traverse((o) => {
            if (!(o instanceof THREE.Mesh) || !o.visible || !o.userData['cardSurface']) return;
            visible++;
            const p = o.getWorldPosition(new THREE.Vector3());
            expect(p.x).toBeGreaterThan(b.left);
            expect(p.x).toBeLessThan(b.left + b.width);
            expect(-p.y).toBeGreaterThan(b.top);
            expect(-p.y).toBeLessThan(b.top + b.height);
          });
          expect(visible).toBeGreaterThan(10);
        }
    disposeObject(model);
    disposeObject(effect.object);
  });
  it('shares varied pressure, stutter, approach and exit pace reproducibly and never stalls on the approach', () => {
    const view = { x: 390, y: 844 };
    const start = { x: 190, y: 200 };
    const plans = Array.from({ length: 40 }, (_, i) => chainsawPlan(`saw-${i}`));
    expect(chainsawPlan('saw-7')).toEqual(plans[7]);
    expect(new Set(plans.map((p) => p.stall)).size).toBe(40);
    expect(new Set(plans.map((p) => p.exit)).size).toBe(40);
    for (const plan of plans)
      for (const left of [5, 325]) {
        const b = { left, top: 620, width: 58, height: 84 };
        const end = chainsawLandingPoint(plan, b, view);
        const facing = end.x < left ? 1 : -1;
        expect(end.x).toBeGreaterThan(40);
        expect(end.x).toBeLessThan(view.x - 40);
        expect(chainsawApproach(plan, start, end, facing, view, 0)).toEqual(start);
        expect(chainsawApproach(plan, start, end, facing, view, 1)).toEqual(end);
        const stop = 1000 + (plan.stall + plan.pause / 2) * 1600;
        expect(sawProgress(stop, plan)).toBe(plan.stall);
        expect(sawProgress(2600, plan)).toBeCloseTo(1);
        for (const from of [start, { x: 190, y: 800 }, { x: 40, y: 640 }]) {
          const pace = approachPace((t) => chainsawApproach(plan, from, end, facing, view, t));
          expect(pace.slowest).toBeGreaterThan(0.3);
        }
        let previous = start;
        for (let t = 0; t <= 1; t += 0.005) {
          const next = chainsawApproach(plan, start, end, facing, view, t);
          expect(Math.hypot(next.x - previous.x, next.y - previous.y)).toBeLessThan(10);
          previous = next;
        }
      }
  });
  it.each([-1, 1])(
    'keeps elbows, wrists and gore finite through cuts, reflow and physical exit (side %s)',
    (facing) => {
      const model = makeChainsawCharacter();
      const effect = new LandingEffect('🪚', model, 'contact');
      const plan = effect.planOf(chainsawCharacter);
      if (!plan) throw new Error('Missing chainsaw plan');
      const view = { x: 390, y: 844 };
      let b = { left: 160, top: 380, width: 84, height: 122 };
      for (const ms of [0, 550, 1000, 1800, 2590, 3400, 4200, 4550]) {
        if (ms === 3400) b = { left: 220, top: 480, width: 58, height: 84 };
        const end = landingPoint('🪚', b, { x: facing > 0 ? 0.2 : 0.8, y: 0.45 });
        effect.update(ms * plan.pace, b, end, view);
        model.updateMatrixWorld(true);
        for (const [prefix, grip] of [
          ['left', 'rear-hand'],
          ['right', 'front-hand'],
        ] as const) {
          const lower = requireSceneObject(model, `${prefix}-forearm`);
          const upper = requireSceneObject(model, `${prefix}-upperarm`);
          const elbow = requireSceneObject(model, `${prefix}-elbow`).position;
          expect(upper.scale.y).toBeCloseTo(31);
          expect(lower.scale.y).toBeCloseTo(31);
          const lowerTop = new THREE.Vector3(0, -0.5, 0).applyMatrix4(lower.matrix);
          const upperEnd = new THREE.Vector3(0, 0.5, 0).applyMatrix4(upper.matrix);
          expect(lowerTop.distanceTo(elbow)).toBeLessThan(0.001);
          expect(upperEnd.distanceTo(elbow)).toBeLessThan(0.001);
          const wrist = new THREE.Vector3(0, 0.5, 0).applyMatrix4(lower.matrixWorld);
          const hand = requireSceneObject(model, grip).getWorldPosition(new THREE.Vector3());
          expect(wrist.distanceTo(hand)).toBeLessThan(0.001);
        }
        effect.object.traverse((part) => {
          expect(
            Number.isFinite(part.position.x) &&
              Number.isFinite(part.position.y) &&
              Number.isFinite(part.scale.x),
          ).toBe(true);
        });
        if (ms === 4550) expect(model.position.x < 0 || model.position.x > view.x).toBe(true);
      }
      const frames = effect.cardAnimation(facing)?.frames;
      expect(frames?.at(-1)?.['translate']).toBe('0px 0px');
      expect(frames?.at(-1)?.['scale']).toBe('1 1');
      effect.update(effect.duration, b, landingPoint('🪚', b, { x: 0.2, y: 0.45 }), view);
      expect(effect.object.visible).toBe(false);
      disposeObject(model);
      disposeObject(effect.object);
    },
  );
  it('exposes hanging viscera for reachable cuts across seeds and card sizes', () => {
    const view = { x: 390, y: 844 };
    for (let seed = 0; seed < 24; seed++)
      for (const width of [58, 84]) {
        const model = makeChainsawCharacter();
        const effect = new LandingEffect('🪚', model, `gory-${seed}`);
        const plan = effect.planOf(chainsawCharacter);
        if (!plan) throw new Error('Missing chainsaw plan');
        const b = { left: 140, top: 400, width, height: (width * 122) / 84 };
        const end = chainsawLandingPoint(plan, b, view);
        effect.update(2600 * plan.pace, b, end, view);
        let visible = 0;
        effect.object.traverse((part) => {
          if (
            part instanceof THREE.Mesh &&
            part.geometry instanceof THREE.TubeGeometry &&
            part.visible
          )
            visible++;
        });
        expect(visible).toBe(4);
        disposeObject(model);
        disposeObject(effect.object);
      }
  });
});
