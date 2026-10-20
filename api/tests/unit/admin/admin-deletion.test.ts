import {
  assertDeletionContext,
  withDeletionFence,
  withMemberContext,
  DeletionConflictError,
} from '../../../src/platform/concurrency/deletion-context';
import {
  memberReference,
  resolveMemberReference,
} from '../../../src/modules/admin/member-reference';
import { RateLimitRecorder } from '../../../src/modules/telemetry/rate-limit-telemetry';

it('invalidates in-flight work and rejects new work during deletion, while allowing fresh activity afterwards', async () => {
  const release = Promise.withResolvers<void>();
  const arrived = Promise.withResolvers<void>();
  const pending = withMemberContext('visitor', 'room', async () => {
    arrived.resolve();
    await release.promise;
    assertDeletionContext();
  });
  await arrived.promise;
  await withDeletionFence('visitor', 'visitor', async () => {
    expect(() => withMemberContext('visitor', 'other', assertDeletionContext)).toThrow(
      DeletionConflictError,
    );
    expect(() => withMemberContext('other', 'room', assertDeletionContext)).not.toThrow();
  });
  const rejection = expect(pending).rejects.toThrow(DeletionConflictError);
  release.resolve();
  await rejection;
  expect(() => withMemberContext('visitor', 'room', assertDeletionContext)).not.toThrow();
});

it('blocks every member of a deleted room and releases the fence after a failure', async () => {
  await expect(
    withDeletionFence('room', 'room-fail', async () => {
      expect(() => withMemberContext('any-user', 'room-fail', assertDeletionContext)).toThrow(
        DeletionConflictError,
      );
      throw new Error('transaction failed');
    }),
  ).rejects.toThrow('transaction failed');
  expect(() => withMemberContext('any-user', 'room-fail', assertDeletionContext)).not.toThrow();
});

it('binds authenticated opaque references to their room and expiration', () => {
  const reference = memberReference('room', 'private-visitor');
  expect(reference).not.toContain('private-visitor');
  expect(resolveMemberReference('room', reference)).toBe('private-visitor');
  expect(() => resolveMemberReference('another-room', reference)).toThrow();
  expect(() => resolveMemberReference('room', reference.slice(0, -4) + 'AAAA')).toThrow();
  const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 61 * 60_000);
  try {
    expect(() => resolveMemberReference('room', reference)).toThrow();
  } finally {
    now.mockRestore();
  }
});

it('waits for a telemetry write then forgets buffered hits before deletion', async () => {
  const release = Promise.withResolvers<void>();
  const persist = jest
    .fn()
    .mockImplementationOnce(() => release.promise)
    .mockResolvedValue(undefined);
  const recorder = new RateLimitRecorder(persist);
  recorder.record('deleted-visitor');
  const flush = recorder.flush();
  recorder.record('deleted-visitor');
  await withDeletionFence('visitor', 'deleted-visitor', async () => {
    const forget = recorder.forget('deleted-visitor');
    recorder.record('deleted-visitor');
    release.resolve();
    await flush;
    await forget;
  });
  await recorder.flush();
  expect(persist.mock.calls[1]?.[0]).toEqual([]);
});
