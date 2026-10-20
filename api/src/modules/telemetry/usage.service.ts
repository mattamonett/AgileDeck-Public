import type { Room } from '@prisma/client';
import { Theme, themeUsageMetric } from '@poker/shared';
import { z } from 'zod';
import { recordUsage } from './usage-telemetry';
import { parseRoomMood } from '../rooms/room-appearance';

export { readUsageSummary } from './usage-stats.repository';

const ThemeSchema = z.enum(Theme);

/** Counts only real changes, so a client re-sending the current value adds nothing. */
export function recordRoomSettingChanges(before: Room, after: Room): void {
  if (before.autoReveal !== after.autoReveal)
    recordUsage(after.autoReveal ? 'setting.autoReveal.on' : 'setting.autoReveal.off');
  if (before.useMultiplier !== after.useMultiplier)
    recordUsage(after.useMultiplier ? 'setting.multiplier.on' : 'setting.multiplier.off');
  if (before.issuesEnabled !== after.issuesEnabled)
    recordUsage(after.issuesEnabled ? 'setting.issues.on' : 'setting.issues.off');
  if (before.theme !== after.theme) {
    const theme = ThemeSchema.safeParse(after.theme);
    if (theme.success) recordUsage(themeUsageMetric(theme.data));
  }
  if (before.mood !== after.mood) recordUsage(`setting.mood.${parseRoomMood(after.mood)}`);
  if (before.name !== after.name) recordUsage('setting.roomName');
}
