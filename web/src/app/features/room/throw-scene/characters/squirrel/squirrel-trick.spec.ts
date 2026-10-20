import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { makeSquirrel, squirrelModel, SQ_HIND_SOLE } from './squirrel-model';
import { SquirrelTrick } from './squirrel-trick';
import {
  ACORN_R,
  PICK,
  SMALL_ACORN,
  SQUIRREL_DURATION,
  STASH_PLACE,
  STASH_PUSH_END,
  squirrelCardPose,
  squirrelExitPoint,
  squirrelFloor,
  squirrelGeometry,
  squirrelLandingPoint,
  squirrelPlaced,
  squirrelPlan,
  squirrelStash,
} from './squirrel-choreography';
import { cardPoint, lowestWorldY, screenOf, sideOf } from '../../kit';
import { disposeObject } from '../../engine/throw-models';

const view = { x: 1200, y: 850 },
  start = { x: 260, y: 480 },
  card = { left: 600, top: 420, width: 84, height: 122 };
const layouts = [
  card,
  { left: 8, top: 500, width: 58, height: 84 },
  { left: 1120, top: 500, width: 58, height: 84 },
];
const NEUTRAL = { x: 0, y: 0, angle: 0, sx: 1, sy: 1 };

function fixture(id: string) {
  const actor = makeSquirrel(id),
    trick = new SquirrelTrick(actor),
    scene = new THREE.Scene();
  scene.add(actor, trick.object);
  return { actor, trick, plan: trick.plan, model: squirrelModel(actor) };
}
type Fixture = ReturnType<typeof fixture>;
const sideFor = (f: Fixture, b = card, chosen?: number) =>
  sideOf(b.left + b.width / 2 - squirrelLandingPoint(f.plan, b, view, chosen).x);
