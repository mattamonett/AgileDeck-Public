import { facingFrom, type CharacterDefinition } from '../../character';
import { bulletLandingPoint } from './bullettime-choreography';
import { makeBulletTime, BulletTimeTrick } from './bullettime-trick';

export const bulletTimeCharacter: CharacterDefinition<BulletTimeTrick['plan']> = {
  emoji: '🥋',
  makeModel: (id) => makeBulletTime(id),
  createAct(stage) {
    const trick = new BulletTimeTrick(stage.projectile);
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
      landingPoint: (at) => bulletLandingPoint(plan, at.b, at.view, at.facing),
    };
  },
  planOf: (act) => (act.trick instanceof BulletTimeTrick ? act.trick.plan : undefined),
};
