import { facingFrom, type CharacterDefinition } from '../../character';
import { hippieLandingPoint } from './hippie-choreography';
import { makeHippie, HippieTrick } from './hippie-trick';

export const hippieCharacter: CharacterDefinition<HippieTrick['plan']> = {
  emoji: '☮️',
  makeModel: (id) => makeHippie(id),
  createAct(stage) {
    const trick = new HippieTrick(stage.projectile);
    const plan = trick.plan;
    return {
      trick,
      object: trick.object,
      get duration() {
        return trick.duration;
      },
      cardAnimation: (facing, bounds) => trick.cardAnimation(facing, bounds),
      perform(ms, at) {
        stage.object.visible = ms < trick.duration;
        stage.object.position.set(0, 0, 0);
        trick.update(ms, stage.projectile, at.start, at.b, at.view, facingFrom(at.b, at.end));
      },
      landingPoint: (at) => hippieLandingPoint(plan, at.b, at.view, at.facing),
    };
  },
  planOf: (act) => (act.trick instanceof HippieTrick ? act.trick.plan : undefined),
};
