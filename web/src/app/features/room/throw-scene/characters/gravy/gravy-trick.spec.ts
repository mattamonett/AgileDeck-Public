import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { gravyModel, makeGravy } from './gravy-model';
import { GravyTrick } from './gravy-trick';
import {
  GRAVY_DURATION,
  gravyCardPose,
  gravyExitPoint,
  gravyFloor,
  gravyLandingPoint,
  gravyPlan,
  gravyRunoffs,
  gravySpots,
  gravyWipePoint,
  type GravyPlan,
} from './gravy-choreography';
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
  const actor = makeGravy(id),
    trick = new GravyTrick(actor),
    scene = new THREE.Scene();
  scene.add(actor, trick.object);
  return { actor, trick, plan: trick.plan, model: gravyModel(actor) };
}
type Fixture = ReturnType<typeof fixture>;
const sideFor = (plan: GravyPlan, b = card, chosen?: number) =>
  sideOf(b.left + b.width / 2 - gravyLandingPoint(plan, b, view, chosen).x);
function at(f: Fixture, ms: number, b = card, facing = sideFor(f.plan, b)) {
  f.trick.update(ms * f.plan.pace, f.actor, start, b, view, facing);
  f.actor.updateMatrixWorld(true);
  f.trick.object.updateMatrixWorld(true);
}
function clean(f: Fixture) {
  disposeObject(f.actor);
  disposeObject(f.trick.object);
}
/** Centre of the visible geometry, so a root at the soles is judged by the body it carries. */
function presence(root: THREE.Object3D) {
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
  return box.getCenter(new THREE.Vector3());
}
function stripCentre(f: Fixture, name: string, i: number) {
  const strip = f.trick.object.getObjectByName(name);
  if (!(strip instanceof THREE.Mesh)) throw new Error(`Missing ${name}`);
  const p = strip.geometry.getAttribute('position');
  return {
    x: (p.getX(i * 2) + p.getX(i * 2 + 1)) / 2,
    y: -(p.getY(i * 2) + p.getY(i * 2 + 1)) / 2,
  };
}
const plans = (count: number) => Array.from({ length: count }, (_, i) => gravyPlan(`gravy-${i}`));

