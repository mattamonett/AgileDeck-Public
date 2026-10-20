import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { makeElf, elfModel } from './elf-model';
import { ElfTrick } from './elf-trick';
import {
  ELF_DURATION,
  elfCardPose,
  elfChaseDir,
  elfLandingPoint,
  elfPlan,
  elfSlope,
  elfStrand,
  type ElfPlan,
} from './elf-choreography';
import { SPOOL_RADIUS } from './elf-model';
import { lowestWorldY, onCard, screenOf, sideOf } from '../../kit';
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
  const actor = makeElf(id),
    trick = new ElfTrick(actor),
    scene = new THREE.Scene();
  scene.add(actor, trick.object);
  return { actor, trick, plan: trick.plan, model: elfModel(actor) };
}
type Fixture = ReturnType<typeof fixture>;
const sideFor = (f: Fixture, b = card, chosen?: number) =>
  sideOf(b.left + b.width / 2 - elfLandingPoint(f.plan, b, view, chosen).x);
function at(f: Fixture, ms: number, b = card, facing = sideFor(f, b)) {
  f.trick.update(ms * f.plan.pace, f.actor, start, b, view, facing);
  f.actor.updateMatrixWorld(true);
  f.trick.object.updateMatrixWorld(true);
}
function clean(f: Fixture) {
  disposeObject(f.actor);
  disposeObject(f.trick.object);
}
/** Screen-space box of every visible mesh under a root. */
function screenBox(root: THREE.Object3D) {
  const box = new THREE.Box3(),
    piece = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (let up: THREE.Object3D | null = o; up && up !== root.parent; up = up.parent)
      if (!up.visible) return;
    o.geometry.computeBoundingBox();
    if (o.geometry.boundingBox)
      box.union(piece.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
  });
  return box;
}
function plans(count: number): ElfPlan[] {
  return Array.from({ length: count }, (_, i) => elfPlan(`elf-${i}`));
}
function stripPoint(mesh: THREE.Object3D | undefined, i: number) {
  if (!(mesh instanceof THREE.Mesh)) throw new Error('Missing strip');
  const p = mesh.geometry.getAttribute('position');
  return {
    x: (p.getX(i * 2) + p.getX(i * 2 + 1)) / 2,
    y: -(p.getY(i * 2) + p.getY(i * 2 + 1)) / 2,
  };
}
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('elf gift-wrapping performance', () => {
  it('samples one reproducible plan whose approach, wrapping and chase vary between events', () => {
    expect(elfPlan('again')).toEqual(elfPlan('again'));
    const all = plans(30);
    for (const key of [
      'pace',
      'travel',
      'bend',
      'winding',
      'surge',
      'beatAt',
      'wrapMs',
      'squeeze',
      'waistV',
      'bowU',
      'crook',
      'rollSpeed',
      'rollSlope',
    ] as const)
      expect(new Set(all.map((p) => p[key])).size, key).toBe(30);
    for (const key of ['side', 'weaves', 'skip', 'wraps', 'crooked', 'rollBack', 'proud'] as const)
      expect(new Set(all.map((p) => p[key])).size, key).toBe(2);
    expect(new Set(all.map((p) => p.ribbon)).size).toBe(3);
    for (const p of all) {
      expect(p.exitEnd + 400).toBeLessThan(ELF_DURATION);
      expect(p.unthreadEnd + 250).toBeLessThan(p.snatch);
      expect(p.wrapEnd).toBeLessThan(p.tie);
    }
  });

  it('trots from the sender to the card without ever stopping on the way', () => {
    for (const id of ['elf-0', 'elf-1', 'elf-2', 'elf-3', 'elf-4', 'elf-5']) {
      const f = fixture(id),
        p = f.plan;
      const steps: number[] = [];
      at(f, p.travel * 0.15);
      let previous = f.actor.position.clone();
      for (let ms = p.travel * 0.15 + 8; ms <= p.travel * 0.85; ms += 8) {
        at(f, ms);
        steps.push(f.actor.position.distanceTo(previous));
        previous = f.actor.position.clone();
      }
      const mean = steps.reduce((sum, s) => sum + s, 0) / steps.length;
      expect(Math.min(...steps), `${id} keeps moving`).toBeGreaterThanOrEqual(0.3 * mean);
      // It is at its stand point by the end of travel and stays there while it works.
      at(f, p.travel);
      const arrived = f.actor.position.clone();
      at(f, p.slip - 1);
      expect(f.actor.position.distanceTo(arrived)).toBeLessThan(1e-6);
      clean(f);
    }
  });

  it('leaves from the real sender and moves continuously at full size through every stage', () => {
    for (const [id, b] of [
      ['elf-0', card],
      ['elf-1', card],
      ['elf-2', card],
      ['elf-7', card],
      ['elf-4', layouts[1]],
      ['elf-6', layouts[2]],
    ] as const) {
      const f = fixture(id);
      if (!b) throw new Error('Missing layout');
      at(f, 0, b);
      const body = screenBox(f.actor).getCenter(new THREE.Vector3());
      expect(Math.hypot(body.x - start.x, body.y + start.y)).toBeLessThan(45);
      const scale = f.actor.scale.y;
      let previous = f.actor.position.clone(),
        turn = f.actor.quaternion.clone();
      for (let ms = 8; ms < ELF_DURATION; ms += 8) {
        at(f, ms, b);
        if (!f.actor.visible) continue;
        expect(f.actor.position.distanceTo(previous), `${id} at ${ms}`).toBeLessThan(14);
        expect(f.actor.quaternion.angleTo(turn), `${id} turn at ${ms}`).toBeLessThan(0.45);
        expect(Math.abs(f.actor.scale.y)).toBeCloseTo(Math.abs(scale), 6);
        previous = f.actor.position.clone();
        turn = f.actor.quaternion.clone();
      }
      clean(f);
    }
  }, 30000);

  it('keeps its chosen side through reflow and avoids viewport edges on first placement', () => {
    for (let i = 0; i < 8; i++) {
      const f = fixture(`elf-${i}`);
      const facing = sideFor(f);
      expect(sideFor(f, { ...card, left: card.left + 140, width: 58, height: 84 }, facing)).toBe(
        facing,
      );
      expect(sideFor(f, { ...card, left: 6 })).toBe(-1);
      expect(sideFor(f, { ...card, left: view.x - card.width - 6 })).toBe(1);
      clean(f);
    }
  });

  it('seeks deterministically with finite transforms and leaves a neutral card', () => {
    const f = fixture('elf-0');
    const probe = ELF_DURATION * 0.55;
    at(f, probe);
    const pose = f.actor.matrixWorld.clone();
    const ribbon = stripPoint(f.trick.object.getObjectByName('elf-ribbon'), 20);
    at(f, ELF_DURATION * 0.9);
    at(f, probe);
    expect(f.actor.matrixWorld.equals(pose)).toBe(true);
    expect(stripPoint(f.trick.object.getObjectByName('elf-ribbon'), 20)).toEqual(ribbon);
    for (let ms = 0; ms <= ELF_DURATION; ms += 61) {
      at(f, ms);
      for (const root of [f.actor, f.trick.object])
        root.traverse((o) => expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
    }
    for (const facing of [-1, 1]) {
      const { frames, options } = f.trick.cardAnimation(facing);
      expect(options.duration).toBeCloseTo(f.trick.duration, 6);
      expect(frames.at(-1)).toMatchObject({ translate: '0px 0px', rotate: '0deg', scale: '1 1' });
    }
    for (const p of plans(12))
      for (const facing of [-1, 1]) {
        for (let ms = 0; ms <= ELF_DURATION; ms += 20) {
          const q = elfCardPose(p, ms, facing);
          expect(Math.abs(q.x) + Math.abs(q.y)).toBeLessThan(60);
          expect(Math.abs(q.angle)).toBeLessThan(30);
          expect(Math.min(q.sx, q.sy)).toBeGreaterThan(0.55);
        }
      }
    at(f, ELF_DURATION + 1);
    expect(f.trick.object.visible).toBe(false);
    clean(f);
  });

  it('disposes every owned geometry and material exactly once', () => {
    const f = fixture('elf-0');
    at(f, f.plan.slip + 400);
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

  it('keeps every arm and leg segment at its fixed length', () => {
    for (const id of ['elf-0', 'elf-1', 'elf-2']) {
      const f = fixture(id);
      for (let ms = 0; ms < ELF_DURATION; ms += 53) {
        at(f, ms);
        for (const limb of [...f.model.arms, ...f.model.legs]) {
          const [upper, lower] = limb.lengths;
          expect(limb.joint.position.length()).toBeCloseTo(upper, 4);
          expect(limb.end.position.distanceTo(limb.joint.position)).toBeCloseTo(lower, 4);
        }
      }
      clean(f);
    }
  });

  it('keeps its real fingertip on the live card through the pin, the tie and the bow fix', () => {
    for (let n = 0; n < 12; n++) {
      const f = fixture(`elf-${n}`),
        p = f.plan;
      for (const b of layouts) {
        const facing = sideFor(f, b),
          near = facing > 0 ? 0 : 1;
        for (let ms = p.attach; ms < p.fixed - 200; ms += 10) {
          at(f, ms, b, facing);
          const q = elfCardPose(p, ms, facing);
          const want =
            ms < p.tie ? onCard(q, facing > 0 ? 0 : 1, p.waistV, b) : f.trick.workPoint(ms, q);
          expect(
            distance(screenOf(f.model.tips[near]), want),
            `elf-${n} ${b.left} ${ms}`,
          ).toBeLessThan(0.02);
        }
      }
      clean(f);
    }
  });

  it('pins the ribbon on the live near edge and ties the bow with its real fingertip', () => {
    for (const id of ['elf-0', 'elf-3', 'elf-5', 'elf-6']) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = sideFor(f, b),
          near = facing > 0 ? 0 : 1,
          nearU = facing > 0 ? 0 : 1;
        for (const ms of [
          p.attach,
          p.wrapStart + p.wrapMs * 0.7,
          p.wrapEnd - 20,
          p.tied,
          p.tied + 300,
          p.crooked ? p.tied + 820 : p.tied + 280,
        ]) {
          at(f, ms, b, facing);
          const q = elfCardPose(p, ms, facing);
          const tip = screenOf(f.model.tips[near]);
          const want = ms < p.tie ? onCard(q, nearU, p.waistV, b) : f.trick.workPoint(ms, q);
          expect(distance(tip, want), `${id} ${ms} fingertip`).toBeLessThan(0.02);
          if (ms < p.tie) {
            // The ribbon runs from the spool in the other hand to that same edge point.
            const ribbon = f.trick.object.getObjectByName('elf-ribbon');
            expect(distance(stripPoint(ribbon, 40), want)).toBeLessThan(1e-3);
            const spool = screenOf(f.model.spools[near ? 0 : 1].group);
            expect(distance(stripPoint(ribbon, 0), spool)).toBeLessThan(
              SPOOL_RADIUS * f.actor.scale.x,
            );
          }
        }
        // While tied, the knot is the fingertip target.
        at(f, p.tied, b, facing);
        expect(
          distance(
            f.trick.workPoint(p.tied, elfCardPose(p, p.tied, facing)),
            f.trick.bowPoint(p.tied, elfCardPose(p, p.tied, facing), 0, 0),
          ),
        ).toBeLessThan(1e-6);
      }
      clean(f);
    }
  });

  it('stands on its real soles while it works at the card', () => {
    for (const id of ['elf-0', 'elf-2', 'elf-4']) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = sideFor(f, b);
        for (const ms of [
          p.travel + 50,
          p.attach + 100,
          p.wrapStart + p.wrapMs * 0.8,
          p.tie + 300,
          p.tied + 400,
        ]) {
          at(f, ms, b, facing);
          let lowest = Infinity;
          for (const leg of f.model.legs) lowest = Math.min(lowest, lowestWorldY(leg.end));
          expect(lowest, `${id} ${ms}`).toBeCloseTo(f.actor.position.y, 3);
        }
      }
      clean(f);
    }
  });

  it('squeezes the card only once a wrap is cinched and releases it fully as the ribbon unthreads', () => {
    for (const p of plans(10))
      for (const facing of [-1, 1]) {
        expect(elfCardPose(p, p.attach - 1, facing)).toEqual(NEUTRAL);
        expect(elfCardPose(p, p.attach + 110, facing).x * facing).toBeGreaterThan(0.5);
        expect(elfCardPose(p, p.wrapEnd + 60, facing).sx).toBeLessThan(0.95);
        expect(elfCardPose(p, p.slip, facing).sx).toBeLessThan(0.95);
        expect(elfCardPose(p, p.unthreadEnd + 900, facing)).toEqual(NEUTRAL);
        for (let k = 0; k < p.wraps; k++) {
          expect(elfStrand(p, p.wrapStart - 1, k)).toBe(0);
          expect(elfStrand(p, p.slip, k)).toBe(1);
          expect(elfStrand(p, p.unthreadEnd, k)).toBe(0);
        }
      }
    const f = fixture('elf-1'),
      p = f.plan;
    at(f, p.tied + 100);
    expect(f.trick.object.getObjectByName('elf-bow')?.visible).toBe(true);
    at(f, p.unthreadEnd + 10);
    expect(f.trick.object.getObjectByName('elf-bow')?.visible).toBe(false);
    for (let k = 0; k < p.wraps; k++)
      expect(f.trick.object.getObjectByName(`elf-wrap-${k}`)?.visible).toBe(false);
    clean(f);
  });

  it('drops the real spool from its fist, rolls it on the floor and catches it in the same fist pose', () => {
    for (const id of ['elf-0', 'elf-1', 'elf-2', 'elf-3', 'elf-8']) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = sideFor(f, b),
          side = facing > 0 ? 1 : -1;
        const far = side > 0 ? 1 : 0,
          chaser = elfChaseDir(p, side) > 0 ? 0 : 1;
        const free = f.trick.object.getObjectByName('elf-rolling-spool');
        if (!free) throw new Error('Missing rolling spool');
        const held = new THREE.Vector3(),
          heldQ = new THREE.Quaternion(),
          freeAt = new THREE.Vector3(),
          freeQ = new THREE.Quaternion();
        // Slip: the loose spool starts exactly where and how the held one was.
        at(f, p.slip - 0.01, b, facing);
        f.model.spools[far].group.getWorldPosition(held);
        f.model.spools[far].group.getWorldQuaternion(heldQ);
        at(f, p.slip, b, facing);
        free.getWorldPosition(freeAt);
        free.getWorldQuaternion(freeQ);
        expect(free.visible && !f.model.spools[far].group.visible).toBe(true);
        expect(Math.hypot(freeAt.x - held.x, freeAt.y - held.y), `${id} slip`).toBeLessThan(0.05);
        expect(freeQ.angleTo(heldQ)).toBeLessThan(0.01);
        // Rolling: resting on the floor line, turning exactly as far as it travels.
        at(f, p.travel + 10, b, facing);
        const stand = { x: f.actor.position.x, y: -f.actor.position.y };
        const dir = elfChaseDir(p, side),
          slope = elfSlope(p);
        for (const ms of [p.snatch - 300, p.snatch - 160]) {
          at(f, ms, b, facing);
          const centre = f.trick.spoolCentre(ms);
          const floor = stand.y + slope * (centre.x - stand.x) * dir;
          expect(-lowestWorldY(free)).toBeCloseTo(floor, 0);
          free.getWorldQuaternion(freeQ);
          at(f, ms + 24, b, facing);
          const later = f.trick.spoolCentre(ms + 24);
          const q2 = new THREE.Quaternion();
          free.getWorldQuaternion(q2);
          const delta = q2.multiply(freeQ.invert());
          const half = 2 * Math.atan2(delta.z, delta.w),
            turned = Math.atan2(Math.sin(half), Math.cos(half));
          const travelled = distance(later, centre) / (SPOOL_RADIUS * f.actor.scale.x);
          expect(-dir * turned).toBeCloseTo(travelled, 3);
        }
        // Catch: the scooping fist closes exactly on the rolling spool, which keeps its turn.
        at(f, p.snatch - 0.01, b, facing);
        free.getWorldPosition(freeAt);
        free.getWorldQuaternion(freeQ);
        at(f, p.snatch, b, facing);
        f.model.spools[chaser].group.getWorldPosition(held);
        f.model.spools[chaser].group.getWorldQuaternion(heldQ);
        expect(f.model.spools[chaser].group.visible && !free.visible).toBe(true);
        expect(Math.hypot(freeAt.x - held.x, freeAt.y - held.y), `${id} catch`).toBeLessThan(0.05);
        expect(freeQ.angleTo(heldQ)).toBeLessThan(0.01);
      }
      clean(f);
    }
  });

  it('runs fully out of the viewport at full size with the spool and its trailing ribbon', () => {
    for (const id of ['elf-0', 'elf-1', 'elf-4', 'elf-6', 'elf-8']) {
      const f = fixture(id);
      for (const b of layouts) {
        const facing = sideFor(f, b);
        at(f, 0, b, facing);
        const scale = f.actor.scale.x;
        at(f, ELF_DURATION - 1, b, facing);
        expect(f.actor.visible).toBe(true);
        expect(f.model.spools.some((spool) => spool.group.visible)).toBe(true);
        expect(f.actor.scale.x).toBe(scale);
        for (const root of [f.actor, f.trick.object]) {
          const box = screenBox(root);
          const outside =
            box.isEmpty() ||
            box.min.x > view.x ||
            box.max.x < 0 ||
            -box.max.y > view.y ||
            -box.min.y < 0;
          expect(outside, `${id} ${root.name}`).toBe(true);
        }
      }
      clean(f);
    }
  });
});