function at(f: Fixture, ms: number, b = card, facing = sideFor(f, b)) {
  f.trick.update(ms * f.plan.pace, f.actor, start, b, view, facing);
  f.actor.updateMatrixWorld(true);
  f.trick.object.updateMatrixWorld(true);
}
function clean(f: Fixture) {
  disposeObject(f.actor);
  disposeObject(f.trick.object);
}
function presence(root: THREE.Object3D) {
  const box = new THREE.Box3(),
    part = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (let up: THREE.Object3D | null = o; up && up !== root.parent; up = up.parent)
      if (!up.visible) return;
    o.geometry.computeBoundingBox();
    if (o.geometry.boundingBox)
      box.union(part.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
  });
  return box.getCenter(new THREE.Vector3());
}
function pawMid(f: Fixture) {
  const a = screenOf(f.model.paws[0]),
    b = screenOf(f.model.paws[1]);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
function centre(o: THREE.Object3D) {
  const v = o.getWorldPosition(new THREE.Vector3());
  return { x: v.x, y: -v.y };
}
function acorn(f: Fixture, name: string) {
  const found = f.trick.object.getObjectByName(name);
  if (!found) throw new Error(`missing ${name}`);
  return found;
}

describe('acorn hoarder squirrel performance', () => {
  it('samples a reproducible plan whose approach, stash, spill, collection and exit all vary', () => {
    expect(squirrelPlan('again')).toEqual(squirrelPlan('again'));
    const plans = Array.from({ length: 40 }, (_, i) => squirrelPlan(`squirrel-${i}`));
    for (const key of [
      'pace',
      'travel',
      'bend',
      'bound',
      'giant',
      'wedge',
      'overshove',
      'exitRise',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(40);
    for (const key of ['side', 'glance', 'teeters', 'flop', 'exit'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(2);
    for (const key of ['count', 'spill', 'orderKind'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(3);
    expect(new Set(plans.map((p) => p.looks.length)).size).toBe(2);
    for (const p of plans) {
      expect([...p.order].sort()).toEqual(p.rests.map((_, i) => i));
      expect(p.exitEnd + 250).toBeLessThan(SQUIRREL_DURATION);
    }
  });

  it('bounds continuously from the sender to its arrival point without a dead stop', () => {
    for (const id of [
      'squirrel-0',
      'squirrel-1',
      'squirrel-2',
      'squirrel-3',
      'squirrel-4',
      'squirrel-5',
    ]) {
      const f = fixture(id),
        p = f.plan;
      at(f, 0);
      const body = presence(f.actor);
      expect(
        Math.hypot(body.x - start.x, body.y + start.y),
        `${id} leaves from the sender`,
      ).toBeLessThan(45);
      const steps: number[] = [];
      let previous = f.actor.position.clone();
      for (let ms = p.travel * 0.15; ms <= p.travel * 0.85; ms += 8) {
        at(f, ms);
        steps.push(f.actor.position.distanceTo(previous));
        previous = f.actor.position.clone();
      }
      steps.shift();
      const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
      expect(Math.min(...steps), `${id} keeps moving`).toBeGreaterThan(0.3 * mean);
      at(f, p.travel);
      const end = squirrelLandingPoint(p, card, view, sideFor(f));
      expect(
        Math.hypot(f.actor.position.x - end.x, -f.actor.position.y - end.y),
        `${id} arrives`,
      ).toBeLessThan(0.01);
      clean(f);
    }
  });

  it('moves at full size through every stage and keeps its side through reflow and near the edges', () => {
    for (const id of ['squirrel-0', 'squirrel-1', 'squirrel-2']) {
      const f = fixture(id);
      at(f, 0);
      const scale = f.actor.scale.y;
      let previous = f.actor.position.clone(),
        turn = f.actor.quaternion.clone();
      for (let ms = 8; ms < SQUIRREL_DURATION; ms += 8) {
        at(f, ms);
        if (!f.actor.visible) continue;
        expect(f.actor.position.distanceTo(previous), `${id} at ${ms}`).toBeLessThan(14);
        expect(f.actor.quaternion.angleTo(turn), `${id} turn at ${ms}`).toBeLessThan(0.45);
        expect(Math.abs(f.actor.scale.y)).toBeCloseTo(Math.abs(scale), 6);
        previous = f.actor.position.clone();
        turn = f.actor.quaternion.clone();
      }
      clean(f);
    }
    for (let i = 0; i < 8; i++) {
      const f = fixture(`squirrel-${i}`);
      const facing = sideFor(f);
      expect(sideFor(f, { ...card, left: card.left + 140, width: 58, height: 84 }, facing)).toBe(
        facing,
      );
      expect(sideFor(f, { ...card, left: 6 })).toBe(-1);
      expect(sideFor(f, { ...card, left: view.x - card.width - 6 })).toBe(1);
      clean(f);
    }
  });

  it('seeks deterministically with finite transforms, restores the card and cleans up', () => {
    const f = fixture('squirrel-0');
    const probe = SQUIRREL_DURATION * 0.55;
    at(f, probe);
    const pose = f.actor.matrixWorld.clone(),
      stash = f.trick.object.children.map((c) => c.matrixWorld.clone());
    at(f, SQUIRREL_DURATION * 0.9);
    at(f, probe);
    expect(f.actor.matrixWorld.equals(pose)).toBe(true);
    f.trick.object.children.forEach((c, i) =>
      expect(c.matrixWorld.equals(stash[i] ?? new THREE.Matrix4())).toBe(true),
    );
    for (let ms = 0; ms <= SQUIRREL_DURATION; ms += 61) {
      at(f, ms);
      for (const root of [f.actor, f.trick.object])
        root.traverse((o) => expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
    }
    const animation = f.trick.cardAnimation(sideFor(f), card);
    expect(animation.frames.at(-1)).toMatchObject({
      translate: '0px 0px',
      rotate: '0deg',
      scale: '1 1',
    });
    for (const k of animation.frames) {
      const [x = 0, y = 0] = String(k['translate']).split(' ').map(parseFloat);
      const [sx = 1, sy = 1] = String(k['scale']).split(' ').map(Number);
      expect(Math.abs(x) + Math.abs(y)).toBeLessThan(60);
      expect(Math.abs(parseFloat(String(k['rotate'])))).toBeLessThan(30);
      expect(Math.min(sx, sy)).toBeGreaterThan(0.55);
    }
    at(f, SQUIRREL_DURATION + 1);
    expect(f.trick.object.visible).toBe(false);
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    for (const root of [f.actor, f.trick.object])
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          resources.add(o.geometry);
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) resources.add(m);
        }
      });
    const spies = Array.from(resources, (r) => vi.spyOn(r, 'dispose'));
    clean(f);
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });

  it('pinches each acorn exactly between its paws and lifts the card about its far corner as the stash grows', () => {
    for (const id of ['squirrel-0', 'squirrel-3', 'squirrel-6']) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = sideFor(f, b);
        expect(squirrelCardPose(p, squirrelPlaced(p, 0) - 1, facing, b)).toEqual(NEUTRAL);
        expect(squirrelCardPose(p, p.slam + 450, facing, b)).toEqual(NEUTRAL);
        const lifts: number[] = [];
        for (let k = 0; k < p.count; k++) {
          const pushed =
            squirrelStash(p, k) +
            p.stashBeat * (STASH_PLACE + 0.7 * (STASH_PUSH_END - STASH_PLACE));
          for (const ms of [squirrelStash(p, k) + p.stashBeat * 0.55, pushed]) {
            at(f, ms, b, facing);
            const paws = pawMid(f),
              held = centre(acorn(f, `squirrel-acorn-${k}`));
            expect(
              Math.hypot(paws.x - held.x, paws.y - held.y),
              `${id} acorn ${k} at ${ms}`,
            ).toBeLessThan(0.05);
          }
          lifts.push(Math.abs(squirrelCardPose(p, squirrelStash(p, k + 1) - 5, facing, b).angle));
          // The far bottom corner is the pivot: it never leaves the floor.
          const q = squirrelCardPose(p, pushed, facing, b);
          const corner = cardPoint(
            q,
            { x: facing > 0 ? b.left + b.width : b.left, y: b.top + b.height },
            b,
          );
          expect(
            Math.hypot(
              corner.x - (facing > 0 ? b.left + b.width : b.left),
              corner.y - b.top - b.height,
            ),
          ).toBeLessThan(1e-6);
        }
        for (let k = 1; k < lifts.length; k++)
          expect(lifts[k] ?? 0).toBeGreaterThan(lifts[k - 1] ?? 0);
        // The giant acorn lifts it further still, pushed with both paws on its cap.
        const wedged = Math.abs(squirrelCardPose(p, p.slip - 1, facing, b).angle);
        expect(wedged).toBeGreaterThan((lifts.at(-1) ?? 0) + 1.5);
        for (const ms of [p.contact + 100, p.wedged, p.slip - 20]) {
          at(f, ms, b, facing);
          const paws = pawMid(f),
            giant = centre(acorn(f, 'squirrel-giant-acorn'));
          const back = facing * (2.5 * p.giant * squirrelGeometry(p, b).s);
          expect(Math.abs(paws.x - (giant.x - back)), `${id} shove at ${ms}`).toBeLessThan(0.05);
        }
      }
      clean(f);
    }
  });

  it('keeps jointed limbs and plants its hind soles on the floor while it works', () => {
    for (const id of ['squirrel-1', 'squirrel-2']) {
      const f = fixture(id),
        p = f.plan;
      for (let ms = 0; ms < p.exitEnd; ms += 89) {
        at(f, ms);
        for (const limb of [...f.model.arms, ...f.model.legs]) {
          expect(limb.joint.position.length()).toBeCloseTo(limb.lengths[0], 4);
          expect(limb.end.position.distanceTo(limb.joint.position)).toBeCloseTo(limb.lengths[1], 4);
        }
      }
      for (const b of layouts)
        for (const ms of [
          squirrelStash(p, 0) + p.stashBeat * 0.3,
          squirrelStash(p, 1) + p.stashBeat * 0.8,
          (p.picks[0] ?? 0) + 60,
        ]) {
          at(f, ms, b);
          for (const leg of f.model.legs)
            expect(lowestWorldY(leg.end), `${id} ${ms}`).toBeCloseTo(-squirrelFloor(b), 3);
          for (const leg of f.model.legs)
            expect(leg.end.position.y + leg.root.position.y).toBeCloseTo(SQ_HIND_SOLE, 3);
        }
      clean(f);
    }
  });

  it('spills the stash onto the floor, collects every acorn into its cheeks and leaves carrying the giant one', () => {
    for (let i = 0; i < 8; i++) {
      const f = fixture(`squirrel-${i}`),
        p = f.plan;
      const facing = sideFor(f);
      const first = p.picks[0] ?? 0;
      at(f, first - 1);
      const floor = -squirrelFloor(card);
      for (let k = 0; k < p.count; k++)
        expect(lowestWorldY(acorn(f, `squirrel-acorn-${k}`)), `rests ${k}`).toBeCloseTo(floor, 3);
      expect(lowestWorldY(acorn(f, 'squirrel-giant-acorn'))).toBeCloseTo(floor, 3);
      expect(squirrelCardPose(p, first, facing, card)).toEqual(NEUTRAL);
      // Each acorn is pinched where it lies.
      p.order.forEach((k, j) => {
        at(f, (p.picks[j] ?? 0) + PICK - 10, card, facing);
        const paws = pawMid(f),
          nut = centre(acorn(f, `squirrel-acorn-${k}`));
        expect(Math.hypot(paws.x - nut.x, paws.y - nut.y), `pick ${k}`).toBeLessThan(0.05);
        expect(
          -squirrelFloor(card) + ACORN_R * SMALL_ACORN * squirrelGeometry(p, card).s,
        ).toBeCloseTo(-nut.y, 3);
      });
      at(f, p.departure);
      for (let k = 0; k < p.count; k++) expect(acorn(f, `squirrel-acorn-${k}`).visible).toBe(false);
      const mouth = screenOf(f.model.hold),
        giant = centre(acorn(f, 'squirrel-giant-acorn'));
      expect(Math.hypot(mouth.x - giant.x, mouth.y - giant.y)).toBeLessThan(1e-6);
      at(f, p.bite);
      const bitten = screenOf(f.model.hold);
      at(f, p.bite - 1);
      const resting = centre(acorn(f, 'squirrel-giant-acorn'));
      expect(
        Math.hypot(bitten.x - resting.x, bitten.y - resting.y),
        'teeth meet the resting acorn',
      ).toBeLessThan(0.3);
      at(f, p.exitEnd);
      const exit = squirrelExitPoint(p, card, view, facing);
      expect(f.actor.position.x).toBeCloseTo(exit.x, 3);
      expect(exit.x < 0 || exit.x > view.x).toBe(true);
      expect(f.actor.scale.y).toBeGreaterThan(0.7);
      clean(f);
    }
  });
});
