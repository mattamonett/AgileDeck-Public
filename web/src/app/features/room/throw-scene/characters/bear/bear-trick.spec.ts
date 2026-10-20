import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { bearModel, makeBear } from './bear-model';
import { BearTrick } from './bear-trick';
import {
  BEAR_DURATION,
  BEAR_PIE_RADIUS,
  bearCardPose,
  bearExitPoint,
  bearLandingPoint,
  bearPlan,
  bearU,
  type BearPlan,
} from './bear-choreography';
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
  const actor = makeBear(id),
    trick = new BearTrick(actor),
    scene = new THREE.Scene();
  scene.add(actor, trick.object);
  return { actor, trick, plan: trick.plan, model: bearModel(actor) };
}
type Fixture = ReturnType<typeof fixture>;
function facingFor(plan: BearPlan, b = card, chosen?: number) {
  return sideOf(b.left + b.width / 2 - bearLandingPoint(plan, b, view, chosen).x);
}
function at(f: Fixture, ms: number, b = card, facing = facingFor(f.plan, b)) {
  f.trick.update(ms * f.plan.pace, f.actor, start, b, view, facing);
  f.actor.updateMatrixWorld(true);
  f.trick.object.updateMatrixWorld(true);
}
function clean(f: Fixture) {
  disposeObject(f.actor);
  disposeObject(f.trick.object);
}
/** Centre of the visible geometry, so a root at the feet is judged by the body it carries. */
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
/** Area of an extruded shape's top cap, i.e. the pie's silhouette seen from above. */
function capArea(geometry: THREE.BufferGeometry): number {
  const points = geometry.getAttribute('position');
  let top = -Infinity,
    area = 0;
  for (let i = 0; i < points.count; i++) top = Math.max(top, points.getZ(i));
  for (let i = 0; i + 2 < points.count; i += 3) {
    if ([0, 1, 2].some((j) => Math.abs(points.getZ(i + j) - top) > 1e-6)) continue;
    const ax = points.getX(i + 1) - points.getX(i),
      ay = points.getY(i + 1) - points.getY(i);
    const bx = points.getX(i + 2) - points.getX(i),
      by = points.getY(i + 2) - points.getY(i);
    area += Math.abs(ax * by - ay * bx) / 2;
  }
  return area;
}
function plans(count: number) {
  return Array.from({ length: count }, (_, i) => bearPlan(`bear-${i}`));
}

