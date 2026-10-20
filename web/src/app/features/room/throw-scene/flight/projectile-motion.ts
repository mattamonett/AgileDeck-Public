import type { ALL_EMOJIS_WITH_TAGS } from '@poker/shared';
import { characterFor } from '../characters';
import { flightPoint, type FlightProfile, type Point } from './flight-math';
import { rocketPoint } from '../characters/rocket/rocket-flight';

type ProjectileEmoji = (typeof ALL_EMOJIS_WITH_TAGS)[number]['char'];
type Motion =
  'tumble' | 'float' | 'rocket' | 'hover' | 'flutter' | 'spin' | 'lob' | 'pulse' | 'zigzag';
export type Trail = 'none' | 'smoke' | 'rainbow' | 'gold' | 'fire' | 'electric';
// Duration multiplier, arc multiplier, rotation strength, trail, and motion character.
type Style = readonly [number, number, number, Trail, Motion];
// Most objects use a simple toss. Reserve trails for propulsion, fire, and magic.
export const PROJECTILE_STYLES = {
  '🎅': [1.8, 0, 0, 'none', 'lob'],
  '🦌': [1.4, 0, 0, 'none', 'lob'],
  '🧝': [1.5, 0, 0, 'none', 'lob'],
  '⛄': [2, 0, 0, 'none', 'lob'],
  '🍪': [1.7, 0, 0, 'none', 'lob'],
  '🦃': [1.3, 0, 0, 'none', 'lob'],
  '🥷': [1.8, 0, 0, 'none', 'lob'],
  '🫗': [1.8, 0, 0, 'none', 'lob'],
  '🌽': [1.8, 0, 0, 'none', 'lob'],
  '🐻': [2, 0, 0, 'none', 'lob'],
  '🐿️': [1.2, 0, 0, 'none', 'lob'],
  '🤕': [1.8, 0, 0, 'none', 'lob'],
  '🧛': [1.3, 0.5, 0, 'none', 'flutter'],
  '🧙': [1.5, 0.5, 0, 'none', 'hover'],
  '🪆': [1.8, 0, 0, 'none', 'lob'],
  '🕷️': [1.4, 0.3, 0, 'none', 'lob'],
  '🎃': [1.3, 0.5, 0, 'none', 'lob'],
  '🍅': [0.95, 0.85, 0.6, 'none', 'tumble'],
  '💐': [1.1, 1, 0.25, 'none', 'lob'],
  '🍺': [1.1, 0.8, 0.3, 'none', 'lob'],
  '🥧': [0.95, 0.65, 0.5, 'none', 'spin'],
  '💩': [1.05, 0.75, 0.5, 'none', 'tumble'],
  '📄': [1.2, 0.9, 0.5, 'none', 'tumble'],
  '🚀': [1, 0.32, 0, 'smoke', 'rocket'],
  '💊': [0.95, 0.8, 0.6, 'none', 'spin'],
  '⭐': [0.95, 0.8, 0.6, 'none', 'spin'],
  '🔥': [0.9, 0.65, 0.05, 'fire', 'pulse'],
  '💎': [1, 0.95, 0.4, 'none', 'spin'],
  '🌈': [1.15, 1, 0.05, 'none', 'lob'],
  '🎈': [1.8, 0.85, 0.08, 'none', 'float'],
  '🍕': [0.95, 0.65, 0.8, 'none', 'spin'],
  '🍦': [1.05, 0.9, 0.2, 'none', 'lob'],
  '🍩': [1, 0.9, 0.7, 'none', 'spin'],
  '🥑': [1.05, 1, 0.5, 'none', 'tumble'],
  '🐱': [1, 1, 0.15, 'none', 'lob'],
  '🐶': [1, 1, 0.2, 'none', 'lob'],
  '🦄': [1.1, 1, 0.1, 'rainbow', 'lob'],
  '🦖': [1.1, 0.8, 0.2, 'none', 'lob'],
  '⚽': [0.85, 1.1, 1.1, 'none', 'spin'],
  '🎮': [1.05, 0.85, 0.4, 'none', 'tumble'],
  '💡': [1.05, 0.9, 0.15, 'none', 'lob'],
  '🔔': [1.05, 0.85, 0.2, 'none', 'lob'],
  '❤️': [1.15, 0.9, 0, 'none', 'pulse'],
  '⚡': [0.6, 0.15, 0, 'electric', 'zigzag'],
  '🍀': [1.2, 0.9, 0.2, 'none', 'flutter'],
  '✨': [1.1, 0.85, 0, 'gold', 'pulse'],
  '🎁': [1.1, 1, 0.4, 'none', 'tumble'],
  '🎂': [1.15, 0.75, 0.15, 'none', 'lob'],
  '💣': [1.1, 1.1, 0.6, 'none', 'tumble'],
  '🧤': [0.85, 0.65, 0.4, 'none', 'tumble'],
  '🎩': [1.1, 0.85, 0.5, 'none', 'spin'],
  '🌮': [1, 0.85, 0.35, 'none', 'lob'],
  '🕶️': [1, 0.8, 0.6, 'none', 'spin'],
  '🐒': [1, 0, 0, 'none', 'lob'],
  '🦈': [1, 0, 0, 'none', 'lob'],
  '🏎️': [1, 0, 0, 'none', 'lob'],
  '📐': [1.7, 0, 0, 'none', 'lob'],
  '👶': [2, 0, 0, 'none', 'lob'],
  '☮️': [1.8, 0, 0, 'none', 'lob'],
  '👻': [1.8, 0, 0, 'none', 'lob'],
  '🎺': [1.8, 0, 0, 'none', 'lob'],
  '🥋': [1.8, 0, 0, 'none', 'lob'],
  '🗑️': [1.2, 0, 0, 'none', 'lob'],
  '🤼': [1.6, 0, 0, 'none', 'lob'],
  '🐐': [1.8, 0, 0, 'none', 'lob'],
  '🪚': [1.8, 0, 0, 'none', 'lob'],
  '☠️': [1.8, 0, 0, 'none', 'lob'],
  '🧟': [2, 0, 0, 'none', 'lob'],
  '🕊️': [1.8, 0, 0, 'none', 'lob'],
  '👽': [1.8, 0, 0, 'none', 'lob'],
  '🛸': [1.1, 0.3, 0.06, 'none', 'hover'],
  '🎰': [1.2, 0.6, 0.2, 'none', 'tumble'],
  '🍒': [1, 0.95, 0.3, 'none', 'lob'],
  '💰': [1.15, 0.8, 0.4, 'none', 'tumble'],
  '🎲': [1, 1, 1.2, 'none', 'tumble'],
} satisfies Record<ProjectileEmoji, Style>;

