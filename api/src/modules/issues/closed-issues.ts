import type { Issue as StoredIssue } from '@prisma/client';
import { IssueStatus } from '@poker/shared';

/**
 * Closed issues that can go without taking open work with them: a closed issue
 * is removed only when every subissue beneath it is closed too. Returns the
 * topmost removable issues (deleting them cascades) and the total removed.
 */
export function findRemovableClosedIssues(records: readonly StoredIssue[]) {
  const children = new Map<string, StoredIssue[]>();
  for (const row of records)
    if (row.parentId) {
      const group = children.get(row.parentId) ?? [];
      group.push(row);
      children.set(row.parentId, group);
    }
  // Size of each fully closed subtree; null when anything beneath is still open.
  const closedSize = (row: StoredIssue): number | null => {
    let size: number | null = row.status === IssueStatus.CLOSED ? 1 : null;
    for (const child of children.get(row.id) ?? []) {
      const childSize = closedSize(child);
      size = size !== null && childSize !== null ? size + childSize : null;
    }
    return size;
  };
  const roots: StoredIssue[] = [];
  let count = 0;
  const collect = (row: StoredIssue) => {
    const size = closedSize(row);
    if (size !== null) {
      roots.push(row);
      count += size;
    } else (children.get(row.id) ?? []).forEach(collect);
  };
  records.filter((row) => !row.parentId).forEach(collect);
  return { roots, count };
}
