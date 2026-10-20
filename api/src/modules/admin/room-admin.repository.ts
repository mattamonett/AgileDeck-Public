import { memberReference } from './member-reference';
import { rateLimitCutoff } from '../telemetry/rate-limit-stats.repository';
import { Prisma } from '@prisma/client';
import {
  ADMIN_ROOM_PAGE_SIZE,
  type AdminRoom,
  type AdminRoomSort,
  type AdminUserSort,
  type AdminApprovalSort,
  type AdminSortDirection,
} from '@poker/shared';
import prisma from '../../platform/db/prisma';
import { parseRoomMood, parseRoomTheme } from '../rooms/room-appearance';
import { AdminError } from './admin-errors';

const roomSelect = {
  id: true,
  name: true,
  theme: true,
  mood: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { users: true, approvals: true, issues: true } },
} satisfies Prisma.RoomSelect;

function roomSummary(room: Prisma.RoomGetPayload<{ select: typeof roomSelect }>): AdminRoom {
  return {
    id: room.id,
    name: room.name,
    theme: parseRoomTheme(room.theme),
    mood: parseRoomMood(room.mood),
    approvedMemberCount: room._count.approvals,
    memberCount: room._count.users,
    issueCount: room._count.issues,
    lastActivityAt: room.updatedAt.toISOString(),
    createdAt: room.createdAt.toISOString(),
  };
}

