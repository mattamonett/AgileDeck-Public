import { DISCONNECT_GRACE_PERIOD_MS, REVELATION_DELAY_MS } from '../../src/room/timing';

describe('room timing', () => {
  it('exposes basic room settings', () => {
    expect(REVELATION_DELAY_MS).toBe(3000);
    expect(DISCONNECT_GRACE_PERIOD_MS).toBe(120_000);
  });
});
