import {
  AdminUsageResponseSchema,
  AdminUsageSummarySchema,
  UsageMetricSchema,
  themeUsageMetric,
  throwableFromUsageKey,
  throwableUsageKey,
} from '../../src/admin/usage';
import { THEMES } from '../../src/themes';

describe('usage metrics', () => {
  it('maps every theme to its own metric', () => {
    const metrics = THEMES.map((theme) => themeUsageMetric(theme.id));
    expect(new Set(metrics).size).toBe(THEMES.length);
    for (const metric of metrics) expect(UsageMetricSchema.safeParse(metric).success).toBe(true);
  });

  it('only builds and reads keys for offered throwables', () => {
    expect(throwableUsageKey('📄')).toBe('throwable:📄');
    expect(throwableUsageKey('<script>')).toBeNull();
    expect(throwableFromUsageKey('throwable:📄')).toBe('📄');
    expect(throwableFromUsageKey('throwable:<script>')).toBeNull();
    expect(throwableFromUsageKey('round.reset')).toBeNull();
  });

  it('rejects summaries with unknown metrics or identities', () => {
    const summary = {
      activeDays: 30,
      trackingSince: null,
      rooms: { active: 0, total: 0 },
      settings: [],
      themes: [],
      moods: [],
      events: [{ metric: 'round.reset', last7Days: 1, last30Days: 2 }],
      throwables: [],
    };
    expect(AdminUsageSummarySchema.safeParse(summary).success).toBe(true);
    expect(
      AdminUsageSummarySchema.safeParse({
        ...summary,
        events: [{ metric: 'room.visited', last7Days: 1, last30Days: 2 }],
      }).success,
    ).toBe(false);
    expect(AdminUsageSummarySchema.safeParse({ ...summary, roomIds: ['a'] }).success).toBe(false);
  });

  it('tells the admin page when usage stats are turned off', () => {
    expect(AdminUsageResponseSchema.safeParse({ usageStats: 'off' }).success).toBe(true);
    expect(AdminUsageResponseSchema.safeParse({ usageStats: 'on' }).success).toBe(false);
  });
});
