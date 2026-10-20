import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { BULLET_NO_CARD, BULLET_WHOA, BulletTimeTrick, makeBulletTime } from './bullettime-trick';
import {
  SPIN,
  SWEEP,
  bulletCardPose,
  bulletFloor,
  bulletFrames,
  bulletLandingPoint,
  bulletScale,
  bulletTimePlan,
  contactPoint,
  type BulletTimePlan,
  type Contact,
  type Exchange,
  type MoveKind,
} from './bullettime-choreography';
import { bulletTimeModel } from './bullettime-model';
import { cardPoint, lowestWorldY, sideOf, type Side } from '../../kit';
import { disposeObject } from '../../engine/throw-models';
import { approachPace } from '../../testing/approach-pace.testing';
import { projectileName } from '@features/room/projectile-names';
import type { TargetBounds } from '../../landing/landing-geometry';

const desktop: TargetBounds = { left: 360, top: 270, width: 84, height: 122 };
const mobile: TargetBounds = { left: 160, top: 430, width: 58, height: 84 };
const view = { x: 800, y: 760 },
  source = { x: 100, y: 330 };

/** The first seeded id whose plan matches, so each authored alternative is exercised. */
function seedWith(match: (p: BulletTimePlan) => boolean, skip = 0): string {
  let found = 0;
  for (let i = 0; i < 500; i++) {
    const id = `bullettime-${i}`;
    if (match(bulletTimePlan(id)) && found++ === skip) return id;
  }
  throw new Error('No matching Bullet Time seed');
}

const has = (p: BulletTimePlan, by: 'hero' | 'agent', kind: MoveKind) =>
  p.exchanges.some((e) => e.by === by && e.kind === kind);
function exchange(p: BulletTimePlan, by: 'hero' | 'agent', kind: MoveKind): Exchange {
  const e = p.exchanges.find((x) => x.by === by && x.kind === kind);
  if (!e) throw new Error(`No ${by} ${kind}`);
  return e;
}

function setup(id: string, b: TargetBounds, chosen?: number) {
  const actor = makeBulletTime(id),
    trick = new BulletTimeTrick(actor),
    p = trick.plan;
  const end = bulletLandingPoint(p, b, view, chosen);
  const side: Side = sideOf(b.left + b.width / 2 - end.x);
  return { actor, trick, p, side, m: bulletTimeModel(actor) };
}
type Setup = ReturnType<typeof setup>;
const world = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
const screen = (o: THREE.Object3D) => {
  const v = world(o);
  return { x: v.x, y: -v.y };
};
function play(s: Setup, ms: number, b = desktop, from = source) {
  s.trick.update(ms * s.p.pace, s.actor, from, b, view, s.side);
}
function limbEnd(
  s: Setup,
  who: 'hero' | 'agent',
  limb: Contact['limb'] | Contact['target'],
  index: 0 | 1,
) {
  const f = who === 'hero' ? s.m.hero : s.m.agent;
  return (limb === 'foot' ? f.legs : f.arms)[index].white.end;
}
function release(s: Setup) {
  disposeObject(s.actor);
  disposeObject(s.trick.object);
}

