import { WindowBudget } from '../../../src/platform/concurrency/window-budget';

describe('WindowBudget.forget', () => {
  it('drops only matching counters so their owners start a fresh window', () => {
    const budget = new WindowBudget(1, 60_000);
    for (const key of ['visitor-a:room-1', 'visitor-a:room-2', 'visitor-b:room-1'])
      expect(budget.consume(key)).toBe(true);

    budget.forget((key) => key.endsWith(':room-1'));
    expect(budget.consume('visitor-a:room-1')).toBe(true);
    expect(budget.consume('visitor-b:room-1')).toBe(true);
    expect(budget.consume('visitor-a:room-2')).toBe(false);

    budget.forget((key) => key.startsWith('visitor-a:'));
    expect(budget.consume('visitor-a:room-2')).toBe(true);
    expect(budget.consume('visitor-b:room-1')).toBe(false);
  });

  it('does nothing when no key matches', () => {
    const budget = new WindowBudget(1, 60_000);
    expect(budget.consume('a')).toBe(true);
    budget.forget(() => false);
    expect(budget.consume('a')).toBe(false);
  });
});

it('bounds fixed windows per identity and allows a new window at the exact boundary', () => {
  const budget = new WindowBudget(2, 1000);
  const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
  expect(budget.consume('a')).toBe(true);
  expect(budget.consume('a')).toBe(true);
  expect(budget.consume('a')).toBe(false);
  expect(budget.consume('b')).toBe(true);
  clock.mockReturnValue(2000);
  // The new window starts with this request, so one more is allowed.
  expect(budget.consume('a')).toBe(true);
  expect(budget.consume('a')).toBe(true);
  expect(budget.consume('a')).toBe(false);
  clock.mockRestore();
});
