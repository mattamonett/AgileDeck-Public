import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { HippieTrick, makeHippie } from './hippie-trick';
import {
  HIPPIE_DURATION,
  daisyFlower,
  hippieCardPose,
  hippieFrames,
  hippieLandingPoint,
  hippiePlan,
  hippieScale,
} from './hippie-choreography';
import { hippieModel } from './hippie-model';
import { cardPoint, lowestWorldY, sideOf, type Side } from '../../kit';
import { disposeObject } from '../../engine/throw-models';
import { approachPace } from '../../testing/approach-pace.testing';
import { projectileName } from '@features/room/projectile-names';
import type { TargetBounds } from '../../landing/landing-geometry';

const desktop: TargetBounds = { left: 360, top: 270, width: 84, height: 122 };
const mobile: TargetBounds = { left: 160, top: 430, width: 58, height: 84 };
const view = { x: 800, y: 760 },
  source = { x: 100, y: 330 };

function setup(id: string, b: TargetBounds, chosen?: number) {
  const actor = makeHippie(id),
    trick = new HippieTrick(actor),
    p = trick.plan;
  const end = hippieLandingPoint(p, b, view, chosen);
  const side: Side = sideOf(b.left + b.width / 2 - end.x);
  return { actor, trick, p, side };
}
const world = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());

