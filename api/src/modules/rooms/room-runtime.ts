import { GameEvents } from '@poker/shared';
import { toPublicUser } from './public-room';
import { reconcileRoomUsers } from './reconcile-users';
import { createRevelationService } from './revelation';
import type { RoomBroadcaster } from './room-broadcaster';
import * as roomRepository from './room.repository';
import { createUserCleanupService } from './user-cleanup';
import * as userRepository from './user.repository';

type RevelationService = ReturnType<typeof createRevelationService>;
type UserCleanupService = ReturnType<typeof createUserCleanupService>;

let broadcaster: RoomBroadcaster | undefined;
let revelation: RevelationService;
let userCleanup: UserCleanupService;

/** Connects the room services to the sockets they notify. */
export function initRoomRuntime(roomBroadcaster: RoomBroadcaster): void {
  broadcaster = roomBroadcaster;
  revelation = createRevelationService(broadcaster, broadcastUserUpdate);
  userCleanup = createUserCleanupService(broadcaster, broadcastUserUpdate, (roomId) =>
    revelation.checkAutoReveal(roomId),
  );
}

export function currentBroadcaster(): RoomBroadcaster | undefined {
  return broadcaster;
}

export function requireBroadcaster(): RoomBroadcaster {
  if (!broadcaster) throw new Error('RoomService not initialized with IO');
  return broadcaster;
}

export function revelationService(): RevelationService {
  return revelation;
}

export function userCleanupService(): UserCleanupService {
  return userCleanup;
}

export async function broadcastUserUpdate(roomId: string): Promise<void> {
  const room = await roomRepository.findById(roomId);
  if (!room) return;

  await reconcileRoomUsers(broadcaster, roomId);
  const users = await userRepository.findByRoomId(roomId);

  // Each member sees their own vote, but nobody else's until the reveal.
  const sockets = await requireBroadcaster().memberSockets(roomId);
  for (const s of sockets) {
    const socketUser = users.find((u) => u.id === s.userId);
    if (!socketUser?.isApproved) {
      if (socketUser) {
        s.emit(GameEvents.UPDATE_USERS, [
          toPublicUser(socketUser, room.reveal || socketUser.id === s.userId),
        ]);
      }
      continue;
    }

    const publicUsers = users.map((u) => toPublicUser(u, room.reveal || u.id === s.userId));
    s.emit(GameEvents.UPDATE_USERS, publicUsers);
  }
}
