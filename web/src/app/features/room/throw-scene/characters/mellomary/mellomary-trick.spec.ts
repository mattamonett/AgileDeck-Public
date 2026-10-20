import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { MelloMaryTrick, makeMelloMary } from './mellomary-trick';
import {
  melloCardPose,
  melloFrames,
  melloLandingPoint,
  melloPlan,
  melloScale,
  noteTarget,
  type MelloPlan,
} from './mellomary-choreography';
import { melloModel } from './mellomary-model';
import { cardPoint, lowestWorldY, screenOf, sideOf, type Side } from '../../kit';
import { disposeObject } from '../../engine/throw-models';
import { approachPace } from '../../testing/approach-pace.testing';
import { projectileName } from '@features/room/projectile-names';
import type { TargetBounds } from '../../landing/landing-geometry';

const desktop: TargetBounds = { left: 360, top: 270, width: 84, height: 122 };
const mobile: TargetBounds = { left: 160, top: 430, width: 58, height: 84 };
const view = { x: 800, y: 760 },
  source = { x: 100, y: 330 };

/** The first seeded id whose plan matches, so each authored alternative is exercised. */
function seedWith(match: (p: MelloPlan) => boolean, skip = 0): string {
  let found = 0;
  for (let i = 0; i < 500; i++) {
    const id = `mellomary-${i}`;
    if (match(melloPlan(id)) && found++ === skip) return id;
  }
  throw new Error('No matching MelloMary seed');
}
const scareId = seedWith((p) => p.act === 'scare');
const tuneId = seedWith((p) => p.act === 'serenade');

function setup(id: string, b: TargetBounds, chosen?: number) {
  const actor = makeMelloMary(id),
    trick = new MelloMaryTrick(actor),
    p = trick.plan;
  const end = melloLandingPoint(p, b, view, chosen);
  const side: Side = sideOf(b.left + b.width / 2 - end.x);
  return { actor, trick, p, side };
}
const world = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
function play(s: ReturnType<typeof setup>, ms: number) {
  s.trick.update(ms * s.p.pace, s.actor, source, desktop, view, s.side);
}
function release(actor: THREE.Group, trick: MelloMaryTrick) {
  disposeObject(actor);
  disposeObject(trick.object);
}

