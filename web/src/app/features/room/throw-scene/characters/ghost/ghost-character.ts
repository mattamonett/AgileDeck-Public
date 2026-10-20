import { facingFrom, type CharacterDefinition } from '../../character';
import { ghostLandingPoint } from './ghost-choreography';
import { makeGhost, GhostTrick } from './ghost-trick';

export const ghostCharacter: CharacterDefinition<GhostTrick['plan']> = {
  emoji: '👻',
  makeModel: (id) => makeGhost(id),
  createAct(stage) {
    const trick = new GhostTrick(stage.projectile);
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
        trick.update(
          ms,
          stage.projectile,
          at.start,
          at.b,
          at.view,
          facingFrom(at.b, at.end),
          at.target,
        );
      },
      release: () => trick.dispose(),
      landingPoint: (at) => ghostLandingPoint(plan, at.b, at.view, at.facing),
    };
  },
  planOf: (act) => (act.trick instanceof GhostTrick ? act.trick.plan : undefined),
};