describe('Slow-Mo Showdown', () => {
  it('is named in the picker', () => {
    expect(projectileName('🥋')).toBe('Slow-Mo Showdown');
  });

  it('shares reproducible plans that vary every stage in order', () => {
    expect(bulletTimePlan('same')).toEqual(bulletTimePlan('same'));
    const plans = Array.from({ length: 60 }, (_, i) => bulletTimePlan(`bullettime-${i}`));
    for (const key of [
      'pace',
      'travel',
      'loft',
      'agentIn',
      'hit',
      'arch',
      'contactU',
      'tilt',
      'hold',
      'knock',
      'tumble',
      'exitLen',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBeGreaterThan(40);
    for (const key of [
      'side',
      'entry',
      'agentEntry',
      'finisher',
      'exit',
      'beckons',
      'claps',
      'turns',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(2);
    expect(new Set(plans.map((p) => p.bubbles))).toEqual(new Set(['both', 'whoa', 'card']));
    const moves = plans.flatMap((p) => p.exchanges.map((e) => `${e.by} ${e.kind}`));
    for (const by of ['hero', 'agent'])
      for (const kind of ['clash', 'flurry', 'sweep', 'spin', 'kick'])
        expect(moves).toContain(`${by} ${kind}`);
    expect(moves).toContain('agent hit');
    expect(moves).not.toContain('hero hit');
    for (const p of plans) {
      const kinds = p.exchanges.map((e) => e.kind);
      // Every fight opens with the mid-air clash and has punches, a sweep and a kick.
      expect(kinds[0]).toBe('clash');
      expect(kinds).toContain('flurry');
      expect(kinds).toContain('sweep');
      expect(kinds.some((k) => k === 'spin' || k === 'kick')).toBe(true);
      const fight = p.exchanges.flatMap((e) => [e.at, e.at + e.len]);
      const beats = [
        p.travel,
        p.agentIn,
        p.beckonAt,
        p.beckonEnd,
        ...fight,
        p.windup,
        p.swing,
        p.hit,
        p.upright,
        p.fin,
        p.strike,
        p.dustAt,
        p.dustEnd,
        p.exitAt,
        p.exitEnd,
        p.end,
      ];
      beats.slice(1).forEach((at, i) => expect(at).toBeGreaterThan(beats[i] ?? Infinity));
      expect(p.agentStart).toBeLessThan(p.agentIn);
      expect(p.end).toBeGreaterThan(p.strike + p.flight);
    }
  });

  it('brings the hero in from either side without stopping dead, flipping over the card from its far side', () => {
    for (const entry of ['flip', 'slide'] as const)
      for (let n = 0; n < 3; n++) {
        const id = seedWith((p) => p.entry === entry, n);
        for (const chosen of [-1, 1])
          for (const from of [source, { x: 720, y: 640 }]) {
            const s = setup(id, desktop, chosen);
            const hero = s.m.hero.root;
            const pace = approachPace((t) => {
              play(s, t * s.p.travel, desktop, from);
              return { x: hero.position.x, y: -hero.position.y };
            });
            expect(pace.slowest, `${id} ${chosen}`).toBeGreaterThan(entry === 'slide' ? 0.05 : 0.2);
            play(s, s.p.travel - 1, desktop, from);
            expect(hero.position.x).toBeCloseTo(screen(s.m.hero.body).x, 0);
            const crossing =
              (from.x - (desktop.left + desktop.width / 2)) * s.side > desktop.width / 2;
            if (entry === 'flip' && crossing) {
              // Mid-flip, the whole tucked hero is above the card's top edge.
              play(s, s.p.travel * (s.p.run + (1 - s.p.run) * 0.5), desktop, from);
              const top = Math.max(
                ...[...s.m.hero.legs, ...s.m.hero.arms].map((l) => screen(l.white.end).y),
              );
              const x = hero.position.x;
              expect(x).toBeGreaterThan(desktop.left - 40);
              expect(x).toBeLessThan(desktop.left + desktop.width + 40);
              expect(top).toBeLessThan(desktop.top);
            }
            release(s);
          }
      }
  });

  it('keeps every limb at fixed length and lands the slow punch on the live card', () => {
    for (const id of [
      seedWith((p) => has(p, 'agent', 'hit')),
      seedWith((p) => p.finisher === 'palm' && has(p, 'hero', 'sweep')),
    ])
      for (const chosen of [-1, 1])
        for (const b of [desktop, mobile]) {
          const s = setup(id, b, chosen);
          const { hero, agent } = s.m;
          const k = bulletScale(b);
          for (let ms = 0; ms < s.p.end; ms += 47) {
            play(s, ms, b);
            for (const f of [hero, agent])
              for (const limb of [...f.arms, ...f.legs].flatMap((l) => [l.white, l.ink])) {
                expect(limb.upper.scale.y).toBeCloseTo(limb.lengths[0], 6);
                expect(limb.lower.scale.y).toBeCloseTo(limb.lengths[1], 6);
              }
          }
          // Through bullet time the fist passes above the bent-back hero's head.
          for (const t of [0.3, 0.5, 0.7]) {
            play(s, s.p.swing + t * (s.p.hit - s.p.swing), b);
            const fist = screen(agent.arms[0].white.end),
              head = screen(hero.head);
            const radius = 4.8 * k;
            if (Math.abs(fist.x - head.x) < radius * 2)
              expect(fist.y).toBeLessThan(head.y - radius);
          }
          for (const ms of [s.p.hit, s.p.hit + 120, s.p.hit + s.p.hold - 10]) {
            play(s, ms, b);
            const contact = cardPoint(
              bulletCardPose(s.p, ms, s.side, b),
              contactPoint(s.p, b, s.side),
              b,
            );
            const fist = screen(agent.arms[0].white.end);
            expect(
              Math.hypot(fist.x - contact.x, fist.y - contact.y),
              `${id} punch ${ms}`,
            ).toBeLessThan(0.5 * k);
          }
          release(s);
        }
  });

  it('lands every blow of the fight on the hand, foot or chin it was aimed at', () => {
    const seeds = new Set<string>();
    for (const by of ['hero', 'agent'] as const)
      for (const kind of ['clash', 'flurry', 'kick'] as const)
        seeds.add(seedWith((p) => has(p, by, kind)));
    seeds.add(seedWith((p) => has(p, 'hero', 'sweep')));
    seeds.add(seedWith((p) => has(p, 'agent', 'hit')));
    for (const id of seeds)
      for (const chosen of [-1, 1])
        for (const b of [desktop, mobile]) {
          const s = setup(id, b, chosen);
          const k = bulletScale(b);
          expect(s.trick.contacts.length).toBe(
            s.p.exchanges
              .flatMap((e) => (e.kind === 'flurry' ? Array(e.count).fill(e) : [e]))
              .filter(
                (e: Exchange) => e.kind !== 'spin' && !(e.kind === 'sweep' && e.by === 'agent'),
              ).length,
          );
          for (const c of s.trick.contacts) {
            play(s, c.at, b);
            const blow = screen(limbEnd(s, c.by, c.limb, c.index));
            const other = c.by === 'hero' ? s.m.agent : s.m.hero;
            const target =
              c.target === 'head'
                ? screen(other.head)
                : screen(limbEnd(s, c.by === 'hero' ? 'agent' : 'hero', c.target, c.targetIndex));
            const reach = c.target === 'head' ? 4.8 * k : 0.6 * k;
            expect(
              Math.hypot(blow.x - target.x, blow.y - target.y),
              `${id} ${c.by} ${c.limb} at ${Math.round(c.at)}`,
            ).toBeLessThan(reach);
            // A flash marks the blow where it lands.
            const sparks = s.trick.object.children.filter(
              (o) => o.name.startsWith('bullettime-spark-') && o.visible,
            );
            expect(
              sparks.some(
                (o) => Math.hypot(o.position.x - blow.x, -o.position.y - blow.y) < 0.5 * k,
              ),
            ).toBe(true);
          }
          release(s);
        }
  });

  it('has the hero hop the sweep, the agent duck the spin kick and the swept agent kip back up', () => {
    const hopped = setup(
      seedWith((p) => has(p, 'agent', 'sweep')),
      desktop,
    );
    const sweep = exchange(hopped.p, 'agent', 'sweep');
    const floor = bulletFloor(desktop),
      k = bulletScale(desktop);
    play(hopped, sweep.at + 725);
    const leg = screen(hopped.m.agent.legs[1].white.end);
    const feet = hopped.m.hero.legs.map((l) => screen(l.white.end));
    expect(leg.y).toBeGreaterThan(floor - 3 * k);
    expect(Math.min(...feet.map((f) => Math.abs(f.x - leg.x)))).toBeLessThan(6 * k);
    for (const f of feet) expect(f.y).toBeLessThan(leg.y - 4 * k);
    release(hopped);

    for (const by of ['hero', 'agent'] as const) {
      const s = setup(
        seedWith((p) => has(p, by, 'spin')),
        desktop,
      );
      const e = exchange(s.p, by, 'spin');
      play(s, e.at + SPIN.jump + 0.85 * (SPIN.land - SPIN.jump));
      const kick = screen(limbEnd(s, by, 'foot', 1));
      const ducked = screen((by === 'hero' ? s.m.agent : s.m.hero).head);
      expect(kick.y, `${by} spin kick`).toBeLessThan(ducked.y - 4.8 * k);
      release(s);
    }

    const s = setup(
      seedWith((p) => has(p, 'hero', 'sweep')),
      desktop,
    );
    const e = exchange(s.p, 'hero', 'sweep');
    play(s, (SWEEP.fall + SWEEP.kip) / 2 + e.at);
    expect(s.m.agent.root.rotation.z * s.side).toBeCloseTo(Math.PI / 2, 1);
    expect(screen(s.m.agent.head).y).toBeGreaterThan(floor - 7 * k);
    play(s, e.at + e.len - 1);
    expect(s.m.agent.root.rotation.z).toBeCloseTo(0, 6);
    expect(Math.min(...s.m.agent.legs.map((leg) => lowestWorldY(leg.white.root)))).toBeCloseTo(
      -floor,
      0,
    );
    release(s);
  });

  it('plants the finisher on the agent and knocks him tumbling away from the card', () => {
    for (const finisher of ['kick', 'palm'] as const) {
      const s = setup(
        seedWith((p) => p.finisher === finisher),
        desktop,
      );
      const { hero, agent } = s.m;
      play(s, s.p.strike - 1);
      const limb = finisher === 'kick' ? hero.legs[1] : hero.arms[1];
      const hit = screen(limb.white.end);
      expect(hero.root.scale.x).toBeCloseTo(-s.side * bulletScale(desktop), 6);
      const agentHip = screen(agent.root);
      expect(Math.abs(hit.x - agentHip.x)).toBeLessThan(8 * bulletScale(desktop));
      play(s, s.p.strike + s.p.flight * 0.5);
      expect((agent.root.position.x - agentHip.x) * s.side).toBeLessThan(
        -20 * bulletScale(desktop),
      );
      expect(agent.root.rotation.z * s.side).toBeGreaterThan(0);
      play(s, s.p.strike + s.p.flight + 1);
      expect(agent.root.visible).toBe(false);
      release(s);
    }
  });

  it('keeps both stick men standing on the floor while they square off and through the bend', () => {
    for (const chosen of [-1, 1]) {
      const s = setup(
        seedWith(() => true),
        desktop,
        chosen,
      );
      const floor = -(desktop.top + desktop.height);
      for (const ms of [
        s.p.beckonAt + 300,
        s.p.windup + 100,
        s.p.swing + (s.p.hit - s.p.swing) * 0.5,
        s.p.dustAt + 100,
      ])
        for (const f of ms < s.p.strike ? [s.m.hero, s.m.agent] : [s.m.hero]) {
          play(s, ms);
          const lowest = Math.min(...f.legs.map((leg) => lowestWorldY(leg.white.root)));
          expect(lowest, `${ms}`).toBeCloseTo(floor, 0);
        }
      release(s);
    }
  });

  it('knocks the card away from the fight about its far corner only after contact, then restores it', () => {
    const p = bulletTimePlan(seedWith(() => true));
    for (const side of [-1, 1] as const) {
      expect(bulletCardPose(p, p.hit, side, desktop)).toEqual({
        x: 0,
        y: 0,
        angle: 0,
        sx: 1,
        sy: 1,
      });
      const knocked = bulletCardPose(p, p.hit + 150, side, desktop);
      expect(Math.sign(knocked.angle)).toBe(side);
      expect(Math.abs(knocked.angle)).toBeGreaterThan(p.tilt * 0.8);
      const far = {
        x: side > 0 ? desktop.left + desktop.width : desktop.left,
        y: desktop.top + desktop.height,
      };
      const at = cardPoint(knocked, far, desktop);
      expect(at.x).toBeCloseTo(far.x, 6);
      expect(at.y).toBeCloseTo(far.y, 6);
      expect(Math.abs(bulletCardPose(p, p.fin + 1400, side, desktop).angle)).toBeLessThan(0.05);
      const frames = bulletFrames(p, side, desktop).frames;
      expect(frames.at(-1)?.['rotate']).toBe('0deg');
      expect(frames.at(-1)?.['translate']).toBe('0px 0px');
    }
  });

  it('shows the code, ripples and exact thought bubbles at their beats', () => {
    for (const bubbles of ['both', 'whoa', 'card'] as const) {
      const s = setup(
        seedWith((p) => p.bubbles === bubbles),
        desktop,
      );
      const whoa = s.trick.object.getObjectByName('bullettime-whoa');
      const noCard = s.trick.object.getObjectByName('bullettime-no-card');
      expect(whoa?.userData['text']).toBe(BULLET_WHOA);
      expect(noCard?.userData['text']).toBe(BULLET_NO_CARD);
      play(s, (s.p.swing + s.p.hit) / 2);
      expect(whoa?.visible).toBe(bubbles !== 'card');
      expect(s.trick.object.getObjectByName('bullettime-card-code')?.visible).toBe(false);
      play(s, s.p.hit + 300);
      expect(noCard?.visible).toBe(bubbles !== 'whoa');
      expect(whoa?.visible).toBe(false);
      expect(s.trick.object.getObjectByName('bullettime-card-code')?.visible).toBe(true);
      expect(s.trick.object.getObjectByName('bullettime-ripple-0')?.visible).toBe(true);
      // The bubble sits above the card, never over it.
      expect(-(noCard?.position.y ?? 0) + (noCard?.scale.y ?? 0) / 2).toBeLessThanOrEqual(
        desktop.top,
      );
      release(s);
    }
  });

  it('keeps the chosen side and the punch on the resized card', () => {
    const s = setup(
      seedWith(() => true),
      mobile,
    );
    const ms = s.p.hit + 80;
    for (const b of [mobile, desktop]) {
      play(s, ms, b);
      const contact = cardPoint(
        bulletCardPose(s.p, ms, s.side, b),
        contactPoint(s.p, b, s.side),
        b,
      );
      const fist = screen(s.m.agent.arms[0].white.end);
      expect(Math.hypot(fist.x - contact.x, fist.y - contact.y)).toBeLessThan(0.5 * bulletScale(b));
      expect(Math.sign(b.left + b.width / 2 - bulletLandingPoint(s.p, b, view, s.side).x)).toBe(
        s.side,
      );
    }
    release(s);
  });

  it('leaves at full size for each exit, stays finite, seeks deterministically and releases every resource once', () => {
    for (const id of [seedWith((p) => p.exit === 'fly'), seedWith((p) => p.exit === 'stroll')]) {
      const s = setup(id, desktop);
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>();
      const collect = () => {
        for (const root of [s.actor, s.trick.object])
          root.traverse((node) => {
            if (!(node instanceof THREE.Mesh || node instanceof THREE.Sprite)) return;
            if (node instanceof THREE.Mesh) geometries.add(node.geometry);
            for (const m of Array.isArray(node.material) ? node.material : [node.material])
              materials.add(m);
          });
      };
      collect();
      const count = [geometries.size, materials.size];
      for (let ms = 0; ms < s.trick.duration; ms += 45) {
        s.trick.update(ms, s.actor, source, desktop, view, s.side);
        s.actor.traverse((node) =>
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
      play(s, s.p.exitEnd - 1);
      const hero = s.m.hero.root;
      expect(hero.visible).toBe(true);
      expect(Math.abs(hero.scale.x)).toBeCloseTo(bulletScale(desktop), 9);
      const head = screen(s.m.hero.head);
      const gone = s.p.exit === 'fly' ? head.y < 0 : head.x < -40 || head.x > view.x + 40;
      expect(gone, `${id} ${s.p.exit}`).toBe(true);
      const at = (s.p.hit + 100) * s.p.pace;
      s.trick.update(at, s.actor, source, desktop, view, s.side);
      const first = world(s.m.agent.arms[0].white.end);
      s.trick.update(s.trick.duration * 0.9, s.actor, source, desktop, view, s.side);
      s.trick.update(at, s.actor, source, desktop, view, s.side);
      expect(world(s.m.agent.arms[0].white.end).distanceTo(first)).toBeLessThan(1e-6);
      s.trick.update(s.trick.duration, s.actor, source, desktop, view, s.side);
      expect(s.actor.visible).toBe(false);
      expect(s.trick.object.visible).toBe(false);
      const spies = [...geometries, ...materials].map((resource) => vi.spyOn(resource, 'dispose'));
      release(s);
      spies.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
    }
  });
});
