import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { makeMonkey, MonkeyTrick, MONKEY_DURATION } from './monkey-trick';
import {
  monkeyPlan,
  monkeyPosition,
  monkeyReleasePoint,
  monkeyFlight,
  monkeyImpact,
  monkeyCardPoint,
  monkeyCardPose,
} from './monkey-choreography';
import { requireSceneObject } from '../../engine/scene-object';
import { disposeObject } from '../../engine/throw-models';
import { approachPace } from '../../testing/approach-pace.testing';
const view = { x: 800, y: 700 };
const source = { left: 80, top: 300, width: 84, height: 122 };
const target = { left: 540, top: 240, width: 84, height: 122 };
function parts(root: THREE.Object3D, name: string) {
  return root.children.filter((part) => part.name === name);
}
function world(root: THREE.Object3D) {
  return root.getWorldPosition(new THREE.Vector3());
}
function close(a: { x: number; y: number }, b: { x: number; y: number }) {
  expect(a.x).toBeCloseTo(b.x, 5);
  expect(a.y).toBeCloseTo(b.y, 5);
}
describe('monkey ambush', () => {
  it('retains compatible seeded approach, throws, recoil and hiding variations', () => {
    const plans = Array.from({ length: 40 }, (_, i) => monkeyPlan('monkey-' + i));
    expect(monkeyPlan('monkey-0')).toEqual(plans[0]);
    for (const field of ['pace', 'force', 'pause', 'step', 'retreat', 'duck'] as const)
      expect(new Set(plans.map((p) => p[field])).size).toBe(40);
    expect(new Set(plans.map((p) => p.wink)).size).toBe(2);
    for (const p of plans) {
      expect(p.shots).toHaveLength(4);
      expect(new Set(p.shots.map((s) => s.u)).size).toBe(4);
      let last = 0;
      for (const s of p.shots) {
        expect(s.release - 300).toBeGreaterThan(last);
        expect(s.release + s.flight).toBeLessThan(p.retreat);
        last = s.release + 220;
      }
    }
  });
  it('peeks and steps out in one continuous move without freezing on top of the card', () => {
    for (let i = 0; i < 40; i++)
      for (const [a, b] of [
        [source, target],
        [target, source],
      ]) {
        if (!a || !b) throw new Error('Missing card geometry');
        const plan = monkeyPlan('monkey-' + i);
        const appear = 250 + plan.pause + 300;
        const pace = approachPace((t) => monkeyPosition(t * appear, plan, a, b, view));
        expect(pace.slowest).toBeGreaterThan(0.3);
        expect(pace.pace((250 + plan.pause / 2) / appear)).toBeLessThan(1);
        const out = monkeyPosition(appear, plan, a, b, view);
        expect(out.out).toBe(1);
      }
  });
  it('holds each prop at the real palm and releases continuously toward live card contact on both sides', () => {
    for (const [a, b] of [
      [source, target],
      [target, source],
      [
        { left: 15, top: 250, width: 58, height: 84 },
        { left: 300, top: 320, width: 58, height: 84 },
      ],
    ]) {
      if (!a || !b) throw new Error('Missing card geometry');
      const monkey = makeMonkey();
      const trick = new MonkeyTrick('monkey-0');
      const shots = parts(trick.object, 'monkey-poop');
      const grip = requireSceneObject(requireSceneObject(monkey, 'throwing-arm'), 'poop-grip');
      for (const [index, shot] of trick.plan.shots.entries()) {
        const prop = shots[index];
        if (!prop) throw new Error('Missing projectile');
        trick.update((shot.release - 120) * trick.plan.pace, monkey, a, b, view);
        expect(prop.visible).toBe(true);
        expect(prop.position.distanceTo(world(grip))).toBeLessThan(1e-6);
        trick.update(shot.release * trick.plan.pace, monkey, a, b, view);
        const release = monkeyReleasePoint(trick.plan, shot, a, b, view);
        close(release, { x: world(grip).x, y: -world(grip).y });
        close(release, { x: prop.position.x, y: -prop.position.y });
        expect(prop.position.z).toBeCloseTo(world(grip).z, 5);
        close(
          monkeyFlight(shot.release + shot.flight, trick.plan, shot, a, b, view),
          monkeyImpact(shot, b),
        );
        expect(monkeyCardPose(shot.release + shot.flight - 1, trick.plan, 1).angle).toBe(0);
        expect(
          monkeyCardPose(shot.release + shot.flight + 100, trick.plan, 1).angle,
        ).toBeGreaterThan(0);
        const moved = { ...b, left: b.left + 30, top: b.top - 50, width: 58, height: 84 };
        const ms = shot.release + shot.flight + 80;
        close(
          monkeyFlight(ms, trick.plan, shot, a, moved, view),
          monkeyCardPoint(
            ms,
            monkeyImpact(shot, moved),
            moved,
            trick.plan,
            b.left > a.left ? 1 : -1,
          ),
        );
      }
      disposeObject(monkey);
      disposeObject(trick.object);
    }
  });
  it('keeps all limbs joined and fixed length through anticipation, release, shuffle and retreat', () => {
    for (let seed = 0; seed < 16; seed++) {
      const monkey = makeMonkey();
      const trick = new MonkeyTrick('monkey-' + seed);
      for (let ms = 0; ms < 5500; ms += 55) {
        trick.update(ms * trick.plan.pace, monkey, source, target, view);
        for (const [name, upper, lower, joint, tip, length] of [
          ['throwing-arm', 'upper-arm', 'forearm', 'elbow', 'hand', 15],
          ['holding-arm', 'upper-arm', 'forearm', 'elbow', 'hand', 15],
          ['monkey-leg--1', 'upper-leg', 'lower-leg', 'knee', 'foot', 13],
          ['monkey-leg-1', 'upper-leg', 'lower-leg', 'knee', 'foot', 13],
        ] as const) {
          const root = requireSceneObject(monkey, name);
          const mid = requireSceneObject(root, joint);
          const hand = requireSceneObject(root, tip);
          expect(world(root).distanceTo(world(mid))).toBeCloseTo(length * 0.8, 5);
          expect(world(mid).distanceTo(world(hand))).toBeCloseTo(length * 0.8, 5);
          expect(requireSceneObject(root, upper).scale.y).toBeCloseTo(length, 5);
          expect(requireSceneObject(root, lower).scale.y).toBeCloseTo(length, 5);
        }
        monkey.traverse((part) =>
          expect(part.matrixWorld.elements.every(Number.isFinite)).toBe(true),
        );
      }
      disposeObject(monkey);
      disposeObject(trick.object);
    }
  });
  it('plants the feet throughout every throw and ducks at full size behind the sender', () => {
    const monkey = makeMonkey();
    const trick = new MonkeyTrick('monkey-0');
    const feet = [-1, 1].map((s) =>
      requireSceneObject(monkey, 'monkey-leg-' + s).getObjectByName('foot'),
    );
    const first = trick.plan.shots[0];
    if (!first) throw new Error('Missing first shot');
    trick.update(750 * trick.plan.pace, monkey, source, target, view);
    const planted = feet.map((f) => {
      if (!f) throw new Error('Missing foot');
      return world(f);
    });
    for (let ms = 750; ms <= 3800; ms += 50) {
      trick.update(ms * trick.plan.pace, monkey, source, target, view);
      for (const [i, f] of feet.entries()) {
        const p = planted[i];
        if (!f || !p) throw new Error('Missing foot');
        expect(world(f).distanceTo(p)).toBeLessThan(1e-6);
      }
    }
    const duckMs = trick.plan.retreat + 550 + trick.plan.duck + 150;
    trick.update(duckMs * trick.plan.pace, monkey, source, target, view);
    expect(monkey.position.x).toBe(source.left + source.width / 2);
    expect(monkey.scale.y).toBe(0.8);
    expect(monkey.visible).toBe(true);
    const body = requireSceneObject(monkey, 'monkey-body').children.find(
      (p) => p instanceof THREE.Mesh,
    );
    if (!(body instanceof THREE.Mesh)) throw new Error('Missing monkey body');
    expect(body.material.clippingPlanes[0]?.constant).toBe(source.top);
    trick.update((duckMs + 151) * trick.plan.pace, monkey, source, target, view);
    expect(monkey.visible).toBe(false);
    disposeObject(monkey);
    disposeObject(trick.object);
  });
  it('synchronizes four readable splats, growing runoff and neutral restoration without allocating frame geometry', () => {
    const monkey = makeMonkey();
    const trick = new MonkeyTrick('monkey-0');
    const geometry = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    for (const root of [monkey, trick.object])
      root.traverse((p) => {
        if (p instanceof THREE.Mesh) {
          geometry.add(p.geometry);
          materials.add(p.material);
        }
      });
    const drip = parts(trick.object, 'monkey-drip')[0];
    if (!drip) throw new Error('Missing runoff');
    const first = trick.plan.shots[0];
    if (!first) throw new Error('Missing first shot');
    trick.update(
      (first.release + first.flight + 100) * trick.plan.pace,
      monkey,
      source,
      target,
      view,
    );
    const length = drip.scale.y;
    trick.update(5000 * trick.plan.pace, monkey, source, target, view);
    expect(drip.scale.y).toBeGreaterThan(length);
    expect(parts(trick.object, 'monkey-splat').filter((p) => p.visible)).toHaveLength(20);
    expect(parts(trick.object, 'monkey-puddle').some((p) => p.visible)).toBe(true);
    const moved = { ...target, left: 300, width: 58, height: 84 };
    trick.update(5000 * trick.plan.pace, monkey, source, moved, view);
    for (const stain of parts(trick.object, 'monkey-splat')) {
      expect(stain.position.x).toBeGreaterThanOrEqual(moved.left);
      expect(stain.position.x).toBeLessThanOrEqual(moved.left + moved.width);
    }
    trick.update(MONKEY_DURATION * trick.plan.pace, monkey, source, moved, view);
    expect(trick.object.visible).toBe(false);
    expect(monkey.visible).toBe(false);
    expect(monkeyCardPose(MONKEY_DURATION, trick.plan, -1)).toEqual({
      x: 0,
      y: 0,
      angle: 0,
      sx: 1,
    });
    expect(trick.cardAnimation(1).frames.at(-1)).toMatchObject({
      translate: '0px 0px',
      rotate: '0deg',
      scale: '1 1',
    });
    for (const root of [monkey, trick.object])
      root.traverse((p) => {
        if (p instanceof THREE.Mesh) expect(geometry.has(p.geometry)).toBe(true);
      });
    let disposed = 0;
    for (const resource of [...geometry, ...materials])
      resource.addEventListener('dispose', () => disposed++);
    disposeObject(monkey);
    disposeObject(trick.object);
    expect(disposed).toBe(geometry.size + materials.size);
  });
  it('reproduces random-access poses without previous-frame history and follows live sender geometry', () => {
    const a = makeMonkey();
    const b = makeMonkey();
    const ta = new MonkeyTrick('monkey-2');
    const tb = new MonkeyTrick('monkey-2');
    for (let ms = 0; ms <= 1600; ms += 20) ta.update(ms * ta.plan.pace, a, source, target, view);
    tb.update(1600 * tb.plan.pace, b, source, target, view);
    expect(a.position).toEqual(b.position);
    expect(
      ta.object.children.map((p) => [p.visible, p.position.toArray(), p.scale.toArray()]),
    ).toEqual(tb.object.children.map((p) => [p.visible, p.position.toArray(), p.scale.toArray()]));
    const moved = { ...source, left: 200, top: 420, width: 58, height: 84 };
    tb.update(1600 * tb.plan.pace, b, moved, target, view);
    close(
      { x: b.position.x, y: -b.position.y },
      monkeyPosition(1600, tb.plan, moved, target, view),
    );
    disposeObject(a);
    disposeObject(b);
    disposeObject(ta.object);
    disposeObject(tb.object);
  });
});
