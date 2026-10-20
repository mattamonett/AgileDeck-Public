import { facingFrom, type CharacterDefinition } from '../../character';
import { rocketLandingPoint } from './rocket-choreography';
import { rocketRoute } from './rocket-flight';
import { makeRocket } from './rocket-model';
import { RocketTrick } from './rocket-trick';

export const rocketCharacter: CharacterDefinition<RocketTrick['plan']> = {
  emoji: '🚀',
  makeModel: (id) => makeRocket(id),
  keepsThrowProfile: true,
  styleProfile(profile) {
    const rocket = rocketRoute(`${profile.spin}:${profile.drift}`);
    return { ...profile, rocket, duration: rocket.duration };
  },
  createAct(stage) {
    const trick = new RocketTrick(stage.projectile);
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
      landingPoint: (at) => rocketLandingPoint(plan, at.b, at.view, at.facing),
    };
  },
  planOf: (act) => (act.trick instanceof RocketTrick ? act.trick.plan : undefined),
};
