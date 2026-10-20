import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ProjectileSchema } from '@poker/shared';
import { makeWrestler, wrestlerWalk, WrestlerTrick } from './wrestler-trick';
import {
  wrestlerPlan,
  wrestlerLandingPoint,
  wrestlerApproach,
  wrestlerContact,
  wrestlerCardPoint,
  wrestlerCardPose,
  wrestlerFeet,
  WRESTLER_DURATION,
} from './wrestler-choreography';
import { LandingEffect, landingKind } from '../../landing/landing-effects';
import { requireSceneObject as part } from '../../engine/scene-object';
import { disposeObject } from '../../engine/throw-models';
import { approachPace } from '../../testing/approach-pace.testing';
import { wrestlerCharacter } from './wrestler-character';
const b = { left: 360, top: 270, width: 84, height: 122 },
  view = { x: 900, y: 760 },
  source = { x: 100, y: 330 };
function pos(root: THREE.Object3D, name: string) {
  return part(root, name).getWorldPosition(new THREE.Vector3());
}
describe('John Schlee-na', () => {
  it('preserves the identifier and shares event choices across every phase', () => {
    expect(ProjectileSchema.safeParse({ targetUserId: 'player', emoji: '🤼' }).success).toBe(true);
    expect(landingKind('🤼')).toBe('🤼');
    expect(wrestlerPlan('same')).toEqual(wrestlerPlan('same'));
    const plans = Array.from({ length: 40 }, (_, i) => wrestlerPlan('wrestler-' + i));
    for (const key of [
      'pace',
      'hit',
      'force',
      'pause',
      'detour',
      'step',
      'departure',
      'exit',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBeGreaterThan(20);
    expect(new Set(plans.map((p) => p.wave))).toEqual(new Set([true, false]));
    for (const p of plans) {
      expect(p.departure + 180 + 1550 * p.exit).toBeLessThan(WRESTLER_DURATION);
      const end = wrestlerLandingPoint(p, b, view, source);
      expect(wrestlerApproach(p, source, end, view, 0, b)).toEqual(source);
      expect(wrestlerApproach(p, source, end, view, 1, b)).toEqual(end);
    }
  });
  it('sizes up the card on the move and rounds the lane corners without stopping dead', () => {
    for (let seed = 0; seed < 20; seed++)
      for (const facing of [-1, 1])
        for (const from of [source, { x: 800, y: 640 }]) {
          const p = wrestlerPlan('wrestler-' + seed),
            end = wrestlerLandingPoint(p, b, view, from, facing);
          const pace = approachPace((t) => wrestlerApproach(p, from, end, view, t, b));
          expect(pace.slowest).toBeGreaterThan(0.3);
          expect(pace.pace(0.72 + p.pause / 2)).toBeLessThan(1);
        }
  });
  it('keeps fixed connected limbs and puts the actual sleeve on the deformed card', () => {
    for (let seed = 0; seed < 6; seed++)
      for (const facing of [-1, 1])
        for (const size of [
          { width: 84, height: 122 },
          { width: 58, height: 84 },
        ]) {
          const bounds = { ...b, ...size },
            man = makeWrestler(),
            trick = new WrestlerTrick('wrestler-' + seed),
            p = trick.plan,
            end = wrestlerLandingPoint(p, bounds, view, source, facing);
          for (let ms = 0; ms <= p.departure; ms += 35) {
            trick.update(ms * p.pace, man, bounds, end, view);
            for (const side of ['left', 'right']) {
              for (const bone of ['upper-arm', 'forearm'])
                expect(
                  part(part(man, side + '-arm'), bone).scale.y,
                  `${seed} ${facing} ${ms} ${bone}`,
                ).toBeCloseTo(22, 6);
              for (const bone of ['thigh', 'shin'])
                expect(
                  part(part(man, side + '-leg'), bone).scale.y,
                  `${seed} ${facing} ${ms} ${bone}`,
                ).toBeCloseTo(24, 6);
            }
            if (ms >= p.hit && ms <= p.hit + 180) {
              const sleeve = pos(
                  part(man, facing > 0 ? 'right-arm' : 'left-arm'),
                  'shoulder-contact',
                ),
                at = wrestlerCardPoint(p, ms, wrestlerContact(p, bounds, facing), bounds, facing);
              expect(sleeve.x).toBeCloseTo(at.x, 6);
              expect(-sleeve.y).toBeCloseTo(at.y, 6);
              expect(sleeve.z).toBeCloseTo(172, 6);
            }
          }
          disposeObject(man);
          disposeObject(trick.object);
        }
  });
  it('keeps the card still until contact, compresses it in the hit direction and restores it', () => {
    const man = makeWrestler(),
      effect = new LandingEffect('🤼', man, 'wrestler-0'),
      p = effect.planOf(wrestlerCharacter);
    if (!p) throw new Error('plan');
    for (const facing of [-1, 1]) {
      const before = wrestlerCardPose(p, p.hit - 1, facing),
        hit = wrestlerCardPose(p, p.hit + 100, facing);
      expect(before).toEqual({ x: 0, y: 0, angle: 0, sx: 1, sy: 1 });
      expect(hit.x * facing).toBeGreaterThan(10);
      expect(hit.sx).toBeLessThan(1);
      expect(hit.sy).toBeGreaterThan(1);
      expect(effect.cardAnimation(facing)?.options.duration).toBe(effect.duration);
      expect(effect.cardAnimation(facing)?.frames.at(-1)).toEqual({
        offset: 1,
        translate: '0px 0px',
        rotate: '0deg',
        scale: '1 1',
      });
    }
    disposeObject(man);
    disposeObject(effect.object);
  });
  it('steps back on actual boots, then plants both supports for the victory pose', () => {
    for (const facing of [-1, 1]) {
      const man = makeWrestler(),
        trick = new WrestlerTrick('wrestler-2'),
        p = trick.plan,
        end = wrestlerLandingPoint(p, b, view, source, facing);
      for (const side of [-1, 1]) {
        const start = p.hit + 300 + (side === facing ? 0 : 380),
          middle = wrestlerFeet(p, start + 190, end, facing, side);
        expect(middle.y).toBeLessThan(end.y + 54 * 0.8 - 4.9);
        trick.update((start + 190) * p.pace, man, b, end, view);
        const shoe = pos(part(man, side > 0 ? 'right-leg' : 'left-leg'), 'boot');
        expect(shoe.x).toBeCloseTo(middle.x, 6);
        expect(-shoe.y).toBeCloseTo(middle.y, 6);
      }
      trick.update((p.hit + 1500) * p.pace, man, b, end, view);
      const boots = ['left-leg', 'right-leg'].map((name) => pos(part(man, name), 'boot'));
      for (const side of [-1, 1]) {
        const arm = part(man, side > 0 ? 'right-arm' : 'left-arm');
        expect((pos(arm, 'elbow').x - pos(arm, 'hand').x) * side).toBeGreaterThan(5);
      }
      trick.update((p.hit + 2200) * p.pace, man, b, end, view);
      boots.forEach((boot, i) =>
        expect(pos(part(man, i ? 'right-leg' : 'left-leg'), 'boot').distanceTo(boot)).toBeLessThan(
          1e-6,
        ),
      );
      wrestlerWalk(man, 10, facing, 0, p.step);
      const shoe = pos(man, 'boot');
      wrestlerWalk(man, 80, facing, 0, p.step);
      expect(pos(man, 'boot').distanceTo(shoe)).toBeLessThan(1e-6);
      disposeObject(man);
      disposeObject(trick.object);
    }
  });
  it('touches the actual cap brim or waves the open hand in front of the face', () => {
    for (let seed = 0; seed < 12; seed++)
      for (const facing of [-1, 1]) {
        const man = makeWrestler(),
          trick = new WrestlerTrick('wrestler-' + seed),
          p = trick.plan,
          end = wrestlerLandingPoint(p, b, view, source, facing);
        trick.update((p.hit + 2100) * p.pace, man, b, end, view);
        const arm = part(man, facing > 0 ? 'right-arm' : 'left-arm'),
          hand = part(arm, 'hand');
        expect(part(hand, 'finger-0').rotation.x).toBe(0);
        if (p.wave) {
          const at = hand.getWorldPosition(new THREE.Vector3()),
            face = pos(man, 'head');
          expect(at.z).toBeGreaterThan(face.z + 15);
          expect(Math.abs(at.x - face.x)).toBeLessThan(8);
        } else {
          const fingertip = pos(hand, 'fingertip'),
            brim = part(man, 'orange-brim').localToWorld(new THREE.Vector3(facing * 0.5, 0, 0.86));
          expect(fingertip.distanceTo(brim)).toBeLessThan(1e-6);
        }
        disposeObject(man);
        disposeObject(trick.object);
      }
  });
  it('retains the contact side and adapts sleeve alignment to current card geometry', () => {
    const man = makeWrestler(),
      trick = new WrestlerTrick('wrestler-3'),
      p = trick.plan,
      mobile = { left: 12, top: 430, width: 58, height: 84 };
    const first = wrestlerLandingPoint(p, mobile, { x: 390, y: 844 }, source),
      facing = Math.sign(mobile.left + mobile.width / 2 - first.x),
      end = wrestlerLandingPoint(p, b, view, source, facing);
    expect(Math.sign(b.left + b.width / 2 - end.x)).toBe(facing);
    for (const [bounds, point] of [
      [mobile, first],
      [b, end],
    ] as const) {
      const ms = p.hit + 100;
      trick.update(ms * p.pace, man, bounds, point, view);
      const sleeve = pos(part(man, facing > 0 ? 'right-arm' : 'left-arm'), 'shoulder-contact'),
        hit = wrestlerCardPoint(p, ms, wrestlerContact(p, bounds, facing), bounds, facing);
      expect(sleeve.x).toBeCloseTo(hit.x, 6);
      expect(-sleeve.y).toBeCloseTo(hit.y, 6);
    }
    disposeObject(man);
    disposeObject(trick.object);
  });
  it('physically jogs out at full size and completely disposes bounded effects', () => {
    const man = makeWrestler(),
      trick = new WrestlerTrick('wrestler-2'),
      p = trick.plan,
      end = wrestlerLandingPoint(p, b, view, source, 1);
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    const collect = () => {
      for (const root of [man, trick.object])
        root.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            resources.add(node.geometry);
            if (Array.isArray(node.material)) node.material.forEach((mat) => resources.add(mat));
            else resources.add(node.material);
          }
        });
    };
    collect();
    const count = resources.size;
    for (let ms = 0; ms <= WRESTLER_DURATION; ms += 40) {
      trick.update(ms * p.pace, man, b, end, view);
      for (const root of [man, trick.object])
        root.traverse((node) =>
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
    expect(resources.size).toBe(count);
    trick.update((p.departure + 180 + 1550 * p.exit - 1) * p.pace, man, b, end, view);
    expect(man.visible).toBe(true);
    expect(man.scale.x).toBe(0.8);
    expect(man.position.x).toBeLessThan(-99);
    trick.update(trick.duration, man, b, end, view);
    expect(man.visible).toBe(false);
    expect(trick.object.visible).toBe(false);
    const spies = [...resources].map((resource) => vi.spyOn(resource, 'dispose'));
    disposeObject(man);
    disposeObject(trick.object);
    spies.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
  });
});
