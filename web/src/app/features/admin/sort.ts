import type { AdminSortDirection } from '@poker/shared';

export type AriaSort = 'none' | 'ascending' | 'descending';

export function sortAria(active: string, column: string, direction: AdminSortDirection): AriaSort {
  if (active !== column) return 'none';
  return direction === 'asc' ? 'ascending' : 'descending';
}

export function sortIndicator(
  active: string,
  column: string,
  direction: AdminSortDirection,
): string {
  if (active !== column) return ' ↕';
  return direction === 'asc' ? ' ↑' : ' ↓';
}

/** Clicking the active ascending column flips it; any other click sorts ascending. */
export function nextSortDirection(
  active: string,
  direction: AdminSortDirection,
  column: string,
): AdminSortDirection {
  return active === column && direction === 'asc' ? 'desc' : 'asc';
}
