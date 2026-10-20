import { GameEvents } from '@poker/shared';
import { broadcastUserUpdate } from '../rooms/room.service';
import type { MemberSocket, RoomBroadcaster } from '../rooms/room-broadcaster';
import { withDeletionFence } from '../../platform/concurrency/deletion-context';
import { ACTION_COOLDOWNS } from '../../platform/concurrency/action-cooldowns';
import { JOIN_BUDGET } from '../../socket/rate-limits';
import { pendingRevealTimers, pendingReveals } from '../rooms/revelation-state';
import { withRoomLock } from '../rooms/room-lock';
import { rateLimitRecorder } from '../telemetry/rate-limit-telemetry';
import { throwStats } from '../rooms/throw-stats';
import { clearUserThrowPenalty } from '../interactions/throw-penalty.service';
import { deleteMemberRecords, deleteRoomRecords, memberRoomIds } from './admin-deletion.repository';
import { resolveMemberReference } from './member-reference';

let members: RoomBroadcaster | undefined;
/** Called by the socket layer once the server exists. */
export function configureAdminDeletion(broadcaster: RoomBroadcaster): void {
  members = broadcaster;
}
function eject(socket: MemberSocket, message: string): void {
  socket.emit(GameEvents.ERROR, message);
  socket.disconnect();
}
function clearUserRuntime(userIds: readonly string[]): void {
  const ids = new Set(userIds);
  for (const key of ACTION_COOLDOWNS.keys())
    if (ids.has(key.split(':')[0] ?? '')) ACTION_COOLDOWNS.delete(key);
  for (const id of ids) clearUserThrowPenalty(id);
}
function clearRoomTimer(id: string): void {
  const timer = pendingRevealTimers.get(id);
  if (timer) clearTimeout(timer.timer);
  pendingRevealTimers.delete(id);
  pendingReveals.delete(id);
}
async function lockRooms<T>(ids: readonly string[], work: () => Promise<T>): Promise<T> {
  const [first, ...rest] = ids;
  return first ? withRoomLock(first, () => lockRooms(rest, work)) : work();
}
export async function deleteAdminRoom(
  id: string,
  name: string | null,
  approvedMemberCount: number,
): Promise<void> {
  await withDeletionFence('room', id, () =>
    withRoomLock(id, async () => {
      const connected = (await members?.allSockets()) ?? [];
      await throwStats.forget((entry) => entry.roomId === id);
      const userIds = await deleteRoomRecords(id, name, approvedMemberCount);
      clearRoomTimer(id);
      JOIN_BUDGET.forget((key) => key.endsWith(':' + id));
      clearUserRuntime(userIds);
      for (const socket of connected)
        if (socket.roomId === id) eject(socket, 'This room was deleted by an administrator.');
    }),
  );
}
export async function deleteAdminMember(
  roomId: string,
  reference: string,
  name: string | null,
): Promise<void> {
  const visitorId = resolveMemberReference(roomId, reference);
  await withDeletionFence('visitor', visitorId, async () => {
    const roomIds = await memberRoomIds(visitorId);
    await lockRooms(roomIds, async () => {
      const connected = (await members?.allSockets()) ?? [];
      await rateLimitRecorder.forget(visitorId);
      await throwStats.forget((entry) => entry.visitorId === visitorId);
      const deleted = await deleteMemberRecords(roomId, visitorId, name);
      clearUserRuntime(deleted.userIds);
      JOIN_BUDGET.forget((key) => key.startsWith(visitorId + ':'));
      for (const socket of connected) {
        if (socket.visitorId === visitorId) {
          eject(socket, 'Your stored user data was deleted by an administrator.');
        } else if (socket.roomId && deleted.roomIds.includes(socket.roomId)) {
          socket.emit(GameEvents.REVEAL_RESULTS, '[]');
        }
      }
      if (members) for (const id of deleted.roomIds) await broadcastUserUpdate(id);
    });
  });
}
