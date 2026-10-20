import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { makeHeart, heartModel, heartShape, HEART_SEAM } from './broken-heart';
import { HeartTrick, heartHalfPose } from './heart-trick';
import {
  HEART_DURATION,
  HEART_SCALE,
  heartPlan,
  heartLandingPoint,
  heartApproach,
  heartContact,
  heartCardPoint,
  heartCardPose,
} from './heart-choreography';
import { LandingEffect, landingKind } from '../../landing/landing-effects';
import { disposeObject } from '../../engine/throw-models';
import { requireSceneObject } from '../../engine/scene-object';
import { approachPace } from '../../testing/approach-pace.testing';
import { heartCharacter } from './heart-character';

const b = { left: 600, top: 420, width: 84, height: 122 },
  source = { x: 260, y: 480 },
  view = { x: 1200, y: 850 };
function fixture(id: string) {
  const actor = makeHeart(id),
    trick = new HeartTrick(actor),
    scene = new THREE.Scene();
  scene.add(actor, trick.object);
  return { actor, trick, scene, model: heartModel(actor) };
}
function update(f: ReturnType<typeof fixture>, ms: number, bounds = b, viewport = view) {
  f.trick.update(ms * f.trick.plan.pace, f.actor, source, bounds, viewport);
  f.scene.updateMatrixWorld(true);
}
function clean(f: ReturnType<typeof fixture>) {
  disposeObject(f.actor);
  disposeObject(f.trick.object);
}
function mesh(root: THREE.Object3D, name: string) {
  const o = requireSceneObject(root, name);
  if (!(o instanceof THREE.Mesh)) throw Error('Missing mesh');
  return o;
}
function area(shape: THREE.Shape) {
  const points = shape.getPoints(24);
  return Math.abs(THREE.ShapeUtils.area(points));
}
describe('hopeful heart and comic heartbreak', () => {
  it('owns one stable event plan and varies every stage, side and wistful ending', () => {
    const actor = makeHeart('shared'),
      effect = new LandingEffect('❤️', actor, 'shared');
    expect(landingKind('❤️')).toBe('❤️');
    expect(effect.planOf(heartCharacter)).toBe(heartModel(actor).plan);
    const plans = Array.from({ length: 40 }, (_, i) => heartPlan('heart-' + i));
    expect(heartPlan('repeat')).toEqual(heartPlan('repeat'));
    for (const key of [
      'pace',
      'travel',
      'hit',
      'rise',
      'bend',
      'pause',
      'beat',
      'phase',
      'split',
      'drop',
      'spread',
      'force',
      'spin',
      'bounce',
      'cleanup',
    ] as const) {
      expect(new Set(plans.map((p) => p[key])).size).toBe(40);
    }
    for (const key of ['side', 'stubborn'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(2);
    for (const p of plans) expect(p.cleanup + 850).toBeLessThan(HEART_DURATION);
    disposeObject(actor);
    disposeObject(effect.object);
  });
  it('preserves matching jagged halves and a seamless whole with native candy depth', () => {
    expect(area(heartShape(-1)) + area(heartShape(1))).toBeCloseTo(area(heartShape()), 6);
    for (const side of [-1, 1]) {
      const points = heartShape(side).getPoints(24);
      for (const [x, y] of HEART_SEAM)
        expect(points.some((p) => p.distanceTo(new THREE.Vector2(x, y)) < 0.00001)).toBe(true);
    }
    const f = fixture('surface'),
      whole = mesh(f.actor, 'whole-heart'),
      positions = whole.geometry.getAttribute('position');
    let minZ = Infinity,
      maxZ = -Infinity,
      tipDistance = Infinity;
    for (let i = 0; i < positions.count; i++) {
      minZ = Math.min(minZ, positions.getZ(i));
      maxZ = Math.max(maxZ, positions.getZ(i));
      tipDistance = Math.min(
        tipDistance,
        new THREE.Vector3().fromBufferAttribute(positions, i).distanceTo(f.model.tip.position),
      );
    }
    expect(maxZ - minZ).toBeGreaterThan(6);
    expect(tipDistance).toBeLessThan(0.00001);
    expect(f.model.intact.visible).toBe(true);
    expect(f.model.halves.every((h) => !h.root.visible)).toBe(true);
    clean(f);
  });
  it('keeps its hopeful hesitation as a slow float that never stops dead on the approach', () => {
    for (let seed = 0; seed < 20; seed++)
      for (const [bounds, from, viewport] of [
        [b, source, view],
        [b, { x: 1000, y: 200 }, view],
        [
          { left: 160, top: 560, width: 58, height: 84 },
          { x: 189, y: 240 },
          { x: 390, y: 844 },
        ],
        [
          { left: 160, top: 200, width: 58, height: 84 },
          { x: 189, y: 640 },
          { x: 390, y: 844 },
        ],
      ] as const) {
        const p = heartPlan('heart-' + seed),
          end = heartLandingPoint(bounds);
        const pace = approachPace((t) => heartApproach(p, from, end, viewport, t * p.travel));
        expect(pace.slowest).toBeGreaterThan(0.3);
        expect(pace.pace(0.62 + p.pause / 2)).toBeLessThan(1);
      }
  });
  it('approaches continuously and makes the actual tip meet the live card before splitting', () => {
    for (let seed = 0; seed < 6; seed++) {
      const f = fixture('heart-' + seed),
        p = f.trick.plan,
        end = heartLandingPoint(b);
      expect(heartApproach(p, source, end, view, 0)).toEqual(source);
      for (const moment of [p.travel, p.hit]) {
        update(f, moment - 0.01);
        const before = f.actor.position.clone();
        update(f, moment + 0.01);
        expect(f.actor.position.distanceTo(before)).toBeLessThan(0.001);
      }
      update(f, p.hit);
      const tip = f.model.tip.getWorldPosition(new THREE.Vector3()),
        at = heartContact(b);
      expect(tip.x).toBeCloseTo(at.x, 6);
      expect(tip.y).toBeCloseTo(-at.y, 6);
      expect(tip.z).toBeCloseTo(172, 6);
      for (const half of f.model.halves) {
        expect(
          half.root.getWorldPosition(new THREE.Vector3()).distanceTo(f.actor.position),
        ).toBeLessThan(0.000001);
        expect(half.root.rotation.z).toBeCloseTo(0, 8);
        expect(half.root.visible).toBe(true);
      }
      expect(f.model.intact.visible).toBe(false);
      expect(heartCardPose(p, p.hit)).toEqual({ x: 0, y: 0, angle: 0 });
      expect(heartCardPose(p, p.hit + 100).y).toBeGreaterThan(0);
      clean(f);
    }
  });
  it('releases love echoes from real lobe highlights and break chips from the native seam', () => {
    const f = fixture('heart-0'),
      p = f.trick.plan;
    for (let i = 0; i < 8; i++) {
      update(f, p.travel * (0.16 + i * 0.065));
      const born = f.model.sources[i % 2];
      if (!born) throw Error('Missing lobe');
      expect(
        mesh(f.trick.object, 'love-echo-' + i)
          .getWorldPosition(new THREE.Vector3())
          .distanceTo(born.getWorldPosition(new THREE.Vector3())),
      ).toBeLessThan(0.00001);
    }
    update(f, p.hit);
    for (let i = 0; i < 10; i++) {
      const point = HEART_SEAM[i % HEART_SEAM.length];
      if (!point) throw Error('Missing seam point');
      const expected = f.actor.localToWorld(new THREE.Vector3(point[0], point[1], 3.1));
      expect(
        mesh(f.trick.object, 'heart-chip-' + i)
          .getWorldPosition(new THREE.Vector3())
          .distanceTo(expected),
      ).toBeLessThan(0.00001);
    }
    clean(f);
  });
  it('hangs, falls, bounces and makes the actual candy undersides contact the floor without jumps', () => {
    for (let seed = 0; seed < 6; seed++) {
      const f = fixture('heart-' + seed),
        p = f.trick.plan;
      for (const bounds of [
        b,
        { left: 8, top: 500, width: 58, height: 84 },
        { left: 310, top: 500, width: 58, height: 84 },
      ]) {
        const viewport = bounds === b ? view : { x: 390, y: 844 };
        for (const half of f.model.halves) {
          const q = heartHalfPose(p, half, p.drop, bounds, viewport);
          for (const moment of [
            p.drop,
            p.drop + q.landing * 1000,
            p.drop + (q.landing + q.bounceDuration) * 1000,
            p.drop + (q.landing + q.bounceDuration + 0.65) * 1000,
            p.drop + (q.landing + q.bounceDuration + 1.13) * 1000,
          ]) {
            const before = heartHalfPose(p, half, moment - 0.001, bounds, viewport),
              after = heartHalfPose(p, half, moment + 0.001, bounds, viewport);
            expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(0.002);
            expect(Math.abs(after.angle - before.angle)).toBeLessThan(0.0001);
          }
          for (const t of [
            q.landing,
            q.landing + q.bounceDuration + 0.2,
            q.landing + q.bounceDuration + 1.25,
          ]) {
            update(f, p.drop + t * 1000, bounds, viewport);
            const positions = half.mesh.geometry.getAttribute('position');
            let lowest = Infinity,
              left = Infinity,
              right = -Infinity;
            for (let i = 0; i < positions.count; i++) {
              const at = half.mesh.localToWorld(
                new THREE.Vector3().fromBufferAttribute(positions, i),
              );
              lowest = Math.min(lowest, at.y);
              left = Math.min(left, at.x);
              right = Math.max(right, at.x);
            }
            expect(lowest).toBeCloseTo(-(bounds.top + bounds.height + 20), 5);
            expect(left).toBeGreaterThan(0);
            expect(right).toBeLessThan(viewport.x);
          }
        }
      }
      update(f, p.cleanup - 1);
      expect(f.actor.scale.x).toBe(HEART_SCALE);
      clean(f);
    }
  });
  it('has an authored last hopeful hop on one half, with both alternatives settled before cleanup', () => {
    const seen = new Set<boolean>();
    for (let seed = 0; seed < 20; seed++) {
      const f = fixture('heart-' + seed),
        p = f.trick.plan;
      seen.add(p.stubborn);
      for (const half of f.model.halves) {
        const first = heartHalfPose(p, half, p.drop, b, view);
        const middle = p.drop + (first.landing + first.bounceDuration + 0.65 + 0.24) * 1000;
        const pose = heartHalfPose(p, half, middle, b, view);
        expect(pose.hop > 0).toBe(p.stubborn && half.side === p.side);
        expect(heartHalfPose(p, half, p.cleanup, b, view).settled).toBe(true);
      }
      clean(f);
    }
    expect(seen.size).toBe(2);
  });
  it('anchors the crack on the affine card, retains its plan through reflow and restores reveal transforms', () => {
    const f = fixture('heart-3'),
      p = f.trick.plan,
      animation = f.trick.cardAnimation();
    expect(animation.options.duration).toBe(f.trick.duration);
    for (const frame of animation.frames) expect(frame['transform']).toBeUndefined();
    expect(heartCardPose(p, HEART_DURATION)).toEqual({ x: 0, y: 0, angle: 0 });
    for (const bounds of [
      b,
      { left: 8, top: 500, width: 58, height: 84 },
      { left: 310, top: 340, width: 58, height: 84 },
    ]) {
      update(f, p.hit + 230, bounds);
      expect(f.trick.plan).toBe(p);
      const line = requireSceneObject(f.trick.object, 'card-heart-crack-1');
      if (!(line instanceof THREE.Line)) throw Error('Missing crack');
      const at = new THREE.Vector3().fromBufferAttribute(line.geometry.getAttribute('position'), 0),
        expected = heartCardPoint(p, p.hit + 230, heartContact(bounds), bounds);
      expect(at.x).toBeCloseTo(expected.x, 4);
      expect(at.y).toBeCloseTo(-expected.y, 4);
    }
    update(f, HEART_DURATION);
    expect(f.actor.visible).toBe(false);
    expect(f.trick.object.visible).toBe(false);
    clean(f);
  });
  it('seeks deterministically with finite fixed resources and disposes native meshes and lines once', () => {
    for (let seed = 0; seed < 4; seed++) {
      const f = fixture('heart-' + seed),
        resources: (THREE.Mesh | THREE.Line)[] = [];
      for (const root of [f.actor, f.trick.object])
        root.traverse((o) => {
          if (o instanceof THREE.Mesh || o instanceof THREE.Line) resources.push(o);
        });
      for (let ms = 0; ms <= HEART_DURATION; ms += 157) {
        update(f, ms);
        for (const root of [f.actor, f.trick.object])
          root.traverse((o) =>
            expect(
              [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()].every(
                Number.isFinite,
              ),
            ).toBe(true),
          );
      }
      update(f, f.trick.plan.drop + 500);
      const before = f.model.halves.map((h) => h.root.matrixWorld.toArray());
      update(f, 7000);
      update(f, f.trick.plan.drop + 500);
      expect(f.model.halves.map((h) => h.root.matrixWorld.toArray())).toEqual(before);
      const after: (THREE.Mesh | THREE.Line)[] = [];
      for (const root of [f.actor, f.trick.object])
        root.traverse((o) => {
          if (o instanceof THREE.Mesh || o instanceof THREE.Line) after.push(o);
        });
      expect(after).toEqual(resources);
      const geometry = resources.map((o) => vi.spyOn(o.geometry, 'dispose'));
      const materials = resources
        .flatMap((o) => (Array.isArray(o.material) ? o.material : [o.material]))
        .map((m) => vi.spyOn(m, 'dispose'));
      clean(f);
      for (const spy of [...geometry, ...materials]) expect(spy).toHaveBeenCalledOnce();
    }
  });
});
