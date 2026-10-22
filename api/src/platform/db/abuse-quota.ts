import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { DAY_MS } from '../time';
import prisma from './prisma';

/** Each daily counter outlives the UTC day it counts. */
const QUOTA_RETENTION_MS = 2 * DAY_MS;

export class AbuseLimitError extends Error {
  constructor(message = 'Daily abuse-prevention limit reached. Please try again tomorrow.') {
    super(message);
  }
}

export interface DailyQuota {
  scope: string;
  identity: string;
  limit: number;
}

export async function consumeDailyQuotas(
  db: Prisma.TransactionClient,
  quotas: readonly DailyQuota[],
): Promise<void> {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const expiresAt = new Date(now.getTime() + QUOTA_RETENTION_MS);
  for (const quota of quotas) {
    const key = quota.scope + ':' + createHash('sha256').update(quota.identity).digest('hex');
    const rows = await db.$queryRaw<{ count: number }[]>`
      INSERT INTO "AbuseQuota" ("key", "day", "count", "expiresAt")
      VALUES (${key}, ${day}, 1, ${expiresAt})
      ON CONFLICT ("key", "day") DO UPDATE SET "count" = "count" + 1
      WHERE "count" < ${quota.limit}
      RETURNING "count"
    `;
    if (rows.length === 0) throw new AbuseLimitError();
  }
}

export function claimDailyQuotas(quotas: readonly DailyQuota[]): Promise<void> {
  return prisma.$transaction((db) => consumeDailyQuotas(db, quotas));
}
