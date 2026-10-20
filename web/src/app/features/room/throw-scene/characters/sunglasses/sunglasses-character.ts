import type { CharacterDefinition } from '../../character';
import { makeSunglasses, sunglassesTravel } from './sunglasses';
import { sunglassesLandingPoint, sunglassesApproach } from './sunglasses-choreography';
import { SunglassesTrick } from './sunglasses-trick';

export const sunglassesCharacter: CharacterDefinition<SunglassesTrick['plan']> = {
  emoji: '🕶️',
  makeModel: (id) => makeSunglasses(id),
  createAct(stage) {
    const trick = new SunglassesTrick(stage.projectile);
    const plan = trick.plan;
    return {
      trick,
      object: trick.object,
      get duration() {
        return trick.duration;
      },
      cardAnimation: () => trick.cardAnimation(),
      land: (ms, b, end) => trick.update(ms, stage.projectile, b, end),
      landingPoint: (at) => sunglassesLandingPoint(at.b),
      approachDuration(distance) {
        return (1250 + Math.min(450, distance * 0.5)) * plan.pace;
      },
      approach({ t, start, end, view }) {
        const object = stage.projectile;
        const point = sunglassesApproach(plan, start, end, view, t);
        sunglassesTravel(object, t);
        object.position.set(point.x, -point.y, 194.4);
        return true;
      },
    };
  },
  planOf: (act) => (act.trick instanceof SunglassesTrick ? act.trick.plan : undefined),
};
