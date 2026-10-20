import cron from 'node-cron';
import { cleanupInactiveRecords, type RoomActivityCheck } from './cleanup.service';
import { logger } from '../../platform/logger';

const DAILY_AT_MIDNIGHT = '0 0 * * *';

/** Purges inactive rooms (older than limits.inactiveRoomDays) once a day. */
export function startCleanupJob(isRoomActive: RoomActivityCheck = () => false): void {
  cron.schedule(DAILY_AT_MIDNIGHT, async () => {
    try {
      logger.log('Running Daily DB Cleanup...');
      const deletedRooms = await cleanupInactiveRecords(new Date(), isRoomActive);

      logger.log(`Cleanup complete: Removed ${deletedRooms} inactive rooms.`);
    } catch (error) {
      logger.error('Daily DB cleanup failed:', error);
    }
  });
}
