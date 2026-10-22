import type { Prisma } from '@prisma/client';
import {
  AdminRoomSettingSchema,
  RoomMoodSchema,
  UsageMetricSchema,
  USAGE_ACTIVE_ROOM_DAYS,
  USAGE_TOP_THROWABLES,
  throwableFromUsageKey,
  type AdminRoomSetting,
  type AdminUsageSummary,
  type RoomMood,
  type UsageKey,
} from '@poker/shared';
import { DAY_MS } from '../../platform/time';
import prisma from '../../platform/db/prisma';
import { getSiteConfig } from '../../config/site-config';
import { parseRoomMood } from '../rooms/room-appearance';

export interface UsageBatchEntry {
  day: string;
  metric: UsageKey;
  count: number;
}

export function usageDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** The first UTC day included in a window of `days` days ending today. */
export function usageCutoff(days: number, now = new Date()): string {
  return usageDay(new Date(now.getTime() - (days - 1) * DAY_MS));
}

export async function persistUsageBatch(entries: readonly UsageBatchEntry[]): Promise<void> {
  if (!entries.length) return;
  await prisma.$transaction(async (tx) => {
    for (const entry of entries)
      await tx.$executeRaw`
        INSERT INTO "UsageDaily" ("day", "metric", "count")
        VALUES (${entry.day}, ${entry.metric}, ${entry.count})
        ON CONFLICT ("day", "metric") DO UPDATE SET
          "count" = MIN(2147483647, "count" + excluded."count")
      `;
  });
}

export async function deleteExpiredUsage(now = new Date()): Promise<void> {
  await prisma.usageDaily.deleteMany({
    where: {
      day: { lt: usageCutoff(getSiteConfig().limits.usageRetentionDays, now) },
    },
  });
}

const settingFilters: Record<AdminRoomSetting, Prisma.RoomWhereInput> = {
  autoReveal: { autoReveal: true },
  multiplier: { useMultiplier: true },
  lobby: { lobbyEnabled: true },
  issues: { issuesEnabled: true },
};

async function countRooms(where: Prisma.RoomWhereInput, since: Date) {
  const [active, total] = await Promise.all([
    prisma.room.count({ where: { ...where, updatedAt: { gte: since } } }),
    prisma.room.count({ where }),
  ]);
  return { active, total };
}

async function groupRooms(field: 'theme' | 'mood', since: Date) {
  const [active, total] = await Promise.all([
    prisma.room.groupBy({
      by: [field],
      where: { updatedAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.room.groupBy({ by: [field], _count: { _all: true } }),
  ]);
  const counts = new Map<string, { active: number; total: number }>();
  for (const row of total) counts.set(row[field], { active: 0, total: row._count._all });
  for (const row of active) {
    const entry = counts.get(row[field]);
    if (entry) entry.active = row._count._all;
  }
  return counts;
}

function moodAdoption(counts: Map<string, { active: number; total: number }>) {
  const moods = new Map<RoomMood, { active: number; total: number }>(
    RoomMoodSchema.options.map((mood) => [mood, { active: 0, total: 0 }]),
  );
  for (const [value, count] of counts) {
    const entry = moods.get(parseRoomMood(value));
    if (!entry) continue;
    entry.active += count.active;
    entry.total += count.total;
  }
  return [...moods].map(([mood, count]) => ({ mood, ...count }));
}

async function sumUsage(since: string) {
  const rows = await prisma.usageDaily.groupBy({
    by: ['metric'],
    where: { day: { gte: since } },
    _sum: { count: true },
  });
  return new Map(rows.map((row) => [row.metric, row._sum.count ?? 0]));
}

export async function readUsageSummary(now = new Date()): Promise<AdminUsageSummary> {
  const since = new Date(now.getTime() - USAGE_ACTIVE_ROOM_DAYS * DAY_MS);
  const [rooms, adoption, themes, moods, week, month, first] = await Promise.all([
    countRooms({}, since),
    Promise.all(
      AdminRoomSettingSchema.options.map(async (setting) => ({
        setting,
        ...(await countRooms(settingFilters[setting], since)),
      })),
    ),
    groupRooms('theme', since),
    groupRooms('mood', since),
    sumUsage(usageCutoff(7, now)),
    sumUsage(usageCutoff(30, now)),
    prisma.usageDaily.findFirst({
      orderBy: { day: 'asc' },
      select: { day: true },
    }),
  ]);
  const throwables = [...month]
    .flatMap(([metric, last30Days]) => {
      const character = throwableFromUsageKey(metric);
      return character ? [{ character, last30Days }] : [];
    })
    .sort((a, b) => b.last30Days - a.last30Days)
    .slice(0, USAGE_TOP_THROWABLES);
  return {
    activeDays: USAGE_ACTIVE_ROOM_DAYS,
    trackingSince: first?.day ?? null,
    rooms,
    settings: adoption,
    themes: [...themes]
      .map(([theme, count]) => ({ theme, ...count }))
      .sort((a, b) => b.total - a.total),
    moods: moodAdoption(moods),
    events: UsageMetricSchema.options.map((metric) => ({
      metric,
      last7Days: week.get(metric) ?? 0,
      last30Days: month.get(metric) ?? 0,
    })),
    throwables,
  };
}
