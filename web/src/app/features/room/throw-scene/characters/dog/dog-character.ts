import type { CharacterDefinition } from '../../character';
import { dogApproach, dogLandingPoint } from './dog-choreography';
import { dogRun } from './dog-model';
import { DogTrick } from './dog-trick';
import { hopPoint } from '../../flight/flight-math';
import { makePet } from '../pet/pet-trick';

export const dogCharacter: CharacterDefinition<DogTrick['plan']> = {
  emoji: '🐶',
  makeModel: () => makePet(true),
  motion: (start, end, _profile, t) => hopPoint(start, end, t, 8),
  createAct(stage, id) {
    const trick = new DogTrick(id);
    const plan = trick.plan;
    return {
      trick,
      object: trick.object,
      get duration() {
        return trick.duration;
      },
      cardAnimation: (facing) => trick.cardAnimation(facing),
      land: (ms, b, end, viewport) => trick.update(ms, stage.projectile, b, end, viewport),
      landingPoint: (at) => dogLandingPoint(plan, at.b, at.view),
      approachDuration(distance) {
        return (1250 + Math.min(650, distance * 0.6)) * plan.pace;
      },
      approach({ t, elapsed, start, end, b, view, profile }) {
        const object = stage.projectile;
        const contactFacing = Math.sign(b.left + b.width / 2 - end.x) || 1;
        const point = dogApproach(plan, start, end, view, t);
        const previous = dogApproach(plan, start, end, view, Math.max(0, t - 0.005));
        const facing = t > 0.94 ? contactFacing : Math.sign(point.x - previous.x) || contactFacing;
        const distance = Math.hypot(point.x - start.x, point.y - start.y);
        const stride = Math.min(
          1,
          (Math.hypot(point.x - previous.x, point.y - previous.y) / (profile.duration * 0.005)) * 7,
        );
        dogRun(object, distance, facing, elapsed * plan.wag, stride);
        object.position.set(point.x, -point.y, 140);
        return true;
      },
    };
  },
  planOf: (act) => (act.trick instanceof DogTrick ? act.trick.plan : undefined),
};
