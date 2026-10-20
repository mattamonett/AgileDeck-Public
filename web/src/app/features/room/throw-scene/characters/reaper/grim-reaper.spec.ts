import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { VALID_INTERACTION_CHARACTERS } from '@poker/shared';
import { makeGrimReaper, reaperBladePoint, reaperWalk, REAPER_THOUGHT } from './grim-reaper';
import {
  reaperPlan,
  reaperApproach,
  reaperLandingPoint,
  reaperCardPose,
  reaperWoundPoint,
} from './reaper-choreography';
import { requireSceneObject } from '../../engine/scene-object';
import { LandingEffect, landingPoint, landingVariation } from '../../landing/landing-effects';
import { disposeObject } from '../../engine/throw-models';
import { approachPace } from '../../testing/approach-pace.testing';
import { projectileName } from '@features/room/projectile-names';

const bounds = { left: 150, top: 100, width: 105, height: 154 };

describe('Grim Reaper', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('varies the side and slice height per event while preserving the chosen spot', () => {
    const points = Array.from({ length: 40 }, (_, i) => {
      const variation = landingVariation(`reaper-${i}`);
      const point = landingPoint('☠️', bounds, variation);
      expect(landingPoint('☠️', bounds, landingVariation(`reaper-${i}`))).toEqual(point);
      return point;
    });
    expect(points.some((p) => p.x < bounds.left)).toBe(true);
    expect(points.some((p) => p.x > bounds.left + bounds.width)).toBe(true);
    expect(
      Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)),
    ).toBeGreaterThan(bounds.height * 0.45);
    expect(new Set(points.map((p) => p.x)).size).toBe(40);
  });
  it.each([0, 0.49, 0.5, 1])('keeps extreme randomized cuts and blood on the card (x %s)', (x) => {
    const model = makeGrimReaper();
    model.userData['reaperFacing'] = x < 0.5 ? 1 : -1;
    const effect = new LandingEffect('☠️', model);
    for (const y of [0, 1]) {
      const end = landingPoint('☠️', bounds, { x, y });
      effect.update(2600, bounds, end);
      effect.object.updateMatrixWorld(true);
      let visible = 0;
      effect.object.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || !o.visible || o.userData['cardSurface'] !== true) return;
        visible++;
        const p = o.getWorldPosition(new THREE.Vector3());
        expect(p.x).toBeGreaterThanOrEqual(bounds.left);
        expect(p.x).toBeLessThanOrEqual(bounds.left + bounds.width);
        expect(-p.y).toBeGreaterThanOrEqual(bounds.top);
        expect(-p.y).toBeLessThanOrEqual(bounds.top + bounds.height);
      });
      expect(visible).toBeGreaterThan(10);
    }
    disposeObject(effect.object);
    disposeObject(model);
  });
  it('registers a selectable, accepted character', () => {
    expect(VALID_INTERACTION_CHARACTERS.has('☠️')).toBe(true);
    expect(projectileName('☠️')).toBe('Grim Reaper');
  });
  it.each([1, -1])('keeps the sickle attached and cuts at the blade tip from side %s', (facing) => {
    const model = makeGrimReaper();
    model.userData['reaperFacing'] = facing;
    const effect = new LandingEffect('☠️', model);
    const plan = reaperPlan('landing');
    const end = landingPoint('☠️', bounds, { x: facing > 0 ? 0 : 1, y: 0.5 });
    for (const ms of [800, 950, 1050, 1150]) {
      effect.update(ms * plan.pace, bounds, end);
      model.updateMatrixWorld(true);
      const actual = requireSceneObject(model, 'sickle-tip').getWorldPosition(new THREE.Vector3());
      const expected = reaperBladePoint(ms, end, facing, plan);
      expect(actual.x).toBeCloseTo(expected.x);
      expect(-actual.y).toBeCloseTo(expected.y);
    }
    effect.update(700 * plan.pace, bounds, end);
    const meshes: THREE.Mesh[] = [];
    effect.object.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData['cardSurface'] === true) meshes.push(o);
    });
    expect(meshes.every((m) => !m.visible)).toBe(true);
    effect.update(2200, bounds, end);
    expect(meshes.filter((m) => m.visible).length).toBeGreaterThan(10);
    const bubble = requireSceneObject(effect.object, 'reaper-thought');
    expect(bubble.userData['text']).toBe(REAPER_THOUGHT);
    expect(bubble.scale.x).toBeGreaterThan(0);
    const position = model.position.clone();
    const armRotation = requireSceneObject(model, 'sickle-arm').rotation.z;
    effect.update(2600, bounds, end);
    effect.update(2200, bounds, end);
    expect(model.position).toEqual(position);
    expect(requireSceneObject(model, 'sickle-arm').rotation.z).toBe(armRotation);
    effect.update(effect.duration, bounds, end);
    expect(effect.object.visible).toBe(false);
    expect(bubble.visible).toBe(false);
    const mesh = meshes[0];
    if (!mesh) throw new Error('Missing Reaper cut');
    const cleanup = vi.spyOn(mesh.geometry, 'dispose');
    disposeObject(effect.object);
    disposeObject(model);
    expect(cleanup).toHaveBeenCalledOnce();
  });
  it('glides with quiet feet and moving cloth, and keeps effects anchored after reflow', () => {
    const model = makeGrimReaper();
    reaperWalk(model, 0.1, -1);
    expect(requireSceneObject(model, 'left-leg').rotation.z).toBe(0);
    expect(requireSceneObject(model, 'robe-fold').rotation.x).not.toBe(0);
    expect(model.scale.x).toBeLessThan(0);
    model.userData['reaperFacing'] = -1;
    const effect = new LandingEffect('☠️', model);
    const variation = { x: 1, y: 0.5 };
    effect.update(2000, bounds, landingPoint('☠️', bounds, variation));
    const before = model.position.clone();
    const moved = { ...bounds, left: 200, top: 130 };
    effect.update(2000, moved, landingPoint('☠️', moved, variation));
    expect(model.position.x - before.x).toBe(50);
    expect(model.position.y - before.y).toBe(-30);
    disposeObject(effect.object);
    disposeObject(model);
  });
  it('keeps all stages seeded, floats slowly mid-glide without stopping and adapts the approach to edge cards', () => {
    const plans = Array.from({ length: 40 }, (_, i) => reaperPlan('harvest-' + i));
    for (const [i, plan] of plans.entries()) {
      expect(plan).toEqual(reaperPlan('harvest-' + i));
      for (const b of [
        { left: 4, top: 230, width: 58, height: 84 },
        { left: 324, top: 230, width: 58, height: 84 },
        bounds,
      ]) {
        const view = { x: 390, y: 844 };
        const end = reaperLandingPoint(plan, b, view);
        expect(end.x).toBeGreaterThan(42);
        expect(end.x).toBeLessThan(view.x - 42);
        const start = { x: 170, y: 340 };
        expect(reaperApproach(plan, start, end, view, 0)).toEqual(start);
        expect(reaperApproach(plan, start, end, view, 1).x).toBeCloseTo(end.x);
        const pace = approachPace((t) => reaperApproach(plan, start, end, view, t));
        expect(pace.slowest).toBeGreaterThan(0.3);
        expect(pace.pace(0.52 + plan.pause / 2)).toBeLessThan(1);
        let previous = start;
        for (let t = 0; t <= 1; t += 0.005) {
          const point = reaperApproach(plan, start, end, view, t);
          expect(Math.hypot(point.x - previous.x, point.y - previous.y)).toBeLessThan(6);
          previous = point;
        }
      }
    }
    for (const key of ['pace', 'strength', 'pause', 'collect', 'departure', 'withdraw'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(40);
  });
  it.each([1, -1])(
    'keeps both arm chains connected, collects the visible soul in the palm and descends through the portal (side %s)',
    (facing) => {
      const id = 'reaper-rig-' + facing;
      const plan = reaperPlan(id);
      const model = makeGrimReaper();
      const effect = new LandingEffect('☠️', model, id);
      const b = { left: 150, top: 200, width: 58, height: 84 };
      const end = {
        x: facing > 0 ? b.left - 27 : b.left + b.width + 27,
        y: b.top + b.height * 0.68,
      };
      const boneEnd = (name: string, t: number) => {
        const bone = requireSceneObject(model, name);
        return bone.localToWorld(new THREE.Vector3(0, t, 0));
      };
      for (const ms of [0, 400, 900, 1150, 2400, 3400, 3800, 4450, 4800]) {
        effect.update(ms * plan.pace, b, end);
        model.updateMatrixWorld(true);
        const elbow = boneEnd('free-upperarm', 0.5);
        const wrist = boneEnd('free-forearm', 0.5);
        expect(elbow.distanceTo(boneEnd('free-forearm', -0.5))).toBeLessThan(1e-7);
        const palmPose = requireSceneObject(model, 'harvest-hand').position;
        const handWrist = requireSceneObject(model, 'free-arm').localToWorld(
          new THREE.Vector3(palmPose.x, palmPose.y, 0),
        );
        expect(wrist.distanceTo(handWrist)).toBeLessThan(1e-7);
        expect(boneEnd('free-upperarm', -0.5).distanceTo(elbow)).toBeCloseTo(17 * 0.9);
        expect(elbow.distanceTo(wrist)).toBeCloseTo(17 * 0.9);
        expect(
          boneEnd('scythe-upperarm', 0.5).distanceTo(boneEnd('scythe-forearm', -0.5)),
        ).toBeLessThan(1e-7);
        const grip = requireSceneObject(model, 'sickle').getWorldPosition(new THREE.Vector3());
        const staffWrist = boneEnd('scythe-forearm', 0.5);
        expect(staffWrist.distanceTo(grip)).toBeCloseTo(1.8);
        model.traverse((part) => {
          expect(part.matrixWorld.elements.every(Number.isFinite)).toBe(true);
        });
        effect.object.updateMatrixWorld(true);
        if (ms === 3400) {
          const soul = requireSceneObject(effect.object, 'card-spirit');
          expect(soul.visible).toBe(true);
          expect(soul.children.every((c) => c.visible)).toBe(true);
          const palm = requireSceneObject(model, 'harvest-hand').getWorldPosition(
            new THREE.Vector3(),
          );
          const spirit = soul.getWorldPosition(new THREE.Vector3());
          expect(Math.hypot(spirit.x - palm.x, spirit.y - palm.y)).toBeLessThan(0.01);
        }
        if (ms === 4800) {
          expect(requireSceneObject(effect.object, 'death-portal').visible).toBe(true);
          expect(Math.abs(model.scale.x)).toBe(0.9);
          const skull = requireSceneObject(model, 'death-eye').getWorldPosition(
            new THREE.Vector3(),
          );
          let clipped = false;
          model.traverse((part) => {
            if (part instanceof THREE.Mesh && part.material instanceof THREE.MeshStandardMaterial) {
              const plane = part.material.clippingPlanes?.[0];
              if (plane && plane.distanceToPoint(skull) < 0) clipped = true;
            }
          });
          expect(clipped).toBe(true);
        }
      }
      effect.update(effect.duration, b, end);
      expect(model.visible).toBe(false);
      expect(effect.object.visible).toBe(false);
      expect(effect.cardAnimation(facing)?.frames.at(-1)).toMatchObject({
        translate: '0px 0px',
        scale: '1 1',
        filter: 'saturate(1) brightness(1)',
      });
      expect(reaperCardPose(5600, plan, facing)).toEqual({ x: facing === 1 ? -0 : 0, y: 0, sy: 1 });
      effect.update(2000 * plan.pace, b, end);
      const before = model.position.clone();
      const moved = { ...b, left: b.left + 35, top: b.top + 17, width: 84, height: 122 };
      effect.update(2000 * plan.pace, moved, { x: end.x + 35, y: end.y + 17 });
      expect(model.position.x - before.x).toBe(35);
      expect(model.position.y - before.y).toBe(-17);
      disposeObject(model);
      disposeObject(effect.object);
    },
  );
  it('anchors the incision to the reacting card and keeps preallocated effects bounded across small-card seeds', () => {
    for (let i = 0; i < 24; i++) {
      const id = 'harvest-small-' + i;
      const model = makeGrimReaper();
      const effect = new LandingEffect('☠️', model, id);
      const plan = reaperPlan(id);
      const b = { left: 180, top: 250, width: 58, height: 84 };
      const end = reaperLandingPoint(plan, b, { x: 390, y: 844 });
      const facing = end.x < b.left ? 1 : -1;
      const point = reaperWoundPoint(980, 980, end, b, facing, plan);
      const tip = reaperBladePoint(980, end, facing, plan);
      expect(point.x).toBeCloseTo(tip.x);
      expect(point.y).toBeCloseTo(tip.y);
      effect.update(2400 * plan.pace, b, end);
      const bowels: THREE.Mesh[] = [];
      effect.object.traverse((p) => {
        if (p instanceof THREE.Mesh && p.name === 'reaper-bowel') bowels.push(p);
      });
      expect(bowels).toHaveLength(3);
      expect(bowels.every((p) => p.visible)).toBe(true);
      effect.object.updateMatrixWorld(true);
      for (const bowel of bowels) {
        const origin = bowel.getWorldPosition(new THREE.Vector3());
        expect(origin.x).toBeGreaterThan(b.left);
        expect(origin.x).toBeLessThan(b.left + b.width);
        expect(-origin.y).toBeGreaterThan(b.top);
        expect(-origin.y).toBeLessThan(b.top + b.height);
      }
      const geometries = bowels.map((p) => p.geometry);
      for (const ms of [1150, 1900, 2800, 3300, 4000, 4850, 5600, 800])
        effect.update(ms * plan.pace, b, end);
      expect(bowels.map((p) => p.geometry)).toEqual(geometries);
      const geometry = geometries[0];
      if (!geometry) throw new Error('Missing bowel geometry');
      const cleanup = vi.spyOn(geometry, 'dispose');
      disposeObject(effect.object);
      disposeObject(model);
      expect(cleanup).toHaveBeenCalledOnce();
    }
  });
});
