import type { CharacterDefinition } from '../../character';
import { hopPoint } from '../../flight/flight-math';
import {
  wrestlerLandingPoint,
  wrestlerApproach,
  wrestlerApproachFacing,
} from './wrestler-choreography';
import { makeWrestler, WrestlerTrick, wrestlerWalk } from './wrestler-trick';

export const wrestlerCharacter: CharacterDefinition<WrestlerTrick['plan']> = {
  emoji: '🤼',
  makeModel: () => makeWrestler(),
  pinsSide: true,
  motion: (start, end, _profile, t) => hopPoint(start, end, t, 8),
  createAct(stage, id) {
    const trick = new WrestlerTrick(id);
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
        wrestlerLandingPoint(plan, at.b, at.view, at.start, at.landed ? at.facing : undefined),
      approachDuration(distance) {
        return (1100 + Math.min(500, distance * 0.7)) * plan.pace;
      },
      approach({ t, start, end, b, view }) {
        const object = stage.projectile;
        const point = wrestlerApproach(plan, start, end, view, t, b);
        const previous = wrestlerApproach(plan, start, end, view, Math.max(0, t - 0.005), b);
        const facing = wrestlerApproachFacing(plan, start, end, b, t);
        const stride = Math.min(1, Math.hypot(point.x - previous.x, point.y - previous.y));
        object.position.set(point.x, -point.y, 166.4);
        wrestlerWalk(
          object,
          Math.hypot(point.x - start.x, point.y - start.y),
          facing,
          stride,
          plan.step,
        );
        return true;
      },
    };
  },
  planOf: (act) => (act.trick instanceof WrestlerTrick ? act.trick.plan : undefined),
};
