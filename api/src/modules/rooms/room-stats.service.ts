import { VALID_INTERACTION_CHARACTERS } from '@poker/shared';
import { findThrowTarget } from './room-stats.repository';
import { throwStats } from './throw-stats';

/** Room statistics for the stats page and the interactions that feed it. */
export { readRoomStats } from './room-stats.repository';

/** Checks an accepted throw against the database and buffers its stats. */
export async function recordInteraction(
  roomId: string,
  userId: string,
  visitorId: string | null,
  kind: 'throw' | 'barrage',
  targetUserId?: string,
  character = '📄',
): Promise<boolean> {
  if (!visitorId || !targetUserId || !VALID_INTERACTION_CHARACTERS.has(character)) return false;
  const targetVisitorId = await findThrowTarget(roomId, userId, visitorId, targetUserId);
  if (!targetVisitorId) return false;
  throwStats.record({ roomId, visitorId, targetVisitorId, kind, character });
  return true;
}
