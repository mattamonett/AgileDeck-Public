import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GhostTrick, makeGhost } from './ghost-trick';
import {
  GHOST_DURATION,
  SPIRIT_LEG,
  ghostCardLook,
  ghostFloor,
  ghostFrames,
  ghostLandingPoint,
  ghostPlan,
  ghostScale,
  spiritRoute,
  spiritState,
} from './ghost-choreography';
import { ghostModel } from './ghost-model';
import { cardPoint, sideOf, type Side } from '../../kit';
import { disposeObject } from '../../engine/throw-models';
import { approachPace } from '../../testing/approach-pace.testing';
import { projectileName } from '@features/room/projectile-names';
import type { TargetBounds } from '../../landing/landing-geometry';

const desktop: TargetBounds = { left: 360, top: 270, width: 84, height: 122 };
const mobile: TargetBounds = { left: 160, top: 430, width: 58, height: 84 };
const view = { x: 800, y: 760 },
  source = { x: 100, y: 330 };

function setup(id: string, b: TargetBounds, chosen?: number) {
  const actor = makeGhost(id),
    trick = new GhostTrick(actor),
    p = trick.plan;
  const end = ghostLandingPoint(p, b, view, chosen);
  const side: Side = sideOf(b.left + b.width / 2 - end.x);
  return { actor, trick, p, side };
}
function release(actor: THREE.Group, trick: GhostTrick) {
  trick.dispose();
  disposeObject(actor);
  disposeObject(trick.object);
}
const corners = (b: TargetBounds, ms: number, p: ReturnType<typeof ghostPlan>, side: Side) => {
  const q = spiritState(p, ms, b, view, side).pose;
  return [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ].map(([u = 0, v = 0]) => cardPoint(q, { x: b.left + b.width * u, y: b.top + b.height * v }, b));
};