describe('MelloMary', () => {
  it('is named in the picker', () => {
    expect(projectileName('🎺')).toBe('MelloMary');
  });

  it('shares reproducible plans that vary every stage', () => {
    expect(melloPlan('same')).toEqual(melloPlan('same'));
    const plans = Array.from({ length: 60 }, (_, i) => melloPlan(`mellomary-${i}`));
    for (const key of [
      'pace',
      'travel',
      'hornsUp',
      'flinch',
      'shiver',
      'spread',
      'kick',
      'period',
      'drift',
      'exit',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBeGreaterThan(40);
    for (const key of ['side', 'approach', 'act', 'turn', 'fakeOut'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(2);
    const tunes = plans.filter((p) => p.act === 'serenade');
    expect(new Set(tunes.map((p) => p.notes.length))).toEqual(new Set([3, 4, 5]));
    for (const p of plans) {
      expect(p.crouch).toBeGreaterThan(p.travel);
      expect(p.pop).toBeGreaterThan(p.crouch);
      expect(p.bowAt).toBeGreaterThan(p.poseEnd);
      expect(p.turned).toBeGreaterThan(p.depart);
      expect(p.end).toBeGreaterThan(p.exitEnd);
      if (p.act === 'serenade') {
        expect(p.playStart).toBeGreaterThan(p.lips);
        const last = p.notes.at(-1);
        expect(p.depart).toBeGreaterThan((last?.land ?? Infinity) + 100);
        expect(p.exitNotes.length).toBeGreaterThan(1);
      } else {
        expect(p.depart).toBe(p.bowEnd);
        expect(p.notes).toEqual([]);
        expect(p.exitNotes).toEqual([]);
      }
    }
  });

  it('marches or creeps in from either side without stopping dead', () => {
    for (const approach of ['march', 'creep'] as const)
      for (let n = 0; n < 4; n++) {
        const id = seedWith((p) => p.approach === approach, n);
        for (const chosen of [-1, 1])
          for (const from of [source, { x: 700, y: 640 }]) {
            const { actor, trick, p, side } = setup(id, desktop, chosen);
            const pace = approachPace((t) => {
              trick.update(t * p.travel * p.pace, actor, from, desktop, view, side);
              return { x: actor.position.x, y: -actor.position.y };
            });
            expect(pace.slowest, `${id} ${chosen}`).toBeGreaterThan(
              approach === 'creep' ? 0.1 : 0.2,
            );
            if (approach === 'creep') expect(pace.pace(p.peeks[0] ?? 0)).toBeLessThan(0.7);
            release(actor, trick);
          }
      }
  });

  it('turns a crisp flank corner when marching from above and beyond the card', () => {
    const id = seedWith((p) => p.approach === 'march' && p.flank && p.side > 0);
    const { actor, trick, p, side } = setup(id, desktop, 1);
    const from = { x: 120, y: 90 };
    // The first leg marches straight down toward the viewer, the second straight along the floor line.
    trick.update(p.travel * 0.12 * p.pace, actor, from, desktop, view, side);
    expect(actor.position.x).toBeCloseTo(from.x, 3);
    trick.update(p.travel * 0.93 * p.pace, actor, from, desktop, view, side);
    expect(-actor.position.y).toBeCloseTo(desktop.top + desktop.height, 3);
    release(actor, trick);
  });

  it('keeps limbs jointed, the near hand always on the valves and both hands on the horn while she plays', () => {
    for (const id of [
      scareId,
      tuneId,
      seedWith((p) => p.approach === 'creep' && p.act === 'serenade'),
    ])
      for (const chosen of [-1, 1])
        for (const b of [desktop, mobile]) {
          const { actor, trick, p, side } = setup(id, b, chosen);
          const m = melloModel(actor),
            scale = melloScale(b);
          for (let ms = 0; ms < p.exitEnd; ms += 41) {
            trick.update(ms * p.pace, actor, source, b, view, side);
            for (const limb of [...m.arms, ...m.legs]) {
              expect(limb.upper.scale.y).toBeCloseTo(limb.lengths[0], 6);
              expect(limb.lower.scale.y).toBeCloseTo(limb.lengths[1], 6);
            }
            const near = m.hands[side > 0 ? 0 : 1];
            expect(
              world(near.grip).distanceTo(world(m.horn.valves)),
              `${id} valves ${ms}`,
            ).toBeLessThan(0.05 * scale);
            if (p.act === 'serenade' && ms > p.lips && ms < p.depart) {
              const far = m.hands[side > 0 ? 1 : 0];
              expect(
                world(far.grip).distanceTo(world(m.horn.pipe)),
                `${id} pipe ${ms}`,
              ).toBeLessThan(0.05 * scale);
              expect(
                world(m.horn.mouthpiece).distanceTo(world(m.lips)),
                `${id} lips ${ms}`,
              ).toBeLessThan(0.01 * scale);
            }
          }
          release(actor, trick);
        }
  });

  it('stands on the floor through the crouch, the one-legged pose, the bow and the tune', () => {
    for (const chosen of [-1, 1]) {
      const scare = setup(scareId, desktop, chosen);
      const tune = setup(tuneId, desktop, chosen);
      const floor = -(desktop.top + desktop.height);
      const beats: [ReturnType<typeof setup>, number][] = [
        [scare, scare.p.crouch],
        [scare, scare.p.pop + 400],
        [scare, scare.p.poseEnd - 100],
        [scare, scare.p.bowAt + 560],
        [tune, tune.p.playStart + tune.p.period * 0.5],
        [tune, tune.p.depart - 300],
      ];
      for (const [s, ms] of beats) {
        play(s, ms);
        // The arms may hang lower than the hips and the horn is held free, so measure the legs.
        const lowest = Math.min(...melloModel(s.actor).legs.map((leg) => lowestWorldY(leg.root)));
        expect(lowest, `${s.p.act} ${ms}`).toBeCloseTo(floor, 0);
      }
      // In the jester pose the back foot is kicked up well off the floor.
      play(scare, scare.p.pop + 500);
      const kicked = lowestWorldY(melloModel(scare.actor).legs[1].root);
      expect(kicked - floor).toBeGreaterThan(5 * melloScale(desktop));
      release(scare.actor, scare.trick);
      release(tune.actor, tune.trick);
    }
  });

  it('flinches the card away from her pose about its far corner only after the pop, then restores it', () => {
    const p = melloPlan(seedWith((q) => q.act === 'scare' && !q.fakeOut));
    for (const side of [-1, 1] as const) {
      expect(melloCardPose(p, p.pop, side, desktop)).toEqual({
        x: 0,
        y: 0,
        angle: 0,
        sx: 1,
        sy: 1,
      });
      const flinched = melloCardPose(p, p.pop + 200, side, desktop);
      expect(Math.sign(flinched.angle)).toBe(side);
      expect(Math.abs(flinched.angle)).toBeGreaterThan(p.flinch * 0.6);
      // The far bottom corner stays put (apart from the small fright lift).
      const far = {
        x: side > 0 ? desktop.left + desktop.width : desktop.left,
        y: desktop.top + desktop.height,
      };
      const at = cardPoint(flinched, far, desktop);
      expect(at.x).toBeCloseTo(far.x, 6);
      expect(at.y).toBeLessThanOrEqual(far.y);
      expect(at.y).toBeGreaterThan(far.y - 4);
      expect(melloCardPose(p, p.depart, side, desktop).angle).toBe(0);
      const frames = melloFrames(p, side, desktop).frames;
      expect(frames.at(-1)?.['rotate']).toBe('0deg');
      expect(frames.at(-1)?.['translate']).toBe('0px 0px');
    }
    // A fake-out only twitches the card a little before the real pop.
    const fake = melloPlan(seedWith((q) => q.act === 'scare' && q.fakeOut));
    const twitch = Math.abs(melloCardPose(fake, fake.fake + 300, 1, desktop).angle);
    expect(twitch).toBeGreaterThan(0.5);
    expect(twitch).toBeLessThan(fake.flinch * 0.4);
  });

  it('plays notes from the bell that land on the live card, each making it hop', () => {
    for (const chosen of [-1, 1]) {
      const { actor, trick, p, side } = setup(tuneId, desktop, chosen);
      const m = melloModel(actor);
      p.notes.forEach((note, i) => {
        const group = trick.object.getObjectByName(`mellomary-note-${i}`);
        trick.update((note.at - 5) * p.pace, actor, source, desktop, view, side);
        expect(group?.visible).toBe(false);
        trick.update((note.at + 1) * p.pace, actor, source, desktop, view, side);
        const bell = screenOf(m.horn.bell);
        expect(group?.visible).toBe(true);
        expect(group?.position.x).toBeCloseTo(bell.x, 0);
        expect(-(group?.position.y ?? 0)).toBeCloseTo(bell.y, 0);
        trick.update((note.land + 30) * p.pace, actor, source, desktop, view, side);
        const target = cardPoint(
          melloCardPose(p, note.land + 30, side, desktop),
          noteTarget(note, desktop),
          desktop,
        );
        expect(group?.position.x).toBeCloseTo(target.x, 4);
        expect(-(group?.position.y ?? 0)).toBeCloseTo(target.y, 4);
        expect(melloCardPose(p, note.land - 1, side, desktop).y).toBe(0);
        expect(melloCardPose(p, note.land + note.hopLength * 0.45, side, desktop).y).toBeLessThan(
          -3,
        );
      });
      expect(melloCardPose(p, p.depart, side, desktop)).toEqual({
        x: 0,
        y: 0,
        angle: 0,
        sx: 1,
        sy: 1,
      });
      // Trailing notes float up from the bell as she marches away.
      const born = p.exitNotes[0] ?? 0;
      trick.update((born + 400) * p.pace, actor, source, desktop, view, side);
      expect(trick.object.getObjectByName('mellomary-exit-note-0')?.visible).toBe(true);
      release(actor, trick);
    }
  });

  it('shows the shiver marks only while the scared card trembles', () => {
    const { actor, trick, p, side } = setup(scareId, desktop);
    const mark = trick.object.getObjectByName('mellomary-fright-mark-0');
    trick.update((p.pop - 20) * p.pace, actor, source, desktop, view, side);
    expect(mark?.visible).toBe(false);
    trick.update((p.pop + 400) * p.pace, actor, source, desktop, view, side);
    expect(mark?.visible).toBe(true);
    trick.update((p.bowAt + 200) * p.pace, actor, source, desktop, view, side);
    expect(mark?.visible).toBe(false);
    release(actor, trick);
  });

  it('keeps the chosen side and lands the notes on the resized card', () => {
    const { actor, trick, p, side } = setup(tuneId, mobile);
    const note = p.notes[1];
    if (!note) throw new Error('Missing note');
    const ms = note.land + 20;
    for (const b of [mobile, desktop]) {
      trick.update(ms * p.pace, actor, source, b, view, side);
      const target = cardPoint(melloCardPose(p, ms, side, b), noteTarget(note, b), b);
      const group = trick.object.getObjectByName('mellomary-note-1');
      expect(group?.position.x).toBeCloseTo(target.x, 4);
      expect(Math.sign(b.left + b.width / 2 - melloLandingPoint(p, b, view, side).x)).toBe(side);
    }
    release(actor, trick);
  });

  it('marches off screen at full size for each turn, stays finite and releases every resource once', () => {
    for (const id of [seedWith((p) => p.turn === 'snap'), seedWith((p) => p.turn === 'twirl')]) {
      const { actor, trick, p, side } = setup(id, desktop);
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>();
      const collect = () => {
        for (const root of [actor, trick.object])
          root.traverse((node) => {
            if (!(node instanceof THREE.Mesh)) return;
            geometries.add(node.geometry);
            for (const m of Array.isArray(node.material) ? node.material : [node.material])
              materials.add(m);
          });
      };
      collect();
      const count = [geometries.size, materials.size];
      for (let ms = 0; ms < trick.duration; ms += 45) {
        trick.update(ms, actor, source, desktop, view, side);
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
      expect(actor.scale.x).toBeCloseTo(melloScale(desktop), 9);
      const offscreen = side > 0 ? actor.position.x < -60 : actor.position.x > view.x + 60;
      expect(offscreen).toBe(true);
      // Seeking back to the same instant reproduces the same pose.
      const at = (p.pop + 300) * p.pace;
      trick.update(at, actor, source, desktop, view, side);
      const first = world(melloModel(actor).hands[1].grip);
      trick.update(trick.duration * 0.9, actor, source, desktop, view, side);
      trick.update(at, actor, source, desktop, view, side);
      expect(world(melloModel(actor).hands[1].grip).distanceTo(first)).toBeLessThan(1e-6);
      trick.update(trick.duration, actor, source, desktop, view, side);
      expect(actor.visible).toBe(false);
      expect(trick.object.visible).toBe(false);
      const spies = [...geometries, ...materials].map((resource) => vi.spyOn(resource, 'dispose'));
      release(actor, trick);
      spies.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
    }
  });
});
