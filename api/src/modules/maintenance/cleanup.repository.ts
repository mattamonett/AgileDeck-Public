import prisma from '../../platform/db/prisma';

export async function findRoomIdsUntouchedSince(oldDate: Date): Promise<string[]> {
  const stale = await prisma.room.findMany({
    where: { updatedAt: { lt: oldDate } },
    select: { id: true },
  });
  return stale.map(({ id }) => id);
}

/** Deletes the room only if it is still untouched; returns how many were removed. */
export async function deleteRoomIfUntouchedSince(id: string, oldDate: Date): Promise<number> {
  const result = await prisma.room.deleteMany({
    where: { id, updatedAt: { lt: oldDate } },
  });
  return result.count;
}

export async function deleteRateLimitDaysBefore(cutoff: string): Promise<void> {
  await prisma.rateLimitDaily.deleteMany({ where: { day: { lt: cutoff } } });
}

export async function deleteExpiredAbuseQuotas(now: Date): Promise<void> {
  await prisma.abuseQuota.deleteMany({ where: { expiresAt: { lt: now } } });
}

/** Agreements no longer linked to a room approval, member or feedback. */
export async function deleteUnlinkedAgreements(oldDate: Date): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM "VisitorAgreement"
    WHERE "acceptedAt" < ${oldDate}
      AND NOT EXISTS (SELECT 1 FROM "RoomApproval" a WHERE a."visitorId" = "VisitorAgreement"."visitorId")
      AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."visitorId" = "VisitorAgreement"."visitorId")
      AND NOT EXISTS (SELECT 1 FROM "Feedback" f WHERE f."visitorId" = "VisitorAgreement"."visitorId")
  `;
}

/** Feedback access no longer linked to a room approval, member or feedback. */
export async function deleteUnlinkedFeedbackAccess(oldDate: Date): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM "FeedbackAccess"
    WHERE "approvedAt" < ${oldDate}
      AND NOT EXISTS (SELECT 1 FROM "RoomApproval" a WHERE a."visitorId" = "FeedbackAccess"."visitorId")
      AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."visitorId" = "FeedbackAccess"."visitorId")
      AND NOT EXISTS (SELECT 1 FROM "Feedback" f WHERE f."visitorId" = "FeedbackAccess"."visitorId")
  `;
}
