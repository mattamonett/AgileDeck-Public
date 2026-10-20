import {
  ACTION_COOLDOWNS,
  checkRateLimit,
} from '../../../src/platform/concurrency/action-cooldowns';

describe('action cooldowns', () => {
  beforeEach(() => {
    ACTION_COOLDOWNS.clear();
  });

  it('keeps cooldowns in a shared map', () => {
    expect(ACTION_COOLDOWNS).toBeInstanceOf(Map);
  });

  it('enforces action cooldowns', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1000);
    expect(checkRateLimit('user-1', 500)).toBe(true);
    expect(ACTION_COOLDOWNS.get('user-1')).toBe(1000);

    nowSpy.mockReturnValue(1200);
    expect(checkRateLimit('user-1', 500)).toBe(false);

    nowSpy.mockReturnValue(2000);
    expect(checkRateLimit('user-1', 500)).toBe(true);
    nowSpy.mockRestore();
  });

  it('keeps separate cooldowns for different action keys', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(5000);

    expect(checkRateLimit('user-1:vote', 1500)).toBe(true);
    expect(checkRateLimit('user-1:reveal', 1500)).toBe(true);
    expect(checkRateLimit('user-1:reveal', 1500)).toBe(false);

    nowSpy.mockRestore();
  });

  it('uses the default cooldown when none is provided', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    ACTION_COOLDOWNS.set('user-2', 0);
    nowSpy.mockReturnValue(600);

    expect(checkRateLimit('user-2')).toBe(true);

    nowSpy.mockRestore();
  });

  it('accepts the first action at epoch zero and preserves its cooldown', () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(0);
    expect(checkRateLimit('new-user', 500)).toBe(true);
    expect(checkRateLimit('new-user', 500)).toBe(false);
    clock.mockRestore();
  });
});

describe('action cooldown sweep', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
  });

  it('sweeps expired entries while retaining current windows', async () => {
    jest.useFakeTimers({ now: 100_000 });
    // A fresh copy schedules its sweep on the fake clock.
    jest.resetModules();
    const cooldowns = await import('../../../src/platform/concurrency/action-cooldowns');
    cooldowns.ACTION_COOLDOWNS.set('old', 1);
    cooldowns.ACTION_COOLDOWNS.set('current', 110_000);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(cooldowns.ACTION_COOLDOWNS.has('old')).toBe(false);
    expect(cooldowns.ACTION_COOLDOWNS.has('current')).toBe(true);
  });
});
