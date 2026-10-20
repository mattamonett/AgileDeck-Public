import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { makeSnowman, snowmanModel } from './snowman-model';
import { SnowmanTrick } from './snowman-trick';
import {
  SNOWMAN_DURATION,
  snowmanCardPose,
  snowmanLandingPoint,
  snowmanPatContact,
  snowmanPlan,
  snowmanScale,
} from './snowman-choreography';
import { lowestWorldY, screenOf, sideOf } from '../../kit';
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
  const actor = makeSnowman(id),
    trick = new SnowmanTrick(actor),
    scene = new THREE.Scene();
  scene.add(actor, trick.object);
  return { actor, trick, plan: trick.plan, model: snowmanModel(actor) };
}
type Fixture = ReturnType<typeof fixture>;
const sideFor = (f: Fixture, b = card, chosen?: number) =>
  sideOf(b.left + b.width / 2 - snowmanLandingPoint(f.plan, b, view, chosen).x);
function at(f: Fixture, ms: number, b = card, facing = sideFor(f, b)) {
  f.trick.update(ms * f.plan.pace, f.actor, start, b, view, facing);
  f.actor.updateMatrixWorld(true);
  f.trick.object.updateMatrixWorld(true);
}
function clean(f: Fixture) {
  disposeObject(f.actor);
  disposeObject(f.trick.object);
}
/** Centre of the visible geometry, so a root offset from the body is judged fairly. */
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
const named = (f: Fixture, name: string) => {
  const o = f.trick.object.getObjectByName(name);
  if (!o) throw new Error(`Missing ${name}`);
  return o;
};
const gap = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('Flurry the snow sculptor', () => {
  it('samples one reproducible plan whose route, sculpture, sneeze, nose and exit vary', () => {
    expect(snowmanPlan('again')).toEqual(snowmanPlan('again'));
    const plans = Array.from({ length: 30 }, (_, i) => fixture(`⛄-${i}`).plan);
    for (const key of [
      'pace',
      'travel',
      'bend',
      'wander',
      'beatAt',
      'ballEnd',
      'strength',
      'noseLand',
      'exitSpeed',
      'exitRise',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size, key).toBe(30);
    for (const key of ['side', 'waves', 'beat', 'fakeOut', 'noseBounce', 'exitAway'] as const)
      expect(new Set(plans.map((p) => p[key])).size, key).toBe(2);
    expect(new Set(plans.map((p) => p.sculpture)).size).toBe(3);
    expect(new Set(plans.map((p) => p.pats)).size).toBe(3);
    expect(new Set(plans.map((p) => p.shoves)).size).toBe(3);
    for (const p of plans) {
      expect(p.exitEnd + 650).toBeLessThan(SNOWMAN_DURATION);
      expect(p.arrive).toBe(p.travel);
      expect(p.noseLanded).toBeLessThan(p.kick);
    }
  });

  it('keeps pushing without a dead stop between 15 % and 85 % of the approach', () => {
    for (let i = 0; i < 8; i++) {
      const f = fixture(`⛄-${i}`),
        p = f.plan;
      const steps: number[] = [];
      at(f, p.travel * 0.15);
      let previous = f.actor.position.clone();
      for (let ms = p.travel * 0.15 + 8; ms <= p.travel * 0.85; ms += 8) {
        at(f, ms);
        steps.push(f.actor.position.distanceTo(previous));
        previous = f.actor.position.clone();
      }
      const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
      for (const step of steps)
        expect(step, `⛄-${i} (${p.beat})`).toBeGreaterThanOrEqual(0.3 * mean);
      at(f, p.travel);
      const stand = snowmanLandingPoint(p, card, view, sideFor(f));
      expect(f.actor.position.x).toBeCloseTo(stand.x, 3);
      clean(f);
    }
  });

  it('leaves from the real sender and moves continuously at full size through every stage', () => {
    for (const id of ['⛄-0', '⛄-1', '⛄-2', '⛄-3']) {
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
      for (let ms = 8; ms < SNOWMAN_DURATION; ms += 8) {
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
    for (let i = 0; i < 8; i++) {
      const f = fixture(`⛄-${i}`);
      const facing = sideFor(f);
      const moved = { ...card, left: card.left + 140, width: 58, height: 84 };
      expect(sideFor(f, moved, facing)).toBe(facing);
      expect(sideFor(f, { ...card, left: 6 })).toBe(-1);
      expect(sideFor(f, { ...card, left: view.x - card.width - 6 })).toBe(1);
      clean(f);
    }
  });

  it('seeks deterministically with finite transforms and ends with a neutral card', () => {
    const f = fixture('⛄-0'),
      end = SNOWMAN_DURATION;
    for (const probe of [end * 0.3, end * 0.55, end * 0.8]) {
      at(f, probe);
      const pose = f.actor.matrixWorld.clone(),
        carrot = f.trick.carrot.matrixWorld.clone();
      at(f, end * 0.9);
      at(f, probe * 0.5);
      at(f, probe);
      expect(f.actor.matrixWorld.equals(pose)).toBe(true);
      expect(f.trick.carrot.matrixWorld.equals(carrot)).toBe(true);
    }
    for (let ms = 0; ms <= end; ms += 61) {
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
    at(f, end + 1);
    expect(f.trick.object.visible).toBe(false);
    expect(f.actor.visible).toBe(false);
    clean(f);
  });

  it('disposes every owned geometry and material exactly once', () => {
    const f = fixture('⛄-0');
    at(f, f.plan.sneeze + 900);
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

  it('keeps every twig arm and leg at its fixed length', () => {
    for (const id of ['⛄-1', '⛄-4']) {
      const f = fixture(id);
      for (let ms = 0; ms < f.plan.exitEnd; ms += 89) {
        at(f, ms);
        for (const limb of [...f.model.arms, ...f.model.legs]) {
          expect(limb.joint.position.length()).toBeCloseTo(limb.lengths[0], 4);
          expect(limb.end.position.distanceTo(limb.joint.position)).toBeCloseTo(limb.lengths[1], 4);
        }
      }
      clean(f);
    }
  });

  it('pushes with both mittens on the rolling snowball, rests it against the card and pats the real sculpture', () => {
    for (const id of ['⛄-0', '⛄-2', '⛄-5']) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = sideFor(f, b),
          sc = snowmanScale(b);
        for (const t of [0, 0.3, 0.55, 0.8, 0.99]) {
          if (p.beat === 'wobble' && Math.abs(t - p.beatAt) < 0.15) continue;
          at(f, p.travel * t, b, facing);
          const ball = named(f, 'snowman-snowball');
          const centre = { x: ball.position.x, y: -ball.position.y };
          for (const grip of f.model.grips)
            expect(gap(screenOf(grip), centre), `${id} t=${t}`).toBeCloseTo(ball.scale.x, 1);
        }
        at(f, p.travel + 10, b, facing);
        const ball = named(f, 'snowman-snowball');
        const edge = facing > 0 ? b.left : b.left + b.width;
        expect(Math.abs(ball.position.x - edge)).toBeCloseTo(p.ballEnd * sc, 3);
        // The patting mitten lands exactly on the snowball or on the pat marker of the piece it shapes.
        const patting = f.model.grips[facing > 0 ? 1 : 0];
        if (!patting) throw new Error('Missing mitten');
        for (let i = 0; i < p.pats; i++) {
          at(f, snowmanPatContact(p, i), b, facing);
          const hand = screenOf(patting);
          const snowball = named(f, 'snowman-snowball');
          const cx = snowball.position.x,
            cy = -snowball.position.y;
          const onBall =
            Math.abs(
              Math.hypot((hand.x - cx) / snowball.scale.x, (hand.y - cy) / snowball.scale.y) - 1,
            ) < 0.01;
          let onPiece = false;
          named(f, 'snowman-sculpture').traverse((o) => {
            if (o.name.endsWith('-pat') && o.parent?.visible && gap(screenOf(o), hand) < 0.05)
              onPiece = true;
          });
          expect(i === 0 ? onBall : onBall || onPiece, `${id} pat ${i}`).toBe(true);
        }
      }
      clean(f);
    }
  });

  it('rolls the snowball by exactly the distance it travels over its growing radius', () => {
    for (const id of ['⛄-0', '⛄-1', '⛄-3']) {
      const f = fixture(id),
        p = f.plan;
      const ball = named(f, 'snowman-snowball'),
        spin = named(f, 'snowman-snowball-spin');
      let turned = 0,
        expected = 0;
      at(f, p.travel * 0.2);
      let centre = new THREE.Vector2(ball.position.x, ball.position.y),
        radius = ball.scale.y,
        q = spin.quaternion.clone();
      for (let ms = p.travel * 0.2 + 16; ms < p.travel * 0.8; ms += 16) {
        at(f, ms);
        // The wobble beat hops the ball over a bump, which is not rolling.
        if (p.beat !== 'wobble' || Math.abs(ms / p.travel - p.beatAt) > 0.08) {
          const next = new THREE.Vector2(
            ball.position.x,
            ball.position.y + (ball.scale.y - radius),
          );
          expected += next.distanceTo(centre) / ((ball.scale.y + radius) / 2);
          turned += spin.quaternion.angleTo(q);
        }
        centre = new THREE.Vector2(ball.position.x, ball.position.y);
        radius = ball.scale.y;
        q = spin.quaternion.clone();
      }
      expect(turned / expected, id).toBeGreaterThan(0.9);
      expect(turned / expected, id).toBeLessThan(1.1);
      at(f, p.travel);
      expect(ball.scale.y / snowmanScale(card)).toBeCloseTo(p.ballEnd, 3);
      clean(f);
    }
  });

  it('stands on its real booties while working and responds to the card only between contact and recovery', () => {
    for (const id of ['⛄-0', '⛄-3', '⛄-6']) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = sideFor(f, b);
        for (const ms of [p.build + 100, p.admire + 500, p.inhale + 200, p.kick - 400]) {
          at(f, ms, b, facing);
          let lowest = Infinity;
          for (const leg of f.model.legs) lowest = Math.min(lowest, lowestWorldY(leg.end));
          expect(lowest, `${id} ${ms}`).toBeCloseTo(f.actor.position.y, 3);
        }
        expect(snowmanCardPose(p, p.arrive - 1, facing)).toEqual(NEUTRAL);
        expect(snowmanCardPose(p, p.sneeze + 1650, facing)).toEqual(NEUTRAL);
        expect(snowmanCardPose(p, p.sneeze + 160, facing).x * facing).toBeGreaterThan(2);
      }
      clean(f);
    }
  });

  it('blows the carrot off, rests it on the floor, kicks it up into the mitten and pushes it back home', () => {
    for (let i = 0; i < 6; i++) {
      const f = fixture(`⛄-${i}`),
        p = f.plan;
      at(f, p.sneeze - 1);
      const worn = f.model.carrot.matrixWorld.clone();
      at(f, p.sneeze);
      expect(f.model.carrot.visible).toBe(false);
      expect(f.trick.carrot.visible).toBe(true);
      at(f, p.sneeze);
      const launched = f.trick.carrot.matrixWorld.clone();
      expect(worn.elements.every((v, k) => Math.abs(v - (launched.elements[k] ?? NaN)) < 2)).toBe(
        true,
      );
      at(f, p.kick - 30);
      expect(lowestWorldY(f.trick.carrot)).toBeCloseTo(
        -snowmanLandingPoint(p, card, view, sideFor(f)).y,
        3,
      );
      at(f, p.catchAt + 40);
      const catching = f.model.grips.some(
        (grip) => gap(screenOf(grip), f.trick.gripOf(f.trick.carrot)) < 0.05,
      );
      expect(catching, `⛄-${i} catches`).toBe(true);
      at(f, p.refitEnd - 0.01);
      const pushed = f.trick.carrot.matrixWorld.clone();
      at(f, p.refitEnd);
      expect(f.model.carrot.visible).toBe(true);
      expect(f.trick.carrot.visible).toBe(false);
      const home = f.model.carrot.matrixWorld;
      expect(pushed.elements.every((v, k) => Math.abs(v - (home.elements[k] ?? NaN)) < 0.05)).toBe(
        true,
      );
      clean(f);
    }
  });

  it('bursts the sculpture into chunks resting on the floor, frosts only the card edges and rolls out of view', () => {
    for (let i = 0; i < 6; i++) {
      const f = fixture(`⛄-${i}`),
        p = f.plan,
        facing = sideFor(f);
      at(f, p.sneeze + 1700);
      expect(named(f, 'snowman-sculpture').visible).toBe(false);
      const floor = snowmanLandingPoint(p, card, view, facing).y;
      for (let k = 0; k < 12; k++) {
        const chunk = named(f, `snowman-chunk-${k}`);
        const low = lowestWorldY(chunk);
        expect(low).toBeLessThan(-floor + 9);
        expect(low).toBeGreaterThan(-floor - 9);
      }
      // Frost stays off the value region in the middle of the card.
      const frost = named(f, 'snowman-frost-core');
      if (!(frost instanceof THREE.Mesh)) throw new Error('Frost is not a mesh');
      const q = snowmanCardPose(p, p.sneeze + 1700, facing);
      expect(q).toEqual(NEUTRAL);
      const positions = frost.geometry.getAttribute('position');
      let drawn = 0;
      for (let v = 0; v < positions.count; v++) {
        const x = positions.getX(v),
          y = -positions.getY(v);
        if (x === 0 && y === 0) continue;
        drawn++;
        const u = (x - card.left) / card.width,
          w = (y - card.top) / card.height;
        expect(
          u > 0.31 && u < 0.69 && w > 0.39 && w < 0.61,
          `frost at ${u.toFixed(2)},${w.toFixed(2)}`,
        ).toBe(false);
      }
      expect(drawn).toBeGreaterThan(20);
      const scale = f.actor.scale.x;
      at(f, p.exitEnd);
      expect(f.actor.position.x < -60 || f.actor.position.x > view.x + 60).toBe(true);
      expect(f.actor.scale.x).toBe(scale);
      expect(f.model.carrot.visible).toBe(true);
      expect(f.model.scarf.visible).toBe(true);
      clean(f);
    }
  });
});
