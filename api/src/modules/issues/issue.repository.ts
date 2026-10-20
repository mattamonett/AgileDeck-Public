import prisma from '../../platform/db/prisma';
import type { Issue, Prisma } from '@prisma/client';
import { IssueStatus } from '@poker/shared';

type IssueDb = Prisma.TransactionClient;
const NEWEST_FIRST: Prisma.IssueOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { id: 'desc' },
];

/** Runs `work` in one transaction so authorization and writes commit together. */
export function transaction<T>(
  work: (tx: IssueDb) => Promise<T>,
  options?: { timeout: number },
): Promise<T> {
  return options ? prisma.$transaction(work, options) : prisma.$transaction(work);
}

export function countInRoom(tx: IssueDb, roomId: string): Promise<number> {
  return tx.issue.count({ where: { roomId } });
}

export function findInRoom(tx: IssueDb, id: string, roomId: string): Promise<Issue | null> {
  return tx.issue.findFirst({ where: { id, roomId } });
}

/** Every issue in the room, newest first. */
export function listRoom(tx: IssueDb, roomId: string): Promise<Issue[]> {
  return tx.issue.findMany({ where: { roomId }, orderBy: NEWEST_FIRST });
}

/** Every issue in the room in storage order, for whole-room status rules. */
export function listRoomUnordered(tx: IssueDb, roomId: string): Promise<Issue[]> {
  return tx.issue.findMany({ where: { roomId } });
}

/** Up to `take` root issues created before the cursor, newest first. */
export function listRootsAfter(
  tx: IssueDb,
  roomId: string,
  cursor: { createdAt: string; id: string } | undefined,
  take: number,
): Promise<Issue[]> {
  return tx.issue.findMany({
    where: {
      roomId,
      parentId: null,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: new Date(cursor.createdAt) } },
              {
                createdAt: new Date(cursor.createdAt),
                id: { lt: cursor.id },
              },
            ],
          }
        : {}),
    },
    orderBy: NEWEST_FIRST,
    take,
  });
}

export function listByRoots(tx: IssueDb, roomId: string, rootIds: string[]): Promise<Issue[]> {
  return tx.issue.findMany({
    where: { roomId, rootId: { in: rootIds } },
    orderBy: NEWEST_FIRST,
  });
}

export function listInProgress(tx: IssueDb, roomId: string): Promise<Issue[]> {
  return tx.issue.findMany({
    where: { roomId, status: IssueStatus.IN_PROGRESS },
    orderBy: NEWEST_FIRST,
  });
}

export async function create(tx: IssueDb, data: Prisma.IssueUncheckedCreateInput) {
  await tx.issue.create({ data });
}

/** Inserts in order, so parents listed before their children satisfy the foreign key. */
export async function createMany(tx: IssueDb, data: Prisma.IssueCreateManyInput[]) {
  await tx.issue.createMany({ data });
}

export async function update(
  tx: IssueDb,
  id: string,
  roomId: string,
  data: Prisma.IssueUpdateInput,
) {
  await tx.issue.update({ where: { id, roomId }, data });
}

async function deleteById(tx: IssueDb, id: string, roomId: string) {
  await tx.issue.delete({ where: { id, roomId } });
}

export async function deleteMany(tx: IssueDb, roomId: string, ids: readonly string[]) {
  await tx.issue.deleteMany({ where: { roomId, id: { in: [...ids] } } });
}

export async function touchIssues(
  tx: IssueDb,
  roomId: string,
  ids: readonly string[],
  lastModifiedAt: Date,
) {
  await tx.issue.updateMany({
    where: { roomId, id: { in: [...ids] } },
    data: { lastModifiedAt },
  });
}

export async function touchRoom(tx: IssueDb, roomId: string, updatedAt: Date) {
  await tx.room.update({ where: { id: roomId }, data: { updatedAt } });
}

export { deleteById as delete };
