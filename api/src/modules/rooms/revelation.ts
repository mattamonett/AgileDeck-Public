import { revealWithStats } from './room-stats.repository';
import { GameEvents, REVELATION_DELAY_MS } from '@poker/shared';
import { pendingReveals, pendingRevealTimers } from './revelation-state';
import { withRoomLock } from './room-lock';
import prisma from '../../platform/db/prisma';
import * as roomRepository from './room.repository';
import * as userRepository from './user.repository';
import type { RoomBroadcaster } from './room-broadcaster';
import { toPublicRoom } from './public-room';
import { recordUsage } from '../telemetry/usage-telemetry';
import { logger } from '../../platform/logger';

export type RevealSource = 'manual' | 'auto';

/** Coordinates one round's reservation, countdown, snapshot, and reset. */
export function createRevelationService(
  broadcaster: RoomBroadcaster,
  broadcastUserUpdate: (roomId: string) => Promise<void>,
) {
  const reservations = new Map<string, symbol>();
  async function resetRoom(roomId: string): Promise<void> {
    await withRoomLock(roomId, async () => {
      reservations.delete(roomId);
      pendingReveals.delete(roomId);
      // Cancel the active revelation timer if one exists, preventing it from
      // firing after the round has already been reset.
      const timerEntry = pendingRevealTimers.get(roomId);
      if (timerEntry) {
        clearTimeout(timerEntry.timer);
        pendingRevealTimers.delete(roomId);
      }

      await prisma.$transaction([
        prisma.room.update({
          where: { id: roomId },
          data: {
            reveal: false,
            resultSnapshot: null,
            roundNumber: { increment: 1 },
            roundStartedAt: new Date(),
            roundRevealedAt: null,
          },
        }),
        prisma.user.updateMany({ where: { roomId }, data: { vote: null } }),
      ]);
      recordUsage('round.reset');

      await broadcastUserUpdate(roomId);
      broadcaster.emitToRoom(roomId, GameEvents.REVEAL_STATE, false);
      broadcaster.emitToRoom(roomId, GameEvents.RESET);
    });
  }

  async function startRevelation(roomId: string, source: RevealSource = 'manual'): Promise<void> {
    if (!broadcaster) throw new Error('RoomService not initialized with IO');
    if (!roomId || pendingReveals.has(roomId)) return;

    const reservation = Symbol('revelation');
    reservations.set(roomId, reservation);
    pendingReveals.add(roomId);
    try {
      const room = await roomRepository.findById(roomId);
      if (reservations.get(roomId) !== reservation) return;
      if (!room || room.reveal) {
        pendingReveals.delete(roomId);
        reservations.delete(roomId);
        return;
      }

      broadcaster.emitToRoom(roomId, GameEvents.REVELATION_STARTED, {
        seconds: REVELATION_DELAY_MS / 1000,
      });
      logger.log(`Starting revelation countdown for room ${roomId}`);

      const timer = setTimeout(() => {
        void withRoomLock(roomId, async () => {
          try {
            if (reservations.get(roomId) !== reservation) return;
            pendingRevealTimers.delete(roomId);
            // If the room is no longer in pendingReveals, it means it was reset
            if (!pendingReveals.has(roomId)) return;
            const revealed = await revealWithStats(roomId);
            if (!revealed) return;
            const { room: updatedRoom, users, snapshot } = revealed;
            recordUsage(source === 'auto' ? 'round.revealed.auto' : 'round.revealed.manual');

            broadcaster.emitToRoom(roomId, GameEvents.REVEAL_STATE, true);
            broadcaster.emitToRoom(roomId, GameEvents.ROOM_UPDATED, toPublicRoom(updatedRoom));
            const approvedIds = new Set(
              users.filter((user) => user.isApproved).map((user) => user.id),
            );
            const sockets = await broadcaster.approvedSockets(roomId);
            for (const socket of sockets) {
              if (socket.userId && approvedIds.has(socket.userId)) {
                socket.emit(GameEvents.REVEAL_RESULTS, snapshot);
              }
            }

            await broadcastUserUpdate(roomId);

            logger.log(`Revealed room ${roomId} after countdown with snapshot`);
          } catch (err) {
            logger.error('Error in revelation timeout:', err);
          } finally {
            if (reservations.get(roomId) === reservation) {
              reservations.delete(roomId);
              pendingReveals.delete(roomId);
            }
          }
        });
      }, REVELATION_DELAY_MS);

      pendingRevealTimers.set(roomId, { timer, startedAt: Date.now() });
    } catch (e) {
      logger.error('Error starting revelation:', e);
      if (reservations.get(roomId) === reservation) {
        reservations.delete(roomId);
        pendingReveals.delete(roomId);
      }
    }
  }

  /**
   * Returns the remaining seconds in an active revelation countdown, or null
   * if no countdown is active. Used to sync reconnecting clients.
   */
  function getRevelationRemainingSeconds(roomId: string): number | null {
    const entry = pendingRevealTimers.get(roomId);
    if (!entry) return null;
    const elapsed = Date.now() - entry.startedAt;
    const remaining = Math.max(0, REVELATION_DELAY_MS - elapsed) / 1000;
    return remaining;
  }

  async function checkAutoReveal(roomId: string): Promise<void> {
    if (!roomId) return;
    try {
      const room = await roomRepository.findById(roomId);
      if (!room || !room.autoReveal || room.reveal || pendingReveals.has(roomId)) return;

      const users = await userRepository.findByRoomId(roomId);
      const players = users.filter((u) => !u.isObserver && u.isApproved);

      if (players.length === 0) return;

      const allVoted = players.every((u) => u.vote && u.vote.trim() !== '');
      if (allVoted) {
        await startRevelation(roomId, 'auto');
      }
    } catch (e) {
      logger.error('Error checking auto-reveal:', e);
    }
  }

  return {
    resetRoom,
    startRevelation,
    checkAutoReveal,
    getRevelationRemainingSeconds,
  };
}
