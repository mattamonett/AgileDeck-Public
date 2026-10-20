import {
  clearThrowPenalties,
  getThrowOverheat,
  recordRejectedThrow,
} from '../../../src/modules/interactions/throw-penalty.service';

describe('throw overheating', () => {
  beforeEach(() => {
    clearThrowPenalties();
    jest.useFakeTimers().setSystemTime(10000);
  });
  afterEach(() => jest.useRealTimers());
  const trigger = (userId = 'user-1') => {
    for (let i = 0; i < 19; i++) expect(recordRejectedThrow(userId)).toBe(false);
    expect(recordRejectedThrow(userId)).toBe(true);
  };

  it('allows occasional rejects and uses a rolling five-second window', () => {
    for (let i = 0; i < 19; i++) recordRejectedThrow('user-1');
    expect(getThrowOverheat('user-1')).toBeUndefined();
    jest.setSystemTime(15000);
    expect(recordRejectedThrow('user-1')).toBe(false);
    expect(getThrowOverheat('user-1')).toBeUndefined();
  });

  it('escalates 5/15/60 seconds, caps at 60, and ignores requests during penalties', () => {
    for (const duration of [5000, 15000, 60000, 60000]) {
      const start = Date.now();
      trigger();
      expect(getThrowOverheat('user-1')).toEqual({
        startedAt: start,
        until: start + duration,
      });
      jest.setSystemTime(start + duration - 1);
      for (let i = 0; i < 100; i++) expect(recordRejectedThrow('user-1')).toBe(false);
      expect(getThrowOverheat('user-1')?.until).toBe(start + duration);
      jest.setSystemTime(start + duration);
      expect(getThrowOverheat('user-1')).toBeUndefined();
    }
  });

  it('isolates users and resets escalation after two minutes without a penalty', () => {
    trigger();
    expect(getThrowOverheat('user-2')).toBeUndefined();
    jest.setSystemTime(130000);
    trigger();
    expect(getThrowOverheat('user-1')?.until).toBe(135000);
  });
});
