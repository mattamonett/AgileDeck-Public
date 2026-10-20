import { computeStatusUpdates } from './issue-status';
import { buildIssueTree } from './issue-tree';
import { findRemovableClosedIssues } from './closed-issues';
import type { Issue as StoredIssue, Prisma } from '@prisma/client';
import {
  ISSUE_PAGE_SIZE,
  IssueStatus,
  type Issue,
  type IssuePage,
  type CreateIssueInput,
  type UpdateIssueInput,
} from '@poker/shared';
import { withRoomLock } from '../rooms/room-lock';
import * as issueRepository from './issue.repository';
import { IssueError } from './issue-errors';
import * as userRepository from '../rooms/user.repository';

export const MAX_ISSUES_PER_ROOM = 5000;
/** Whole-room issue rewrites can be slow on SQLite; allow them longer than Prisma's default. */
export const ISSUE_TRANSACTION_TIMEOUT_MS = 15_000;

export async function exportIssues(roomId: string, userId: string, visitorId: string) {
  const records = await issueRepository.transaction(async (db) => {
    await authorizeIssueAccess(db, roomId, userId, visitorId);
    return issueRepository.listRoom(db, roomId);
  });
  return buildIssueTree(records);
}

export async function authorizeIssueAccess(
  db: Prisma.TransactionClient,
  roomId: string,
  userId: string,
  visitorId: string,
) {
  if (!(await userRepository.isApprovedMember(roomId, userId, visitorId, db)))
    throw new IssueError(403, 'You do not have access to this room.');
}

export async function listIssues(
  roomId: string,
  userId: string,
  visitorId: string,
  cursor?: { createdAt: string; id: string },
): Promise<IssuePage> {
  const { roots, page, records, inProgress } = await issueRepository.transaction(async (db) => {
    await authorizeIssueAccess(db, roomId, userId, visitorId);
    const roots = await issueRepository.listRootsAfter(db, roomId, cursor, ISSUE_PAGE_SIZE + 1);
    const page = roots.slice(0, ISSUE_PAGE_SIZE);
    const records = await issueRepository.listByRoots(
      db,
      roomId,
      page.map((row) => row.id),
    );
    const inProgress = await issueRepository.listInProgress(db, roomId);
    return { roots, page, records, inProgress };
  });
  const last = page.at(-1);
  const deepest = (items: Issue[]): Issue | null => {
    const first = items[0];
    return first ? (deepest(first.subIssues ?? []) ?? first) : null;
  };
  return {
    issues: buildIssueTree(records),
    activeIssue: deepest(buildIssueTree(inProgress)),
    nextCursor:
      roots.length > ISSUE_PAGE_SIZE && last
        ? JSON.stringify({
            createdAt: last.createdAt.toISOString(),
            id: last.id,
          })
        : null,
  };
}

// Preserve the panel's branch rules across the entire room, including other pages.
export async function applyStatus(
  db: Prisma.TransactionClient,
  roomId: string,
  id: string,
  status: IssueStatus,
) {
  const records = await issueRepository.listRoomUnordered(db, roomId);
  const updates = computeStatusUpdates(records, id, status);
  const now = new Date();
  for (const update of updates)
    await issueRepository.update(db, update.id, roomId, {
      status: update.status,
      lastModifiedAt: now,
    });
}

export enum IssueMutationKind {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
}
export type IssueMutation =
  | { kind: IssueMutationKind.CREATE; input: CreateIssueInput }
  | { kind: IssueMutationKind.UPDATE; id: string; input: UpdateIssueInput }
  | { kind: IssueMutationKind.DELETE; id: string };

