import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { IssueStatus, type TransferIssue } from '@poker/shared';
import { getSiteConfig } from '../../config/site-config';
import { consumeDailyQuotas } from '../../platform/db/abuse-quota';
import { withRoomLock } from '../rooms/room-lock';
import { IssueError } from './issue-errors';
import {
  applyStatus,
  authorizeIssueAccess,
  ISSUE_TRANSACTION_TIMEOUT_MS,
  MAX_ISSUES_PER_ROOM,
} from './issue.service';
import * as issueRepository from './issue.repository';

interface IssueRecords {
  readonly records: Prisma.IssueCreateManyInput[];
  /** The imported issue that was in progress, if any. */
  readonly activeId: string | undefined;
}

/** Flattens an imported tree with new IDs; parents precede their children. */
function toIssueRecords(roomId: string, issues: TransferIssue[], now: Date): IssueRecords {
  const records: Prisma.IssueCreateManyInput[] = [];
  let activeId: string | undefined;
  const visit = (items: TransferIssue[], parentId: string | null, rootId?: string) => {
    for (const issue of items) {
      const id = crypto.randomUUID();
      if (issue.status === IssueStatus.IN_PROGRESS) activeId = id;
      records.push({
        id,
        roomId,
        parentId,
        rootId: rootId ?? id,
        title: issue.title,
        issueNumber: issue.issueNumber || null,
        url: issue.url || null,
        estimate: issue.estimate,
        status: issue.status,
        createdAt: now,
        lastModifiedAt: now,
      });
      visit(issue.subIssues, id, rootId ?? id);
    }
  };
  visit(issues, null);
  return { records, activeId };
}

/** Imports hold the single SQLite writer, so only one runs at a time server-wide. */
let importRunning = false;

export async function importIssues(
  roomId: string,
  userId: string,
  requester: { visitorId: string; network: string },
  issues: TransferIssue[],
) {
  if (importRunning) throw new IssueError(429, 'Another import is running. Try again shortly.');
  importRunning = true;
  try {
    return await importIssuesNow(roomId, userId, requester, issues);
  } finally {
    importRunning = false;
  }
}

function importIssuesNow(
  roomId: string,
  userId: string,
  { visitorId, network }: { visitorId: string; network: string },
  issues: TransferIssue[],
) {
  return withRoomLock(roomId, () =>
    issueRepository.transaction(
      async (db) => {
        await authorizeIssueAccess(db, roomId, userId, visitorId);
        // Daily import budgets survive restarts and new room IDs or cookies.
        const quota = getSiteConfig().limits.daily.issueImports;
        await consumeDailyQuotas(db, [
          {
            scope: 'import-visitor',
            identity: visitorId,
            limit: quota.perVisitor,
          },
          {
            scope: 'import-network',
            identity: network,
            limit: quota.perNetwork,
          },
          { scope: 'import-global', identity: 'all', limit: quota.perSite },
        ]);
        const now = new Date();
        const { records, activeId } = toIssueRecords(roomId, issues, now);
        if ((await issueRepository.countInRoom(db, roomId)) + records.length > MAX_ISSUES_PER_ROOM)
          throw new IssueError(409, 'Import would exceed the room limit of 5,000 issues.');
        // Parents precede children; all writes roll back together on any failure.
        await issueRepository.createMany(db, records);
        if (activeId) await applyStatus(db, roomId, activeId, IssueStatus.IN_PROGRESS);
        await issueRepository.touchRoom(db, roomId, now);
        return { count: records.length };
      },
      { timeout: ISSUE_TRANSACTION_TIMEOUT_MS },
    ),
  );
}
