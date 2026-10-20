import { facingFrom, type CharacterDefinition } from '../../character';
import { melloLandingPoint } from './mellomary-choreography';
import { makeMelloMary, MelloMaryTrick } from './mellomary-trick';

export const melloMaryCharacter: CharacterDefinition<MelloMaryTrick['plan']> = {
  emoji: '🎺',
  makeModel: (id) => makeMelloMary(id),
  createAct(stage) {
    const trick = new MelloMaryTrick(stage.projectile);
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
      landingPoint: (at) => melloLandingPoint(plan, at.b, at.view, at.facing),
    };
  },
  planOf: (act) => (act.trick instanceof MelloMaryTrick ? act.trick.plan : undefined),
};
