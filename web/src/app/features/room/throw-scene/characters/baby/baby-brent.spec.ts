import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ProjectileSchema } from '@poker/shared';
import { makeBabyBrent, babyCrawl } from './baby-brent';
import { BabyTrick } from './baby-trick';
import {
  babyPlan,
  babyLandingPoint,
  babyApproach,
  babyApproachFacing,
  babyCardPoint,
  babyCardPose,
  BABY_DURATION,
  BABY_SCALE,
} from './baby-choreography';
import { LandingEffect, landingKind } from '../../landing/landing-effects';
import { disposeObject } from '../../engine/throw-models';
import { requireSceneObject as part } from '../../engine/scene-object';
import { approachPace } from '../../testing/approach-pace.testing';
import { babyCharacter } from './baby-character';
const b = { left: 360, top: 270, width: 84, height: 122 },
  view = { x: 800, y: 760 },
  source = { x: 100, y: 330 };
function pos(root: THREE.Object3D, name: string) {
  return part(root, name).getWorldPosition(new THREE.Vector3());
}
describe('Baby Brent', () => {
  it('preserves the identifier and shares reproducible variation throughout the performance', () => {
    expect(ProjectileSchema.safeParse({ targetUserId: 'player', emoji: '👶' }).success).toBe(true);
    expect(landingKind('👶')).toBe('👶');
    expect(babyPlan('same')).toEqual(babyPlan('same'));
    const plans = Array.from({ length: 40 }, (_, i) => babyPlan('baby-' + i));
    for (const key of [
      'pace',
      'pause',
      'detour',
      'step',
      'pat',
      'discovery',
      'force',
      'departure',
      'exit',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBeGreaterThan(20);
    expect(new Set(plans.map((p) => p.wipe))).toEqual(new Set([true, false]));
    expect(new Set(plans.map((p) => p.sobs.length))).toEqual(new Set([3, 4]));
    for (const p of plans) {
      expect(p.departure + 420 + 1700 * p.exit).toBeLessThan(BABY_DURATION);
      const end = babyLandingPoint(p, b, view, source);
      expect(babyApproach(p, source, end, view, 0, b)).toEqual(source);
      expect(babyApproach(p, source, end, view, 1, b)).toEqual(end);
    }
  });
  it('keeps crawling slowly through its hesitation and around the lane corners without stopping dead', () => {
    for (let seed = 0; seed < 20; seed++)
      for (const facing of [-1, 1])
        for (const from of [source, { x: 700, y: 640 }]) {
          const p = babyPlan('baby-' + seed),
            end = babyLandingPoint(p, b, view, from, facing);
          const pace = approachPace((t) => babyApproach(p, from, end, view, t, b));
          expect(pace.slowest).toBeGreaterThan(0.3);
          expect(pace.pace(0.55 + p.pause / 2)).toBeLessThan(1);
        }
  });
  it('keeps both crawl and sitting limbs connected at fixed lengths, without movement when the stride is zero', () => {
    for (let seed = 0; seed < 6; seed++)
      for (const facing of [-1, 1])
        for (const size of [
          { width: 84, height: 122 },
          { width: 58, height: 84 },
        ]) {
          const bounds = { ...b, ...size },
            baby = makeBabyBrent(),
            trick = new BabyTrick('baby-' + seed),
            p = trick.plan,
            end = babyLandingPoint(p, bounds, view, source, facing);
          for (let ms = 0; ms <= BABY_DURATION; ms += 45) {
            trick.update(ms * p.pace, baby, bounds, end, view);
            for (const name of ['left', 'right']) {
              const arm = part(baby, name + '-arm'),
                leg = part(baby, name + '-leg');
              for (const bone of ['upper-arm', 'forearm'])
                expect(part(arm, bone).scale.y, `${seed} ${facing} ${ms} ${bone}`).toBeCloseTo(
                  18,
                  6,
                );
              for (const bone of ['thigh', 'shin'])
                expect(part(leg, bone).scale.y, `${seed} ${facing} ${ms} ${bone}`).toBeCloseTo(
                  14,
                  6,
                );
            }
          }
          baby.position.set(end.x, -end.y, 165);
          babyCrawl(baby, 10, facing, 0, p.step);
          const at = pos(baby, 'hand');
          babyCrawl(baby, 80, facing, 0, p.step);
          expect(pos(baby, 'hand').distanceTo(at)).toBeLessThan(1e-6);
          for (const name of ['left-leg', 'right-leg']) {
            const knee = pos(part(baby, name), 'knee');
            expect(-knee.y + 5.2 * BABY_SCALE).toBeCloseTo(end.y + 26.2 * BABY_SCALE, 6);
          }
          disposeObject(baby);
          disposeObject(trick.object);
        }
  });
  it('puts the actual palm on the responding card on either side and after live reflow', () => {
    const baby = makeBabyBrent(),
      effect = new LandingEffect('👶', baby, 'baby-0'),
      p = effect.planOf(babyCharacter);
    if (!p) throw new Error('baby plan');
    for (const facing of [-1, 1])
      for (const bounds of [b, { left: 12, top: 430, width: 58, height: 84 }]) {
        const end = babyLandingPoint(p, bounds, view, source, facing);
        effect.update(p.pat * p.pace, bounds, end, view);
        const hand = part(
          part(baby, facing > 0 ? 'right-arm' : 'left-arm'),
          'hand',
        ).getWorldPosition(new THREE.Vector3());
        const contact = babyCardPoint(
          p,
          p.pat,
          {
            x: facing > 0 ? bounds.left + 1 : bounds.left + bounds.width - 1,
            y: bounds.top + bounds.height * 0.91,
          },
          bounds,
          facing,
        );
        expect(hand.x).toBeCloseTo(contact.x, 6);
        expect(-hand.y).toBeCloseTo(contact.y, 6);
        expect(hand.z).toBeCloseTo(172, 6);
        expect(effect.cardAnimation(facing)?.options.duration).toBe(effect.duration);
      }
    disposeObject(baby);
    disposeObject(effect.object);
  });
  it('turns continuously into far-side arrival with connected crawl supports', () => {
    const baby = makeBabyBrent(),
      p = babyPlan('baby-1'),
      end = babyLandingPoint(p, b, view, source, -1);
    let previous = babyApproachFacing(p, source, end, b, 0);
    for (let t = 0; t <= 1; t += 0.005) {
      const facing = babyApproachFacing(p, source, end, b, t),
        at = babyApproach(p, source, end, view, t, b);
      expect(Math.abs(facing - previous)).toBeLessThan(0.16);
      previous = facing;
      baby.position.set(at.x, -at.y, 165);
      babyCrawl(baby, Math.hypot(at.x - source.x, at.y - source.y), facing, 1, p.step);
      for (const name of ['left', 'right'])
        for (const bone of ['upper-arm', 'forearm'])
          expect(part(part(baby, name + '-arm'), bone).scale.y).toBeCloseTo(18, 6);
      for (const name of ['left', 'right'])
        for (const bone of ['thigh', 'shin'])
          expect(part(part(baby, name + '-leg'), bone).scale.y).toBeCloseTo(14, 6);
    }
    expect(babyApproachFacing(p, source, end, b, 1)).toBe(-1);
    disposeObject(baby);
  });
  it('releases tears from the actual eyes, lands them on the live card, and leaks from the real diaper seam', () => {
    for (const facing of [-1, 1]) {
      const baby = makeBabyBrent(),
        trick = new BabyTrick('baby-0'),
        p = trick.plan,
        end = babyLandingPoint(p, b, view, source, facing),
        release = p.sobs[0];
      if (release === undefined) throw new Error('sob');
      trick.update(release * p.pace, baby, b, end, view);
      const drops = trick.object.children.filter((node) => node.name === 'tear-drop');
      for (const [index, name] of [
        [0, 'left-tear-source'],
        [3, 'right-tear-source'],
      ] as const) {
        const drop = drops[index];
        if (!drop) throw new Error('drop');
        const eye = pos(baby, name);
        expect(drop.position.x).toBeCloseTo(eye.x, 6);
        expect(drop.position.y).toBeCloseTo(eye.y, 6);
        expect(drop.position.z + 150).toBeCloseTo(eye.z, 6);
      }
      trick.update((release + 499.999) * p.pace, baby, b, end, view);
      const drop = drops[0];
      if (!drop) throw new Error('drop');
      const point = babyCardPoint(
        p,
        release + 499.999,
        { x: facing > 0 ? b.left + 2 : b.left + b.width - 2, y: b.top + b.height * 0.835 },
        b,
        facing,
      );
      expect(drop.position.x).toBeCloseTo(point.x, 3);
      expect(-drop.position.y).toBeCloseTo(point.y, 3);
      expect(babyCardPose(p, release + 100, facing).y).toBe(0);
      expect(babyCardPose(p, release + 620, facing).y).toBeGreaterThan(0);
      trick.update((p.discovery + 500) * p.pace, baby, b, end, view);
      const seam = pos(baby, 'diaper-seam'),
        leak = part(trick.object, 'diaper-ooze');
      expect(leak.position.x).toBeCloseTo(seam.x, 6);
      expect(leak.position.y + leak.scale.y).toBeCloseTo(seam.y, 6);
      expect(leak.position.z + 150).toBeCloseTo(seam.z, 6);
      disposeObject(baby);
      disposeObject(trick.object);
    }
  });
  it('recovers with actual eye or mouth contact while the seated feet remain planted', () => {
    for (let seed = 0; seed < 12; seed++) {
      const baby = makeBabyBrent(),
        trick = new BabyTrick('baby-' + seed),
        p = trick.plan,
        end = babyLandingPoint(p, b, view, source, 1);
      const last = p.sobs[p.sobs.length - 1] ?? p.discovery,
        time = Math.max(last + 600, p.departure - 750);
      trick.update(time * p.pace, baby, b, end, view);
      const hand = pos(part(baby, 'right-arm'), p.wipe ? 'wipe-fingertip' : 'thumb-tip'),
        target = pos(baby, p.wipe ? 'right-tear-source' : 'mouth');
      expect(hand.distanceTo(target)).toBeLessThan(p.wipe ? 1.41 : 1e-6);
      const feet = ['left-leg', 'right-leg'].map((name) => pos(part(baby, name), 'foot'));
      trick.update((time + 30) * p.pace, baby, b, end, view);
      feet.forEach((foot, i) =>
        expect(pos(part(baby, i ? 'right-leg' : 'left-leg'), 'foot').distanceTo(foot)).toBeLessThan(
          1e-6,
        ),
      );
      disposeObject(baby);
      disposeObject(trick.object);
    }
  });
  it('retains the chosen side and leaves physically at full size with finite bounded disposable effects', () => {
    const baby = makeBabyBrent(),
      trick = new BabyTrick('baby-2'),
      p = trick.plan,
      mobile = { left: 12, top: 430, width: 58, height: 84 };
    const first = babyLandingPoint(p, mobile, { x: 390, y: 844 }, source),
      facing = Math.sign(mobile.left + mobile.width / 2 - first.x),
      end = babyLandingPoint(p, b, view, source, facing);
    expect(Math.sign(b.left + b.width / 2 - end.x)).toBe(facing);
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    const collect = () => {
      for (const root of [baby, trick.object])
        root.traverse((node) => {
          if (node instanceof THREE.Mesh || node instanceof THREE.Sprite) {
            if (node instanceof THREE.Mesh) resources.add(node.geometry);
            if (Array.isArray(node.material)) node.material.forEach((mat) => resources.add(mat));
            else resources.add(node.material);
          }
        });
    };
    collect();
    const count = resources.size;
    for (let ms = 0; ms <= BABY_DURATION; ms += 60) {
      trick.update(ms * p.pace, baby, b, end, view);
      for (const root of [baby, trick.object])
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
    trick.update((p.departure + 420 + 1700 * p.exit - 1) * p.pace, baby, b, end, view);
    expect(baby.visible).toBe(true);
    expect(baby.scale.x).toBe(BABY_SCALE);
    expect(facing > 0 ? baby.position.x < -84 : baby.position.x > view.x + 84).toBe(true);
    trick.update(trick.duration, baby, b, end, view);
    expect(baby.visible).toBe(false);
    expect(trick.object.visible).toBe(false);
    expect(trick.cardAnimation(facing).frames.at(-1)?.['translate']).toBe('0px 0px');
    const spies = [...resources].map((resource) => vi.spyOn(resource, 'dispose'));
    disposeObject(baby);
    disposeObject(trick.object);
    spies.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
  });
});