describe('hungry bear performance', () => {
  it('samples one reproducible plan that varies every stage and finishes in time', () => {
    expect(bearPlan('again')).toEqual(bearPlan('again'));
    const all = plans(30);
    expect(new Set(all.map((p) => p.side)).size).toBe(2);
    for (const key of [
      'pace',
      'travel',
      'bend',
      'meander',
      'surge',
      'pressure',
      'pieDepth',
      'exitRise',
      'phase',
    ] as const)
      expect(new Set(all.map((p) => p[key])).size, key).toBe(30);
    for (const key of ['find', 'nods', 'chews'] as const)
      expect(new Set(all.map((p) => p[key])).size, key).toBe(2);
    expect(new Set(all.map((p) => p.ending)).size).toBe(3);
    expect(new Set(all.map((p) => p.bites)).size).toBe(3);
    expect(new Set(all.map((p) => p.prints.length)).size).toBe(3);
    expect(new Set(all.map((p) => p.sniffs.length)).size).toBe(2);
    for (const p of plans(200)) {
      expect(p.cleanup + 600).toBeLessThan(BEAR_DURATION);
      expect(p.arrive).toBe(p.travel);
      // Prints stay off the value: inside the near third, or below it.
      for (const print of p.prints) expect(print.depth < 0.3 || print.v > 0.62).toBe(true);
    }
  });

  it('keeps walking from the sender to the card without a dead stop', () => {
    for (const id of ['bear-0', 'bear-1', 'bear-2', 'bear-3']) {
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
      for (let ms = p.travel * 0.15 + 8; ms <= p.travel * 0.85; ms += 8) {
        at(f, ms);
        steps.push(f.actor.position.distanceTo(previous));
        previous = f.actor.position.clone();
      }
      const mean = steps.reduce((sum, s) => sum + s, 0) / steps.length;
      for (const step of steps) expect(step, id).toBeGreaterThan(mean * 0.3);
      at(f, p.travel);
      const stand = bearLandingPoint(p, card, view, facingFor(p));
      expect(f.actor.position.x).toBeCloseTo(stand.x, 3);
      expect(-f.actor.position.y).toBeCloseTo(stand.y, 3);
      clean(f);
    }
  });

  it('moves continuously at full size through every stage and seeks deterministically', () => {
    for (const id of ['bear-0', 'bear-1', 'bear-2']) {
      const f = fixture(id);
      at(f, 0);
      const scale = f.actor.scale.y;
      let previous = f.actor.position.clone(),
        turn = f.actor.quaternion.clone();
      for (let ms = 8; ms < BEAR_DURATION; ms += 8) {
        at(f, ms);
        if (!f.actor.visible) continue;
        expect(f.actor.position.distanceTo(previous), `${id} at ${ms}`).toBeLessThan(14);
        expect(f.actor.quaternion.angleTo(turn), `${id} turn at ${ms}`).toBeLessThan(0.45);
        expect(Math.abs(f.actor.scale.y)).toBeCloseTo(Math.abs(scale), 6);
        previous = f.actor.position.clone();
        turn = f.actor.quaternion.clone();
      }
      const probe = BEAR_DURATION * 0.55;
      at(f, probe);
      const pose = f.actor.matrixWorld.clone(),
        pie = f.trick.pie.matrixWorld.clone();
      at(f, BEAR_DURATION * 0.9);
      at(f, probe);
      expect(f.actor.matrixWorld.equals(pose)).toBe(true);
      expect(f.trick.pie.matrixWorld.equals(pie)).toBe(true);
      for (let ms = 0; ms <= BEAR_DURATION; ms += 61) {
        at(f, ms);
        for (const root of [f.actor, f.trick.object])
          root.traverse((o) => expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
      }
      at(f, BEAR_DURATION + 1);
      expect(f.trick.object.visible).toBe(false);
      expect(f.actor.visible).toBe(false);
      clean(f);
    }
  }, 20000); // Samples every 8 ms across the whole 13.9 s performance.

  it('keeps its chosen side through reflow and avoids viewport edges on first placement', () => {
    for (const p of plans(8)) {
      const facing = facingFor(p);
      expect(facingFor(p, { ...card, left: card.left + 140, width: 58, height: 84 }, facing)).toBe(
        facing,
      );
      expect(facingFor(p, { ...card, left: 6 })).toBe(-1);
      expect(facingFor(p, { ...card, left: view.x - card.width - 6 })).toBe(1);
    }
  });

  it('dips the card only under real paw presses and restores it completely', () => {
    for (const p of plans(10))
      for (const facing of [-1, 1]) {
        const first = p.prints[0]?.at ?? 0;
        expect(bearCardPose(p, first - 1, facing)).toEqual(NEUTRAL);
        expect(bearCardPose(p, first + 50, facing).y).toBeGreaterThan(0.5);
        expect(bearCardPose(p, p.recovered, facing)).toEqual(NEUTRAL);
        expect(bearCardPose(p, BEAR_DURATION - 1, facing)).toEqual(NEUTRAL);
      }
    const f = fixture('bear-0');
    const animation = f.trick.cardAnimation(facingFor(f.plan));
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
    clean(f);
  });

  it('presses its real honey soles onto the live card and leaves each print exactly there', () => {
    for (const id of ['bear-0', 'bear-1', 'bear-3']) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = facingFor(p, b),
          L = f.trick.layout(start, b, view, facing);
        p.prints.forEach((print, k) => {
          const sole = f.model.soles[f.trick.armFor(print.paw, L.side)];
          const want = onCard(
            bearCardPose(p, print.at, facing),
            bearU(L.side, print.depth),
            print.v,
            b,
          );
          f.trick.stage(print.at, L);
          const pressed = screenOf(sole);
          expect(
            Math.hypot(pressed.x - want.x, pressed.y - want.y),
            `${id} print ${k}`,
          ).toBeLessThan(0.05);
          // While the card is still giving under the paw, the paw rides it.
          f.trick.stage(print.at + 60, L);
          const held = screenOf(sole),
            live = onCard(
              bearCardPose(p, print.at + 60, facing),
              bearU(L.side, print.depth),
              print.v,
              b,
            );
          expect(Math.hypot(held.x - live.x, held.y - live.y)).toBeLessThan(0.05);
          at(f, print.at + 400, b, facing);
          const mark = f.trick.object.getObjectByName(`bear-print-${k}`);
          const q = bearCardPose(p, print.at + 400, facing),
            spot = onCard(q, bearU(L.side, print.depth), print.v, b);
          expect(mark?.visible).toBe(true);
          expect(mark?.position.x).toBeCloseTo(spot.x, 2);
          expect(mark?.position.y).toBeCloseTo(-spot.y, 2);
        });
      }
      at(f, (p.prints[0]?.at ?? 0) - 1);
      expect(f.trick.object.getObjectByName('bear-print-0')?.visible).toBe(false);
      clean(f);
    }
  });

  it('takes separate bites with its real mouth on the rim, holding the pie in both paws', () => {
    for (const id of ['bear-0', 'bear-2', 'bear-4']) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const L = f.trick.layout(start, b, view, facingFor(p, b));
        p.biteTimes.forEach((bite, k) => {
          // The last bite is stuffed in whole, so check it just before the pie disappears.
          const ms = k === p.bites - 1 ? bite - 0.01 : bite;
          const frame = f.trick.stage(ms, L);
          if (!frame.pie) throw new Error('Missing pie at bite');
          const a = p.biteAngles[k] ?? 0;
          const notch = new THREE.Vector3(
            Math.cos(a) * BEAR_PIE_RADIUS,
            Math.sin(a) * BEAR_PIE_RADIUS,
            0,
          ).applyMatrix4(frame.pie);
          const mouth = screenOf(f.model.mouth);
          expect(Math.hypot(mouth.x - notch.x, mouth.y + notch.y), `${id} bite ${k}`).toBeLessThan(
            0.2,
          );
        });
        for (const ms of [p.grab, p.snap + 150, p.seated + 100, (p.biteTimes[0] ?? 0) - 100]) {
          const frame = f.trick.stage(ms, L);
          if (!frame.pie) throw new Error('Missing held pie');
          for (const arm of [0, 1] as const) {
            const grip = new THREE.Vector3(
              arm ? BEAR_PIE_RADIUS : -BEAR_PIE_RADIUS,
              0,
              1.1,
            ).applyMatrix4(frame.pie);
            const paw = f.model.arms[arm].end.getWorldPosition(new THREE.Vector3());
            expect(
              Math.hypot(paw.x - grip.x, paw.y - grip.y),
              `${id} grip ${arm} at ${ms}`,
            ).toBeLessThan(2);
          }
        }
      }
      // Each bite leaves a visibly smaller pie: the same object, its silhouette bitten away.
      const sizes = [p.seated + 50, ...p.biteTimes.slice(0, -1).map((t) => t + 300)].map((ms) => {
        at(f, ms);
        const shown = f.trick.pie.children.find((stage) => stage.visible);
        const shell = shown?.getObjectByName('bear-pie-shell');
        if (!(shell instanceof THREE.Mesh)) throw new Error('Missing pie shell');
        return capArea(shell.geometry);
      });
      for (let k = 1; k < sizes.length; k++)
        expect(sizes[k] ?? 0).toBeLessThan((sizes[k - 1] ?? 0) * 0.93);
      at(f, (p.biteTimes.at(-1) ?? 0) + 10);
      expect(f.trick.pie.visible).toBe(false);
      at(f, p.swallow + 900);
      const floor = -(card.top + card.height * 1.05);
      for (let k = 0; k < p.bites; k++)
        for (let i = 0; i < 4; i++) {
          const crumb = f.trick.object.getObjectByName(`bear-crumb-${k}-${i}`);
          if (!(crumb instanceof THREE.Mesh)) throw new Error('Missing crumb');
          expect(crumb.visible).toBe(true);
          expect(lowestWorldY(crumb)).toBeCloseTo(floor, 3);
        }
      clean(f);
    }
  });

  it('keeps jointed limbs and plants its soles on the floor while it stands and climbs', () => {
    for (const id of ['bear-0', 'bear-1', 'bear-5']) {
      const f = fixture(id),
        p = f.plan;
      for (let ms = 0; ms < BEAR_DURATION; ms += 97) {
        at(f, ms);
        for (const limb of [...f.model.arms, ...f.model.legs]) {
          expect(limb.joint.position.length()).toBeCloseTo(limb.lengths[0], 4);
          expect(limb.end.position.distanceTo(limb.joint.position)).toBeCloseTo(limb.lengths[1], 4);
        }
      }
      for (const b of layouts) {
        const facing = facingFor(p, b),
          floor = -(b.top + b.height * 1.05);
        for (const ms of [
          p.arrive + 100,
          p.rear + 200,
          p.prints[0]?.at ?? 0,
          (p.prints.at(-1)?.at ?? 0) + 50,
        ]) {
          at(f, ms, b, facing);
          for (const leg of f.model.legs)
            expect(lowestWorldY(leg.end), `${id} ${ms}`).toBeCloseTo(floor, 3);
        }
      }
      clean(f);
    }
  });

  it('dozes off resting on its measured body, or waddles fully out of view at full size', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const f = fixture(`bear-${i}`),
        p = f.plan;
      seen.add(p.ending);
      at(f, 0);
      const scale = f.actor.scale.y;
      if (p.ending === 'waddle') {
        at(f, p.exitEnd - 1);
        const exit = bearExitPoint(p, card, view, facingFor(p));
        expect(Math.abs(f.actor.position.x - exit.x)).toBeLessThan(1);
        expect(exit.x < 0 || exit.x > view.x).toBe(true);
        const box = new THREE.Box3().setFromObject(f.actor);
        expect(box.max.x < 0 || box.min.x > view.x).toBe(true);
        expect(f.trick.object.getObjectByName('bear-z-0')?.visible).toBe(false);
      } else {
        for (const ms of [p.settle + 50, p.cleanup - 10]) {
          at(f, ms);
          expect(lowestWorldY(f.actor), `${p.ending} rest`).toBeCloseTo(
            -(card.top + card.height * 1.05),
            3,
          );
        }
        expect(f.trick.object.getObjectByName('bear-z-0')?.visible).toBe(true);
        at(f, p.cleanup + 620);
        expect(f.actor.visible).toBe(true);
      }
      expect(f.actor.scale.y).toBe(scale);
      at(f, p.cleanup + 620);
      for (let k = 0; k < p.prints.length; k++)
        expect(f.trick.object.getObjectByName(`bear-print-${k}`)?.visible).toBe(false);
      clean(f);
    }
    expect(seen.size).toBe(3);
  });

  it('disposes every owned geometry and material exactly once', () => {
    const f = fixture('bear-0');
    at(f, 6000);
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
