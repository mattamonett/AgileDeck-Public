import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { makePet } from '../pet/pet-trick';
import { catWalk } from './cat-model';
import {
  CAT_DURATION,
  CAT_SWIPE_START,
  CAT_SWIPE_STEP,
  catPlan,
  catApproach,
  catLandingPoint,
  catCardPose,
  catClawPoint,
  catWoundPoint,
  catExitProgress,
} from './cat-choreography';
import { LandingEffect } from '../../landing/landing-effects';
import { requireSceneObject } from '../../engine/scene-object';
import { disposeObject } from '../../engine/throw-models';
import { approachPace } from '../../testing/approach-pace.testing';
import { catCharacter } from './cat-character';

const bounds = { left: 150, top: 220, width: 58, height: 84 };
const viewport = { x: 390, y: 844 };
const world = (part: THREE.Object3D) => part.getWorldPosition(new THREE.Vector3());
describe('ginger kitten', () => {
  it('keeps a continuous source-to-card route, side choices and variation in every stage', () => {
    const plans = Array.from({ length: 40 }, (_, i) => catPlan('kitten-' + i));
    for (const [i, plan] of plans.entries()) {
      expect(plan).toEqual(catPlan('kitten-' + i));
      for (const b of [bounds, { ...bounds, left: 4 }, { ...bounds, left: 325 }]) {
        const start = { x: 170, y: 340 };
        const end = catLandingPoint(plan, b, viewport);
        expect(end.x).toBeGreaterThan(42);
        expect(end.x).toBeLessThan(viewport.x - 42);
        expect(catApproach(plan, start, end, viewport, 0)).toEqual(start);
        expect(catApproach(plan, start, end, viewport, 1).x).toBeCloseTo(end.x);
        expect(catApproach(plan, start, end, viewport, 1).y).toBeCloseTo(end.y);
        let before = start;
        for (let t = 0; t <= 1; t += 0.005) {
          const point = catApproach(plan, start, end, viewport, t);
          expect(Math.hypot(point.x - before.x, point.y - before.y)).toBeLessThan(7);
          before = point;
        }
      }
    }
    for (const key of ['pace', 'strength', 'wiggle', 'detour', 'pause', 'exit', 'glance'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(40);
    for (const key of ['strokes', 'wipe', 'licks'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(2);
    expect(plans.some((p) => p.spot.x < 0.5)).toBe(true);
    expect(plans.some((p) => p.spot.x >= 0.5)).toBe(true);
  });
  it('creeps through its watchful stalking beat without ever stopping dead on the approach', () => {
    for (let i = 0; i < 40; i++) {
      const plan = catPlan('kitten-' + i);
      for (const [b, start] of [
        [bounds, { x: 170, y: 340 }],
        [
          { ...bounds, left: 4 },
          { x: 300, y: 600 },
        ],
        [
          { ...bounds, left: 325 },
          { x: 60, y: 120 },
        ],
      ] as const) {
        const end = catLandingPoint(plan, b, viewport);
        const pace = approachPace((t) => catApproach(plan, start, end, viewport, t));
        expect(pace.slowest).toBeGreaterThan(0.3);
        expect(pace.pace(0.5 + plan.pause / 2)).toBeLessThan(1);
      }
    }
  });
  it.each([1, -1])(
    'plants the paws during anticipation and springs into claw contact with a reacting card (side %s)',
    (facing) => {
      const id = 'kitten-contact-' + facing;
      const plan = catPlan(id);
      const cat = makePet(false);
      const effect = new LandingEffect('🐱', cat, id);
      const end = {
        x: facing > 0 ? bounds.left - 36 : bounds.left + bounds.width + 36,
        y: bounds.top + bounds.height - 14,
      };
      const update = (ms: number) => {
        effect.update(ms * plan.pace, bounds, end, viewport);
        cat.updateMatrixWorld(true);
        effect.object.updateMatrixWorld(true);
      };
      update(0);
      const paws = Array.from({ length: 4 }, (_, i) =>
        world(requireSceneObject(requireSceneObject(cat, 'kitten-leg-' + i), 'paw')),
      );
      update(450);
      expect(cat.position.y).toBeLessThan(-end.y + 1);
      for (let i = 0; i < 4; i++) {
        const before = paws[i];
        if (!before) throw new Error('Missing planted paw');
        expect(
          world(requireSceneObject(requireSceneObject(cat, 'kitten-leg-' + i), 'paw')).distanceTo(
            before,
          ),
        ).toBeLessThan(1e-7);
      }
      update(850);
      expect(cat.position.y).toBeGreaterThan(-end.y + 10);
      expect((cat.position.x - end.x) * facing).toBeGreaterThan(9);
      const paw = requireSceneObject(requireSceneObject(cat, 'kitten-leg-2'), 'paw');
      for (let stroke = 0; stroke < plan.strokes; stroke++)
        for (const age of [50, 90, 135, 160]) {
          const ms = CAT_SWIPE_START + stroke * CAT_SWIPE_STEP + age;
          update(ms);
          for (let claw = 0; claw < 3; claw++) {
            const actual = world(requireSceneObject(paw, 'claw-tip-' + claw));
            const expected = catClawPoint(ms, stroke, claw, bounds, plan, facing);
            expect(actual.x).toBeCloseTo(expected.x, 6);
            expect(-actual.y).toBeCloseTo(expected.y, 6);
            const wound = catWoundPoint(ms, ms, stroke, claw, bounds, plan, facing);
            expect(wound.x).toBeCloseTo(expected.x, 6);
            expect(wound.y).toBeCloseTo(expected.y, 6);
          }
          if (age === 90) expect(Math.abs(catCardPose(ms, plan, facing).x)).toBeGreaterThan(0.6);
        }
      const at = 1250 * plan.pace;
      effect.update(at, bounds, end, viewport);
      const before = cat.position.clone();
      const moved = {
        ...bounds,
        left: bounds.left + 30,
        top: bounds.top + 17,
        width: 84,
        height: 122,
      };
      effect.update(at, moved, { x: end.x + 30, y: end.y + 17 }, { x: 1200, y: 850 });
      expect(cat.position.x - before.x).toBe(30);
      expect(cat.position.y - before.y).toBe(-17);
      expect(effect.planOf(catCharacter)).toEqual(plan);
      disposeObject(effect.object);
      disposeObject(cat);
    },
  );
  it('keeps all leg chains connected at fixed length through pouncing, extreme swipes, grooming and reflow', () => {
    for (let seed = 0; seed < 24; seed++) {
      const id = 'kitten-rig-' + seed;
      const plan = catPlan(id);
      const cat = makePet(false);
      const effect = new LandingEffect('🐱', cat, id);
      for (const b of [bounds, { ...bounds, width: 84, height: 122 }]) {
        const end = catLandingPoint(plan, b, viewport);
        const times = [
          0, 450, 730, 850, 1000, 1150, 1240, 1370, 1470, 1690, 1900, 2180, 2650, 2830, 3050, 3260,
          3490, 3800, 4240, 4900,
        ];
        for (const ms of times) {
          effect.update(ms * plan.pace, b, end, viewport);
          cat.updateMatrixWorld(true);
          for (let i = 0; i < 4; i++) {
            const leg = requireSceneObject(cat, 'kitten-leg-' + i);
            const upper = requireSceneObject(leg, 'upper-leg');
            const lower = requireSceneObject(leg, 'lower-leg');
            const root = upper.localToWorld(new THREE.Vector3(0, -0.5, 0));
            const elbow = upper.localToWorld(new THREE.Vector3(0, 0.5, 0));
            const elbow2 = lower.localToWorld(new THREE.Vector3(0, -0.5, 0));
            const wrist = lower.localToWorld(new THREE.Vector3(0, 0.5, 0));
            expect(elbow.distanceTo(elbow2)).toBeLessThan(1e-7);
            expect(root.distanceTo(elbow)).toBeCloseTo(13.5, 5);
            expect(elbow.distanceTo(wrist)).toBeCloseTo(13.5, 5);
            expect(wrist.distanceTo(world(requireSceneObject(leg, 'paw')))).toBeLessThan(1e-7);
          }
          cat.traverse((part) => {
            expect(part.matrixWorld.elements.every(Number.isFinite)).toBe(true);
          });
        }
      }
      catWalk(cat, 130, -1, 1500, 0);
      cat.updateMatrixWorld(true);
      const paw = requireSceneObject(requireSceneObject(cat, 'kitten-leg-0'), 'paw');
      const before = world(paw);
      catWalk(cat, 190, -1, 1800, 0);
      cat.updateMatrixWorld(true);
      expect(world(paw)).toEqual(before);
      disposeObject(effect.object);
      disposeObject(cat);
    }
  });
  it('keeps scratch marks on the card, reuses effect geometry and finishes the groom and physical exit before cleanup', () => {
    for (let seed = 0; seed < 12; seed++) {
      const id = 'kitten-cleanup-' + seed;
      const plan = catPlan(id);
      const cat = makePet(false);
      const effect = new LandingEffect('🐱', cat, id);
      const end = catLandingPoint(plan, bounds, viewport);
      const facing = end.x < bounds.left ? 1 : -1;
      effect.update(2200 * plan.pace, bounds, end, viewport);
      effect.object.updateMatrixWorld(true);
      const meshes: THREE.Mesh[] = [];
      effect.object.traverse((part) => {
        if (part instanceof THREE.Mesh) meshes.push(part);
      });
      const geometries = meshes.map((p) => p.geometry);
      let surface = 0;
      for (const mesh of meshes)
        if (mesh.visible && mesh.userData['cardSurface'] === true) {
          const point = world(mesh);
          expect(point.x).toBeGreaterThan(bounds.left);
          expect(point.x).toBeLessThan(bounds.left + bounds.width);
          expect(-point.y).toBeGreaterThan(bounds.top);
          expect(-point.y).toBeLessThan(bounds.top + bounds.height);
          surface++;
        }
      expect(surface).toBeGreaterThan(40);
      effect.update(3050 * plan.pace, bounds, end, viewport);
      expect(
        requireSceneObject(requireSceneObject(cat, 'kitten-leg-2'), 'paw').position.y,
      ).toBeGreaterThan(0);
      expect(requireSceneObject(cat, 'kitten-leg-0').position.y).toBe(-3);
      const stop = (0.35 + plan.glance / 2) * 1100 * plan.exit + 4050;
      expect(catExitProgress(stop, plan)).toBeCloseTo(0.3);
      effect.update(stop * plan.pace, bounds, end, viewport);
      const paw = requireSceneObject(requireSceneObject(cat, 'kitten-leg-0'), 'paw');
      const before = paw.position.clone();
      effect.update((stop + 3) * plan.pace, bounds, end, viewport);
      expect(paw.position).toEqual(before);
      effect.update(5290 * plan.pace, bounds, end, viewport);
      expect(cat.position.x < -60 || cat.position.x > viewport.x + 60).toBe(true);
      expect(Math.abs(cat.scale.x)).toBe(0.9);
      expect(meshes.map((p) => p.geometry)).toEqual(geometries);
      effect.update(effect.duration, bounds, end, viewport);
      expect(cat.visible).toBe(false);
      expect(effect.object.visible).toBe(false);
      expect(effect.duration).toBe(CAT_DURATION * plan.pace);
      expect(effect.cardAnimation(facing)?.frames.at(-1)).toMatchObject({
        translate: '0px 0px',
        rotate: '0deg',
        scale: '1 1',
      });
      const geometry = geometries[0];
      if (!geometry) throw new Error('Missing claw trace');
      const cleanup = vi.spyOn(geometry, 'dispose');
      disposeObject(effect.object);
      disposeObject(cat);
      expect(cleanup).toHaveBeenCalledOnce();
    }
  });
});
