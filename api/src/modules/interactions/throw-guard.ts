import { checkRateLimit } from '../../platform/concurrency/action-cooldowns';
import { WindowBudget } from '../../platform/concurrency/window-budget';
import { broadcastUserUpdate } from '../rooms/room.service';
import { recordRateLimitHit } from '../telemetry/rate-limit-telemetry';
import { getThrowOverheat, recordRejectedThrow } from './throw-penalty.service';

// Each accepted throw writes stats and fans out to the room. Per-player limits do
// not bound a room of puppet identities, so cap rooms and the whole server too.
const ROOM_THROWS_PER_SECOND = 40;
const GLOBAL_THROWS_PER_SECOND = 200;
const MAX_TRACKED_ROOMS = 1_000;
const roomThrows = new WindowBudget(ROOM_THROWS_PER_SECOND, 1_000, MAX_TRACKED_ROOMS);
const globalThrows = new WindowBudget(GLOBAL_THROWS_PER_SECOND, 1_000, 1);

/** Shared budgets are not the sender's fault, so they never add overheat. */
function consumeThrowBudget(roomId: string): boolean {
  return roomThrows.consume(roomId) && globalThrows.consume('all');
}

export interface ThrowRequest {
  readonly userId: string;
  readonly roomId: string;
  readonly visitorId: string | null;
  /** Whether the thrower is still an approved member of the room. */
  readonly isMember: () => Promise<boolean>;
}

/**
 * Decides whether a throw may go out. Throwing faster than `limitMs` overheats
 * the thrower, and the room sees the penalty once.
 */
export async function admitThrow(
  request: ThrowRequest,
  limitMs: number,
  action: string,
): Promise<boolean> {
  const { userId, roomId, visitorId } = request;
  if (getThrowOverheat(userId)) {
    recordRateLimitHit(visitorId);
    return false;
  }
  if (!checkRateLimit(`${userId}:${action}`, limitMs)) {
    recordRateLimitHit(visitorId);
    // Set the penalty synchronously so simultaneous requests cannot broadcast it twice.
    if (recordRejectedThrow(userId) && (await request.isMember())) {
      await broadcastUserUpdate(roomId);
    }
    return false;
  }
  if (!(await request.isMember()) || getThrowOverheat(userId)) return false;
  if (!consumeThrowBudget(roomId)) {
    recordRateLimitHit(visitorId);
    return false;
  }
  return true;
}
