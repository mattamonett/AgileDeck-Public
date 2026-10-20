import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { VALID_INTERACTION_CHARACTERS } from '@poker/shared';
import {
  landingKind,
  landingPoint,
  landingVariation,
  LandingEffect,
} from '../../landing/landing-effects';
import {
  makeZombie,
  ZombieTrick,
  zombieBitePoints,
  ZOMBIE_CONTACTS,
  zombiePlan,
  zombieApproach,
  zombieLandingPoint,
} from './zombie-trick';
import { requireSceneObject } from '../../engine/scene-object';
import { disposeObject } from '../../engine/throw-models';
import { approachPace } from '../../testing/approach-pace.testing';
import { projectileName } from '@features/room/projectile-names';

const bounds = { left: 180, top: 160, width: 100, height: 140 };
describe('Zombie', () => {
  it('is registered, chooses both sides and shares repeatable randomized bite points', () => {
    expect(VALID_INTERACTION_CHARACTERS.has('🧟')).toBe(true);
    expect(projectileName('🧟')).toBe('Zombie');
    expect(landingKind('🧟')).toBe('🧟');
    const sides = new Set(
      Array.from(
        { length: 30 },
        (_, i) => landingPoint('🧟', bounds, landingVariation(`zombie-${i}`)).x < bounds.left,
      ),
    );
    expect(sides.size).toBe(2);
    expect(zombieBitePoints('one')).toEqual(zombieBitePoints('one'));
    expect(zombieBitePoints('one')).not.toEqual(zombieBitePoints('two'));
  });
  for (const side of [0, 1]) {
    it(`syncs contact and spray, anchors effects and restores poses on side ${side}`, () => {
      const zombie = makeZombie(),
        trick = new ZombieTrick('test');
      const update = (ms: number, b = bounds, e = end) =>
        trick.update(ms * trick.plan.pace, zombie, b, e);
      const end = landingPoint('🧟', bounds, { x: side, y: 0 });
      update(ZOMBIE_CONTACTS[0] - 1);
      expect(trick.object.children.every((c) => !c.visible)).toBe(true);
      update(ZOMBIE_CONTACTS[0]);
      const p = trick.contact(0, bounds, side ? -1 : 1);
      expect(zombie.position.x + (side ? -1 : 1) * 24 * 0.8).toBeCloseTo(p.x);
      expect(-zombie.position.y - 26 * 0.8).toBeCloseTo(p.y);
      expect(trick.object.children[0]!.visible).toBe(true);
      const position = zombie.position.clone();
      update(3400);
      update(ZOMBIE_CONTACTS[0]);
      expect(zombie.position).toEqual(position);
      const moved = { ...bounds, left: 310, top: 90, height: 190 };
      update(4800, moved, landingPoint('🧟', moved, { x: side, y: 0 }));
      expect(trick.object.children[12]!.position.y).toBeCloseTo(-(moved.top + moved.height + 7));
      for (let i = 0; i < 6; i++) {
        const point = trick.contact(i, moved, side ? -1 : 1);
        expect(point.x).toBeGreaterThan(moved.left);
        expect(point.x).toBeLessThan(moved.left + moved.width);
        expect(point.y).toBeGreaterThan(moved.top);
        expect(point.y).toBeLessThan(moved.top + moved.height);
      }
      expect(zombie.getObjectByName('thought-bubble')).toBeUndefined();
      const effect = new LandingEffect('🧟', zombie, 'test');
      effect.update(effect.duration, bounds, end);
      expect(effect.object.visible).toBe(false);
      const mesh = trick.object.children[0] as THREE.Mesh;
      const spy = vi.spyOn(mesh.geometry, 'dispose');
      disposeObject(trick.object);
      disposeObject(effect.object);
      disposeObject(zombie);
      expect(spy).toHaveBeenCalledOnce();
    });
  }
  it('shares varying pace and yank strength with the card response and drags through halts without stopping dead', () => {
    const plans = Array.from({ length: 40 }, (_, i) => zombiePlan(`hungry-${i}`));
    expect(zombiePlan('hungry-3')).toEqual(plans[3]);
    expect(new Set(plans.map((p) => p.hesitation)).size).toBe(40);
    for (const plan of plans)
      for (const facing of [-1, 1]) {
        const view = { x: 390, y: 844 };
        const b = { left: facing > 0 ? 5 : 325, top: 640, width: 58, height: 84 };
        const end = zombieLandingPoint(b, { x: facing > 0 ? 0 : 1, y: 0.5 }, view);
        const start = { x: 160, y: 420 };
        expect(end.x).toBeGreaterThan(38);
        expect(end.x).toBeLessThan(view.x - 38);
        expect(zombieApproach(plan, start, end, view, 0)).toEqual(start);
        expect(zombieApproach(plan, start, end, view, 1)).toEqual(end);
        for (const from of [start, { x: 160, y: 700 }, { x: 360, y: 200 }]) {
          const pace = approachPace((t) => zombieApproach(plan, from, end, view, t));
          expect(pace.slowest).toBeGreaterThan(0.3);
          expect(pace.pace(0.3 + plan.hesitation / 2)).toBeLessThan(0.6);
          expect(pace.pace(0.7 + plan.hesitation / 4)).toBeLessThan(0.6);
        }
        let previous = start;
        for (let t = 0; t <= 1; t += 0.005) {
          const next = zombieApproach(plan, start, end, view, t);
          expect(Math.hypot(next.x - previous.x, next.y - previous.y)).toBeLessThan(15);
          previous = next;
        }
      }
  });
  it.each([-1, 1])(
    'keeps the continuous entrails in the claw through pulling and reflow (side %s)',
    (facing) => {
      const zombie = makeZombie();
      const trick = new ZombieTrick('entrails');
      const b = { left: 140, top: 100, width: 58, height: 84 };
      const end = landingPoint('🧟', b, { x: facing > 0 ? 0 : 1, y: 0.5 });
      for (const ms of [4300, 4550, 4850, 5200]) {
        trick.update(ms * trick.plan.pace, zombie, b, end);
        const grip = requireSceneObject(
          requireSceneObject(zombie, 'arm--1'),
          'hand',
        ).getWorldPosition(new THREE.Vector3());
        const strands: THREE.Mesh[] = [];
        trick.object.traverse((part) => {
          if (part instanceof THREE.Mesh && !part.frustumCulled) strands.push(part);
        });
        expect(strands).toHaveLength(2);
        for (const strand of strands) {
          const vertices = strand.geometry.getAttribute('position');
          const center = new THREE.Vector3();
          for (let i = vertices.count - 8; i < vertices.count; i++)
            center.add(new THREE.Vector3().fromBufferAttribute(vertices, i));
          center.divideScalar(8);
          expect(center.x).toBeCloseTo(grip.x, 3);
          expect(center.y).toBeCloseTo(grip.y, 3);
          for (let i = 0; i < vertices.count; i++)
            expect(Number.isFinite(vertices.getX(i)) && Number.isFinite(vertices.getY(i))).toBe(
              true,
            );
        }
      }
      const animation = trick.cardAnimation(facing);
      expect(animation.options.duration).toBe(5600 * trick.plan.pace);
      expect(animation.frames.at(-1)?.['translate']).toBe('0px 0px');
      expect(animation.frames.at(-1)?.['scale']).toBe('1 1');
      trick.update(trick.duration, zombie, b, end);
      const entrails = trick.object.children.at(-1);
      expect(entrails?.visible).toBe(false);
      disposeObject(trick.object);
      disposeObject(zombie);
    },
  );
});
