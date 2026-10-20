import { DISCONNECT_GRACE_PERIOD_MS } from '@poker/shared';
import type { RoomBroadcaster } from './room-broadcaster';
import { withRoomLock } from './room-lock';
import prisma from '../../platform/db/prisma';
import * as userRepository from './user.repository';
import { logger } from '../../platform/logger';

/** Retains membership across reconnects and ignores superseded cleanup timers. */
export function createUserCleanupService(
  broadcaster: RoomBroadcaster,
  broadcastUserUpdate: (roomId: string) => Promise<void>,
  checkAutoReveal: (roomId: string) => Promise<void>,
) {
  interface PendingUserCleanup {
    readonly timer: ReturnType<typeof setTimeout>;
    readonly token: symbol;
  }

  const pendingUserCleanups = new Map<string, PendingUserCleanup>();

  function getUserCleanupKey(userId: string, roomId: string): string {
    return `${roomId}:${userId}`;
  }

  function cancelPendingUserCleanup(userId: string, roomId: string): void {
    const key = getUserCleanupKey(userId, roomId);
    const pending = pendingUserCleanups.get(key);
    if (!pending) return;

    clearTimeout(pending.timer);
    pendingUserCleanups.delete(key);
  }

  async function cleanupUser(
    userId: string | null,
    roomId: string | null,
    currentSocketId: string,
    immediate = false,
  ): Promise<void> {
    if (!broadcaster) throw new Error('RoomService not initialized with IO');
    if (!userId || !roomId) return;

    const cleanupKey = getUserCleanupKey(userId, roomId);

    const performCleanup = async (expectedToken?: symbol) => {
      try {
        await withRoomLock(roomId, async () => {
          if (expectedToken) {
            const pending = pendingUserCleanups.get(cleanupKey);
            if (pending?.token !== expectedToken) return;
            pendingUserCleanups.delete(cleanupKey);
          }

          const allSockets = await broadcaster.allSockets();
          const stillInRoom = allSockets.some(
            (s) => s.id !== currentSocketId && s.userId === userId && s.roomId === roomId,
          );

          if (stillInRoom) {
            logger.log(`User ${userId} reconnected or still has other sockets. Skipping cleanup.`);
            return;
          }

          logger.log(`Cleaning up user ${userId} in room ${roomId}.`);

          await prisma.$transaction(async (tx) => {
            try {
              await tx.user.delete({ where: { id: userId } });
            } catch {
              // User might already be gone
            }
          });

          const remainingAfter = await userRepository.findByRoomId(roomId);
          if (remainingAfter.length > 0) {
            await broadcastUserUpdate(roomId);
            await checkAutoReveal(roomId);
          }
        });
      } catch (e) {
        logger.error('Error during cleanup:', e);
      }
    };

    if (immediate) {
      cancelPendingUserCleanup(userId, roomId);
      await performCleanup();
    } else {
      cancelPendingUserCleanup(userId, roomId);
      logger.log(
        `User ${userId} disconnected. Waiting ${DISCONNECT_GRACE_PERIOD_MS}ms before cleanup.`,
      );
      const token = Symbol('pending-user-cleanup');
      const timer = setTimeout(() => {
        void performCleanup(token);
      }, DISCONNECT_GRACE_PERIOD_MS);
      timer.unref();
      pendingUserCleanups.set(cleanupKey, { timer, token });
    }
  }

  return { cleanupUser, cancelPendingUserCleanup };
}
