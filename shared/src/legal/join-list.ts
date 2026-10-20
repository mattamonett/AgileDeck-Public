/** Joins items as prose: "a and b", or "a, b, and c" for longer lists. */
export function joinList(items: readonly string[]): string {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')}, and ${items.slice(-1).join('')}`;
}
