import { createHash, randomUUID } from 'node:crypto';
import prisma from '../../platform/db/prisma';
import { AdminError } from './admin-errors';

export async function deleteRoomRecords(
  id: string,
  name: string | null,
  approvedMemberCount: number,
) {
  return prisma.$transaction(async (tx) => {
    const room = await tx.room.findUnique({
      where: { id },
      select: {
        name: true,
        _count: { select: { approvals: true } },
        users: { select: { id: true } },
      },
    });
    if (!room) throw new AdminError(404, 'Room not found.');
    if (room.name !== name || room._count.approvals !== approvedMemberCount)
      throw new AdminError(409, 'The room changed. Cancel and refresh before deleting.');
    await tx.room.delete({ where: { id } });
    return room.users.map((user) => user.id);
  });
}

export async function memberRoomIds(visitorId: string): Promise<string[]> {
  const [users, approvals, preferences] = await Promise.all([
    prisma.user.findMany({ where: { visitorId }, select: { roomId: true } }),
    prisma.roomApproval.findMany({
      where: { visitorId },
      select: { roomId: true },
    }),
    prisma.observerPreference.findMany({
      where: { visitorId },
      select: { roomId: true },
    }),
  ]);
  return [...new Set([...users, ...approvals, ...preferences].map((entry) => entry.roomId))].sort();
}

export async function deleteMemberRecords(
  roomId: string,
  visitorId: string,
  expectedName: string | null,
) {
  return prisma.$transaction(async (tx) => {
    const where = { roomId_visitorId: { roomId, visitorId } };
    const [user, approval] = await Promise.all([
      tx.user.findUnique({ where }),
      tx.roomApproval.findUnique({ where }),
    ]);
    if (!user && !approval) throw new AdminError(404, 'Member not found.');
    const name = user?.name ?? approval?.lastKnownName ?? null;
    if (name !== expectedName)
      throw new AdminError(409, 'The member changed. Cancel and refresh before deleting.');
    const users = await tx.user.findMany({
      where: { visitorId },
      select: { id: true, roomId: true },
    });
    const approvals = await tx.roomApproval.findMany({
      where: { visitorId },
      select: { roomId: true },
    });
    const roomIds = [...new Set([...users, ...approvals].map((entry) => entry.roomId))];
    // Old snapshots do not retain the browser identity needed to remove just one historical entry.
    await tx.room.updateMany({
      where: { id: { in: roomIds } },
      data: { resultSnapshot: null },
    });
    await tx.user.deleteMany({ where: { visitorId } });
    await tx.roomApproval.deleteMany({ where: { visitorId } });
    await tx.observerPreference.deleteMany({ where: { visitorId } });
    await tx.visitorAgreement.deleteMany({ where: { visitorId } });
    await tx.feedbackAccess.deleteMany({ where: { visitorId } });
    await tx.feedbackVote.deleteMany({ where: { visitorId } });
    await tx.rateLimitDaily.deleteMany({ where: { visitorId } });
    const identityHash = createHash('sha256').update(visitorId).digest('hex');
    await tx.abuseQuota.deleteMany({
      where: { key: { endsWith: ':' + identityHash } },
    });
    // Keep feedback and conversations, but the deleted browser identity can no longer own them.
    await tx.feedback.updateMany({
      where: { visitorId },
      data: { visitorId: 'deleted-' + randomUUID() },
    });
    return { userIds: users.map((entry) => entry.id), roomIds };
  });
}
