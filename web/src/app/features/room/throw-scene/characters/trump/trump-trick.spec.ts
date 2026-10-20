import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ProjectileSchema } from '@poker/shared';
import { TrumpTrick, makeTrump, trumpWalk } from './trump-trick';
import {
  TRUMP_PHRASES,
  TRUMP_DURATION,
  trumpPlan,
  trumpLandingPoint,
  trumpApproach,
  trumpContact,
  trumpCardPoint,
  trumpCardPose,
  trumpExit,
} from './trump-choreography';
import { disposeObject } from '../../engine/throw-models';
import { requireSceneObject } from '../../engine/scene-object';
import { approachPace } from '../../testing/approach-pace.testing';
const view = { x: 800, y: 760 };
const b = { left: 360, top: 300, width: 84, height: 122 };
const source = { x: 100, y: 350 };
function mesh(root: THREE.Object3D, name: string) {
  const part = requireSceneObject(root, name);
  if (!(part instanceof THREE.Mesh)) throw new Error(name);
  return part;
}
describe('Donald Trump performance', () => {
  it('retains the identifier and exact authored quips while varying each stage reproducibly', () => {
    expect(ProjectileSchema.safeParse({ targetUserId: 'player', emoji: '🇺🇸' }).success).toBe(true);
    const plans = Array.from({ length: 80 }, (_, i) => trumpPlan('trump-' + i));
    expect(new Set(plans.map((p) => p.phrase))).toEqual(new Set(TRUMP_PHRASES));
    expect(trumpPlan('same')).toEqual(trumpPlan('same'));
    for (const key of [
      'pace',
      'pat',
      'force',
      'detour',
      'pause',
      'step',
      'inspect',
      'departure',
      'exit',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBeGreaterThan(20);
    expect(
      new Set(plans.map((p) => Math.sign(trumpLandingPoint(p, b, view, source).x - b.left))).size,
    ).toBe(2);
    expect(plans.every((p) => p.departure + 1450 * p.exit < TRUMP_DURATION)).toBe(true);
  });
  it('slows its deliberate approach without stopping dead, keeps stride-free limbs stationary and exact endpoints', () => {
    const p = trumpPlan('trump-2');
    const end = trumpLandingPoint(p, b, view, source);
    for (let seed = 0; seed < 20; seed++)
      for (const facing of [-1, 1])
        for (const from of [source, { x: 700, y: 640 }]) {
          const plan = trumpPlan('trump-' + seed);
          const to = trumpLandingPoint(plan, b, view, from, facing);
          const pace = approachPace((t) => trumpApproach(plan, from, to, view, t, b));
          expect(pace.slowest).toBeGreaterThan(0.3);
          expect(pace.pace(0.6 + plan.pause / 2)).toBeLessThan(1);
        }
    expect(trumpApproach(p, source, end, view, 0, b)).toEqual(source);
    expect(trumpApproach(p, source, end, view, 1, b)).toEqual(end);
    const man = makeTrump('trump-2');
    trumpWalk(man, 20, 1, 0, p.step);
    const foot = requireSceneObject(man, 'dress-shoe').getWorldPosition(new THREE.Vector3());
    trumpWalk(man, 120, 1, 0, p.step);
    expect(
      requireSceneObject(man, 'dress-shoe').getWorldPosition(new THREE.Vector3()).distanceTo(foot),
    ).toBeLessThan(1e-8);
    let previous = source;
    for (let i = 0; i <= 200; i++) {
      const point = trumpApproach(p, source, end, view, i / 200, b);
      expect(Math.hypot(point.x - previous.x, point.y - previous.y)).toBeLessThan(9);
      previous = point;
    }
    disposeObject(man);
  });
  it('pats the real card with fixed-length arms and planted shoes on both sides and sizes', () => {
    for (let seed = 0; seed < 8; seed++)
      for (const facing of [-1, 1])
        for (const size of [
          { width: 84, height: 122 },
          { width: 58, height: 84 },
        ]) {
          const bounds = { ...b, ...size };
          const man = makeTrump('trump-' + seed);
          const trick = new TrumpTrick('trump-' + seed);
          const p = trick.plan;
          const end = trumpLandingPoint(p, bounds, view, source, facing);
          const footPositions = [-1, 1].map(
            (side) => new THREE.Vector3(end.x + side * 8 * 0.8, -end.y - 48 * 0.8, 160),
          );
          for (let ms = 0; ms < p.departure; ms += 35) {
            trick.update(ms * p.pace, man, bounds, end, view);
            for (const [index, side] of [-1, 1].entries()) {
              const arm = requireSceneObject(man, side > 0 ? 'right-arm' : 'left-arm');
              const leg = requireSceneObject(man, side > 0 ? 'right-leg' : 'left-leg');
              for (const name of ['upper-arm', 'forearm'])
                expect(mesh(arm, name).scale.y, `${seed} ${facing} ${ms} ${name}`).toBeCloseTo(
                  18,
                  7,
                );
              for (const name of ['thigh', 'shin'])
                expect(mesh(leg, name).scale.y).toBeCloseTo(17, 7);
              const foot = footPositions[index];
              if (!foot) throw new Error('foot');
              expect(
                requireSceneObject(leg, 'dress-shoe')
                  .getWorldPosition(new THREE.Vector3())
                  .distanceTo(foot),
              ).toBeLessThan(1e-7);
            }
          }
          for (const age of [0, 60, 130]) {
            trick.update((p.pat + age) * p.pace, man, bounds, end, view);
            const palm = requireSceneObject(
              requireSceneObject(man, facing > 0 ? 'right-arm' : 'left-arm'),
              'palm-contact',
            ).getWorldPosition(new THREE.Vector3());
            const contact = trumpCardPoint(
              p.pat + age,
              trumpContact(p, bounds, facing),
              p,
              bounds,
              facing,
            );
            expect(palm.x).toBeCloseTo(contact.x, 6);
            expect(-palm.y).toBeCloseTo(contact.y, 6);
          }
          expect(trumpCardPose(p.pat + 70, p, facing).x * facing).toBeGreaterThan(0);
          disposeObject(man);
          disposeObject(trick.object);
        }
  });
  it('walks around the card on the far approach without premature body contact', () => {
    for (let i = 0; i < 12; i++) {
      const p = trumpPlan('trump-' + i);
      const end = trumpLandingPoint(p, b, view, source, -1);
      const man = makeTrump('trump-' + i);
      let previous = source;
      for (let step = 0; step <= 300; step++) {
        const point = trumpApproach(p, source, end, view, step / 300, b);
        expect(Math.hypot(point.x - previous.x, point.y - previous.y)).toBeLessThan(14);
        man.position.set(point.x, -point.y, 160);
        trumpWalk(man, step, -1, 1, p.step);
        man.updateMatrixWorld(true);
        const bodyBox = new THREE.Box3().setFromObject(requireSceneObject(man, 'jacket'));
        expect(
          bodyBox.max.x <= b.left ||
            bodyBox.min.x >= b.left + b.width ||
            -bodyBox.min.y <= b.top ||
            -bodyBox.max.y >= b.top + b.height,
        ).toBe(true);
        previous = point;
      }
      disposeObject(man);
    }
  });
  it('retains its side, readable dialogue and pat contact through edge reflow', () => {
    const trick = new TrumpTrick('trump-4');
    const man = makeTrump('trump-4');
    const p = trick.plan;
    const mobile = { left: 12, top: 440, width: 58, height: 84 };
    const end = trumpLandingPoint(p, mobile, { x: 390, y: 844 }, source);
    const facing = Math.sign(mobile.left + mobile.width / 2 - end.x);
    const desktop = trumpLandingPoint(p, b, view, source, facing);
    expect(Math.sign(b.left + b.width / 2 - desktop.x)).toBe(facing);
    for (const [bounds, point, viewport] of [
      [mobile, end, { x: 390, y: 844 }],
      [b, desktop, view],
    ] as const) {
      trick.update(p.pat * p.pace, man, bounds, point, viewport);
      const palm = requireSceneObject(
        requireSceneObject(man, facing > 0 ? 'right-arm' : 'left-arm'),
        'palm-contact',
      ).getWorldPosition(new THREE.Vector3());
      const contact = trumpContact(p, bounds, facing);
      expect(palm.x).toBeCloseTo(contact.x, 6);
      expect(-palm.y).toBeCloseTo(contact.y, 6);
      const bubble = requireSceneObject(trick.object, 'trump-dialogue');
      expect(bubble.visible).toBe(true);
      expect(bubble.userData['text']).toBe(p.phrase);
      // TrumpTrick's object is normally parented at the landing point.
      expect(bubble.position.x - bubble.scale.x / 2).toBeGreaterThanOrEqual(8);
      expect(bubble.position.x + bubble.scale.x / 2).toBeLessThanOrEqual(viewport.x - 8);
    }
    disposeObject(man);
    disposeObject(trick.object);
  });
  it('chooses the upper departure lane when the card is near the viewport bottom', () => {
    const p = trumpPlan('trump-3');
    const bounds = { ...b, top: 620 };
    const end = trumpLandingPoint(p, bounds, view, source, 1);
    const point = trumpExit(p.departure + 1450 * p.exit * 0.5, p, bounds, end, view, 1);
    expect(point.y + 48 * 0.8 + 4).toBeLessThan(bounds.top);
  });
  it('leaves physically at full size and restores every card frame without creating resources', () => {
    for (const facing of [-1, 1]) {
      const man = makeTrump('trump-1');
      const trick = new TrumpTrick('trump-1');
      const p = trick.plan;
      const end = trumpLandingPoint(p, b, view, source, facing);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      for (const root of [man, trick.object])
        root.traverse((part) => {
          if (part instanceof THREE.Mesh) geometries.add(part.geometry);
          if (part instanceof THREE.Mesh || part instanceof THREE.Sprite) {
            if (Array.isArray(part.material)) part.material.forEach((m) => materials.add(m));
            else materials.add(part.material);
          }
        });
      const counts = [geometries.size, materials.size];
      for (let ms = 0; ms <= TRUMP_DURATION; ms += 40) {
        trick.update(ms * p.pace, man, b, end, view);
        man.traverse((part) =>
          expect(
            [
              ...part.position,
              ...part.scale,
              part.rotation.x,
              part.rotation.y,
              part.rotation.z,
            ].every(Number.isFinite),
          ).toBe(true),
        );
      }
      trick.update((p.departure + 1450 * p.exit - 1) * p.pace, man, b, end, view);
      expect(man.visible).toBe(true);
      expect(man.scale.x).toBe(0.8);
      expect(facing > 0 ? man.position.x : -man.position.x).toBeGreaterThan(
        facing > 0 ? view.x + 99 : 99,
      );
      trick.update(trick.duration, man, b, end, view);
      expect(man.visible).toBe(false);
      expect(trick.object.visible).toBe(false);
      expect(trumpCardPose(TRUMP_DURATION, p, facing)).toEqual({ x: 0, y: 0, angle: 0, sx: 1 });
      const frames = trick.cardAnimation(facing);
      expect(frames.frames.at(-1)?.['translate']).toBe('0px 0px');
      expect(frames.options.duration).toBe(trick.duration);
      const afterGeometry = new Set<THREE.BufferGeometry>();
      const afterMaterial = new Set<THREE.Material>();
      for (const root of [man, trick.object])
        root.traverse((part) => {
          if (part instanceof THREE.Mesh) afterGeometry.add(part.geometry);
          if (part instanceof THREE.Mesh || part instanceof THREE.Sprite) {
            if (Array.isArray(part.material)) part.material.forEach((m) => afterMaterial.add(m));
            else afterMaterial.add(part.material);
          }
        });
      expect([afterGeometry.size, afterMaterial.size]).toEqual(counts);
      expect(afterGeometry).toEqual(geometries);
      expect(afterMaterial).toEqual(materials);
      const spies = [...geometries, ...materials].map((resource) => vi.spyOn(resource, 'dispose'));
      disposeObject(man);
      disposeObject(trick.object);
      spies.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
    }
  });
});
