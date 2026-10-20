describe('socket admission budgets', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
  });

  it('keeps socket admission budget limits and windows', async () => {
    const budgets = await import('../../../src/socket/rate-limits');
    expect(budgets.CONNECTION_BUDGET).toMatchObject({
      limit: 120,
      windowMs: 60_000,
    });
    expect(budgets.JOIN_NETWORK_BUDGET).toMatchObject({
      limit: 120,
      windowMs: 60_000,
    });
    expect(budgets.JOIN_BUDGET).toMatchObject({ limit: 10, windowMs: 10_000 });
    expect(budgets.HEALTH_BUDGET).toMatchObject({
      limit: 12,
      windowMs: 60_000,
    });
  });

  it('expires socket admission windows', async () => {
    jest.useFakeTimers({ now: 100_000 });
    const budgets = await import('../../../src/socket/rate-limits');
    for (let i = 0; i < 12; i++) expect(budgets.HEALTH_BUDGET.consume('network')).toBe(true);
    expect(budgets.HEALTH_BUDGET.consume('network')).toBe(false);
    jest.setSystemTime(160_000);
    expect(budgets.HEALTH_BUDGET.consume('network')).toBe(true);
  });
});
