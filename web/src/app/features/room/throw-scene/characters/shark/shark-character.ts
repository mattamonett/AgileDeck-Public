import type { CharacterDefinition } from '../../character';
import { sharkLandingPoint, sharkApproach, sharkTangent } from './shark-choreography';
import { sharkTravel } from './shark-model';
import { makeShark, sharkPoint, sharkRoute, SharkTrick } from './shark-trick';

export const sharkCharacter: CharacterDefinition<SharkTrick['plan']> = {
  emoji: '🦈',
  makeModel: () => makeShark(),
  keepsThrowProfile: true,
  motion(start, end, profile, t) {
    return profile.swim ? sharkPoint(start, end, profile.swim, t) : undefined;
  },
  styleProfile(profile) {
    const swim = sharkRoute(`${profile.spin}:${profile.drift}`);
    return { ...profile, swim, duration: swim.duration };
  },
  createAct(stage, id) {
    const trick = new SharkTrick(id);
    const plan = trick.plan;
    return {
      trick,
      object: trick.object,
      get duration() {
        return trick.duration;
      },
      cardAnimation: (facing) => trick.cardAnimation(facing),
      land: (ms, b, end, viewport) => trick.update(ms, stage.projectile, b, end, viewport),
      landingPoint: (at) =>
        sharkLandingPoint(plan, at.b, at.view, at.landed ? at.facing : undefined),
      approachDuration(distance) {
        return (1700 + Math.min(650, distance * 0.65)) * plan.pace;
      },
      approach({ t, elapsed, start, end, b, view }) {
        const object = stage.projectile;
        const facing = Math.sign(b.left + b.width / 2 - end.x) || 1;
        const point = sharkApproach(plan, start, end, view, facing, t);
        const tangent = sharkTangent(plan, start, end, view, facing, t);
        sharkTravel(object, plan, elapsed / plan.pace, t, tangent, facing);
        object.position.set(point.x, -point.y, 160);
        return true;
      },
    };
  },
  planOf: (act) => (act.trick instanceof SharkTrick ? act.trick.plan : undefined),
};
