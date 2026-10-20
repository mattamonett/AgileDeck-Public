import { facingFrom, type CharacterDefinition } from '../../character';
import { dinoLandingPoint } from './dinosaur-choreography';
import { makeDinosaur, DinosaurTrick } from './dinosaur-trick';
import { hopPoint } from '../../flight/flight-math';

export const dinosaurCharacter: CharacterDefinition<DinosaurTrick['plan']> = {
  emoji: '🦖',
  makeModel: (id) => makeDinosaur(id),
  motion: (start, end, _profile, t) => hopPoint(start, end, t, 5),
  createAct(stage) {
    const trick = new DinosaurTrick(stage.projectile);
    const plan = trick.plan;
    return {
      trick,
      object: trick.object,
      get duration() {
        return trick.duration;
      },
      cardAnimation: (facing) => trick.cardAnimation(facing),
      perform(ms, at) {
        stage.object.visible = ms < trick.duration;
        stage.object.position.set(0, 0, 0);
        trick.update(ms, stage.projectile, at.start, at.b, at.view, facingFrom(at.b, at.end));
      },
      landingPoint: (at) => dinoLandingPoint(plan, at.b, at.view, at.facing),
    };
  },
  planOf: (act) => (act.trick instanceof DinosaurTrick ? act.trick.plan : undefined),
};
