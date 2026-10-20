import type { Issue as StoredIssue } from '@prisma/client';
import { IssueStatus, type Issue } from '@poker/shared';

export function parseIssueStatus(value: string): IssueStatus {
  switch (value) {
    case IssueStatus.OPEN:
      return IssueStatus.OPEN;
    case IssueStatus.IN_PROGRESS:
      return IssueStatus.IN_PROGRESS;
    case IssueStatus.CLOSED:
      return IssueStatus.CLOSED;
    default:
      throw new Error(`Invalid persisted issue status: ${value}`);
  }
}

/** Links flat rows without asserting that every lookup or child collection exists. */
export function buildIssueTree(records: readonly StoredIssue[]): Issue[] {
  const nodes = new Map<string, Issue & { subIssues: Issue[] }>(
    records.map((row) => [
      row.id,
      {
        id: row.id,
        title: row.title,
        ...(row.issueNumber ? { issueNumber: row.issueNumber } : {}),
        ...(row.url ? { url: row.url } : {}),
        status: parseIssueStatus(row.status),
        estimate: row.estimate,
        createdAt: row.createdAt.toISOString(),
        lastModifiedAt: row.lastModifiedAt.toISOString(),
        subIssues: [],
      },
    ]),
  );
  const roots: Issue[] = [];
  for (const row of records) {
    const node = nodes.get(row.id);
    if (!node) continue;
    if (row.parentId) nodes.get(row.parentId)?.subIssues.push(node);
    else roots.push(node);
  }
  return roots;
}
