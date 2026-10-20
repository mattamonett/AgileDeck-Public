import { formatVersion, mean, numericVotes } from './vote-selectors';

describe('vote selectors', () => {
  it('keeps only positive numeric votes', () => {
    expect(numericVotes(['3', '0.5', undefined, '', '?', '☕', '0', '-2', '13'])).toEqual([
      3, 0.5, 13,
    ]);
  });

  it('averages values and reports no mean for an empty list', () => {
    expect(mean([])).toBeNull();
    expect(mean([1, 2, 6])).toBe(3);
  });

  it('formats build timestamps and passes status labels through', () => {
    const stamp = '2026-01-02T03:04:05.000Z';
    expect(formatVersion(stamp)).toBe(new Date(stamp).toLocaleString());
    for (const label of ['', 'Development', 'Unknown', 'Disconnected', 'not a date']) {
      expect(formatVersion(label)).toBe(label);
    }
  });
});
