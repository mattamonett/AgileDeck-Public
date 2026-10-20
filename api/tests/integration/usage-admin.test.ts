import type { PrismaClient } from '@prisma/client';
import { AdminUsageResponseSchema, AdminUsageSummarySchema } from '@poker/shared';
import { startAdminTestServer, type AdminTestServer } from '../helpers/admin-server';
import { MigratedDatabase } from '../helpers/migrated-database';

// A separate server keeps these requests out of the main admin suite's rate budget.
describe('admin usage summary', () => {
  const database = new MigratedDatabase('poker-usage-');
  let db: PrismaClient;
  let admin: AdminTestServer;
  let base: string;
  const request = (url: string) => admin.request(url);
  beforeAll(async () => {
    database.setUp();
    db = (await import('../../src/platform/db/prisma')).default;
    admin = await startAdminTestServer();
    base = admin.base;
  }, 30_000);
  afterAll(async () => {
    await admin?.close();
    delete process.env.ADMIN_PASSWORD;
    if (db) await db.$disconnect();
    database.tearDown();
  });

  it('summarizes setting adoption and recent feature use without room or visitor identities', async () => {
    const recent = new Date();
    const stale = new Date(recent.getTime() - 60 * 86_400_000);
    await db.room.createMany({
      data: [
        {
          id: 'usage-active',
          autoReveal: true,
          theme: 'vegas',
          mood: 'spicy',
          updatedAt: recent,
        },
        {
          id: 'usage-stale',
          autoReveal: true,
          useMultiplier: true,
          issuesEnabled: false,
          mood: 'unknown',
          updatedAt: stale,
        },
      ],
    });
    const { persistUsageBatch, usageCutoff, usageDay } =
      await import('../../src/modules/telemetry/usage-stats.repository');
    const today = usageDay();
    const older = usageCutoff(20);
    await persistUsageBatch([
      { day: today, metric: 'round.revealed.auto', count: 3 },
      { day: older, metric: 'round.revealed.auto', count: 4 },
      { day: older, metric: 'round.revealed.manual', count: 2 },
      { day: today, metric: 'throwable:📄', count: 5 },
    ]);
    await persistUsageBatch([{ day: today, metric: 'round.revealed.auto', count: 1 }]);
    await db.usageDaily.create({
      data: { day: usageCutoff(60), metric: 'round.revealed.auto', count: 50 },
    });

    const response = await request('/usage');
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain('usage-active');
    const summary = AdminUsageSummarySchema.parse(JSON.parse(body));
    expect(summary.rooms).toEqual({ active: 1, total: 2 });
    expect(summary.trackingSince).toBe(usageCutoff(60));
    expect(summary.settings).toEqual([
      { setting: 'autoReveal', active: 1, total: 2 },
      { setting: 'multiplier', active: 0, total: 1 },
      { setting: 'lobby', active: 1, total: 2 },
      { setting: 'issues', active: 1, total: 1 },
    ]);
    expect(summary.themes).toEqual(
      expect.arrayContaining([
        { theme: 'vegas', active: 1, total: 1 },
        { theme: 'default', active: 0, total: 1 },
      ]),
    );
    expect(summary.moods).toEqual([
      { mood: 'friendly', active: 0, total: 0 },
      { mood: 'playful', active: 0, total: 1 },
      { mood: 'spicy', active: 1, total: 1 },
    ]);
    const event = (metric: string) => summary.events.find((row) => row.metric === metric);
    expect(event('round.revealed.auto')).toEqual({
      metric: 'round.revealed.auto',
      last7Days: 4,
      last30Days: 8,
    });
    expect(event('round.revealed.manual')).toMatchObject({
      last7Days: 0,
      last30Days: 2,
    });
    expect(event('nudge.single')).toMatchObject({ last30Days: 0 });
    expect(summary.throwables).toEqual([{ character: '📄', last30Days: 5 }]);
    expect((await fetch(base + '/api/admin/usage')).status).toBe(401);
  });

  it('says usage stats are off instead of summarizing when the operator turned them off', async () => {
    const { setSiteConfig } = await import('../../src/config/site-config');
    setSiteConfig({ features: { usageStats: false } });
    try {
      const response = await request('/usage');
      expect(response.status).toBe(200);
      expect(AdminUsageResponseSchema.parse(await response.json())).toEqual({
        usageStats: 'off',
      });
    } finally {
      setSiteConfig();
    }
  });
});
