import {
  DeletionConflictError,
  LeaseCapacityError,
  assertDeletionContext,
  withDeletionFence,
  withMemberContext,
} from '../../../src/platform/concurrency/deletion-context';

const MAX_SCOPES = 10_000;

describe('deletion leases', () => {
  it('does not invalidate in-flight work when unrelated keys fill the map', async () => {
    const release = Promise.withResolvers<void>();
    const inFlight = withMemberContext('busy-visitor', 'busy-room', async () => {
      await release.promise;
      assertDeletionContext();
      return 'committed';
    });

    for (let i = 0; i < MAX_SCOPES * 2; i++) withMemberContext(null, `junk-${i}`, () => undefined);

    release.resolve();
    await expect(inFlight).resolves.toBe('committed');
  });

  it('refuses new work instead of evicting when every lease is busy', async () => {
    const release = Promise.withResolvers<void>();
    const held = Array.from({ length: MAX_SCOPES }, (_, i) =>
      withMemberContext(null, `held-${i}`, () => release.promise),
    );

    expect(() => withMemberContext(null, 'one-more', () => undefined)).toThrow(LeaseCapacityError);

    release.resolve();
    await Promise.all(held);
    expect(withMemberContext(null, 'one-more', () => 'ok')).toBe('ok');
  });

  it('still invalidates in-flight work when its room is deleted', async () => {
    const release = Promise.withResolvers<void>();
    const inFlight = withMemberContext(null, 'deleted-room', async () => {
      await release.promise;
      assertDeletionContext();
    });

    await withDeletionFence('room', 'deleted-room', async () => undefined);
    release.resolve();
    await expect(inFlight).rejects.toThrow(DeletionConflictError);
  });
});