export async function listAdminRooms(
  cursor: string | undefined,
  sort: AdminRoomSort = 'createdAt',
  direction: AdminSortDirection = 'desc',
) {
  const order: Record<AdminRoomSort, Prisma.RoomOrderByWithRelationInput> = {
    name: { name: direction },
    approvedMemberCount: { approvals: { _count: direction } },
    memberCount: { users: { _count: direction } },
    issueCount: { issues: { _count: direction } },
    lastActivityAt: { updatedAt: direction },
    createdAt: { createdAt: direction },
  };
  if (
    cursor &&
    !(await prisma.room.findUnique({
      where: { id: cursor },
      select: { id: true },
    }))
  )
    throw new AdminError(400, 'Invalid room page cursor.');
  const rooms = await prisma.room.findMany({
    select: roomSelect,
    orderBy: [order[sort], { id: 'asc' }],
    take: ADMIN_ROOM_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const visible = rooms.slice(0, ADMIN_ROOM_PAGE_SIZE);
  return {
    items: visible.map(roomSummary),
    nextCursor: rooms.length > ADMIN_ROOM_PAGE_SIZE ? (visible.at(-1)?.id ?? null) : null,
  };
}

export async function findAdminRoom(
  id: string,
  cursor: string | undefined,
  approvedOffset = 0,
  memberSort: AdminUserSort = 'createdAt',
  memberDirection: AdminSortDirection = 'asc',
  approvedSort: AdminApprovalSort = 'name',
  approvedDirection: AdminSortDirection = 'asc',
) {
  const room = await prisma.room.findUnique({
    where: { id },
    select: roomSelect,
  });
  if (!room) throw new AdminError(404, 'Room not found.');
  if (
    cursor &&
    !(await prisma.user.findFirst({
      where: { id: cursor, roomId: id },
      select: { id: true },
    }))
  )
    throw new AdminError(400, 'Invalid member page cursor.');
  const userDirection =
    memberSort === 'isObserver' || memberSort === 'isApproved'
      ? memberDirection === 'asc'
        ? 'desc'
        : 'asc'
      : memberDirection;
  const stats = Prisma.sql`SELECT visitorId, SUM(count) AS count, MAX(lastHitAt) AS lastHitAt FROM RateLimitDaily WHERE day >= ${rateLimitCutoff()} GROUP BY visitorId`;
  const userColumns: Record<AdminUserSort, Prisma.Sql> = {
    name: Prisma.sql`u.name`,
    isObserver: Prisma.sql`u.isObserver`,
    isApproved: Prisma.sql`u.isApproved`,
    createdAt: Prisma.sql`u.createdAt`,
    rateLimitCount: Prisma.sql`COALESCE(s.count, 0)`,
    lastRateLimitAt: Prisma.sql`s.lastHitAt`,
  };
  const userOrder = userDirection === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const users = await prisma.$queryRaw<CurrentMemberRow[]>(Prisma.sql`
    WITH stats AS (${stats}), ranked AS (
      SELECT u.id, u.visitorId, u.name, u.isObserver, u.isApproved, u.createdAt,
        COALESCE(s.count, 0) AS rateLimitCount, s.lastHitAt AS lastRateLimitAt,
        ROW_NUMBER() OVER (ORDER BY ${userColumns[memberSort]} ${userOrder}, u.id ASC) AS position
      FROM User u LEFT JOIN stats s ON s.visitorId = u.visitorId WHERE u.roomId = ${id}
    )
    SELECT * FROM ranked WHERE position > COALESCE((SELECT position FROM ranked WHERE id = ${cursor ?? null}), 0)
    ORDER BY position LIMIT ${ADMIN_ROOM_PAGE_SIZE + 1}
  `);
  const approvalColumns: Record<AdminApprovalSort, Prisma.Sql> = {
    name: Prisma.sql`COALESCE(u.name, a.lastKnownName)`,
    isCurrent: Prisma.sql`(u.id IS NOT NULL)`,
    isObserver: Prisma.sql`COALESCE(u.isObserver, a.lastIsObserver)`,
    isApproved: Prisma.sql`1 + 0`,
    createdAt: Prisma.sql`COALESCE(u.createdAt, a.lastJoinedAt)`,
    rateLimitCount: Prisma.sql`COALESCE(s.count, 0)`,
    lastRateLimitAt: Prisma.sql`s.lastHitAt`,
  };
  const reverse = approvedSort === 'isCurrent' || approvedSort === 'isObserver';
  const sortDirection = (reverse ? approvedDirection === 'desc' : approvedDirection === 'asc')
    ? Prisma.sql`ASC`
    : Prisma.sql`DESC`;
  const approvals = await prisma.$queryRaw<ApprovedMemberRow[]>(Prisma.sql`
    WITH stats AS (${stats})
    SELECT a.visitorId, COALESCE(u.name, a.lastKnownName) AS name, (u.id IS NOT NULL) AS isCurrent,
      COALESCE(u.isObserver, a.lastIsObserver) AS isObserver,
      COALESCE(u.createdAt, a.lastJoinedAt) AS createdAt,
      COALESCE(s.count, 0) AS rateLimitCount, s.lastHitAt AS lastRateLimitAt
    FROM RoomApproval a
    LEFT JOIN User u ON u.roomId = a.roomId AND u.visitorId = a.visitorId AND u.isApproved = true
    LEFT JOIN stats s ON s.visitorId = a.visitorId
    WHERE a.roomId = ${id}
    ORDER BY ${approvalColumns[approvedSort]} ${sortDirection}, a.visitorId ASC
    LIMIT ${ADMIN_ROOM_PAGE_SIZE + 1} OFFSET ${approvedOffset}
  `);
  const visibleApprovals = approvals.slice(0, ADMIN_ROOM_PAGE_SIZE);
  const visible = users.slice(0, ADMIN_ROOM_PAGE_SIZE);
  return {
    room: roomSummary(room),
    approvedMembers: visibleApprovals.map((entry) => ({
      memberReference: memberReference(id, entry.visitorId),
      name: entry.name,
      isCurrent: Number(entry.isCurrent) === 1,
      isObserver: entry.isObserver === null ? null : Number(entry.isObserver) === 1,
      isApproved: true as const,
      createdAt: isoDate(entry.createdAt),
      rateLimitCount: Number(entry.rateLimitCount),
      lastRateLimitAt: isoDate(entry.lastRateLimitAt),
    })),
    nextApprovedOffset:
      approvals.length > ADMIN_ROOM_PAGE_SIZE ? approvedOffset + ADMIN_ROOM_PAGE_SIZE : null,
    users: visible.map((user) => ({
      memberReference: memberReference(id, user.visitorId),
      id: user.id,
      name: user.name,
      isObserver: Number(user.isObserver) === 1,
      isApproved: Number(user.isApproved) === 1,
      createdAt: isoDate(user.createdAt),
      rateLimitCount: Number(user.rateLimitCount),
      lastRateLimitAt: isoDate(user.lastRateLimitAt),
    })),
    nextCursor: users.length > ADMIN_ROOM_PAGE_SIZE ? (visible.at(-1)?.id ?? null) : null,
  };
}

type DatabaseDate = Date | string | number | bigint | null;
interface MemberStatsRow {
  visitorId: string;
  rateLimitCount: bigint | number;
  lastRateLimitAt: DatabaseDate;
}
interface CurrentMemberRow extends MemberStatsRow {
  id: string;
  name: string;
  isObserver: boolean | number | bigint | string;
  isApproved: boolean | number | bigint | string;
  createdAt: DatabaseDate;
}
interface ApprovedMemberRow extends MemberStatsRow {
  name: string | null;
  isCurrent: number | bigint;
  isObserver: boolean | number | bigint | string | null;
  createdAt: DatabaseDate;
}
function isoDate(value: DatabaseDate): string | null {
  if (value === null) return null;
  return (
    value instanceof Date
      ? value
      : new Date(
          typeof value === 'bigint' || (typeof value === 'string' && /^\d+$/.test(value))
            ? Number(value)
            : value,
        )
  ).toISOString();
}
