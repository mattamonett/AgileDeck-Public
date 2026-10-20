/** Positive numeric votes; non-numeric cards such as "?" or "☕" are ignored. */
export function numericVotes(votes: readonly (string | undefined)[]): number[] {
  return votes.map((vote) => parseFloat(vote ?? '')).filter((value) => !isNaN(value) && value > 0);
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

const UNFORMATTED_VERSIONS = new Set(['Development', 'Unknown', 'Disconnected']);

/** Shows a build timestamp in the viewer's locale; status labels and non-dates pass through. */
export function formatVersion(version: string): string {
  if (!version || UNFORMATTED_VERSIONS.has(version)) return version;
  const date = new Date(version);
  if (isNaN(date.getTime())) return version;
  return date.toLocaleString();
}
