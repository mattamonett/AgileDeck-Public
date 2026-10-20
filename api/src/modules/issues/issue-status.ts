import type { Issue as StoredIssue } from '@prisma/client';
import { IssueStatus } from '@poker/shared';
import { parseIssueStatus } from './issue-tree';

/** One active branch per room; closing the last open child closes its ancestors. */
export function computeStatusUpdates(
  records: readonly StoredIssue[],
  id: string,
  status: IssueStatus,
) {
  const byId = new Map(records.map((row) => [row.id, row]));
  const children = new Map<string, StoredIssue[]>();
  for (const row of records)
    if (row.parentId) {
      const group = children.get(row.parentId) ?? [];
      group.push(row);
      children.set(row.parentId, group);
    }
  const related = new Set<string>();
  const ancestors = new Set<string>();
  const descend = (key: string) => {
    related.add(key);
    for (const child of children.get(key) ?? []) descend(child.id);
  };
  descend(id);
  let parentId = byId.get(id)?.parentId;
  while (parentId) {
    related.add(parentId);
    ancestors.add(parentId);
    parentId = byId.get(parentId)?.parentId;
  }
  const updates: { id: string; status: IssueStatus }[] = [];
  const visit = (row: StoredIssue): IssueStatus => {
    const childStatuses = (children.get(row.id) ?? []).map(visit);
    let next =
      row.id === id
        ? status
        : status === IssueStatus.IN_PROGRESS &&
            row.status === IssueStatus.IN_PROGRESS &&
            !related.has(row.id)
          ? IssueStatus.OPEN
          : parseIssueStatus(row.status);
    if (childStatuses.includes(IssueStatus.IN_PROGRESS)) next = IssueStatus.IN_PROGRESS;
    if (
      status === IssueStatus.CLOSED &&
      ancestors.has(row.id) &&
      childStatuses.length &&
      childStatuses.every((value) => value === IssueStatus.CLOSED)
    )
      next = IssueStatus.CLOSED;
    if (next !== row.status) updates.push({ id: row.id, status: next });
    return next;
  };
  records.filter((row) => !row.parentId).forEach(visit);
  return updates;
}
