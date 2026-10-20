import { getSiteConfig } from '../../config/site-config';
import {
  DeletionConflictError,
  withDeletionFence,
} from '../../platform/concurrency/deletion-context';
import { withRoomLock } from '../rooms/room-lock';
import { rateLimitCutoff } from '../telemetry/rate-limit-stats.repository';
import { deleteExpiredUsage } from '../telemetry/usage-stats.repository';
import * as cleanupRepository from './cleanup.repository';

/** True while any socket is still subscribed to the room. */
export type RoomActivityCheck = (roomId: string) => boolean;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes each stale room under its room lock and deletion fence, like an
 * administrative deletion, so in-flight joins and writes cannot race it.
 */
async function deleteInactiveRooms(
  oldDate: Date,
  isRoomActive: RoomActivityCheck,
): Promise<number> {
  const stale = await cleanupRepository.findRoomIdsUntouchedSince(oldDate);
  let deleted = 0;
  for (const id of stale) {
    try {
      deleted += await withRoomLock(id, async () => {
        if (isRoomActive(id)) return 0;
        return withDeletionFence('room', id, () =>
          // The age check repeats inside the lock; a join may have touched it.
          cleanupRepository.deleteRoomIfUntouchedSince(id, oldDate),
        );
      });
    } catch (error) {
      // An administrator is already deleting this room.
      if (!(error instanceof DeletionConflictError)) throw error;
    }
  }
  return deleted;
}

export async function cleanupInactiveRecords(
  now = new Date(),
  isRoomActive: RoomActivityCheck = () => false,
): Promise<number> {
  // Rooms untouched for limits.inactiveRoomDays are purged, and agreement and
  // feedback-access records no longer linked to a room or feedback follow them.
  const days = getSiteConfig().limits.inactiveRoomDays;
  const oldDate = new Date(now.getTime() - days * DAY_MS);
  const deletedRooms = await deleteInactiveRooms(oldDate, isRoomActive);
  await cleanupRepository.deleteRateLimitDaysBefore(rateLimitCutoff(now));
  await cleanupRepository.deleteExpiredAbuseQuotas(now);
  await deleteExpiredUsage(now);
  await cleanupRepository.deleteUnlinkedAgreements(oldDate);
  await cleanupRepository.deleteUnlinkedFeedbackAccess(oldDate);
  return deletedRooms;
}
