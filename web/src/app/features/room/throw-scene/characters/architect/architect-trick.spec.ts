import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ArchitectTrick, makeArchitect } from './architect-trick';
import {
  architectPlan,
  architectLandingPoint,
  architectApproach,
  architectPen,
  architectInkPoint,
  architectWipe,
  architectCardPoint,
  ARCHITECT_DURATION,
} from './architect-choreography';
import { requireSceneObject } from '../../engine/scene-object';
import { disposeObject } from '../../engine/throw-models';
import { approachPace } from '../../testing/approach-pace.testing';
import { architectStrokes } from './architect-drawing';
const b = { left: 360, top: 270, width: 84, height: 122 };
const view = { x: 800, y: 760 },
  source = { x: 100, y: 330 };
function part(root: THREE.Object3D, name: string) {
  return requireSceneObject(root, name);
}
describe('Architect', () => {
  it('shares reproducible varied approach, wiping, writing, presentation and departure choices', () => {
    expect(architectPlan('same')).toEqual(architectPlan('same'));
    const plans = Array.from({ length: 40 }, (_, i) => architectPlan('architect-' + i));
    for (const key of [
      'pace',
      'wipe',
      'drawEnd',
      'pressure',
      'pause',
      'detour',
      'step',
      'departure',
      'exit',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBeGreaterThan(20);
    expect(new Set(plans.map((p) => p.glasses))).toEqual(new Set([true, false]));
    expect(plans.every((p) => p.departure + 180 + 1300 * p.exit < ARCHITECT_DURATION)).toBe(true);
    const p = plans[0];
    if (!p) throw new Error('plan');
    const end = architectLandingPoint(p, b, view, source);
    expect(architectApproach(p, source, end, view, 0, b)).toEqual(source);
    expect(architectApproach(p, source, end, view, 1, b)).toEqual(end);
    expect(p.strokes).toHaveLength(architectStrokes.length);
  });
  it('walks on through its considered beat and rounds the lane corners without stopping dead', () => {
    for (let seed = 0; seed < 20; seed++)
      for (const facing of [-1, 1])
        for (const from of [source, { x: 700, y: 640 }]) {
          const p = architectPlan('architect-' + seed),
            end = architectLandingPoint(p, b, view, from, facing);
          const pace = approachPace((t) => architectApproach(p, from, end, view, t, b));
          expect(pace.slowest).toBeGreaterThan(0.3);
          expect(pace.pace(0.68 + p.pause / 2)).toBeLessThan(1);
        }
  });
  it('keeps limbs fixed, props gripped and both physical tips on current card strokes', () => {
    for (let seed = 0; seed < 6; seed++)
      for (const facing of [-1, 1])
        for (const size of [
          { width: 84, height: 122 },
          { width: 58, height: 84 },
        ]) {
          const bounds = { ...b, ...size };
          const man = makeArchitect(),
            trick = new ArchitectTrick('architect-' + seed),
            p = trick.plan;
          const end = architectLandingPoint(p, bounds, view, source, facing);
          for (let ms = 0; ms <= p.drawEnd + 1200; ms += 35) {
            trick.update(ms * p.pace, man, bounds, end, view);
            man.updateMatrixWorld(true);
            for (const side of [-1, 1]) {
              const arm = part(man, side > 0 ? 'right-arm' : 'left-arm'),
                leg = part(man, side > 0 ? 'right-leg' : 'left-leg');
              for (const name of ['upper-arm', 'forearm'])
                expect(part(arm, name).scale.y, `${seed} ${facing} ${ms} ${name}`).toBeCloseTo(
                  22,
                  6,
                );
              for (const name of ['thigh', 'shin'])
                expect(part(leg, name).scale.y, `${ms} ${name}`).toBeCloseTo(19, 6);
            }
            if (ms < p.wipe) {
              const q = architectWipe(ms, p);
              const raw = {
                x:
                  bounds.left + 4 + (facing > 0 ? q.point[0] : 1 - q.point[0]) * (bounds.width - 8),
                y: bounds.top + 4 + q.point[1] * (bounds.height - 8),
              };
              const at = architectCardPoint(ms, raw, p, bounds, facing),
                tip = part(man, 'eraser-contact').getWorldPosition(new THREE.Vector3());
              expect(tip.x).toBeCloseTo(at.x, 6);
              expect(-tip.y).toBeCloseTo(at.y, 6);
              expect(tip.z).toBeCloseTo(172, 6);
            } else if (ms >= p.drawStart && ms <= p.drawEnd) {
              const point = architectInkPoint(architectPen(p, ms).point, bounds),
                tip = part(man, 'marker-tip').getWorldPosition(new THREE.Vector3());
              expect(tip.x).toBeCloseTo(point.x, 6);
              expect(-tip.y).toBeCloseTo(point.y, 6);
              expect(tip.z).toBeCloseTo(172, 6);
              const stroke = architectPen(p, ms).stroke;
              const dot = trick.object.children
                .filter(
                  (node) =>
                    node.visible && node.name.startsWith('architect-ink-tip-' + stroke + '-'),
                )
                .at(-1);
              if (architectPen(p, ms).drawing && dot) {
                expect(dot.position.x).toBeCloseTo(tip.x, 6);
                expect(dot.position.y).toBeCloseTo(tip.y, 6);
                expect(dot.position.z + 150).toBeCloseTo(tip.z, 6);
              }
            }
            if (ms < p.drawEnd + 450) {
              for (const name of ['green-marker', 'eraser'])
                expect(part(man, name).parent?.name).toBe('hand');
            }
          }
          disposeObject(man);
          disposeObject(trick.object);
        }
  });
  it('swaps tools and stows them without separating either prop from its actual palm', () => {
    const man = makeArchitect(),
      trick = new ArchitectTrick('architect-0'),
      p = trick.plan,
      end = architectLandingPoint(p, b, view, source, 1);
    for (const time of [
      p.wipe + 259.999,
      p.wipe + 260.001,
      p.drawEnd + 449.999,
      p.drawEnd + 450.001,
    ]) {
      trick.update(time * p.pace, man, b, end, view);
      man.updateMatrixWorld(true);
      const marker = part(man, 'green-marker').getWorldPosition(new THREE.Vector3()),
        eraser = part(man, 'eraser').getWorldPosition(new THREE.Vector3());
      const hands = ['right-arm', 'left-arm'].map((name) =>
        part(part(man, name), 'grip-contact').getWorldPosition(new THREE.Vector3()),
      );
      if (time < p.drawEnd) {
        expect(Math.min(...hands.map((hand) => hand.distanceTo(marker)))).toBeLessThan(1e-6);
        expect(Math.min(...hands.map((hand) => hand.distanceTo(eraser)))).toBeLessThan(1e-6);
      } else {
        expect(Math.min(...hands.map((hand) => hand.distanceTo(marker)))).toBeLessThan(0.001);
        expect(Math.min(...hands.map((hand) => hand.distanceTo(eraser)))).toBeLessThan(0.001);
      }
    }
    disposeObject(man);
    disposeObject(trick.object);
  });
  it('retains the chosen side and follows new native card geometry through resize', () => {
    const man = makeArchitect(),
      trick = new ArchitectTrick('architect-3'),
      p = trick.plan;
    const mobile = { left: 12, top: 430, width: 58, height: 84 };
    const end = architectLandingPoint(p, mobile, { x: 390, y: 844 }, source);
    const facing = Math.sign(mobile.left + mobile.width / 2 - end.x);
    const moved = architectLandingPoint(p, b, view, source, facing);
    expect(Math.sign(b.left + b.width / 2 - moved.x)).toBe(facing);
    const time = p.drawStart + 1200;
    for (const [bounds, point] of [
      [mobile, end],
      [b, moved],
    ] as const) {
      trick.update(time * p.pace, man, bounds, point, view);
      const tip = part(man, 'marker-tip').getWorldPosition(new THREE.Vector3());
      const target = architectInkPoint(architectPen(p, time).point, bounds);
      expect(tip.x).toBeCloseTo(target.x, 6);
      expect(-tip.y).toBeCloseTo(target.y, 6);
    }
    disposeObject(man);
    disposeObject(trick.object);
  });
  it('plants both shoes for the proud check and touches the real glasses frame', () => {
    for (const facing of [-1, 1]) {
      const man = makeArchitect(),
        trick = new ArchitectTrick('architect-2'),
        p = trick.plan,
        end = architectLandingPoint(p, b, view, source, facing);
      expect(p.glasses).toBe(true);
      trick.update((p.drawEnd + 850) * p.pace, man, b, end, view);
      man.updateMatrixWorld(true);
      const hand = part(
        part(man, facing > 0 ? 'left-arm' : 'right-arm'),
        'grip-contact',
      ).getWorldPosition(new THREE.Vector3());
      const glasses = part(man, facing > 0 ? 'left-glasses' : 'right-glasses').localToWorld(
        new THREE.Vector3(-facing * 4.5, 0, 0),
      );
      expect(hand.distanceTo(glasses)).toBeLessThan(1e-6);
      const shoes = ['left-leg', 'right-leg'].map((name) =>
        part(part(man, name), 'shoe').getWorldPosition(new THREE.Vector3()),
      );
      trick.update((p.drawEnd + 1000) * p.pace, man, b, end, view);
      shoes.forEach((at, i) => {
        const name = i ? 'right-leg' : 'left-leg';
        expect(
          part(part(man, name), 'shoe').getWorldPosition(new THREE.Vector3()).distanceTo(at),
        ).toBeLessThan(1e-6);
      });
      disposeObject(man);
      disposeObject(trick.object);
    }
  });
  it('keeps resources bounded, leaves physically at full size and restores the whiteboard', () => {
    const man = makeArchitect(),
      trick = new ArchitectTrick('architect-2'),
      p = trick.plan,
      end = architectLandingPoint(p, b, view, source, 1);
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>();
    const collect = () => {
      for (const root of [man, trick.object])
        root.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            geometries.add(node.geometry);
            if (Array.isArray(node.material)) node.material.forEach((m) => materials.add(m));
            else materials.add(node.material);
          }
        });
    };
    collect();
    const count = [geometries.size, materials.size];
    for (let ms = 0; ms < ARCHITECT_DURATION; ms += 40) {
      trick.update(ms * p.pace, man, b, end, view);
      man.traverse((node) =>
        expect(
          [
            ...node.position,
            ...node.scale,
            node.rotation.x,
            node.rotation.y,
            node.rotation.z,
          ].every(Number.isFinite),
        ).toBe(true),
      );
    }
    collect();
    expect([geometries.size, materials.size]).toEqual(count);
    trick.update((p.departure + 180 + 1300 * p.exit - 1) * p.pace, man, b, end, view);
    expect(man.visible).toBe(true);
    expect(man.scale.x).toBe(0.9);
    expect(man.position.x).toBeLessThan(-99);
    trick.update(trick.duration, man, b, end, view);
    expect(man.visible).toBe(false);
    expect(trick.object.visible).toBe(false);
    expect(trick.cardAnimation(1).frames.at(-1)?.['translate']).toBe('0px 0px');
    const spies = [...geometries, ...materials].map((resource) => vi.spyOn(resource, 'dispose'));
    disposeObject(man);
    disposeObject(trick.object);
    spies.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
  });
});
