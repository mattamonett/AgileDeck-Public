import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { makeDinosaur, DinosaurTrick, dinoFootPoint } from './dinosaur-trick';
import { dinoMouth, nativeDinoPlan } from './dinosaur-model';
import {
  DINO_DURATION,
  DINO_SCALE,
  dinoArrival,
  dinoApproach,
  dinoCardPose,
  dinoLandingPoint,
  dinoPlan,
} from './dinosaur-choreography';
import { LandingEffect, landingKind } from '../../landing/landing-effects';
import { disposeObject } from '../../engine/throw-models';
import { requireSceneObject } from '../../engine/scene-object';
import { approachPace } from '../../testing/approach-pace.testing';
import { dinosaurCharacter } from './dinosaur-character';

const b = { left: 600, top: 420, width: 84, height: 122 },
  source = { x: 260, y: 480 },
  view = { x: 1200, y: 850 };
function fixture(id: string) {
  const actor = makeDinosaur(id),
    trick = new DinosaurTrick(actor),
    scene = new THREE.Scene();
  scene.add(actor, trick.object);
  return { actor, trick, scene };
}
function update(
  f: ReturnType<typeof fixture>,
  ms: number,
  bounds = b,
  viewport = view,
  facing = f.trick.plan.side,
) {
  f.trick.update(ms * f.trick.plan.pace, f.actor, source, bounds, viewport, facing);
  f.scene.updateMatrixWorld(true);
}
const pos = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
function sole(f: ReturnType<typeof fixture>, i: number) {
  return requireSceneObject(requireSceneObject(f.actor, `leg-${i}`), 'sole');
}
function clean(f: ReturnType<typeof fixture>) {
  disposeObject(f.actor);
  disposeObject(f.trick.object);
}
describe('T. rex tantrum', () => {
  it('shares a native event plan with variations in every phase and both comic endings', () => {
    const actor = makeDinosaur('shared'),
      effect = new LandingEffect('🦖', actor, 'shared');
    expect(effect.planOf(dinosaurCharacter)).toBe(nativeDinoPlan(actor));
    expect(landingKind('🦖')).toBe('🦖');
    expect(dinoPlan('repeat')).toEqual(dinoPlan('repeat'));
    const plans = Array.from({ length: 40 }, (_, i) => dinoPlan('dino-' + i));
    for (const key of [
      'pace',
      'travel',
      'jump',
      'rise',
      'pause',
      'bend',
      'gait',
      'lift',
      'roar',
      'stomp',
      'force',
      'departure',
      'exit',
      'phase',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(40);
    for (const key of ['side', 'pulses', 'foot', 'startled'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(2);
    for (const p of plans) expect(p.departure + 520 + p.exit).toBeLessThan(DINO_DURATION);
    disposeObject(actor);
    disposeObject(effect.object);
  });
  it('keeps fixed connected legs, tiny arms and tail links throughout routes, turns and jumps', () => {
    const layouts = [
      b,
      { left: 8, top: 500, width: 58, height: 84 },
      { left: 310, top: 340, width: 58, height: 84 },
    ];
    for (let seed = 0; seed < 3; seed++)
      for (const bounds of layouts) {
        const f = fixture('dino-' + seed),
          viewport = bounds === b ? view : { x: 390, y: 844 };
        for (let ms = 0; ms < DINO_DURATION; ms += 47) {
          update(f, ms, bounds, viewport);
          for (let i = 0; i < 2; i++)
            for (const [limbName, a, c, joint, end, length] of [
              [`leg-${i}`, 'upper-leg', 'lower-leg', 'knee', 'foot', 14],
              [`arm-${i}`, 'upper-arm', 'forearm', 'elbow', 'hand', 5],
            ] as const) {
              const limb = requireSceneObject(f.actor, limbName),
                knee = requireSceneObject(limb, joint),
                foot = requireSceneObject(limb, end);
              expect(knee.position.length(), `seed ${seed}, ${ms}, ${limbName}`).toBeCloseTo(
                length,
                5,
              );
              expect(
                knee.position.distanceTo(foot.position),
                `seed ${seed}, ${ms}, ${limbName}`,
              ).toBeCloseTo(length, 5);
              for (const name of [a, c])
                expect(requireSceneObject(limb, name).scale.y).toBeCloseTo(length, 5);
            }
          for (const [i, length] of [12, 10, 8].entries())
            expect(requireSceneObject(f.actor, `tail-end-${i}`).position.x).toBe(-length);
        }
        clean(f);
      }
  });
  it('brakes into a slow stomping creep without ever stopping dead on the approach', () => {
    const layouts = [
      { bounds: b, from: source, viewport: view },
      { bounds: b, from: { x: 1000, y: 700 }, viewport: view },
      {
        bounds: { left: 160, top: 200, width: 58, height: 84 },
        from: { x: 189, y: 640 },
        viewport: { x: 390, y: 844 },
      },
    ];
    for (let seed = 0; seed < 20; seed++)
      for (const facing of [-1, 1])
        for (const { bounds, from, viewport } of layouts) {
          const p = dinoPlan('dino-' + seed),
            end = dinoLandingPoint(p, bounds, viewport, facing);
          const pace = approachPace((t) => dinoApproach(p, from, end, bounds, viewport, t));
          expect(pace.slowest).toBeGreaterThan(0.3);
          expect(pace.pace(0.7 + p.pause / 2)).toBeLessThan(1);
        }
  });
  it('keeps a stance foot planted while creeping through the brake and joins every stage continuously without a size flip', () => {
    for (let seed = 0; seed < 6; seed++) {
      const f = fixture('dino-' + seed),
        p = f.trick.plan,
        end = dinoLandingPoint(p, b, view);
      expect(dinoApproach(p, source, end, b, view, 0)).toEqual(source);
      for (const beat of [0.2, 0.5, 0.8]) {
        update(f, p.travel * (0.7 + p.pause * beat));
        const feet = [pos(sole(f, 0)), pos(sole(f, 1))],
          at = f.actor.position.clone();
        update(f, p.travel * (0.7 + p.pause * beat) + 12);
        expect(f.actor.position.distanceTo(at)).toBeGreaterThan(0.1);
        expect(
          Math.min(
            ...[0, 1].map((i) => {
              const before = feet[i];
              return before ? pos(sole(f, i)).distanceTo(before) : Infinity;
            }),
          ),
        ).toBeLessThan(0.00001);
      }
      for (const ms of [p.travel, dinoArrival(p), p.departure, p.departure + 520]) {
        update(f, ms - 0.01);
        const before = f.actor.position.clone(),
          feet = [pos(sole(f, 0)), pos(sole(f, 1))];
        const toes = [0, 1].map((i) =>
          pos(requireSceneObject(requireSceneObject(f.actor, `leg-${i}`), 'toe-forward')),
        );
        update(f, ms + 0.01);
        expect(f.actor.position.distanceTo(before)).toBeLessThan(0.01);
        for (let i = 0; i < 2; i++) {
          const old = feet[i];
          if (old) expect(pos(sole(f, i)).distanceTo(old)).toBeLessThan(0.02);
        }
        for (let i = 0; i < 2; i++) {
          const old = toes[i];
          if (old)
            expect(
              pos(
                requireSceneObject(requireSceneObject(f.actor, `leg-${i}`), 'toe-forward'),
              ).distanceTo(old),
            ).toBeLessThan(0.02);
        }
        expect(Math.abs(f.actor.scale.x)).toBe(DINO_SCALE);
      }
      clean(f);
    }
  });
  it('emits each roar from the actual open mouth before the matching card flutter', () => {
    for (let seed = 0; seed < 4; seed++) {
      const f = fixture('dino-' + seed),
        p = f.trick.plan;
      for (let i = 0; i < p.pulses; i++) {
        const birth = p.roar + i * 260;
        update(f, birth);
        const wave = requireSceneObject(f.trick.object, `mouth-wave-${i}`);
        expect(wave.visible).toBe(true);
        expect(wave.position.distanceTo(dinoMouth(f.actor))).toBeLessThan(0.000001);
        expect(requireSceneObject(f.actor, 'jaw').rotation.z).toBeLessThan(-0.5);
      }
      expect(dinoCardPose(p, p.roar + 179, p.side).angle).toBeCloseTo(0, 8);
      expect(Math.abs(dinoCardPose(p, p.roar + 250, p.side).angle)).toBeGreaterThan(0);
      clean(f);
    }
  });
  it('uses real affine sole contact and a raised foot before releasing stomp dust and paper', () => {
    for (let seed = 0; seed < 6; seed++) {
      const f = fixture('dino-' + seed),
        p = f.trick.plan;
      for (const bounds of [b, { left: 8, top: 500, width: 58, height: 84 }])
        for (const ms of [
          dinoArrival(p),
          p.stomp - 130,
          p.stomp,
          p.stomp + 50,
          p.departure - 120,
        ]) {
          update(f, ms, bounds);
          for (let i = 0; i < 2; i++) {
            const at = dinoFootPoint(p, ms, bounds, p.side, i),
              actual = pos(sole(f, i));
            expect(actual.x).toBeCloseTo(at.x, 6);
            expect(actual.y).toBeCloseTo(-at.y, 6);
            expect(actual.z).toBeCloseTo(172, 6);
          }
        }
      update(f, p.stomp - 1);
      expect(requireSceneObject(f.trick.object, 'stomp-shock').visible).toBe(false);
      update(f, p.stomp);
      const foot = pos(sole(f, p.foot));
      for (const name of ['stomp-dust-0', 'paper-chip-0', 'stomp-shock']) {
        const mesh = requireSceneObject(f.trick.object, name);
        expect(mesh.visible).toBe(true);
        expect(mesh.position.x).toBeCloseTo(foot.x, 6);
        expect(mesh.position.y).toBeCloseTo(foot.y, 6);
      }
      expect(dinoCardPose(p, p.stomp + 50, p.side).sy).toBeLessThan(0.97);
      clean(f);
    }
  });
  it('keeps the chosen side and contact after reflow and restores individual reveal-safe card transforms', () => {
    const f = fixture('dino-1'),
      p = f.trick.plan,
      facing = p.side;
    for (const bounds of [b, { left: 8, top: 500, width: 58, height: 84 }]) {
      const end = dinoLandingPoint(p, bounds, view, facing);
      expect(Math.sign(bounds.left + bounds.width / 2 - end.x)).toBe(facing);
      update(f, p.stomp + 50, bounds, view, facing);
      expect(f.trick.plan).toBe(p);
    }
    const frames = f.trick.cardAnimation(facing);
    expect(frames.options.duration).toBe(f.trick.duration);
    for (const frame of frames.frames) expect(frame['transform']).toBeUndefined();
    expect(frames.frames.at(-1)).toEqual({
      offset: 1,
      translate: '0px 0px',
      rotate: '0deg',
      scale: '1 1',
    });
    update(f, DINO_DURATION);
    expect(f.trick.object.visible).toBe(false);
    expect(f.actor.visible).toBe(false);
    clean(f);
  });
  it('turns toward a physical full-size exit after either proud or surprised recovery', () => {
    const seen = new Set<boolean>();
    for (let seed = 0; seed < 8; seed++) {
      const f = fixture('dino-' + seed),
        p = f.trick.plan;
      seen.add(p.startled);
      update(f, p.stomp + 300);
      const head = requireSceneObject(f.actor, 'head');
      expect(head.rotation.z < 0).toBe(p.startled);
      update(f, p.departure + 520 + p.exit - 0.1);
      expect(f.actor.visible).toBe(true);
      expect(Math.abs(f.actor.scale.x)).toBe(DINO_SCALE);
      expect(f.actor.position.y).toBeLessThan(-view.y - 109);
      const leg = requireSceneObject(f.actor, 'leg-0'),
        direction = pos(requireSceneObject(leg, 'toe-forward')).sub(
          pos(requireSceneObject(leg, 'sole')),
        );
      expect(Math.sign(direction.x)).toBe(-p.side);
      update(f, p.departure + 520 + p.exit + 0.1);
      expect(f.actor.visible).toBe(false);
      clean(f);
    }
    expect(seen.size).toBe(2);
  });
  it('seeks finitely and deterministically with bounded GPU resources disposed once', () => {
    const f = fixture('dino-2'),
      resources: (THREE.Mesh | THREE.Line)[] = [];
    for (const root of [f.actor, f.trick.object])
      root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) resources.push(o);
      });
    for (let ms = 0; ms < DINO_DURATION; ms += 113) {
      update(f, ms);
      for (const root of [f.actor, f.trick.object])
        root.traverse((o) =>
          expect(
            [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()].every(
              Number.isFinite,
            ),
          ).toBe(true),
        );
    }
    update(f, f.trick.plan.stomp + 50);
    const before = f.actor.matrixWorld.toArray();
    update(f, 9000);
    update(f, f.trick.plan.stomp + 50);
    expect(f.actor.matrixWorld.toArray()).toEqual(before);
    const after: (THREE.Mesh | THREE.Line)[] = [];
    for (const root of [f.actor, f.trick.object])
      root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) after.push(o);
      });
    expect(after).toEqual(resources);
    const spies = resources.flatMap((o) => [
      vi.spyOn(o.geometry, 'dispose'),
      ...(Array.isArray(o.material) ? o.material : [o.material]).map((m) => vi.spyOn(m, 'dispose')),
    ]);
    clean(f);
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  });
});
