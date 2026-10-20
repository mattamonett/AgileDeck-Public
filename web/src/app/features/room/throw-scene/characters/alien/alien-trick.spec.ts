import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AlienTrick, alienTravel, makeAlien } from './alien-trick';
import {
  alienPlan,
  alienLandingPoint,
  alienApproach,
  alienCardPoint,
  alienCardPose,
  alienCardAnimation,
  ALIEN_DURATION,
} from './alien-choreography';
import { LandingEffect } from '../../landing/landing-effects';
import { requireSceneObject } from '../../engine/scene-object';
import { disposeObject } from '../../engine/throw-models';
import { approachPace } from '../../testing/approach-pace.testing';

const bounds = { left: 200, top: 100, width: 84, height: 122 };
const viewport = { x: 650, y: 500 };
describe('alien inspection', () => {
  it('preserves the reveal flip origin while lifting the same edge at desktop and mobile sizes', () => {
    for (const facing of [-1, 1])
      for (const width of [58, 84]) {
        const b = { ...bounds, width, height: width === 58 ? 84 : 122 };
        const plan = { ...alienPlan('pivot'), tilt: 12 };
        const animation = alienCardAnimation(facing, plan, b);
        for (const frame of animation.frames) {
          expect(frame['transformOrigin']).toBe('50% 50%');
          const [dx, dy] = String(frame['translate']).split(' ').map(parseFloat);
          if (
            dx === undefined ||
            dy === undefined ||
            frame.offset === undefined ||
            frame.offset === null
          )
            throw new Error('Incomplete card frame');
          const angle = (parseFloat(String(frame['rotate'])) * Math.PI) / 180;
          const u = facing > 0 ? 0 : 1;
          const x = (u - 0.5) * b.width;
          const y = b.height / 2;
          const actual = {
            x: b.left + b.width / 2 + x * Math.cos(angle) - y * Math.sin(angle) + dx,
            y: b.top + b.height / 2 + x * Math.sin(angle) + y * Math.cos(angle) + dy,
          };
          const edge = alienCardPoint(plan, b, frame.offset * 3300, facing, u, 1);
          expect(actual.x).toBeCloseTo(edge.x, 5);
          expect(actual.y).toBeCloseTo(edge.y, 5);
        }
      }
  });
  it('maintains the grip after reflow to small cards at the top and bottom of the viewport', () => {
    const view = { x: 390, y: 844 };
    const plan = { ...alienPlan('reflow'), malfunction: false };
    const actor = makeAlien();
    const trick = new AlienTrick('reflow', plan);
    for (const left of [4, 320])
      for (const top of [0, 760]) {
        const b = { left, top, width: 58, height: 84 };
        const end = alienLandingPoint(plan, b, view);
        const facing = end.x < b.left ? 1 : -1;
        for (const ms of [400, 1200, 2500]) {
          trick.update(ms * plan.pace, actor, b, end, view);
          const expected = alienCardPoint(plan, b, ms, facing, facing > 0 ? 0.015 : 0.985, 0.94);
          const actual = requireSceneObject(actor, 'lifting-hand').getWorldPosition(
            new THREE.Vector3(),
          );
          expect(Math.hypot(actual.x - expected.x, actual.y + expected.y)).toBeLessThan(0.5);
        }
      }
    disposeObject(actor);
    disposeObject(trick.object);
  });
  it('reproduces an event while varying all stages across events', () => {
    const plans = Array.from({ length: 40 }, (_, i) => alienPlan(`alien-${i}`));
    expect(alienPlan('same')).toEqual(alienPlan('same'));
    expect(new Set(plans.map((p) => p.side)).size).toBe(2);
    expect(new Set(plans.map((p) => p.malfunction)).size).toBe(2);
    expect(new Set(plans.map((p) => p.scans)).size).toBe(2);
    for (const field of ['pace', 'bend', 'hesitation', 'tilt', 'exitDistance'] as const)
      expect(new Set(plans.map((p) => p[field])).size).toBeGreaterThan(30);
  });
  it('uses either side, stays inside narrow viewports, and arrives continuously after reflow', () => {
    for (const side of [-1, 1])
      for (const left of [4, 110, 265]) {
        const plan = { ...alienPlan('edge'), side };
        const b = { ...bounds, left };
        const view = { x: 360, y: 400 };
        const end = alienLandingPoint(plan, b, view);
        const facing = end.x < b.left ? 1 : -1;
        const start = { x: 170, y: 285 };
        expect(alienApproach(plan, start, end, facing, view, 0)).toEqual(start);
        expect(alienApproach(plan, start, end, facing, view, 1)).toEqual(end);
        for (let i = 0; i <= 100; i++) {
          const p = alienApproach(plan, start, end, facing, view, i / 100);
          expect(p.x).toBeGreaterThanOrEqual(23);
          expect(p.x).toBeLessThanOrEqual(337);
          expect(p.y).toBeGreaterThanOrEqual(52);
          expect(p.y).toBeLessThanOrEqual(372);
        }
        const near = alienApproach(plan, start, end, facing, view, 0.999);
        expect(Math.hypot(near.x - end.x, near.y - end.y)).toBeLessThan(0.01);
      }
  });
  it('creeps through its curious hesitation without ever stopping dead on the approach', () => {
    for (let i = 0; i < 40; i++)
      for (const [b, start, view] of [
        [bounds, { x: 560, y: 420 }, viewport],
        [
          { ...bounds, left: 4 },
          { x: 170, y: 285 },
          { x: 360, y: 400 },
        ],
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
        const plan = alienPlan(`alien-${i}`);
        const end = alienLandingPoint(plan, b, view);
        const facing = end.x < b.left ? 1 : -1;
        const pace = approachPace((t) => alienApproach(plan, start, end, facing, view, t));
        expect(pace.slowest).toBeGreaterThan(0.3);
      }
  });
  it('keeps articulated hands on the lifting edge and probe contact for both sides and timing extremes', () => {
    for (const facing of [-1, 1])
      for (const pace of [0.9, 1.12])
        for (const tilt of [8, 12]) {
          const plan = { ...alienPlan('contact'), side: facing, pace, tilt, malfunction: false };
          const alien = makeAlien();
          const trick = new AlienTrick('contact', plan);
          const end = alienLandingPoint(plan, bounds, viewport);
          for (const ms of [400, 850, 1100, 1600, 2200, 2550, 2990]) {
            trick.update(ms * pace, alien, bounds, end, viewport);
            const point = alienCardPoint(
              plan,
              bounds,
              ms,
              facing,
              facing > 0 ? 0.015 : 0.985,
              0.94,
            );
            const actual = requireSceneObject(alien, 'lifting-hand').getWorldPosition(
              new THREE.Vector3(),
            );
            expect(Math.hypot(actual.x - point.x, actual.y + point.y)).toBeLessThan(0.5);
            if (ms >= 1100 && ms <= 2200) {
              const fraction = (Math.sin(((ms - 1000) / 1200) * Math.PI * 2 * plan.scans) + 1) / 2;
              const target = alienCardPoint(
                plan,
                bounds,
                ms,
                facing,
                facing > 0 ? 0.06 + fraction * 0.12 : 0.94 - fraction * 0.12,
                0.92,
              );
              const tip = requireSceneObject(alien, 'probe-tip').getWorldPosition(
                new THREE.Vector3(),
              );
              expect(Math.hypot(tip.x - target.x, tip.y + target.y)).toBeLessThan(0.5);
            }
          }
          disposeObject(alien);
          disposeObject(trick.object);
        }
  });
  it('shares card timing, settles completely, plants idle feet, and cleans up on completion', () => {
    for (let i = 0; i < 12; i++) {
      const id = `alien-${i}`;
      const plan = alienPlan(id);
      const alien = makeAlien();
      const landing = new LandingEffect('👽', alien, id);
      const end = alienLandingPoint(plan, bounds, viewport);
      const facing = end.x < bounds.left ? 1 : -1;
      const animation = landing.cardAnimation(facing);
      if (!animation) throw new Error('Alien card animation missing');
      expect(animation.options.duration).toBe(3300 * plan.pace);
      expect(animation.frames.at(-1)?.['rotate']).toBe('0deg');
      expect(animation.frames.at(-1)?.['translate']).toBe('0px 0px');
      alienTravel(alien, plan, 1, facing, 150);
      expect(requireSceneObject(alien, 'left-leg').rotation.z).toBe(0);
      for (let ms = 0; ms < ALIEN_DURATION; ms += 90) {
        landing.update(ms * plan.pace, bounds, end, viewport);
        alien.traverse((part) => {
          expect(
            [
              ...part.position,
              ...part.scale,
              part.rotation.x,
              part.rotation.y,
              part.rotation.z,
            ].every(Number.isFinite),
          ).toBe(true);
        });
      }
      expect(alienCardPose(plan, 3300, facing).angle).toBeCloseTo(0);
      landing.update(landing.duration, bounds, end, viewport);
      expect(landing.object.visible).toBe(false);
      expect(alien.visible).toBe(false);
      disposeObject(alien);
      disposeObject(landing.object);
      expect(alien.parent).toBeNull();
    }
  });
});
