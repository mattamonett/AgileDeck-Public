import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  CHRISTMAS_PROJECTILES,
  HALLOWEEN_PROJECTILES,
  THANKSGIVING_PROJECTILES,
} from '@poker/shared';
import { seasonalLandingPoint, seasonalRoutine, type SeasonalAct } from './seasonal-routines';
import { seasonalCharacter } from './seasonal-character';
import { LandingEffect } from '../landing/landing-effects';
import { disposeObject, makeProjectile } from '../engine/throw-models';
import { sideOf } from '../kit';

const view = { x: 1200, y: 850 },
  start = { x: 260, y: 480 },
  card = { left: 600, top: 420, width: 84, height: 122 };
const kinds = [...HALLOWEEN_PROJECTILES, ...CHRISTMAS_PROJECTILES, ...THANKSGIVING_PROJECTILES].map(
  ({ char }) => char,
);

function fixture(kind: (typeof kinds)[number], id: string) {
  const actor = makeProjectile(kind, id);
  const routine = seasonalRoutine(kind, actor);
  const scene = new THREE.Scene();
  scene.add(actor, routine.object);
  return { actor, routine };
}
function facingFor(routine: SeasonalAct, b = card, chosen?: number) {
  const end = seasonalLandingPoint(routine.plan, b, view, chosen);
  return sideOf(b.left + b.width / 2 - end.x);
}
function frame(
  f: ReturnType<typeof fixture>,
  ms: number,
  b = card,
  facing = facingFor(f.routine, b),
) {
  f.routine.update(ms * f.routine.plan.pace, f.actor, start, b, view, facing);
  f.actor.updateMatrixWorld(true);
  f.routine.object.updateMatrixWorld(true);
}
/** Centre of the visible geometry, so routines whose root is offset from their body are judged fairly. */
function presence(root: THREE.Object3D) {
  const box = new THREE.Box3(),
    part = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (let at: THREE.Object3D | null = o; at && at !== root.parent; at = at.parent)
      if (!at.visible) return;
    o.geometry.computeBoundingBox();
    if (o.geometry.boundingBox)
      box.union(part.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
  });
  return box.getCenter(new THREE.Vector3());
}
function clean(f: ReturnType<typeof fixture>) {
  disposeObject(f.actor);
  disposeObject(f.routine.object);
}

describe('Seasonal performances', () => {
  for (const kind of kinds) {
    describe(kind, () => {
      it('shares one reproducible model-owned plan with the landing effect and varies between events', () => {
        const actor = makeProjectile(kind, 'shared');
        const effect = new LandingEffect(kind, actor, 'shared');
        expect(effect.planOf(seasonalCharacter(kind))).toEqual(
          fixture(kind, 'shared').routine.plan,
        );
        expect(effect.duration).toBeGreaterThan(5000);
        const plans = Array.from(
          { length: 30 },
          (_, i) => fixture(kind, `${kind}-${i}`).routine.plan,
        );
        expect(new Set(plans.map((p) => p.side)).size).toBe(2);
        expect(new Set(plans.map((p) => p.pace)).size).toBe(30);
        disposeObject(actor);
        disposeObject(effect.object);
      });

      it('leaves from the real sender and moves continuously at full size through every stage', () => {
        for (const id of [`${kind}-0`, `${kind}-1`, `${kind}-2`]) {
          const f = fixture(kind, id);
          frame(f, 0);
          const body = presence(f.actor);
          expect(
            Math.hypot(body.x - start.x, body.y + start.y),
            `${id} leaves from the sender`,
          ).toBeLessThan(45);
          const scale = f.actor.scale.y;
          let previous = f.actor.position.clone(),
            turn = f.actor.quaternion.clone();
          const end = f.routine.duration / f.routine.plan.pace;
          for (let ms = 8; ms < end; ms += 8) {
            frame(f, ms);
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

      it('flows to the card without a dead stop part-way along the approach', () => {
        for (let i = 0; i < 6; i++) {
          const f = fixture(kind, `${kind}-${i}`);
          // Net movement over 120 ms windows, so gait bob and hop arcs don't read as stops.
          const travel = f.routine.plan.travel;
          const steps: number[] = [];
          for (let ms = travel * 0.15; ms + 120 <= travel * 0.85; ms += 40) {
            frame(f, ms);
            const from = f.actor.position.clone();
            frame(f, ms + 120);
            steps.push(f.actor.position.distanceTo(from));
          }
          const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
          expect(Math.min(...steps), `${kind}-${i}`).toBeGreaterThan(mean * 0.3);
          clean(f);
        }
      });

      it('keeps its chosen side through reflow and avoids viewport edges on first placement', () => {
        for (let i = 0; i < 8; i++) {
          const f = fixture(kind, `${kind}-${i}`);
          const facing = facingFor(f.routine);
          const moved = { ...card, left: card.left + 140, width: 58, height: 84 };
          expect(facingFor(f.routine, moved, facing)).toBe(facing);
          expect(facingFor(f.routine, { ...card, left: 6 })).toBe(-1);
          expect(facingFor(f.routine, { ...card, left: view.x - card.width - 6 })).toBe(1);
          clean(f);
        }
      });

      it('seeks deterministically with finite transforms and ends with a neutral card', () => {
        const f = fixture(kind, `${kind}-0`),
          end = f.routine.duration / f.routine.plan.pace;
        const probe = end * 0.55;
        frame(f, probe);
        const pose = f.actor.matrixWorld.clone();
        frame(f, end * 0.9);
        frame(f, probe);
        expect(f.actor.matrixWorld.equals(pose)).toBe(true);
        for (let ms = 0; ms <= end; ms += 61) {
          frame(f, ms);
          for (const root of [f.actor, f.routine.object])
            root.traverse((o) => expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
        }
        const animation = f.routine.cardAnimation(facingFor(f.routine), card);
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
        frame(f, end + 1);
        expect(f.routine.object.visible).toBe(false);
        clean(f);
      });

      it('works with the DOMRect bounds the renderer actually passes', () => {
        const f = fixture(kind, `${kind}-3`);
        const rect = new DOMRect(card.left, card.top, card.width, card.height);
        const end = f.routine.duration / f.routine.plan.pace;
        for (let ms = 0; ms <= end; ms += 37) {
          f.routine.update(
            ms * f.routine.plan.pace,
            f.actor,
            start,
            rect,
            view,
            facingFor(f.routine, rect),
          );
          f.actor.updateMatrixWorld(true);
          f.routine.object.updateMatrixWorld(true);
          for (const root of [f.actor, f.routine.object])
            root.traverse((o) =>
              expect(o.matrixWorld.elements.every(Number.isFinite), `${kind} at ${ms}`).toBe(true),
            );
        }
        clean(f);
      });

      it('disposes every owned geometry and material exactly once', () => {
        const f = fixture(kind, `${kind}-0`);
        frame(f, 3000);
        const resources = new Set<THREE.BufferGeometry | THREE.Material>();
        for (const root of [f.actor, f.routine.object])
          root.traverse((o) => {
            if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
              resources.add(o.geometry);
              for (const m of Array.isArray(o.material) ? o.material : [o.material])
                resources.add(m);
            }
          });
        const spies = Array.from(resources, (r) => vi.spyOn(r, 'dispose'));
        clean(f);
        for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
      });
    });
  }
});