describe('gravy boat captain performance', () => {
  it('samples one reproducible plan whose approach, pour, cleanup and exit all vary', () => {
    expect(gravyPlan('again')).toEqual(gravyPlan('again'));
    const all = plans(40);
    for (const key of [
      'pace',
      'travel',
      'bend',
      'rhythm',
      'beatAt',
      'beatDip',
      'pourHigh',
      'poolN',
      'tipMax',
      'strokeMs',
      'exitRise',
    ] as const)
      expect(new Set(all.map((p) => p[key])).size, key).toBe(40);
    for (const key of [
      'side',
      'march',
      'beat',
      'flood',
      'wipe',
      'streak',
      'exit',
      'bites',
    ] as const)
      expect(new Set(all.map((p) => p[key])).size, key).toBe(2);
    expect(new Set(all.map((p) => p.strokes)).size).toBe(3);
    for (const p of all) {
      expect(p.contact).toBeGreaterThan(p.travel);
      expect(p.wipeStart).toBeGreaterThan(p.dry + p.fall);
      expect(p.recovered).toBeLessThan(p.exitEnd);
      expect(p.exitEnd + 500).toBeLessThan(GRAVY_DURATION);
    }
  });

  it('walks from the sender without dead stops, moving continuously at full size through every stage', () => {
    for (const id of ['gravy-0', 'gravy-1', 'gravy-2', 'gravy-3']) {
      const f = fixture(id),
        p = f.plan;
      at(f, 0);
      const body = presence(f.actor);
      expect(
        Math.hypot(body.x - start.x, body.y + start.y),
        `${id} leaves from the sender`,
      ).toBeLessThan(45);
      const steps: number[] = [];
      at(f, p.travel * 0.15);
      let last = f.actor.position.clone();
      for (let ms = p.travel * 0.15 + 8; ms <= p.travel * 0.85; ms += 8) {
        at(f, ms);
        steps.push(f.actor.position.distanceTo(last));
        last = f.actor.position.clone();
      }
      const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
      for (const step of steps)
        expect(step, `${id} keeps moving`).toBeGreaterThanOrEqual(0.3 * mean);
      at(f, 0);
      const scale = f.actor.scale.y;
      let previous = f.actor.position.clone(),
        turn = f.actor.quaternion.clone();
      for (let ms = 8; ms < GRAVY_DURATION; ms += 8) {
        at(f, ms);
        if (!f.actor.visible) continue;
        expect(f.actor.position.distanceTo(previous), `${id} at ${ms}`).toBeLessThan(14);
        expect(f.actor.quaternion.angleTo(turn), `${id} turn at ${ms}`).toBeLessThan(0.45);
        expect(Math.abs(f.actor.scale.y)).toBeCloseTo(Math.abs(scale), 6);
        previous = f.actor.position.clone();
        turn = f.actor.quaternion.clone();
      }
      at(f, p.travel);
      const stand = gravyLandingPoint(p, card, view, sideFor(p));
      expect(f.actor.position.x).toBeCloseTo(stand.x, 3);
      expect(-f.actor.position.y).toBeCloseTo(stand.y, 3);
      clean(f);
    }
  });

  it('keeps its chosen side through reflow and avoids viewport edges on first placement', () => {
    for (const p of plans(10)) {
      const facing = sideFor(p);
      expect(sideFor(p, { ...card, left: card.left + 140, width: 58, height: 84 }, facing)).toBe(
        facing,
      );
      expect(sideFor(p, { ...card, left: 6 })).toBe(-1);
      expect(sideFor(p, { ...card, left: view.x - card.width - 6 })).toBe(1);
    }
  });

  it('pours a connected stream from the real boat lip onto the live card', () => {
    for (const id of ['gravy-0', 'gravy-1', 'gravy-4']) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = sideFor(p, b),
          u = facing > 0 ? p.poolN : 1 - p.poolN;
        for (const ms of [p.contact + 20, p.tip + 150, p.right - 40]) {
          at(f, ms, b, facing);
          const lip = screenOf(f.model.lip),
            land = onCard(gravyCardPose(p, ms, facing), u, p.poolV, b);
          const first = stripCentre(f, 'gravy-stream', 0),
            last = stripCentre(f, 'gravy-stream', 16);
          expect(
            Math.hypot(first.x - lip.x, first.y - lip.y),
            `${id} ${ms} from the lip`,
          ).toBeLessThan(0.01);
          expect(
            Math.hypot(last.x - land.x, last.y - land.y),
            `${id} ${ms} onto the card`,
          ).toBeLessThan(0.01);
          expect(lip.y, `${id} ${ms} pours downward`).toBeLessThan(land.y - 4);
          expect(lip.x).toBeGreaterThan(b.left);
          expect(lip.x).toBeLessThan(b.left + b.width);
        }
      }
      clean(f);
    }
  });

  it('presses the real roll onto the live card along every stroke, with jointed limbs and planted soles', () => {
    for (const id of ['gravy-0', 'gravy-2', 'gravy-3', 'gravy-5']) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = sideFor(p, b),
          floor = -gravyFloor(b);
        for (let ms = p.wipeStart; ms <= p.wipeEnd; ms += 61) {
          at(f, ms, b, facing);
          const spot = gravyWipePoint(p, ms);
          const target = onCard(
            gravyCardPose(p, ms, facing),
            facing > 0 ? spot.n : 1 - spot.n,
            spot.v,
            b,
          );
          const roll = screenOf(f.model.wiper);
          expect(Math.hypot(roll.x - target.x, roll.y - target.y), `${id} ${ms}`).toBeLessThan(
            0.05,
          );
        }
        for (const ms of [p.pour, p.tip + 200, p.oops, p.wipeStart + 100, p.wipeEnd - 50]) {
          at(f, ms, b, facing);
          let lowest = Infinity;
          for (const leg of f.model.legs) lowest = Math.min(lowest, lowestWorldY(leg.end));
          expect(lowest, `${id} sole at ${ms}`).toBeCloseTo(floor, 3);
        }
      }
      for (let ms = 0; ms < p.exitEnd; ms += 83) {
        at(f, ms);
        for (const limb of [...f.model.arms, ...f.model.legs]) {
          expect(limb.joint.position.length()).toBeCloseTo(limb.lengths[0], 4);
          expect(limb.end.position.distanceTo(limb.joint.position)).toBeCloseTo(limb.lengths[1], 4);
        }
        expect(f.model.boat.parent).toBe(f.model.arms[0].end);
        expect(f.model.roll.parent).toBe(f.model.arms[1].end);
      }
      clean(f);
    }
  });

  it('sags under the flood, mops every drop up, restores the card and leaves no gravy behind', () => {
    for (const p of plans(12)) {
      for (const facing of [-1, 1]) {
        expect(gravyCardPose(p, p.contact - 1, facing)).toEqual(NEUTRAL);
        const heavy = gravyCardPose(p, p.right + 60, facing);
        expect(Math.sign(heavy.angle)).toBe(-facing);
        expect(heavy.y).toBeGreaterThan(0.8);
        expect(gravyCardPose(p, p.recovered, facing)).toEqual(NEUTRAL);
      }
      for (const spot of gravySpots(p)) expect(spot.wiped).toBeLessThanOrEqual(p.wipeEnd);
      for (const runoff of gravyRunoffs(p)) expect(runoff.wiped).toBeLessThanOrEqual(p.wipeEnd);
    }
    for (const id of ['gravy-0', 'gravy-1', 'gravy-2', 'gravy-3', 'gravy-6']) {
      const f = fixture(id),
        p = f.plan;
      const gravy = () =>
        f.trick.object.children.filter(
          (o) => o.visible && /gravy-(pool|runoff|stream)/.test(o.name),
        ).length;
      at(f, p.flow - 5);
      expect(gravy()).toBe(0);
      at(f, p.right + 200);
      expect(gravy()).toBeGreaterThan(8);
      at(f, p.wipeEnd + 700);
      expect(gravy(), `${id} mopped up`).toBe(0);
      expect(f.trick.object.getObjectByName('gravy-streak')?.visible).toBe(p.streak);
      at(f, p.exitEnd - 10);
      expect(f.trick.object.getObjectByName('gravy-puddle')?.visible).toBe(true);
      const animation = f.trick.cardAnimation(sideFor(p));
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
      at(f, GRAVY_DURATION + 1);
      expect(f.trick.object.visible).toBe(false);
      expect(f.actor.visible).toBe(false);
      clean(f);
    }
  });

  it('walks fully out of view at full size, eating the roll or backing away first', () => {
    for (const id of ['gravy-0', 'gravy-1', 'gravy-2', 'gravy-3', 'gravy-4']) {
      const f = fixture(id),
        p = f.plan;
      at(f, p.departure);
      const scale = f.actor.scale.x;
      at(f, p.exitEnd - 200);
      const eaten = f.model.lobes.filter((lobe) => !lobe.visible).length;
      expect(eaten).toBe(p.exit === 'nibble' ? p.bites : 0);
      at(f, p.exitEnd);
      const exit = gravyExitPoint(p, card, view, sideFor(p));
      expect(f.actor.position.x).toBeCloseTo(exit.x, 3);
      expect(exit.x < -100 || exit.x > view.x + 100).toBe(true);
      expect(f.actor.scale.x).toBe(scale);
      clean(f);
    }
  });

  it('seeks deterministically with finite transforms and disposes every resource exactly once', () => {
    const f = fixture('gravy-0'),
      p = f.plan;
    for (const probe of [p.travel * 0.5, p.tip + 100, p.wipeStart + 200, p.departure + 600]) {
      at(f, probe);
      const pose = f.actor.matrixWorld.clone();
      const roll = screenOf(f.model.wiper);
      at(f, GRAVY_DURATION * 0.9);
      at(f, probe);
      expect(f.actor.matrixWorld.equals(pose)).toBe(true);
      expect(screenOf(f.model.wiper)).toEqual(roll);
    }
    for (let ms = 0; ms <= GRAVY_DURATION; ms += 61) {
      at(f, ms);
      for (const root of [f.actor, f.trick.object])
        root.traverse((o) => expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
    }
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    for (const root of [f.actor, f.trick.object])
      root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          resources.add(o.geometry);
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) resources.add(m);
        }
      });
    const spies = Array.from(resources, (r) => vi.spyOn(r, 'dispose'));
    clean(f);
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});
