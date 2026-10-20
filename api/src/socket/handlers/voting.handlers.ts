import { onMemberEvent } from '../member-event';
import { castVote } from '../../modules/rooms/voting';
import { GameEvents, SocketEvents, VoteSchema } from '@poker/shared';

import * as RoomService from '../../modules/rooms/room.service';

import { getAuthorizedData } from '../authorization';
import type { PokerSocket } from '../types';
import { logger } from '../../platform/logger';

/** Minimum time between one member's repeats of each action. */
const VOTE_COOLDOWN_MS = 500;
const REVEAL_COOLDOWN_MS = 1500;
const RESET_COOLDOWN_MS = 1500;

export function registerVotingHandlers(socket: PokerSocket): void {
  onMemberEvent(socket, SocketEvents.VOTE, async (payload: unknown) => {
    const auth = await getAuthorizedData(socket, VOTE_COOLDOWN_MS, SocketEvents.VOTE);
    if (!auth) return;
    const { userId, roomId } = auth;

    const validation = VoteSchema.safeParse(payload);
    if (!validation.success) {
      socket.emit(GameEvents.ERROR, validation.error.issues[0]?.message || 'Invalid payload');
      return;
    }
    const { vote } = validation.data;

    try {
      await castVote(roomId, userId, vote, RoomService);
    } catch (e) {
      logger.error('Error voting:', e);
    }
  });

  onMemberEvent(socket, SocketEvents.REVEAL, async () => {
    const auth = await getAuthorizedData(socket, REVEAL_COOLDOWN_MS, SocketEvents.REVEAL);
    if (!auth) return;
    const { roomId } = auth;

    await RoomService.startRevelation(roomId);
  });

  onMemberEvent(socket, SocketEvents.RESET, async () => {
    const auth = await getAuthorizedData(socket, RESET_COOLDOWN_MS, SocketEvents.RESET);
    if (!auth) return;
    const { roomId } = auth;

    try {
      await RoomService.resetRoom(roomId);
    } catch (e) {
      logger.error('Error resetting:', e);
    }
  });
}
