import { z } from 'zod';
import { RoomMoodSchema } from '../room/mood';
import { Theme } from '../themes';
import { VALID_INTERACTION_CHARACTERS } from '../throwables/catalog';

/** Rooms touched within this many days count as active in the admin usage summary. */
export const USAGE_ACTIVE_ROOM_DAYS = 30;
export const USAGE_TOP_THROWABLES = 10;

/**
 * App-wide event counters. They carry no room, member, or visitor identity,
 * so the set of possible rows per day is fixed and small.
 */
export const UsageMetricSchema = z.enum([
  'room.created',
  'round.revealed.manual',
  'round.revealed.auto',
  'round.reset',
  'setting.autoReveal.on',
  'setting.autoReveal.off',
  'setting.multiplier.on',
  'setting.multiplier.off',
  'setting.issues.on',
  'setting.issues.off',
  'setting.theme.default',
  'setting.theme.space',
  'setting.theme.retro',
  'setting.theme.vegas',
  'setting.theme.graveyard',
  'setting.theme.harvest',
  'setting.theme.cabin',
  'setting.mood.friendly',
  'setting.mood.playful',
  'setting.mood.spicy',
  'setting.roomName',
  'observer.on',
  'observer.off',
  'nudge.single',
  'nudge.stragglers',
  'throw.single',
  'throw.barrage',
  'issue.created',
  'issue.updated',
  'issue.deleted',
  'issue.imported',
  'issue.nextStarted',
  'issue.closedCleared',
]);
export type UsageMetric = z.infer<typeof UsageMetricSchema>;

const THROWABLE_PREFIX = 'throwable:';
export type ThrowableUsageKey = `${typeof THROWABLE_PREFIX}${string}`;
export type UsageKey = UsageMetric | ThrowableUsageKey;

export function throwableUsageKey(character: string): ThrowableUsageKey | null {
  return VALID_INTERACTION_CHARACTERS.has(character) ? `${THROWABLE_PREFIX}${character}` : null;
}

/** The throwable a stored key counts, or null for event metrics and unknown keys. */
export function throwableFromUsageKey(key: string): string | null {
  if (!key.startsWith(THROWABLE_PREFIX)) return null;
  const character = key.slice(THROWABLE_PREFIX.length);
  return VALID_INTERACTION_CHARACTERS.has(character) ? character : null;
}

export function themeUsageMetric(theme: Theme): UsageMetric {
  switch (theme) {
    case Theme.GARDEN:
      return 'setting.theme.default';
    case Theme.SPACE:
      return 'setting.theme.space';
    case Theme.RETRO:
      return 'setting.theme.retro';
    case Theme.VEGAS:
      return 'setting.theme.vegas';
    case Theme.GRAVEYARD:
      return 'setting.theme.graveyard';
    case Theme.HARVEST:
      return 'setting.theme.harvest';
    case Theme.CABIN:
      return 'setting.theme.cabin';
  }
}

export const AdminRoomSettingSchema = z.enum(['autoReveal', 'multiplier', 'lobby', 'issues']);
export type AdminRoomSetting = z.infer<typeof AdminRoomSettingSchema>;

const count = z.number().int().nonnegative();
const adoption = { active: count, total: count };

export const AdminUsageSummarySchema = z.strictObject({
  activeDays: z.number().int().positive(),
  trackingSince: z.iso.date().nullable(),
  rooms: z.strictObject(adoption),
  settings: z.array(z.strictObject({ setting: AdminRoomSettingSchema, ...adoption })),
  themes: z.array(z.strictObject({ theme: z.string(), ...adoption })),
  moods: z.array(z.strictObject({ mood: RoomMoodSchema, ...adoption })),
  events: z.array(
    z.strictObject({
      metric: UsageMetricSchema,
      last7Days: count,
      last30Days: count,
    }),
  ),
  throwables: z
    .array(z.strictObject({ character: z.string(), last30Days: count }))
    .max(USAGE_TOP_THROWABLES),
});
export type AdminUsageSummary = z.infer<typeof AdminUsageSummarySchema>;

/** What the admin usage endpoint sends while features.usageStats is false. */
export const AdminUsageOffSchema = z.strictObject({
  usageStats: z.literal('off'),
});
export const AdminUsageResponseSchema = z.union([AdminUsageSummarySchema, AdminUsageOffSchema]);
export type AdminUsageResponse = z.infer<typeof AdminUsageResponseSchema>;