describe('Hippie', () => {
  it('is named in the picker', () => {
    expect(projectileName('☮️')).toBe('Hippie');
  });

  it('shares reproducible, varied approach, tuck, sway and farewell choices', () => {
    expect(hippiePlan('same')).toEqual(hippiePlan('same'));
    const plans = Array.from({ length: 40 }, (_, i) => hippiePlan(`hippie-${i}`));
    for (const key of [
      'pace',
      'travel',
      'sniffAt',
      'peaceAt',
      'inset',
      'lean',
      'push',
      'period',
      'sway',
      'exit',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBeGreaterThan(20);
    for (const key of ['side', 'gait', 'farewell', 'swings'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(2);
    for (const p of plans) {
      expect(Math.abs(p.sniffAt - p.peaceAt)).toBeGreaterThan(0.15);
      expect(p.fadeEnd).toBeLessThan(HIPPIE_DURATION);
      expect(p.depart).toBeGreaterThan(p.release + p.period);
    }
  });

  it('slows to smell the daisy on the way in without stopping dead', () => {
    for (let seed = 0; seed < 12; seed++)
      for (const chosen of [-1, 1])
        for (const from of [source, { x: 700, y: 640 }]) {
          const { actor, trick, p, side } = setup(`hippie-${seed}`, desktop, chosen);
          const pace = approachPace((t) => {
            trick.update(t * p.travel * p.pace, actor, from, desktop, view, side);
            return { x: actor.position.x, y: -actor.position.y };
          });
          expect(pace.slowest).toBeGreaterThan(0.25);
          expect(pace.pace(p.sniffAt + 0.02)).toBeLessThan(0.95);
          disposeObject(actor);
          disposeObject(trick.object);
        }
  });

  it('keeps limbs jointed and the daisy in her palm until it is tucked onto the live card corner', () => {
    for (let seed = 0; seed < 6; seed++)
      for (const chosen of [-1, 1])
        for (const b of [desktop, mobile]) {
          const { actor, trick, p, side } = setup(`hippie-${seed}`, b, chosen);
          const m = hippieModel(actor),
            scale = hippieScale(b);
          const daisyHand = m.hands[side > 0 ? 0 : 1];
          for (let ms = 0; ms < p.exitEnd; ms += 37) {
            trick.update(ms * p.pace, actor, source, b, view, side);
            for (const limb of [...m.arms, ...m.legs]) {
              expect(limb.upper.scale.y).toBeCloseTo(limb.lengths[0], 6);
              expect(limb.lower.scale.y).toBeCloseTo(limb.lengths[1], 6);
            }
            if (ms < p.release)
              expect(
                world(daisyHand.grip).distanceTo(world(m.daisy.grip)),
                `${seed} ${side} ${ms}`,
              ).toBeLessThan(0.05 * scale);
            if (ms >= p.tuck) {
              const flower = cardPoint(hippieCardPose(p, ms, side, b), daisyFlower(p, b, side), b);
              const head = world(m.daisy.head);
              expect(head.x).toBeCloseTo(flower.x, 4);
              expect(-head.y).toBeCloseTo(flower.y, 4);
            }
          }
          disposeObject(actor);
          disposeObject(trick.object);
        }
  });

  it('stands on the floor through the tiptoe stretch and the sway', () => {
    for (const chosen of [-1, 1]) {
      const { actor, trick, p, side } = setup('hippie-3', desktop, chosen);
      const floor = -(desktop.top + desktop.height);
      for (const ms of [
        p.look,
        p.reach + 500,
        p.tuck,
        p.release,
        p.swayStart + p.period / 4,
        p.swayEnd - 400,
      ]) {
        trick.update(ms * p.pace, actor, source, desktop, view, side);
        // The daisy is screen-space and the arms may hang lower than the hips, so measure the legs.
        const m = hippieModel(actor);
        const lowest = Math.min(...m.legs.map((leg) => lowestWorldY(leg.root)));
        expect(lowest, `${ms}`).toBeCloseTo(floor, 0);
      }
      disposeObject(actor);
      disposeObject(trick.object);
    }
  });

  it('nudges the card only after contact, rocks it about its base and restores it', () => {
    const p = hippiePlan('hippie-5');
    for (const side of [-1, 1] as const) {
      expect(hippieCardPose(p, p.tuck - 1, side, desktop).angle).toBe(0);
      expect(Math.sign(hippieCardPose(p, p.tuck + 150, side, desktop).angle)).toBe(side);
      const rocked = hippieCardPose(p, p.swayStart + p.period * 0.75, side, desktop);
      expect(Math.abs(rocked.angle)).toBeGreaterThan(2);
      // The bottom centre stays put while the card rocks.
      const base = cardPoint(
        rocked,
        { x: desktop.left + desktop.width / 2, y: desktop.top + desktop.height },
        desktop,
      );
      expect(base.x).toBeCloseTo(desktop.left + desktop.width / 2, 6);
      expect(base.y).toBeCloseTo(desktop.top + desktop.height, 6);
      expect(hippieCardPose(p, p.swayEnd + 1, side, desktop).angle).toBe(0);
      const frames = hippieFrames(p, side, desktop).frames;
      expect(frames.at(-1)?.['rotate']).toBe('0deg');
      expect(frames.at(-1)?.['translate']).toBe('0px 0px');
    }
  });

  it('keeps the chosen side and the tucked daisy on the card through a resize', () => {
    const { actor, trick, p, side } = setup('hippie-2', mobile);
    const ms = p.swayStart + 300;
    for (const b of [mobile, desktop]) {
      trick.update(ms * p.pace, actor, source, b, view, side);
      const flower = cardPoint(hippieCardPose(p, ms, side, b), daisyFlower(p, b, side), b);
      const head = world(hippieModel(actor).daisy.head);
      expect(head.x).toBeCloseTo(flower.x, 4);
      expect(-head.y).toBeCloseTo(flower.y, 4);
      expect(Math.sign(b.left + b.width / 2 - hippieLandingPoint(p, b, view, side).x)).toBe(side);
    }
    disposeObject(actor);
    disposeObject(trick.object);
  });

  it('shows the greeting while the card sways and waves goodbye on the way out', () => {
    const { actor, trick, p, side } = setup('hippie-1', desktop);
    const bubble = trick.object.getObjectByName('hippie-greeting');
    expect(bubble?.userData['text']).toBe('Peace, man ✌️');
    trick.update((p.swayStart - 20) * p.pace, actor, source, desktop, view, side);
    expect(bubble?.visible).toBe(false);
    trick.update((p.swayStart + 600) * p.pace, actor, source, desktop, view, side);
    expect(bubble?.visible).toBe(true);
    trick.update((p.turned + 450) * p.pace, actor, source, desktop, view, side);
    expect(bubble?.visible).toBe(false);
    const m = hippieModel(actor);
    const free = m.arms[side > 0 ? 1 : 0];
    expect(world(free.end).y).toBeGreaterThan(world(m.head).y - 6 * hippieScale(desktop));
    disposeObject(actor);
    disposeObject(trick.object);
  });

  it('wanders off screen at full size, stays finite and releases every resource once', () => {
    const { actor, trick, p, side } = setup('hippie-4', desktop);
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>();
    const collect = () => {
      for (const root of [actor, trick.object])
        root.traverse((node) => {
          if (!(node instanceof THREE.Mesh || node instanceof THREE.Sprite)) return;
          if (node instanceof THREE.Mesh) geometries.add(node.geometry);
          for (const m of Array.isArray(node.material) ? node.material : [node.material])
            materials.add(m);
        });
    };
    collect();
    const count = [geometries.size, materials.size];
    for (let ms = 0; ms < HIPPIE_DURATION; ms += 45) {
      trick.update(ms * p.pace, actor, source, desktop, view, side);
      actor.traverse((node) =>
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
    trick.update((p.exitEnd - 1) * p.pace, actor, source, desktop, view, side);
    expect(actor.visible).toBe(true);
    expect(actor.scale.x).toBeCloseTo(hippieScale(desktop), 9);
    const offscreen = side > 0 ? actor.position.x < -60 : actor.position.x > view.x + 60;
    expect(offscreen).toBe(true);
    trick.update(trick.duration, actor, source, desktop, view, side);
    expect(actor.visible).toBe(false);
    expect(trick.object.visible).toBe(false);
    const spies = [...geometries, ...materials].map((resource) => vi.spyOn(resource, 'dispose'));
    disposeObject(actor);
    disposeObject(trick.object);
    spies.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
  });
});
