import type { CharacterDefinition } from '../../character';
import { chainsawApproach, chainsawLandingPoint } from './chainsaw-choreography';
import { makeChainsawCharacter, ChainsawTrick, chainsawWalk } from './chainsaw-trick';
import { hopPoint } from '../../flight/flight-math';

export const chainsawCharacter: CharacterDefinition<ChainsawTrick['plan']> = {
  emoji: '🪚',
  makeModel: () => makeChainsawCharacter(),
  motion: (start, end, _profile, t) => hopPoint(start, end, t, 8),
  createAct(stage, id) {
    const trick = new ChainsawTrick(id);
    const plan = trick.plan;
    return {
      trick,
      object: trick.object,
      get duration() {
        return trick.duration;
      },
      cardAnimation: (facing) => trick.cardAnimation(facing),
      land: (ms, b, end, viewport) => trick.update(ms, stage.projectile, b, end, viewport),
      landingPoint: (at) => chainsawLandingPoint(plan, at.b, at.view),
      approachDuration(distance) {
        return (1250 + Math.min(600, distance * 0.6)) * plan.pace;
      },
      approach({ t, start, end, b, view }) {
        const object = stage.projectile;
        const contactFacing = Math.sign(b.left + b.width / 2 - end.x) || 1;
        const point = chainsawApproach(plan, start, end, contactFacing, view, t);
        const previous = chainsawApproach(
          plan,
          start,
          end,
          contactFacing,
          view,
          Math.max(0, t - 0.005),
        );
        const facing = t > 0.94 ? contactFacing : Math.sign(point.x - previous.x) || contactFacing;
        chainsawWalk(object, Math.hypot(point.x - start.x, point.y - start.y) / 130, facing);
        object.position.set(point.x, -point.y, 140);
        return true;
      },
    };
  },
  planOf: (act) => (act.trick instanceof ChainsawTrick ? act.trick.plan : undefined),
};
