import type { Prisma } from '@prisma/client';
import {
  IssueStatus,
  VALID_INTERACTION_CHARACTERS,
  VALID_VOTES,
  type RoomStats,
  type RoomStatsMetric,
} from '@poker/shared';
import prisma from '../../platform/db/prisma';
import { getSiteConfig } from '../../config/site-config';

/** A room's issue backlog counts only while the site offers issues at all. */
function issuesOn(room: { issuesEnabled: boolean }): boolean {
  return room.issuesEnabled && getSiteConfig().features.issues;
}

async function startStats(tx: Prisma.TransactionClient, roomId: string) {
  await tx.room.updateMany({
    where: { id: roomId, statsStartedAt: null },
    data: { statsStartedAt: new Date() },
  });
}

export async function setVoteWithStats(userId: string, vote: string | null) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const room = await tx.room.findUniqueOrThrow({
      where: { id: user.roomId },
    });
    if (!user.isApproved || user.isObserver || room.reveal) return user;
    const updated = await tx.user.update({
      where: { id: userId },
      data: { vote },
    });
    if (vote !== null) {
      await tx.roomApproval.updateMany({
        where: {
          roomId: user.roomId,
          visitorId: user.visitorId,
          lastVotedRound: { not: room.roundNumber },
        },
        data: { votesCast: { increment: 1 }, lastVotedRound: room.roundNumber },
      });
      await startStats(tx, user.roomId);
    }
    return updated;
  });
}

export interface ThrowStatsEntry {
  readonly roomId: string;
  readonly visitorId: string;
  readonly sent: number;
  readonly received: number;
  readonly barrages: number;
  readonly characters: readonly string[];
}

/** The target's visitor ID when the throw is allowed, read without writing anything. */
export async function findThrowTarget(
  roomId: string,
  userId: string,
  visitorId: string,
  targetUserId: string,
): Promise<string | null> {
  if (targetUserId === userId) return null;
  const [user, room, target] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId, roomId, visitorId, isApproved: true } }),
    prisma.room.findUnique({ where: { id: roomId } }),
    prisma.user.findFirst({ where: { id: targetUserId, roomId, isApproved: true } }),
  ]);
  if (!user || !room || room.reveal || !target) return null;
  return target.visitorId;
}

function storedCharacters(json: string): string[] {
  const stored: unknown = JSON.parse(json);
  return Array.isArray(stored)
    ? stored.filter(
        (value: unknown): value is string =>
          typeof value === 'string' && VALID_INTERACTION_CHARACTERS.has(value),
      )
    : [];
}

// Fixed counters on existing approvals: no event log or new identities per interaction.
// Approvals deleted since the throws were buffered are skipped.
export async function persistThrowStatsBatch(entries: readonly ThrowStatsEntry[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const roomIds = new Set<string>();
    for (const entry of entries) {
      const identity = { roomId: entry.roomId, visitorId: entry.visitorId };
      const approval = await tx.roomApproval.findUnique({
        where: { roomId_visitorId: identity },
      });
      if (!approval) continue;
      const characters = new Set([
        ...storedCharacters(approval.charactersUsed),
        ...entry.characters.filter((value) => VALID_INTERACTION_CHARACTERS.has(value)),
      ]);
      await tx.roomApproval.update({
        where: { roomId_visitorId: identity },
        data: {
          throwsSent: { increment: entry.sent },
          throwsReceived: { increment: entry.received },
          barragesSent: { increment: entry.barrages },
          charactersUsed: JSON.stringify([...characters]),
          characterVariety: characters.size,
        },
      });
      roomIds.add(entry.roomId);
    }
    for (const roomId of roomIds) {
      await startStats(tx, roomId);
      await startAwards(tx, roomId);
    }
  });
}

