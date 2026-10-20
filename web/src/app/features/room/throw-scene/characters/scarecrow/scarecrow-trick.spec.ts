import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { makeScarecrow, scarecrowModel } from './scarecrow-model';
import { ScarecrowTrick } from './scarecrow-trick';
import {
  SCARECROW_DURATION,
  scarecrowCardPose,
  scarecrowCrowU,
  scarecrowExitPoint,
  scarecrowFloor,
  scarecrowLandingPoint,
  scarecrowPlan,
} from './scarecrow-choreography';
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
  const actor = makeScarecrow(id),
    trick = new ScarecrowTrick(actor),
    scene = new THREE.Scene();
  scene.add(actor, trick.object);
  return { actor, trick, plan: trick.plan, model: scarecrowModel(actor) };
}
type Fixture = ReturnType<typeof fixture>;
const sideFor = (f: Fixture, b = card, chosen?: number) =>
  sideOf(b.left + b.width / 2 - scarecrowLandingPoint(f.plan, b, view, chosen).x);
function at(f: Fixture, ms: number, b = card, facing = sideFor(f, b)) {
  f.trick.update(ms * f.plan.pace, f.actor, start, b, view, facing);
  f.actor.updateMatrixWorld(true);
  f.trick.object.updateMatrixWorld(true);
}
function clean(f: Fixture) {
  disposeObject(f.actor);
  disposeObject(f.trick.object);
}
/** Centre of the visible geometry, as the shared seasonal checks measure it. */
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
const world = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
const ids = (n: number) => Array.from({ length: n }, (_, i) => `scarecrow-${i}`);

