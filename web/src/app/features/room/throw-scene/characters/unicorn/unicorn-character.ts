import type { CharacterDefinition } from '../../character';
import { unicornLandingPoint } from './unicorn-choreography';
import { makeUnicorn, RainbowRide } from './unicorn-flight';

export const unicornCharacter: CharacterDefinition<RainbowRide['plan']> = {
  emoji: '🦄',
  makeModel: (id) => makeUnicorn(id),
  createAct(stage) {
    const trick = new RainbowRide(stage.projectile);
    return {
      trick,
      object: trick.object,
      get duration() {
        return trick.duration;
      },
      cardAnimation: () => trick.cardAnimation(),
      perform(ms, at) {
        stage.object.visible = true;
        stage.object.position.set(0, 0, 0);
        trick.update(ms, stage.projectile, at.start, at.end, at.b, at.view);
      },
      landingPoint: (at) => unicornLandingPoint(at.b),
    };
  },
  planOf: (act) => (act.trick instanceof RainbowRide ? act.trick.plan : undefined),
};
