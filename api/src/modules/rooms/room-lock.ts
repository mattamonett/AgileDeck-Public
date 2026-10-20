const roomLocks = new Map<string, Promise<void>>();

/**
 * Runs `fn` after every earlier holder of this room's lock has finished, so
 * joins, approvals, reveals and cleanup for one room never interleave.
 */
export async function withRoomLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
  const previousLock = roomLocks.get(roomId) ?? Promise.resolve();

  // Register before awaiting so later callers queue behind this one.
  const { promise: thisLock, resolve: releaseLock } = Promise.withResolvers<void>();
  roomLocks.set(roomId, thisLock);

  await previousLock;
  try {
    return await fn();
  } finally {
    releaseLock();
    if (roomLocks.get(roomId) === thisLock) {
      roomLocks.delete(roomId);
    }
  }
}
