import type { CharacterDefinition } from '../../character';
import { ufoLandingPoint, ufoApproach, UFO_SCALE } from './ufo-choreography';
import { makeUfo, ufoDetails } from './ufo-model';
import { UfoTrick } from './ufo-trick';

export const ufoCharacter: CharacterDefinition<UfoTrick['plan']> = {
  emoji: '🛸',
  makeModel: () => makeUfo(),
  createAct(stage, id) {
    const trick = new UfoTrick(id);
    const plan = trick.plan;
    return {
      trick,
      object: trick.object,
      get duration() {
        return trick.duration;
      },
      cardAnimation: (facing, bounds) => trick.cardAnimation(bounds),
      land: (ms, b, end, viewport) => trick.update(ms, stage.projectile, b, end, viewport),
      landingPoint: (at) => ufoLandingPoint(plan, at.b, at.view),
      approachDuration(distance) {
        return (1400 + Math.min(550, distance * 0.65)) * plan.pace;
      },
      approach({ t, start, end, view }) {
        const object = stage.projectile;
        const point = ufoApproach(plan, start, end, view, t);
        object.position.set(point.x, -point.y, 162);
        object.scale.setScalar(UFO_SCALE);
        object.rotation.set(0, 0, -plan.side * Math.sin(t * Math.PI) * 0.16);
        ufoDetails(object, plan, (t - 1) * 1200, 0);
        return true;
      },
    };
  },
  planOf: (act) => (act.trick instanceof UfoTrick ? act.trick.plan : undefined),
};
