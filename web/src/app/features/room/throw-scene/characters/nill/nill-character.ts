import type { CharacterDefinition } from '../../character';
import { hopPoint } from '../../flight/flight-math';
import { nillLandingPoint, nillApproach, nillEase } from './nill-choreography';
import { makeNillSmith, NillTrick, nillWalk } from './nill-smith';

export const nillCharacter: CharacterDefinition<NillTrick['plan']> = {
  emoji: '✋',
  makeModel: () => makeNillSmith(),
  pinsSide: true,
  motion: (start, end, _profile, t) => hopPoint(start, end, t, 8),
  createAct(stage, id) {
    const trick = new NillTrick(id);
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
        nillLandingPoint(plan, at.b, at.view, at.start, at.landed ? at.facing : undefined),
      approachDuration(distance) {
        return (1450 + Math.min(650, distance * 0.65)) * plan.pace;
      },
      approach({ t, start, end, b, view, profile }) {
        const object = stage.projectile;
        const point = nillApproach(plan, start, end, view, t);
        const previous = nillApproach(plan, start, end, view, Math.max(0, t - 0.005));
        const facing = Math.sign(b.left + b.width / 2 - end.x) || 1;
        const walkFacing = Math.sign(end.x - start.x) || facing;
        const distance = Math.hypot(point.x - start.x, point.y - start.y);
        const stride = Math.min(
          1,
          (Math.hypot(point.x - previous.x, point.y - previous.y) / (profile.duration * 0.005)) * 8,
        );
        object.position.set(point.x, -point.y, 160);
        nillWalk(object, distance, walkFacing, stride, plan.step);
        const settle = nillEase((t - 0.88) / 0.12);
        object.rotation.y = walkFacing * 0.2 * (1 - settle) + facing * 0.18 * settle;
        return true;
      },
    };
  },
  planOf: (act) => (act.trick instanceof NillTrick ? act.trick.plan : undefined),
};
