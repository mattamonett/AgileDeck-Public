import type { CharacterDefinition } from '../../character';
import { architectLandingPoint, architectApproach, architectEase } from './architect-choreography';
import { makeArchitect, ArchitectTrick, architectWalk } from './architect-trick';
import { hopPoint } from '../../flight/flight-math';

export const architectCharacter: CharacterDefinition<ArchitectTrick['plan']> = {
  emoji: '📐',
  makeModel: () => makeArchitect(),
  pinsSide: true,
  motion: (start, end, _profile, t) => hopPoint(start, end, t, 8),
  createAct(stage, id) {
    const trick = new ArchitectTrick(id);
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
        architectLandingPoint(plan, at.b, at.view, at.start, at.landed ? at.facing : undefined),
      approachDuration(distance) {
        return (1600 + Math.min(600, distance * 0.6)) * plan.pace;
      },
      approach({ t, start, end, b, view }) {
        const object = stage.projectile;
        const point = architectApproach(plan, start, end, view, t, b);
        const previous = architectApproach(plan, start, end, view, Math.max(0, t - 0.005), b);
        const facing = Math.sign(b.left + b.width / 2 - end.x) || 1;
        const walkFacing = Math.sign(point.x - previous.x) || Math.sign(end.x - start.x) || facing;
        const stride = Math.min(1, Math.hypot(point.x - previous.x, point.y - previous.y));
        object.position.set(point.x, -point.y, 165);
        architectWalk(
          object,
          Math.hypot(point.x - start.x, point.y - start.y),
          walkFacing,
          stride,
          plan.step,
        );
        const settle = architectEase((t - 0.88) / 0.12);
        object.rotation.y = walkFacing * 0.16 * (1 - settle);
        return true;
      },
    };
  },
  planOf: (act) => (act.trick instanceof ArchitectTrick ? act.trick.plan : undefined),
};