export async function mutateIssue(
  roomId: string,
  userId: string,
  visitorId: string,
  command: IssueMutation,
): Promise<string> {
  return withRoomLock(roomId, () =>
    issueRepository.transaction(
      async (db) => {
        await authorizeIssueAccess(db, roomId, userId, visitorId);
        const now = new Date();
        const input = command.kind === IssueMutationKind.DELETE ? {} : command.input;
        const id = command.kind === IssueMutationKind.CREATE ? crypto.randomUUID() : command.id;
        const fields = {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.issueNumber !== undefined ? { issueNumber: input.issueNumber || null } : {}),
          ...(input.url !== undefined ? { url: input.url || null } : {}),
          ...(input.estimate !== undefined ? { estimate: input.estimate } : {}),
          lastModifiedAt: now,
        };
        let parentId: string | null = null;
        if (command.kind === IssueMutationKind.CREATE) {
          if ((await issueRepository.countInRoom(db, roomId)) >= MAX_ISSUES_PER_ROOM)
            throw new IssueError(409, 'This room has reached its 5,000 issue limit.');
          const create = command.input;
          parentId = create.parentId ?? null;
          let parent: StoredIssue | null = null;
          if (parentId) {
            parent = await issueRepository.findInRoom(db, parentId, roomId);
            if (!parent) throw new IssueError(404, 'Parent issue not found in this room.');
            let ancestor: StoredIssue | null = parent;
            let depth = 1;
            while (ancestor?.parentId) {
              depth++;
              ancestor = await issueRepository.findInRoom(db, ancestor.parentId, roomId);
            }
            if (depth >= 20) throw new IssueError(409, 'Issues support up to 20 levels.');
          }
          await issueRepository.create(db, {
            ...fields,
            id,
            roomId,
            parentId,
            rootId: parent?.rootId ?? id,
            title: create.title,
            createdAt: now,
          });
        } else {
          const existing = await issueRepository.findInRoom(db, id, roomId);
          if (!existing) throw new IssueError(404, 'Issue not found in this room.');
          parentId = existing.parentId;
          if (command.kind === IssueMutationKind.DELETE)
            await issueRepository.delete(db, id, roomId);
          else await issueRepository.update(db, id, roomId, fields);
        }
        if (parentId && command.kind !== IssueMutationKind.UPDATE)
          await issueRepository.update(db, parentId, roomId, {
            lastModifiedAt: now,
          });
        if (command.kind !== IssueMutationKind.DELETE && input.status !== undefined)
          await applyStatus(db, roomId, id, input.status);
        await issueRepository.touchRoom(db, roomId, now);
        return id;
      },
      { timeout: ISSUE_TRANSACTION_TIMEOUT_MS },
    ),
  );
}

/** How many issues "clear closed" would delete right now. */
export async function countClosedIssues(
  roomId: string,
  userId: string,
  visitorId: string,
): Promise<number> {
  const records = await issueRepository.transaction(async (db) => {
    await authorizeIssueAccess(db, roomId, userId, visitorId);
    return issueRepository.listRoomUnordered(db, roomId);
  });
  return findRemovableClosedIssues(records).count;
}

/** Deletes every closed issue whose subissues are all closed too. */
export async function deleteClosedIssues(
  roomId: string,
  userId: string,
  visitorId: string,
): Promise<number> {
  return withRoomLock(roomId, () =>
    issueRepository.transaction(
      async (db) => {
        await authorizeIssueAccess(db, roomId, userId, visitorId);
        const { roots, count } = findRemovableClosedIssues(
          await issueRepository.listRoomUnordered(db, roomId),
        );
        if (!count) return 0;
        const now = new Date();
        await issueRepository.deleteMany(
          db,
          roomId,
          roots.map(({ id }) => id),
        );
        const parentIds = [...new Set(roots.flatMap(({ parentId }) => parentId ?? []))];
        if (parentIds.length) await issueRepository.touchIssues(db, roomId, parentIds, now);
        await issueRepository.touchRoom(db, roomId, now);
        return count;
      },
      { timeout: ISSUE_TRANSACTION_TIMEOUT_MS },
    ),
  );
}

/** Closes the active issue and starts the next open one in board order, wrapping to the top. */
export async function startNextIssue(
  roomId: string,
  userId: string,
  visitorId: string,
): Promise<string | null> {
  return withRoomLock(roomId, () =>
    issueRepository.transaction(
      async (db) => {
        await authorizeIssueAccess(db, roomId, userId, visitorId);
        const findBoard = () => issueRepository.listRoom(db, roomId);
        const roots = buildIssueTree(await findBoard());
        const active = activeIssueId(roots);
        if (active) await applyStatus(db, roomId, active, IssueStatus.CLOSED);
        const board = flattenIssues(buildIssueTree(await findBoard()));
        const start = active ? board.findIndex(({ id }) => id === active) : -1;
        const next = [...board.slice(start + 1), ...board.slice(0, start + 1)].find(
          (issue) => issue.status === IssueStatus.OPEN,
        );
        if (next) await applyStatus(db, roomId, next.id, IssueStatus.IN_PROGRESS);
        if (active || next) await issueRepository.touchRoom(db, roomId, new Date());
        return next?.id ?? null;
      },
      { timeout: ISSUE_TRANSACTION_TIMEOUT_MS },
    ),
  );
}

function flattenIssues(issues: Issue[]): Issue[] {
  return issues.flatMap((issue) => [issue, ...flattenIssues(issue.subIssues ?? [])]);
}

/** The deepest issue on the in-progress branch, matching the voting heading. */
function activeIssueId(issues: Issue[]): string | null {
  const branch = issues.find((issue) => issue.status === IssueStatus.IN_PROGRESS);
  return branch ? (activeIssueId(branch.subIssues ?? []) ?? branch.id) : null;
}
