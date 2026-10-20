import {
  UsageRecorder,
  recordThrowableUsage,
  usageRecorder,
} from '../../../src/modules/telemetry/usage-telemetry';
import {
  usageCutoff,
  type UsageBatchEntry,
} from '../../../src/modules/telemetry/usage-stats.repository';

import { setSiteConfig } from '../../../src/config/site-config';

afterEach(() => setSiteConfig());

const persistMock = () =>
  jest.fn<Promise<void>, [readonly UsageBatchEntry[]]>().mockResolvedValue();

it('coalesces events into one row per day and metric without touching the database', async () => {
  const persist = persistMock();
  const recorder = new UsageRecorder(persist);
  const today = new Date('2026-10-09T12:00:00.000Z');
  for (let index = 0; index < 500; index++) recorder.record('round.revealed.auto', today);
  recorder.record('round.revealed.auto', new Date('2026-10-10T00:00:01.000Z'));
  recorder.record('throwable:📄', today);
  expect(persist).not.toHaveBeenCalled();
  await recorder.flush();
  expect(persist.mock.calls[0]?.[0]).toEqual([
    { day: '2026-10-09', metric: 'round.revealed.auto', count: 500 },
    { day: '2026-10-10', metric: 'round.revealed.auto', count: 1 },
    { day: '2026-10-09', metric: 'throwable:📄', count: 1 },
  ]);
  await recorder.flush();
  expect(persist.mock.calls[1]?.[0]).toEqual([]);
});

it('bounds memory and batches, and keeps counts when a flush fails', async () => {
  const persist = persistMock().mockRejectedValueOnce(new Error('offline'));
  const recorder = new UsageRecorder(persist);
  const start = Date.parse('2020-01-01T00:00:00.000Z');
  for (let index = 0; index < 2100; index++)
    recorder.record('nudge.single', new Date(start + index * 86_400_000));
  recorder.record('nudge.single', new Date(start));
  await expect(recorder.flush()).rejects.toThrow('offline');
  for (let index = 0; index < 20; index++) await recorder.flush();
  const saved = persist.mock.calls.slice(1).flatMap(([batch]) => batch);
  expect(saved).toHaveLength(2000);
  expect(saved.reduce((sum, entry) => sum + entry.count, 0)).toBe(2001);
  expect(persist.mock.calls.every(([batch]) => batch.length <= 200)).toBe(true);
});

it('does not run overlapping flushes', async () => {
  let release = () => {};
  const persist = persistMock().mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const recorder = new UsageRecorder(persist);
  recorder.record('throw.single');
  const first = recorder.flush();
  await recorder.flush();
  expect(persist).toHaveBeenCalledTimes(1);
  release();
  await first;
});

it('only counts throwables the app offers', () => {
  const record = jest.spyOn(usageRecorder, 'record').mockImplementation(() => undefined);
  recordThrowableUsage('📄');
  recordThrowableUsage('not-a-throwable');
  expect(record.mock.calls).toEqual([['throwable:📄']]);
  record.mockRestore();
});

it('includes today in a usage window', () => {
  const now = new Date('2026-10-09T23:59:59.000Z');
  expect(usageCutoff(1, now)).toBe('2026-10-09');
  expect(usageCutoff(7, now)).toBe('2026-10-03');
  expect(usageCutoff(30, now)).toBe('2026-09-10');
});

it('records nothing while usage stats are turned off', async () => {
  setSiteConfig({ features: { usageStats: false } });
  const persist = persistMock();
  const recorder = new UsageRecorder(persist);
  recorder.record('round.reset');
  await recorder.flush();
  expect(persist).toHaveBeenCalledWith([]);
  setSiteConfig();
  recorder.record('round.reset');
  await recorder.flush();
  expect(persist).toHaveBeenLastCalledWith([
    expect.objectContaining({ metric: 'round.reset', count: 1 }),
  ]);
});
