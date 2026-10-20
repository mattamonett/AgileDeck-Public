import {
  ThrowStatsRecorder,
  startThrowStats,
  throwStats,
  type AcceptedThrow,
} from '../../../src/modules/rooms/throw-stats';
import type { ThrowStatsEntry } from '../../../src/modules/rooms/room-stats.repository';

const persistMock = () =>
  jest.fn<Promise<void>, [readonly ThrowStatsEntry[]]>().mockResolvedValue();

const aliceAtBob: AcceptedThrow = {
  roomId: 'room',
  visitorId: 'alice',
  targetVisitorId: 'bob',
  kind: 'throw',
  character: '📄',
};

it('coalesces throws into one entry per room member without touching the database', async () => {
  const persist = persistMock();
  const recorder = new ThrowStatsRecorder(persist);
  for (let index = 0; index < 50; index++) recorder.record(aliceAtBob);
  recorder.record({ ...aliceAtBob, kind: 'barrage', character: '🚀' });
  recorder.record({ ...aliceAtBob, visitorId: 'bob', targetVisitorId: 'alice' });
  expect(persist).not.toHaveBeenCalled();
  await recorder.flush();
  expect(persist.mock.calls[0]?.[0]).toEqual([
    {
      roomId: 'room',
      visitorId: 'alice',
      sent: 51,
      received: 1,
      barrages: 1,
      characters: ['📄', '🚀'],
    },
    { roomId: 'room', visitorId: 'bob', sent: 1, received: 51, barrages: 0, characters: ['📄'] },
  ]);
  await recorder.flush();
  expect(persist).toHaveBeenCalledTimes(1);
});

it('bounds memory and batches, keeps counts when a flush fails, and drains', async () => {
  const persist = persistMock().mockRejectedValueOnce(new Error('offline'));
  const recorder = new ThrowStatsRecorder(persist);
  for (let index = 0; index < 1100; index++)
    recorder.record({ ...aliceAtBob, visitorId: `v${index}`, targetVisitorId: `t${index}` });
  recorder.record({ ...aliceAtBob, visitorId: 'v0', targetVisitorId: 't0' });
  await expect(recorder.flush()).rejects.toThrow('offline');
  await recorder.drain();
  const saved = persist.mock.calls.slice(1).flatMap(([batch]) => batch);
  expect(saved).toHaveLength(2000);
  expect(saved.reduce((sum, entry) => sum + entry.sent, 0)).toBe(1001);
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
  const recorder = new ThrowStatsRecorder(persist);
  recorder.record(aliceAtBob);
  const first = recorder.flush();
  await recorder.flush();
  await recorder.drain();
  expect(persist).toHaveBeenCalledTimes(1);
  release();
  await first;
});

it('flushes on a timer and logs failures', async () => {
  jest.useFakeTimers();
  const flush = jest.spyOn(throwStats, 'flush').mockRejectedValue(new Error('offline'));
  const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  startThrowStats();
  jest.advanceTimersByTime(10_000);
  await Promise.resolve();
  await Promise.resolve();
  expect(flush).toHaveBeenCalledTimes(1);
  expect(error).toHaveBeenCalled();
  flush.mockRestore();
  error.mockRestore();
  jest.useRealTimers();
});

it('waits for an in-flight flush, then forgets buffered counts for deleted data', async () => {
  const release = Promise.withResolvers<void>();
  const persist = persistMock().mockImplementationOnce(() => release.promise);
  const recorder = new ThrowStatsRecorder(persist);
  recorder.record(aliceAtBob);
  const flush = recorder.flush();
  recorder.record(aliceAtBob);
  recorder.record({ ...aliceAtBob, roomId: 'other' });
  let forgotten = false;
  const forget = recorder
    .forget((entry) => entry.visitorId === 'alice')
    .then(() => (forgotten = true));
  await Promise.resolve();
  expect(forgotten).toBe(false);
  release.resolve();
  await flush;
  await forget;
  await recorder.drain();
  expect(persist.mock.calls[1]?.[0]).toEqual([
    { roomId: 'room', visitorId: 'bob', sent: 0, received: 1, barrages: 0, characters: [] },
    { roomId: 'other', visitorId: 'bob', sent: 0, received: 1, barrages: 0, characters: [] },
  ]);
});
