import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { makeTomato, tomatoModel } from './tomato-model';
import { TomatoTrick, tomatoPeelPose } from './tomato-trick';
import {
  TOMATO_DURATION,
  TOMATO_DEPTH,
  TOMATO_SCALE,
  tomatoPlan,
  tomatoContact,
  tomatoCardPose,
  tomatoCardPoint,
  tomatoApproach,
} from './tomato-choreography';
import { LandingEffect, landingKind } from '../../landing/landing-effects';
import { disposeObject } from '../../engine/throw-models';
import { requireSceneObject } from '../../engine/scene-object';
import { tomatoCharacter } from './tomato-character';
const b = { left: 600, top: 420, width: 84, height: 122 },
  start = { x: 260, y: 480 },
  view = { x: 1200, y: 850 };
function fixture(id: string) {
  const actor = makeTomato(id),
    trick = new TomatoTrick(actor),
    scene = new THREE.Scene();
  scene.add(actor, trick.object);
  return { actor, trick, scene };
}
function update(f: ReturnType<typeof fixture>, ms: number, bounds = b, viewport = view) {
  f.trick.update(ms * f.trick.plan.pace, f.actor, start, bounds, viewport);
  f.scene.updateMatrixWorld(true);
}
function clean(f: ReturnType<typeof fixture>) {
  disposeObject(f.actor);
  disposeObject(f.trick.object);
}
const pos = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
function geometryBottom(root: THREE.Object3D) {
  let bottom = Infinity;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const vertices = o.geometry.getAttribute('position');
      for (let n = 0; n < vertices.count; n++)
        bottom = Math.min(
          bottom,
          new THREE.Vector3().fromBufferAttribute(vertices, n).applyMatrix4(o.matrixWorld).y,
        );
    }
  });
  return bottom;
}
describe('wet heckling tomato', () => {
  it('owns one reproducible plan with choices across lob, rupture, runoff and debris', () => {
    const actor = makeTomato('native'),
      effect = new LandingEffect('🍅', actor, 'native');
    expect(effect.planOf(tomatoCharacter)).toBe(tomatoModel(actor).plan);
    expect(landingKind('🍅')).toBe('🍅');
    expect(tomatoPlan('repeat')).toEqual(tomatoPlan('repeat'));
    const plans = Array.from({ length: 40 }, (_, i) => tomatoPlan('tomato-' + i));
    for (const key of [
      'pace',
      'travel',
      'loft',
      'spot',
      'force',
      'phase',
      'peelDelay',
      'cleanup',
      'runoff',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(40);
    for (const key of ['side', 'turns', 'sticky'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(2);
    for (const p of plans) expect(p.cleanup + 800).toBeLessThan(TOMATO_DURATION);
    disposeObject(actor);
    disposeObject(effect.object);
  });
  it('starts at the real source and curls continuously into either side without crossing viewport edges', () => {
    for (let i = 0; i < 10; i++) {
      const p = tomatoPlan('tomato-' + i);
      for (const bounds of [
        b,
        { left: 8, top: 550, width: 58, height: 84 },
        { left: 320, top: 550, width: 58, height: 84 },
      ]) {
        const vp = bounds === b ? view : { x: 390, y: 844 },
          at = tomatoContact(p, bounds);
        const source = bounds === b ? start : { x: 150, y: 590 };
        expect(tomatoApproach(p, 0, source, bounds, vp).x).toBe(source.x);
        const end = tomatoApproach(p, p.travel, source, bounds, vp);
        expect(end.x).toBeCloseTo(at.x, 8);
        expect(end.y).toBeCloseTo(at.y, 8);
        for (let t = 0; t <= 1; t += 0.01) {
          const q = tomatoApproach(p, t * p.travel, source, bounds, vp);
          expect(q.x).toBeGreaterThan(0);
          expect(q.x).toBeLessThan(vp.x);
          expect(q.y).toBeGreaterThan(48);
        }
        const near = tomatoApproach(p, p.travel - 0.1, source, bounds, vp);
        expect(Math.sign(end.x - near.x)).toBe(p.side);
      }
    }
  });
  it('touches the live affine card with real skin before a causal squash and recoil', () => {
    const f = fixture('tomato-0'),
      p = f.trick.plan;
    for (const bounds of [b, { left: 8, top: 520, width: 58, height: 84 }])
      for (const age of [0, 50, 119]) {
        update(f, p.travel + age, bounds);
        const at = tomatoCardPoint(p, p.travel + age, tomatoContact(p, bounds), bounds),
          skin = pos(requireSceneObject(f.actor, 'skin-contact'));
        expect(skin.x).toBeCloseTo(at.x, 6);
        expect(skin.y).toBeCloseTo(-at.y, 6);
        expect(skin.z).toBeCloseTo(TOMATO_DEPTH, 6);
      }
    expect(tomatoCardPose(p, p.travel - 1).x).toBeCloseTo(0, 8);
    expect(Math.abs(tomatoCardPose(p, p.travel + 50).x)).toBeGreaterThan(1);
    update(f, p.travel - 0.01);
    const before = f.actor.position.clone(),
      rotation = f.actor.quaternion.clone();
    update(f, p.travel + 0.01);
    expect(f.actor.position.distanceTo(before)).toBeLessThan(0.01);
    expect(f.actor.quaternion.angleTo(rotation)).toBeLessThan(0.001);
    clean(f);
  });
  it('releases spray at the actual contact and keeps sticking seeds continuous', () => {
    const f = fixture('tomato-0'),
      p = f.trick.plan;
    update(f, p.travel);
    const at = tomatoContact(p, b);
    for (const name of ['tomato-pulp-0', 'tomato-seed-0']) {
      const q = pos(requireSceneObject(f.trick.object, name));
      expect(q.x).toBeCloseTo(at.x, 6);
      expect(q.y).toBeCloseTo(-at.y, 6);
    }
    for (let i = 0; i < 8; i++) {
      const age = (0.24 + (i % 3) * 0.06) * 1000;
      update(f, p.travel + age - 0.01);
      const q = pos(requireSceneObject(f.trick.object, 'tomato-seed-' + i));
      update(f, p.travel + age + 0.01);
      expect(
        pos(requireSceneObject(f.trick.object, 'tomato-seed-' + i)).distanceTo(q),
      ).toBeLessThan(0.02);
    }
    clean(f);
  });
  it('releases original curved skins continuously, delays only the sticky piece and rests actual geometry on the floor', () => {
    for (let seed = 0; seed < 8; seed++) {
      const f = fixture('tomato-' + seed),
        p = f.trick.plan,
        model = tomatoModel(f.actor);
      for (const [i, peel] of model.peels.entries()) {
        const at = p.travel + 120;
        update(f, at);
        const initial = pos(peel);
        update(f, at + 0.01);
        expect(pos(peel).distanceTo(initial)).toBeLessThan(0.01);
        if (p.sticky && i === 2) {
          update(f, at + 100);
          const before = pos(peel);
          update(f, at + p.peelDelay - 1);
          expect(pos(peel).distanceTo(before)).toBeLessThan(0.1);
        }
        update(f, p.travel + 4000);
        const q = tomatoPeelPose(p, p.travel + 4000, i, b, view);
        expect(geometryBottom(peel)).toBeCloseTo(-q.floor, 5);
        expect(f.actor.scale.x).toBe(TOMATO_SCALE);
        expect(geometryBottom(model.stem)).toBeCloseTo(-b.top - b.height - 25, 5);
      }
      clean(f);
    }
  });
  it('seeks deterministically, restores card transforms and disposes fixed resources once', () => {
    const f = fixture('tomato-0'),
      p = f.trick.plan;
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    for (const root of [f.actor, f.trick.object])
      root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          resources.add(o.geometry);
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) resources.add(m);
        }
      });
    update(f, p.travel + 500);
    const before = pos(requireSceneObject(f.trick.object, 'tomato-pulp-4'));
    update(f, p.cleanup + 400);
    update(f, p.travel + 500);
    expect(
      pos(requireSceneObject(f.trick.object, 'tomato-pulp-4')).distanceTo(before),
    ).toBeLessThan(0.000001);
    for (let ms = 0; ms <= TOMATO_DURATION; ms += 137) {
      update(f, ms);
      for (const root of [f.actor, f.trick.object])
        root.traverse((o) => expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
    }
    expect(f.trick.cardAnimation().frames.at(-1)).toMatchObject({
      translate: '0px 0px',
      rotate: '0deg',
      scale: '1 1',
    });
    update(f, TOMATO_DURATION);
    expect(f.actor.visible).toBe(false);
    expect(f.trick.object.visible).toBe(false);
    const spies = Array.from(resources, (r) => vi.spyOn(r, 'dispose'));
    clean(f);
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});
