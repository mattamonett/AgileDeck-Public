import { nextSortDirection, sortAria, sortIndicator } from './sort';

describe('admin table sorting', () => {
  it('describes the active column for assistive technology', () => {
    expect(sortAria('name', 'name', 'asc')).toBe('ascending');
    expect(sortAria('name', 'name', 'desc')).toBe('descending');
    expect(sortAria('createdAt', 'name', 'asc')).toBe('none');
  });

  it('shows an arrow on the active column and a neutral mark elsewhere', () => {
    expect(sortIndicator('name', 'name', 'asc')).toBe(' ↑');
    expect(sortIndicator('name', 'name', 'desc')).toBe(' ↓');
    expect(sortIndicator('createdAt', 'name', 'desc')).toBe(' ↕');
  });

  it('flips only an ascending active column and otherwise starts ascending', () => {
    expect(nextSortDirection('name', 'asc', 'name')).toBe('desc');
    expect(nextSortDirection('name', 'desc', 'name')).toBe('asc');
    expect(nextSortDirection('createdAt', 'asc', 'name')).toBe('asc');
    expect(nextSortDirection('createdAt', 'desc', 'name')).toBe('asc');
  });
});
