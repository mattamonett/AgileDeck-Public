import type { LandingKind } from './landing-geometry';

export function landingCardAnimation(
  kind: LandingKind,
  facing = 1,
): { frames: Keyframe[]; options: KeyframeAnimationOptions } | null {
  if (kind === '💰' || kind === '🕶️') {
    const force = kind === '💰' ? 1 : 0.7;
    return {
      frames: [
        { translate: '0 0', rotate: '0deg' },
        {
          translate: `${facing * 7 * force}px ${3 * force}px`,
          rotate: `${facing * 5 * force}deg`,
          offset: 0.2,
        },
        {
          translate: `${-facing * 3 * force}px ${-2 * force}px`,
          rotate: `${-facing * 2 * force}deg`,
          offset: 0.5,
        },
        { translate: '0 0', rotate: '0deg' },
      ],
      options: { duration: 380, easing: 'ease-out' },
    };
  }
  if (kind === '🛸')
    return {
      frames: [
        { translate: '0 0' },
        { translate: '0 -16px', offset: 0.35 },
        { translate: '0 -16px', offset: 0.68 },
        { translate: '0 3px', offset: 0.86 },
        { translate: '0 0' },
      ],
      options: { duration: 1250, easing: 'ease-in-out' },
    };
  if (kind === '🎈')
    return {
      frames: [
        { translate: '0 0', rotate: '0deg' },
        { translate: '0 -7px', rotate: '-2deg', offset: 0.45 },
        { translate: '0 -5px', rotate: '1deg', offset: 0.7 },
        { translate: '0 0', rotate: '0deg' },
      ],
      options: { duration: 1200, easing: 'ease-in-out' },
    };
  if (kind === '💣')
    return {
      frames: [
        { translate: '0 0' },
        { translate: '7px 2px', offset: 0.2 },
        { translate: '-5px -1px', offset: 0.5 },
        { translate: '0 0' },
      ],
      options: { delay: 550, duration: 350, easing: 'ease-out' },
    };
  return null;
}