describe('Ghost', () => {
  it('is named in the picker', () => {
    expect(projectileName('👻')).toBe('Ghost');
  });

  it('shares reproducible, varied float, fright, runaway and exit choices', () => {
    expect(ghostPlan('same')).toEqual(ghostPlan('same'));
    const plans = Array.from({ length: 40 }, (_, i) => ghostPlan(`ghost-${i}`));
    for (const key of [
      'pace',
      'travel',
      'weave',
      'rise',
      'leapHeight',
      'leapSpin',
      'heading',
      'boo',
      'runEnd',
      'exitEnd',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBeGreaterThan(20);
    for (const key of ['side', 'approach', 'laugh', 'exit'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(2);
    expect(new Set(plans.map((p) => p.swerves.length))).toEqual(new Set([1, 2]));
    for (const p of plans) {
      expect(p.boo).toBeGreaterThan(p.travel + 600);
      expect(p.leap).toBeGreaterThan(p.boo);
      expect(Math.max(p.exitEnd, p.restoreEnd)).toBeLessThan(GHOST_DURATION);
    }
  });

  it('floats in without stopping dead, from either side', () => {
    for (let seed = 0; seed < 12; seed++)
      for (const chosen of [-1, 1])
        for (const from of [source, { x: 700, y: 640 }]) {
          const { actor, trick, p, side } = setup(`ghost-${seed}`, desktop, chosen);
          const pace = approachPace((t) => {
            trick.update(t * p.travel * p.pace, actor, from, desktop, view, side);
            return { x: actor.position.x, y: -actor.position.y };
          });
          expect(pace.slowest).toBeGreaterThan(0.25);
          release(actor, trick);
        }
  });

  it('jolts the card only at the BOO and keeps its vote readable while the spirit is away', () => {
    for (let seed = 0; seed < 8; seed++) {
      const p = ghostPlan(`ghost-${seed}`);
      for (const side of [-1, 1] as const) {
        expect(ghostCardLook(p, p.travel, side, desktop).pale).toBe(0);
        const jolt = ghostCardLook(p, p.boo + 110, side, desktop).pose;
        expect(jolt.y).toBeLessThan(-3);
        expect(jolt.sy).toBeGreaterThan(1.03);
        for (let ms = p.leap; ms < p.restoreEnd; ms += 40) {
          const look = ghostCardLook(p, ms, side, desktop);
          // The body stays on the table: never shifted or turned enough to read as gone.
          expect(Math.abs(look.pose.angle)).toBeLessThan(8);
          expect(Math.abs(look.pose.x)).toBeLessThan(10);
        }
        expect(ghostCardLook(p, (p.runEnd + p.leap) / 2, side, desktop).pale).toBe(1);
        expect(ghostCardLook(p, p.restoreEnd, side, desktop).pale).toBe(0);
        const frames = ghostFrames(p, side, desktop).frames;
        for (const frame of frames) expect(Number(frame['opacity'])).toBeGreaterThanOrEqual(0.6);
        expect(frames.at(-1)?.['rotate']).toBe('0deg');
        expect(frames.at(-1)?.['translate']).toBe('0px 0px');
        expect(frames.at(-1)?.['filter']).toBe('saturate(1) brightness(1)');
      }
    }
  });

  it('leaps out from the card itself, lands beside it away from the ghost and runs off screen at full size', () => {
    for (let seed = 0; seed < 16; seed++)
      for (const b of [
        desktop,
        mobile,
        { ...desktop, left: 10 },
        { ...desktop, left: view.x - 94 },
      ])
        for (const side of [-1, 1] as const) {
          const p = ghostPlan(`ghost-${seed}`);
          expect(spiritState(p, p.leap - 1, b, view, side).stage).toBe('hidden');
          const born = spiritState(p, p.leap, b, view, side).pose;
          expect(Math.hypot(born.x, born.y)).toBeLessThan(0.5);
          const landed = spiritState(p, p.land, b, view, side);
          expect(landed.stage).toBe('scramble');
          expect(Math.sign(landed.pose.x)).toBe(side);
          expect(landed.pose.y).toBeCloseTo(-SPIRIT_LEG * b.height, 0);
          // Continuous: no frame-to-frame jumps through the leap, scramble and every swerve.
          let previous = born;
          for (let ms = p.leap + 10; ms < p.runEnd; ms += 10) {
            const s = spiritState(p, ms, b, view, side);
            expect(
              Math.hypot(s.pose.x - previous.x, s.pose.y - previous.y),
              `${seed} ${ms}`,
            ).toBeLessThan(0.16 * Math.max(view.x, view.y));
            expect(Math.max(s.pose.sx, s.pose.sy)).toBeLessThan(1.2);
            expect(Math.min(s.pose.sx, s.pose.sy)).toBeGreaterThan(0.8);
            previous = s.pose;
          }
          // Every corner of the runaway is past the viewport by the end of the run.
          const out = corners(b, p.runEnd - 1, p, side);
          const gone =
            out.every((c) => c.x < 0) ||
            out.every((c) => c.x > view.x) ||
            out.every((c) => c.y < 0) ||
            out.every((c) => c.y > view.y);
          expect(gone, `${seed} ${side} ${b.left}`).toBe(true);
          expect(spiritState(p, p.runEnd, b, view, side).stage).toBe('gone');
        }
  });

  it('never runs back through the ghost and swerves at least once on the way out', () => {
    for (let seed = 0; seed < 40; seed++) {
      const p = ghostPlan(`ghost-${seed}`);
      for (const side of [-1, 1] as const) {
        const route = spiritRoute(p, desktop, view, side);
        expect(route.length).toBe(p.swerves.length + 3);
        for (let i = 1; i < route.length; i++) {
          const a = route[i - 1],
            c = route[i];
          if (!a || !c) continue;
          const len = Math.hypot(c.x - a.x, c.y - a.y);
          expect((c.x - a.x) * side, `${seed} ${i}`).toBeGreaterThan(-0.15 * len);
        }
      }
    }
  });

  it('sprouts jointed legs that land on the floor and keep their length while running', () => {
    for (const b of [desktop, mobile])
      for (const chosen of [-1, 1]) {
        const { actor, trick, p, side } = setup('ghost-3', b, chosen);
        for (let ms = p.leap; ms < p.runEnd; ms += 31) {
          trick.update(ms * p.pace, actor, source, b, view, side);
          for (const limb of trick.spirit.limbs) {
            expect(limb.upper.scale.y).toBeCloseTo(limb.lengths[0], 6);
            expect(limb.lower.scale.y).toBeCloseTo(limb.lengths[1], 6);
          }
        }
        trick.update((p.land + 120) * p.pace, actor, source, b, view, side);
        trick.object.updateMatrixWorld(true);
        const floor = ghostFloor(b);
        for (const sole of trick.spirit.soles())
          expect(Math.abs(-sole.y - floor)).toBeLessThan(0.1 * b.height);
        release(actor, trick);
      }
  });

  it('copies the card for the runaway without touching the real card, and removes the copy', () => {
    const target = document.createElement('div');
    target.className = 'card-display';
    target.setAttribute('data-player-id', 'u1');
    target.setAttribute('aria-label', 'Throw at Sam');
    target.innerHTML = '<span class="vote-status">Voted</span>';
    document.body.appendChild(target);
    const { actor, trick, p, side } = setup('ghost-6', desktop);
    trick.update((p.leap - 100) * p.pace, actor, source, desktop, view, side, target);
    expect(trick.card.element).toBeNull();
    trick.update((p.leap + 200) * p.pace, actor, source, desktop, view, side, target);
    const copy = trick.card.element;
    expect(copy?.isConnected).toBe(true);
    expect(copy?.getAttribute('aria-hidden')).toBe('true');
    expect(copy?.querySelector('[data-player-id], [aria-label]')).toBeNull();
    expect(copy?.textContent).toContain('Voted');
    expect(copy?.style.display).toBe('block');
    trick.update((p.runEnd + 10) * p.pace, actor, source, desktop, view, side, target);
    expect(copy?.style.display).toBe('none');
    expect(target.isConnected).toBe(true);
    expect(target.getAttribute('data-player-id')).toBe('u1');
    trick.dispose();
    expect(copy?.isConnected).toBe(false);
    disposeObject(actor);
    disposeObject(trick.object);
    target.remove();
  });

  it('keeps the chosen side and the runaway on the live card through a resize', () => {
    const { actor, trick, p, side } = setup('ghost-2', mobile);
    const ms = p.land - 60;
    for (const b of [mobile, desktop]) {
      trick.update(ms * p.pace, actor, source, b, view, side);
      expect(Math.sign(b.left + b.width / 2 - ghostLandingPoint(p, b, view, side).x)).toBe(side);
      expect(trick.spiritNow?.stage).toBe('leap');
      expect(Math.sign(trick.spiritNow?.pose.x ?? 0)).toBe(side);
    }
    release(actor, trick);
  });

  it('shouts BOO at the card and laughs at the runaway', () => {
    const { actor, trick, p, side } = setup('ghost-1', desktop);
    const bubble = trick.object.getObjectByName('ghost-shout');
    expect(bubble?.userData['text']).toBe('BOO!');
    trick.update((p.boo - 200) * p.pace, actor, source, desktop, view, side);
    expect(bubble?.visible).toBe(false);
    trick.update((p.boo + 100) * p.pace, actor, source, desktop, view, side);
    expect(bubble?.visible).toBe(true);
    const m = ghostModel(actor);
    expect(m.mouth.scale.y).toBeGreaterThan(4);
    trick.update(((p.laughStart + p.laughEnd) / 2) * p.pace, actor, source, desktop, view, side);
    expect(bubble?.visible).toBe(false);
    expect(m.grin.visible).toBe(true);
    expect(m.eyes.every((eye) => !eye.visible)).toBe(true);
    release(actor, trick);
  });

  it('leaves physically by rising away or sinking through the floor', () => {
    let rose = false,
      sank = false;
    for (let seed = 0; seed < 12 && !(rose && sank); seed++) {
      const { actor, trick, p, side } = setup(`ghost-${seed}`, desktop);
      trick.update((p.exitEnd - 30) * p.pace, actor, source, desktop, view, side);
      expect(actor.scale.x).toBeCloseTo(ghostScale(desktop), 9);
      const material = ghostModel(actor).materials[0]?.material;
      if (p.exit === 'sink') {
        sank = true;
        // The hem is well below the floor line, and the floor clips it.
        expect(-actor.position.y).toBeGreaterThan(ghostFloor(desktop) + 20);
        expect(material?.clippingPlanes?.[0]?.constant).toBeCloseTo(ghostFloor(desktop), 6);
      } else {
        rose = true;
        expect(-actor.position.y).toBeLessThan(0);
      }
      trick.update(p.laughEnd * p.pace - 50, actor, source, desktop, view, side);
      expect(material?.clippingPlanes?.[0]?.constant).toBeGreaterThan(1e5);
      release(actor, trick);
    }
    expect(rose && sank).toBe(true);
  });

  it('stays finite, ends hidden and releases every resource once', () => {
    const { actor, trick, p, side } = setup('ghost-4', desktop);
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
    for (let ms = 0; ms < GHOST_DURATION; ms += 45) {
      trick.update(ms * p.pace, actor, source, desktop, view, side);
      for (const root of [actor, trick.object])
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
    expect([geometries.size, materials.size]).toEqual(count);
    trick.update(trick.duration, actor, source, desktop, view, side);
    expect(actor.visible).toBe(false);
    expect(trick.object.visible).toBe(false);
    const spies = [...geometries, ...materials].map((resource) => vi.spyOn(resource, 'dispose'));
    release(actor, trick);
    spies.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
  });
});
