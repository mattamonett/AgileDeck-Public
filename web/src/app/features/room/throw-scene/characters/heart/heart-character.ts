import type { CharacterDefinition } from '../../character';
import { makeHeart } from './broken-heart';
import { heartLandingPoint } from './heart-choreography';
import { HeartTrick } from './heart-trick';

export const heartCharacter: CharacterDefinition<HeartTrick['plan']> = {
  emoji: '❤️',
  makeModel: (id) => makeHeart(id),
  createAct(stage) {
    const trick = new HeartTrick(stage.projectile);
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
        trick.update(ms, stage.projectile, at.start, at.b, at.view);
      },
      landingPoint: (at) => heartLandingPoint(at.b),
    };
  },
  planOf: (act) => (act.trick instanceof HeartTrick ? act.trick.plan : undefined),
};
