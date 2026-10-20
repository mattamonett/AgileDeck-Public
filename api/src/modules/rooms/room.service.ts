import type { RoomBroadcaster } from './room-broadcaster';
import { pendingReveals } from './revelation-state';
import {
  initRoomRuntime,
  requireBroadcaster,
  revelationService,
  userCleanupService,
} from './room-runtime';

export { toPublicUser, toPublicRoom } from './public-room';
export {
  JoinRejectedError,
  SiteAgreementRequiredError,
  SitePasswordRequiredError,
} from './room-errors';
export { joinRoom, MAX_PENDING_REQUESTS, PENDING_REQUEST_TTL_MS } from './room-join.service';
export { approveUser, denyUser } from './room-approval.service';
export { toggleAutoReveal, updateRoom } from './room-settings.service';
export { broadcastUserUpdate } from './room-runtime';

export const init = (roomBroadcaster: RoomBroadcaster) => initRoomRuntime(roomBroadcaster);

export const resetRoom = (roomId: string) => revelationService().resetRoom(roomId);
export async function startRevelation(roomId: string): Promise<void> {
  requireBroadcaster();
  await revelationService().startRevelation(roomId);
}
export const checkAutoReveal = (roomId: string) => revelationService().checkAutoReveal(roomId);
export const getRevelationRemainingSeconds = (roomId: string) =>
  revelationService().getRevelationRemainingSeconds(roomId);
export const isRevealPending = (roomId: string) => pendingReveals.has(roomId);

export async function cleanupUser(
  userId: string | null,
  roomId: string | null,
  currentSocketId: string,
  immediate = false,
): Promise<void> {
  requireBroadcaster();
  await userCleanupService().cleanupUser(userId, roomId, currentSocketId, immediate);
}
