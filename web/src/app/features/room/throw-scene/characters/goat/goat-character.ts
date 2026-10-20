import type { CharacterDefinition } from '../../character';
import { hopPoint } from '../../flight/flight-math';
import { goatLandingPoint, goatApproach, goatApproachFacing } from './goat-choreography';
import { makeGoats, GoatTrick, goatWalk } from './goat-trick';

export const goatCharacter: CharacterDefinition<GoatTrick['plan']> = {
  emoji: '🐐',
  makeModel: () => makeGoats(),
  pinsSide: true,
  motion: (start, end, _profile, t) => hopPoint(start, end, t, 8),
  createAct(stage, id) {
    const trick = new GoatTrick(id);
    const plan = trick.plan;
    return {
      trick,
      object: trick.object,
      get duration() {
        return trick.duration;
      },
      cardAnimation: (facing) => trick.cardAnimation(facing),
      land: (ms, b, end, viewport) => trick.update(ms, stage.projectile, b, end, viewport),
      landingPoint: (at) =>
        goatLandingPoint(plan, at.b, at.view, at.start, at.landed ? at.facing : undefined),
      approachDuration(distance) {
        return (1400 + Math.min(550, distance * 0.65)) * plan.pace;
      },
      approach({ t, start, end, b, view, profile }) {
        const object = stage.projectile;
        const point = goatApproach(plan, start, end, view, t, b);
        const previous = goatApproach(plan, start, end, view, Math.max(0, t - 0.005), b);
        const facing = goatApproachFacing(plan, start, end, b, t),
          contactFacing = Math.sign(b.left + b.width / 2 - end.x) || 1;
        const stride = Math.min(
          1,
          (Math.hypot(point.x - previous.x, point.y - previous.y) / (profile.duration * 0.005)) *
            10,
        );
        object.position.set(point.x, -point.y, 168.56);
        goatWalk(
          object,
          Math.hypot(point.x - start.x, point.y - start.y),
          facing,
          stride,
          plan.step,
          contactFacing,
          plan.order,
        );
        return true;
      },
    };
  },
  planOf: (act) => (act.trick instanceof GoatTrick ? act.trick.plan : undefined),
};
