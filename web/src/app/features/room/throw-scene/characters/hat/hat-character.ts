import type { CharacterDefinition } from '../../character';
import { hatApproach, hatLandingPoint } from './hat-choreography';
import { hatTravel } from './hat-model';
import { makeTopHat, HatTrick } from './top-hat';

export const hatCharacter: CharacterDefinition<HatTrick['plan']> = {
  emoji: '🎩',
  makeModel: () => makeTopHat(),
  createAct(stage, id) {
    const trick = new HatTrick(id);
    const plan = trick.plan;
    return {
      trick,
      object: trick.object,
      get duration() {
        return trick.duration;
      },
      cardAnimation: () => trick.cardAnimation(),
      land: (ms, b, end) => trick.update(ms, stage.projectile, b, end),
      landingPoint: (at) => hatLandingPoint(plan, at.b),
      approachDuration(distance) {
        return (1000 + Math.min(650, distance * 0.65)) * plan.pace;
      },
      approach({ t, start, end, view }) {
        const object = stage.projectile;
        const point = hatApproach(plan, start, end, view, t);
        hatTravel(object, plan, t);
        object.position.set(point.x, -point.y, 160);
        return true;
      },
    };
  },
  planOf: (act) => (act.trick instanceof HatTrick ? act.trick.plan : undefined),
};