export async function readRoomStats(
  roomId: string,
  visitorId: string,
  page: number,
  sort: RoomStatsMetric,
): Promise<RoomStats | null> {
  return prisma.$transaction(async (tx) => {
    const access = await tx.roomApproval.findUnique({
      where: { roomId_visitorId: { roomId, visitorId } },
    });
    if (!access) return null;
    const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
    const aggregate = await tx.roomApproval.aggregate({
      where: { roomId },
      _count: true,
      _sum: {
        votesCast: true,
        throwsSent: true,
        throwsReceived: true,
        barragesSent: true,
      },
    });
    const pageSize = 25;
    const members = await tx.roomApproval.findMany({
      where: { roomId },
      orderBy: [{ [sort]: 'desc' }, { statsId: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const ranks = await Promise.all(
      members.map((member) =>
        tx.roomApproval.count({
          where: { roomId, [sort]: { gt: member[sort] } },
        }),
      ),
    );
    return {
      roomName: room.name ?? roomId,
      startedAt: room.statsStartedAt?.toISOString() ?? null,
      roundsRevealed: room.roundsRevealed,
      participants: aggregate._count,
      page,
      pageSize,
      totals: {
        votesCast: aggregate._sum.votesCast ?? 0,
        throwsSent: aggregate._sum.throwsSent ?? 0,
        throwsReceived: aggregate._sum.throwsReceived ?? 0,
        barragesSent: aggregate._sum.barragesSent ?? 0,
      },
      awardsStartedAt: room.awardsStartedAt?.toISOString() ?? null,
      unanimousRounds: room.unanimousRounds,
      awards: {
        onARoll: await readAward(tx, roomId, visitorId, 'bestVoteStreak'),
        varietyShow: await readAward(tx, roomId, visitorId, 'characterVariety'),
      },
      issueStats: issuesOn(room)
        ? {
            estimated: await tx.issue.count({
              where: { roomId, estimate: { not: null } },
            }),
            spiciest: await readIssueHighlight(tx, roomId, 'firstVoteSpread'),
            commonGround: await readIssueHighlight(tx, roomId, 'spreadReduction'),
          }
        : null,
      members: members.map((member, index) => ({
        id: member.statsId,
        name: member.lastKnownName ?? 'Room member',
        isYou: member.visitorId === visitorId,
        rank: (ranks[index] ?? 0) + 1,
        votesCast: member.votesCast,
        throwsSent: member.throwsSent,
        throwsReceived: member.throwsReceived,
        barragesSent: member.barragesSent,
        bestVoteStreak: member.bestVoteStreak,
        characterVariety: member.characterVariety,
      })),
    };
  });
}

async function startAwards(tx: Prisma.TransactionClient, roomId: string) {
  await tx.room.updateMany({
    where: { id: roomId, awardsStartedAt: null },
    data: { awardsStartedAt: new Date() },
  });
}

// Reveal, snapshot and awards share one transaction: retries cannot credit a round twice.
export async function revealWithStats(roomId: string) {
  return prisma.$transaction(async (tx) => {
    const room = await tx.room.findUnique({ where: { id: roomId } });
    if (!room || room.reveal) return null;
    const users = await tx.user.findMany({ where: { roomId } });
    const players = users.filter((user) => user.isApproved && !user.isObserver);
    const approvals = await tx.roomApproval.findMany({
      where: {
        roomId,
        visitorId: { in: players.map((user) => user.visitorId) },
      },
    });
    for (const approval of approvals) {
      const player = players.find((user) => user.visitorId === approval.visitorId);
      const streak = player?.vote ? approval.currentVoteStreak + 1 : 0;
      await tx.roomApproval.update({
        where: { roomId_visitorId: { roomId, visitorId: approval.visitorId } },
        data: {
          currentVoteStreak: streak,
          bestVoteStreak: Math.max(approval.bestVoteStreak, streak),
        },
      });
    }
    const numericVotes = players.flatMap((player) => {
      const vote = player.vote;
      return vote !== null &&
        VALID_VOTES.some((valid) => valid === vote) &&
        Number.isFinite(Number(vote))
        ? [Number(vote)]
        : [];
    });
    const unanimous =
      players.length >= 2 &&
      numericVotes.length === players.length &&
      numericVotes.every((vote) => vote === numericVotes[0]);
    const issue = issuesOn(room)
      ? await tx.issue.findFirst({
          where: {
            roomId,
            status: IssueStatus.IN_PROGRESS,
            children: { none: { status: IssueStatus.IN_PROGRESS } },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        })
      : null;
    if (issue && numericVotes.length >= 2) {
      const latestMin = Math.min(...numericVotes);
      const latestMax = Math.max(...numericVotes);
      const firstMin = issue.firstVoteMin ?? latestMin;
      const firstMax = issue.firstVoteMax ?? latestMax;
      await tx.issue.update({
        where: { id: issue.id },
        data: {
          firstVoteMin: firstMin,
          firstVoteMax: firstMax,
          latestVoteMin: latestMin,
          latestVoteMax: latestMax,
          firstVoteSpread: firstMax - firstMin,
          spreadReduction: Math.max(0, firstMax - firstMin - (latestMax - latestMin)),
          // Recording statistics must not make an issue appear edited by a member.
          lastModifiedAt: issue.lastModifiedAt,
        },
      });
    }
    const snapshot = JSON.stringify(players.map(({ id, name, vote }) => ({ id, name, vote })));
    const updatedRoom = await tx.room.update({
      where: { id: roomId },
      data: {
        reveal: true,
        roundRevealedAt: new Date(),
        resultSnapshot: snapshot,
        roundsRevealed: { increment: 1 },
        unanimousRounds: { increment: unanimous ? 1 : 0 },
        statsStartedAt: room.statsStartedAt ?? new Date(),
        awardsStartedAt: room.awardsStartedAt ?? new Date(),
      },
    });
    return { room: updatedRoom, users, snapshot, issueId: issue?.id ?? null };
  });
}

async function readAward(
  tx: Prisma.TransactionClient,
  roomId: string,
  visitorId: string,
  metric: 'bestVoteStreak' | 'characterVariety',
): Promise<RoomStats['awards']['onARoll']> {
  const top = await tx.roomApproval.findFirst({
    where: { roomId, [metric]: { gt: 0 } },
    orderBy: [{ [metric]: 'desc' }, { statsId: 'asc' }],
  });
  if (!top) return null;
  const where = { roomId, [metric]: top[metric] };
  const winnerCount = await tx.roomApproval.count({ where });
  const winners = await tx.roomApproval.findMany({
    where,
    orderBy: { statsId: 'asc' },
    take: 3,
  });
  return {
    score: top[metric],
    winnerCount,
    winners: winners.map((winner) => ({
      id: winner.statsId,
      name: winner.lastKnownName ?? 'Room member',
      isYou: winner.visitorId === visitorId,
    })),
  };
}

async function readIssueHighlight(
  tx: Prisma.TransactionClient,
  roomId: string,
  metric: 'firstVoteSpread' | 'spreadReduction',
) {
  const issue = await tx.issue.findFirst({
    where: { roomId, [metric]: { gt: 0 } },
    orderBy: [{ [metric]: 'desc' }, { id: 'asc' }],
  });
  if (
    !issue ||
    issue.firstVoteMin === null ||
    issue.firstVoteMax === null ||
    issue.latestVoteMin === null ||
    issue.latestVoteMax === null
  )
    return null;
  return {
    id: issue.id,
    title: issue.title,
    firstMin: issue.firstVoteMin,
    firstMax: issue.firstVoteMax,
    latestMin: issue.latestVoteMin,
    latestMax: issue.latestVoteMax,
    tiedCount: await tx.issue.count({
      where: { roomId, [metric]: issue[metric] },
    }),
  };
}
