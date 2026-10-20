import { GameEvents } from '@poker/shared';
import type { User } from '@prisma/client';
import { getSiteConfig } from '../../config/site-config';
import { toPublicRoom, toPublicUser } from './public-room';
import { isPendingRequestExpired } from './room-join.service';
import { withRoomLock } from './room-lock';
import {
  broadcastUserUpdate,
  currentBroadcaster,
  requireBroadcaster,
  revelationService,
} from './room-runtime';
import * as roomRepository from './room.repository';
import * as userRepository from './user.repository';
import { logger } from '../../platform/logger';

/** The target only when it exists in this room, which blocks cross-room requests. */
async function findMemberOfRoom(
  action: string,
  userId: string,
  roomId: string,
): Promise<User | null> {
  const target = await userRepository.findById(userId);
  if (target && target.roomId === roomId) return target;
  logger.warn(`${action}: user ${userId} not found in room ${roomId}`);
  return null;
}

export async function approveUser(userId: string, roomId: string): Promise<void> {
  await withRoomLock(roomId, async () => {
    const target = await findMemberOfRoom('approveUser', userId, roomId);
    if (!target) return;
    if (!target.isApproved && isPendingRequestExpired(target)) {
      logger.warn(`approveUser: request ${userId} in room ${roomId} expired`);
      return;
    }
    const maxUsers = getSiteConfig().limits.maxUsersPerRoom;
    if (!target.isApproved && (await userRepository.countByRoomId(roomId, true)) >= maxUsers)
      throw new Error(`Room is full (Max ${maxUsers} approved players)`);
    const user = await userRepository.update(userId, { isApproved: true });
    const targetSockets = (await requireBroadcaster().memberSockets(roomId)).filter(
      (socket) => socket.userId === userId,
    );
    for (const socket of targetSockets) socket.admitToRoom(roomId);
    await broadcastUserUpdate(roomId);

    // Pending sockets missed room-wide updates; send the current room state.
    const room = await roomRepository.findById(roomId);
    const remainingSeconds = revelationService().getRevelationRemainingSeconds(roomId);
    for (const socket of targetSockets) {
      socket.emit(GameEvents.USER_UPDATED, toPublicUser(user, true));
      if (!room) continue;
      socket.emit(GameEvents.ROOM_UPDATED, toPublicRoom(room));
      socket.emit(GameEvents.REVEAL_STATE, room.reveal);
      if (remainingSeconds !== null && remainingSeconds > 0)
        socket.emit(GameEvents.REVELATION_STARTED, {
          seconds: remainingSeconds,
        });
    }
  });
}

export async function denyUser(userId: string, roomId: string): Promise<void> {
  try {
    await withRoomLock(roomId, async () => {
      const target = await findMemberOfRoom('denyUser', userId, roomId);
      if (!target) return;
      if (target.isApproved) {
        logger.warn(`denyUser: user ${userId} is already approved in room ${roomId}`);
        return;
      }

      const broadcaster = currentBroadcaster();
      if (broadcaster) {
        const sockets = await broadcaster.memberSockets(roomId);
        for (const targetSocket of sockets.filter((socket) => socket.userId === userId)) {
          logger.log(`Notifying user ${userId} of denial via socket ${targetSocket.id}`);
          targetSocket.emit(
            GameEvents.ERROR,
            'Access Denied: Your request to join was denied by a room participant.',
          );
          targetSocket.disconnect();
        }
      }

      await userRepository.delete(userId);
      await broadcastUserUpdate(roomId);
    });
  } catch (err) {
    logger.error('Error in denyUser:', err);
  }
}
