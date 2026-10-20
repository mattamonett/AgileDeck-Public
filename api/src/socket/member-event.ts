import { GameEvents, JoinRoomSchema, SocketEvents } from '@poker/shared';
import {
  DeletionConflictError,
  LeaseCapacityError,
  withMemberContext,
} from '../platform/concurrency/deletion-context';
import type { PokerSocket } from './types';

export function onMemberEvent(
  socket: PokerSocket,
  event: SocketEvents,
  handler: (payload: unknown) => Promise<void>,
): void {
  socket.on(event, async (payload: unknown) => {
    const join = event === SocketEvents.JOIN_ROOM ? JoinRoomSchema.safeParse(payload) : null;
    const roomId = join?.success ? join.data.roomId.toLowerCase() : socket.data.roomId;
    try {
      if (socket.disconnected) return;
      await withMemberContext(socket.data.visitorId, roomId, () => handler(payload));
    } catch (error) {
      if (error instanceof DeletionConflictError || error instanceof LeaseCapacityError)
        socket.emit(GameEvents.ERROR, error.message);
      else throw error;
    }
  });
}