describe('sleepy scarecrow performance', () => {
  it('samples one reproducible plan whose approach, doze, crow, theft and ending all vary', () => {
    expect(scarecrowPlan('again')).toEqual(scarecrowPlan('again'));
    const plans = ids(40).map(scarecrowPlan);
    for (const key of [
      'travel',
      'bend',
      'rhythm',
      'nodAt',
      'hopHeight',
      'doze',
      'crowU',
      'startleDelay',
      'frenzy',
      'knockLift',
      'perchU',
      'exitRise',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size, key).toBe(40);
    for (const key of ['side', 'nod', 'perch', 'chase', 'caws'] as const)
      expect(new Set(plans.map((p) => p[key])).size, key).toBe(2);
    expect(new Set(plans.map((p) => p.crowHops)).size).toBe(3);
    expect(new Set(plans.map((p) => p.hops)).size).toBe(3);
    expect(new Set(plans.map((p) => `${p.perch}-${p.chase}`)).size).toBe(4);
    const thirty = ids(30).map((id) => fixture(id));
    expect(new Set(thirty.map((f) => f.plan.side)).size).toBe(2);
    expect(new Set(thirty.map((f) => f.plan.pace)).size).toBe(30);
    thirty.forEach(clean);
    for (const p of plans) {
      expect(p.exitEnd + 400).toBeLessThan(SCARECROW_DURATION);
      expect(p.recover).toBeLessThan(SCARECROW_DURATION);
      expect(p.flush).toBeLessThan(p.knock);
      expect(p.knock).toBeLessThan(p.grab);
    }
  });

  it('hops continuously from the sender to the card without dead stops and arrives on time', () => {
    for (const id of ids(8)) {
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
      const mean = steps.reduce((a, s) => a + s, 0) / steps.length;
      expect(Math.min(...steps) / mean, `${id} slowest step`).toBeGreaterThan(0.3);
      const { stand } = f.trick.contact(card, sideFor(f));
      at(f, p.travel);
      expect(f.actor.position.x).toBeCloseTo(stand.x, 6);
      expect(-f.actor.position.y).toBeCloseTo(stand.y, 6);
      clean(f);
    }
  });

  it('leaves from the real sender and moves continuously at full size through every stage', () => {
    for (const id of ids(4)) {
      const f = fixture(id);
      at(f, 0);
      const body = presence(f.actor);
      expect(
        Math.hypot(body.x - start.x, body.y + start.y),
        `${id} leaves from the sender`,
      ).toBeLessThan(45);
      const scale = f.actor.scale.y;
      let previous = f.actor.position.clone(),
        turn = f.actor.quaternion.clone();
      for (let ms = 8; ms < SCARECROW_DURATION; ms += 8) {
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
  });

  it('keeps its chosen side through reflow and avoids viewport edges on first placement', () => {
    for (const id of ids(8)) {
      const f = fixture(id);
      const facing = sideFor(f);
      const moved = { ...card, left: card.left + 140, width: 58, height: 84 };
      expect(sideFor(f, moved, facing)).toBe(facing);
      expect(sideFor(f, { ...card, left: 6 })).toBe(-1);
      expect(sideFor(f, { ...card, left: view.x - card.width - 6 })).toBe(1);
      clean(f);
    }
  });

  it('seeks deterministically with finite transforms and ends with a neutral card', () => {
    const f = fixture('scarecrow-0');
    const probe = SCARECROW_DURATION * 0.55;
    at(f, probe);
    const pose = f.actor.matrixWorld.clone(),
      crow = f.trick.crow.root.matrixWorld.clone();
    at(f, SCARECROW_DURATION * 0.9);
    at(f, probe);
    expect(f.actor.matrixWorld.equals(pose)).toBe(true);
    expect(f.trick.crow.root.matrixWorld.equals(crow)).toBe(true);
    for (let ms = 0; ms <= SCARECROW_DURATION; ms += 61) {
      at(f, ms);
      for (const root of [f.actor, f.trick.object])
        root.traverse((o) => expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
    }
    const animation = f.trick.cardAnimation(sideFor(f));
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
    at(f, SCARECROW_DURATION + 1);
    expect(f.trick.object.visible).toBe(false);
    clean(f);
  });

  it('disposes every owned geometry and material exactly once, wherever the hat is', () => {
    for (const ms of [3000, 9500]) {
      const f = fixture('scarecrow-0');
      at(f, ms);
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
    }
  });

  it('vaults on a planted stake with fixed limbs and dozes with its stake tip on the floor', () => {
    for (const id of ids(3)) {
      const f = fixture(id),
        p = f.plan;
      // The planted tip stays put while the body vaults over it.
      for (let ms = 0; ms < p.travel; ms += 9) {
        at(f, ms);
        for (const limb of [...f.model.arms, ...f.model.legs]) {
          expect(limb.joint.position.length()).toBeCloseTo(limb.lengths[0], 4);
          expect(limb.end.position.distanceTo(limb.joint.position)).toBeCloseTo(limb.lengths[1], 4);
        }
      }
      const tips: THREE.Vector3[] = [];
      for (let ms = p.travel * 0.905; ms < p.travel; ms += 15) {
        at(f, ms);
        tips.push(world(f.model.tip));
      }
      for (const tip of tips) expect(tip.distanceTo(tips[0] ?? tip)).toBeLessThan(1e-6);
      for (const b of layouts) {
        const floor = -scarecrowFloor(b);
        for (const ms of [p.dozeAt + 600, p.startle - 100, p.knock, p.grab + 400]) {
          at(f, ms, b);
          expect(world(f.model.tip).y, `${id} ${ms}`).toBeCloseTo(floor, 4);
          expect(lowestWorldY(f.actor), `${id} ${ms}`).toBeCloseTo(floor, 3);
        }
      }
      clean(f);
    }
  });

  it('knocks the near edge with its real straw fingertips and the card moves away from that blow', () => {
    for (const id of ids(4)) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = sideFor(f, b),
          hit = f.trick.contact(b, facing);
        expect(hit.v).toBeGreaterThan(0.5);
        expect(hit.v).toBeLessThan(0.9);
        at(f, p.knock, b, facing);
        const hand = screenOf(f.model.hand);
        expect(Math.hypot(hand.x - hit.knock.x, hand.y - hit.knock.y), `${id}`).toBeLessThan(0.05);
        const edge = onCard(scarecrowCardPose(p, p.knock, facing), facing > 0 ? 0 : 1, hit.v, b);
        expect(Math.hypot(edge.x - hit.knock.x, edge.y - hit.knock.y)).toBeLessThan(0.05);
        const shoved = scarecrowCardPose(p, p.knock + 90, facing);
        expect(Math.sign(shoved.x)).toBe(facing);
        expect(Math.sign(shoved.angle)).toBe(-facing);
        expect(scarecrowCardPose(p, p.crowLand - 1, facing)).toEqual(NEUTRAL);
        expect(scarecrowCardPose(p, p.recover, facing)).toEqual(NEUTRAL);
        expect(scarecrowCardPose(p, p.crowLand + 60, facing).y).toBeGreaterThan(0.5);
      }
      clean(f);
    }
  });

  it('plants the crow on the live top edge and moves one hat from head, to talons, to the crow', () => {
    for (const id of ids(6)) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = sideFor(f, b);
        for (const ms of [p.crowLand + 30, p.crowLand + 200, p.startle - 50]) {
          at(f, ms, b, facing);
          if (p.crowHops && ms > p.crowLand + 280 && ms < p.hopsEnd) continue;
          const q = scarecrowCardPose(p, ms, facing);
          const a = onCard(q, 0, 0, b),
            c = onCard(q, 1, 0, b);
          for (const leg of f.trick.crow.legs) {
            const foot = screenOf(leg.end);
            const across =
              ((foot.x - a.x) * (c.y - a.y) - (foot.y - a.y) * (c.x - a.x)) /
              Math.hypot(c.x - a.x, c.y - a.y);
            expect(Math.abs(across), `${id} ${ms}`).toBeLessThan(0.05);
          }
          const centre = onCard(q, scarecrowCrowU(p, ms, facing), 0, b);
          expect(Math.abs(screenOf(f.trick.crow.root).x - centre.x)).toBeLessThan(0.05);
        }
        at(f, p.grab, b, facing);
        const top = screenOf(f.model.hatTop),
          grip = screenOf(f.trick.crow.grip);
        expect(Math.hypot(top.x - grip.x, top.y - grip.y), `${id} grab`).toBeLessThan(0.05);
      }
      const hats = () =>
        [f.actor, f.trick.object].reduce((n, root) => {
          root.traverse((o) => (n += o.name === 'scarecrow-hat-crown' ? 1 : 0));
          return n;
        }, 0);
      at(f, p.grab - 1);
      expect(f.model.hat.parent).toBe(f.model.head);
      const before = screenOf(f.model.hatTop);
      at(f, p.grab + 1);
      expect(f.model.hat.parent).toBe(f.trick.crow.grip);
      const after = screenOf(f.model.hatTop);
      expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(0.5);
      expect(f.model.topTuft.visible).toBe(true);
      at(f, p.perchAt);
      expect(f.model.hat.parent).toBe(f.trick.crow.crown);
      expect(f.trick.crow.root.visible).toBe(true);
      for (let ms = 0; ms < SCARECROW_DURATION; ms += 250) {
        at(f, ms);
        expect(hats()).toBe(1);
      }
      clean(f);
    }
  });

  it('lands the hatted crow on the arm or card, then rests asleep on its stake or chases it out of view', () => {
    const seen = new Set<string>();
    for (const id of ids(16)) {
      const f = fixture(id),
        p = f.plan;
      const key = `${p.perch}-${p.chase}`;
      if (seen.has(key)) {
        clean(f);
        continue;
      }
      seen.add(key);
      for (const ms of [p.perchAt, p.perchAt + 300]) {
        at(f, ms);
        if (p.perch === 'arm') {
          const wrist = screenOf(f.model.wrist),
            root = screenOf(f.trick.crow.root);
          expect(Math.abs(root.x - wrist.x)).toBeLessThan(0.05);
          expect(root.y).toBeLessThan(wrist.y);
        } else {
          const spot = onCard(scarecrowCardPose(p, ms, sideFor(f)), p.perchU, 0, card);
          const root = screenOf(f.trick.crow.root);
          expect(Math.hypot(root.x - spot.x, root.y - spot.y), `${id} ${ms}`).toBeLessThan(0.05);
        }
      }
      const exit = scarecrowExitPoint(p, f.trick.contact(card, sideFor(f)).stand, view, sideFor(f));
      at(f, p.exitEnd);
      const floor = -scarecrowFloor(card);
      if (p.chase) {
        expect(f.actor.position.x).toBeCloseTo(exit.x, 3);
        expect(exit.x < 0 || exit.x > view.x).toBe(true);
        expect(Math.abs(f.actor.scale.y)).toBeGreaterThan(0.5);
      } else {
        at(f, SCARECROW_DURATION - 700);
        expect(lowestWorldY(f.actor)).toBeCloseTo(floor, 3);
        expect(f.model.lids.every((lid) => lid.scale.y > 0.95)).toBe(true);
      }
      if (p.perch === 'card' || p.chase) expect(f.trick.crow.root.visible).toBe(false);
      // Feathers shaken from the startled crow drift clear of the card's value.
      for (let ms = p.startle; ms < SCARECROW_DURATION - 500; ms += 40) {
        at(f, ms);
        for (let i = 0; i < 2; i++) {
          const feather = f.trick.object.getObjectByName(`scarecrow-crow-feather-${i}`);
          if (!feather?.visible) continue;
          const u = (feather.position.x - card.left) / card.width,
            v = (-feather.position.y - card.top) / card.height;
          expect(u > 0.3 && u < 0.7 && v > 0.38 && v < 0.62, `${id} feather at ${ms}`).toBe(false);
        }
      }
      // Loose straw comes to rest lying on its real lowest vertex.
      at(f, SCARECROW_DURATION - 700);
      for (let i = 0; i < 12; i++) {
        const straw = f.trick.object.getObjectByName(`scarecrow-loose-straw-${i}`);
        if (!straw) throw new Error('Missing straw');
        expect(straw.visible).toBe(true);
        expect(lowestWorldY(straw)).toBeCloseTo(floor, 3);
      }
      clean(f);
    }
    expect(seen.size).toBe(4);
  });
});
