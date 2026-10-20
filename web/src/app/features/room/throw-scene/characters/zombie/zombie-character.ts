import type { CharacterDefinition } from '../../character';
import { hopPoint } from '../../flight/flight-math';
import {
  makeZombie,
  ZombieTrick,
  zombieWalk,
  zombieApproach,
  zombieLandingPoint,
} from './zombie-trick';

export const zombieCharacter: CharacterDefinition<ZombieTrick['plan']> = {
  emoji: '🧟',
  makeModel: () => makeZombie(),
  motion: (start, end, _profile, t) => hopPoint(start, end, t, 8),
  createAct(stage, id) {
    const trick = new ZombieTrick(id);
    const plan = trick.plan;
    return {
      trick,
      object: trick.object,
      get duration() {
        return trick.duration;
      },
      cardAnimation: (facing) => trick.cardAnimation(facing),
      land: (ms, b, end, viewport) => trick.update(ms, stage.projectile, b, end, viewport),
      landingPoint: (at) => zombieLandingPoint(at.b, at.variation, at.view),
      approachDuration(distance) {
        return (1700 + Math.min(900, distance * 0.8)) * plan.pace;
      },
      approach({ t, start, end, b, view }) {
        const object = stage.projectile;
        const contactFacing = Math.sign(b.left + b.width / 2 - end.x) || 1;
        const point = zombieApproach(plan, start, end, view, t, contactFacing);
        const previous = zombieApproach(
          plan,
          start,
          end,
          view,
          Math.max(0, t - 0.005),
          contactFacing,
        );
        const facing =
          t > 0.93
            ? contactFacing
            : Math.sign(point.x - previous.x) || Math.sign(end.x - start.x) || 1;
        zombieWalk(object, Math.hypot(point.x - start.x, point.y - start.y) / 180, facing);
        object.position.set(point.x, -point.y, 140);
        return true;
      },
    };
  },
  planOf: (act) => (act.trick instanceof ZombieTrick ? act.trick.plan : undefined),
};
