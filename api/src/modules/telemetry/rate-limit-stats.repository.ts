import prisma from '../../platform/db/prisma';

/** Rate-limit days kept, today included. */
const RETAINED_DAYS = 30;
/** New visitor-days stop being recorded once the table holds this many rows. */
const MAX_STORED_ROWS = 100_000;
const MAX_BATCH_SIZE = 100;

export interface RateLimitBatchEntry {
  visitorId: string;
  day: string;
  count: number;
  lastHitAt: Date;
}

export function rateLimitCutoff(now = new Date()): string {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  day.setUTCDate(day.getUTCDate() - (RETAINED_DAYS - 1));
  return day.toISOString().slice(0, 10);
}

export async function persistRateLimitBatch(
  entries: readonly RateLimitBatchEntry[],
): Promise<void> {
  if (!entries.length) return;
  await prisma.$transaction(async (tx) => {
    await tx.rateLimitDaily.deleteMany({
      where: { day: { lt: rateLimitCutoff() } },
    });
    let remaining = Math.max(0, MAX_STORED_ROWS - (await tx.rateLimitDaily.count()));
    for (const entry of entries.slice(0, MAX_BATCH_SIZE)) {
      // Only known room identities are retained; random valid cookies cannot grow this table.
      await tx.$executeRaw`
        INSERT INTO "RateLimitDaily" ("visitorId", "day", "count", "lastHitAt")
        SELECT ${entry.visitorId}, ${entry.day}, ${entry.count}, ${entry.lastHitAt}
        WHERE (EXISTS (SELECT 1 FROM "RoomApproval" WHERE "visitorId" = ${entry.visitorId})
          OR EXISTS (SELECT 1 FROM "User" WHERE "visitorId" = ${entry.visitorId}))
          AND (${remaining} > 0 OR EXISTS (SELECT 1 FROM "RateLimitDaily" WHERE "visitorId" = ${entry.visitorId} AND "day" = ${entry.day}))
        ON CONFLICT ("visitorId", "day") DO UPDATE SET
          "count" = MIN(2147483647, "count" + excluded."count"),
          "lastHitAt" = MAX("lastHitAt", excluded."lastHitAt")
      `;
      remaining = Math.max(0, remaining - 1);
    }
  });
}