const styles = new Map<string, Style>(Object.entries(PROJECTILE_STYLES));

export function projectileStyle(emoji: string): Style {
  return styles.get(emoji) ?? [1, 1, 1, 'none', 'tumble'];
}

export function styleProfile(
  profile: FlightProfile,
  emoji: string,
  availableRise = profile.height,
): FlightProfile {
  const own = characterFor(emoji)?.styleProfile;
  if (own) return own(profile);
  const [speed, arc] = projectileStyle(emoji);
  return {
    ...profile,
    duration: Math.min(2100, profile.duration * speed),
    height: Math.min(Math.max(0, availableRise), profile.height * arc),
  };
}

export function motionPoint(
  start: Point,
  end: Point,
  profile: FlightProfile,
  emoji: string,
  progress: number,
): Point {
  const t = Math.max(0, Math.min(1, progress));
  if (t === 0) return { ...start };
  if (t === 1) return { ...end };
  const own = characterFor(emoji)?.motion?.(start, end, profile, t);
  if (own) return own;
  const mode = projectileStyle(emoji)[4];
  if (mode === 'rocket' && profile.rocket) return rocketPoint(start, end, profile.rocket, t);
  const travel = mode === 'rocket' ? t * t : mode === 'float' ? t * t * (3 - 2 * t) : t;
  const point = flightPoint(start, end, profile, travel);
  const envelope = Math.sin(Math.PI * t);
  const wave = Math.sin(t * Math.PI * (mode === 'zigzag' ? 12 : 6)) * envelope;
  if (mode === 'float' || mode === 'flutter') point.x += wave * (mode === 'flutter' ? 7 : 5);
  // Keep extra vertical movement inside the existing arc's headroom.
  if (mode === 'hover' || mode === 'zigzag')
    point.y += wave * Math.min(mode === 'hover' ? 5 : 12, profile.height * 0.4);
  return point;
}

export function motionPose(
  start: Point,
  end: Point,
  profile: FlightProfile,
  emoji: string,
  t: number,
) {
  const [, , spin, , mode] = projectileStyle(emoji);
  const sway = Math.sin(t * Math.PI * (mode === 'lob' ? 1 : 4)) * spin;
  const before = motionPoint(start, end, profile, emoji, Math.max(0, t - 0.002));
  const after = motionPoint(start, end, profile, emoji, Math.min(1, t + 0.002));
  const heading = Math.atan2(-(after.y - before.y), after.x - before.x);
  const rolling = mode === 'tumble' || mode === 'spin';
  return {
    x: mode === 'tumble' ? t * profile.spin * spin : emoji === '🥧' ? 0.65 : 0,
    y: mode === 'tumble' ? t * 3.5 * spin : 0,
    z: mode === 'rocket' ? heading - Math.PI / 2 : rolling ? t * profile.spin * spin * 1.5 : sway,
    scale:
      (0.8 + Math.sin(Math.PI * t) * 0.3) *
      (mode === 'pulse' ? 1 + Math.sin(t * Math.PI * 4) * 0.06 : 1),
    heading,
  };
}
