import { onMemberEvent } from '../member-event';
import { withRoomLock } from '../../modules/rooms/room-lock';
import { recordUsage } from '../../modules/telemetry/usage-telemetry';
import {
  GameEvents,
  NAME_TAKEN_MESSAGE,
  SocketEvents,
  UpdateUserSchema,
  ToggleObserverSchema,
  ApproveUserSchema,
  DenyUserSchema,
} from '@poker/shared';
import { sanitize } from '../sanitize';
import * as RoomService from '../../modules/rooms/room.service';
import * as memberService from '../../modules/rooms/member.service';
import { isNameTaken } from '../../modules/rooms/room-lookup.service';

import { getAuthorizedData } from '../authorization';
import type { PokerSocket } from '../types';
import { logger } from '../../platform/logger';

/** Minimum time between one member's repeats of each action. */
const UPDATE_USER_COOLDOWN_MS = 500;
const TOGGLE_OBSERVER_COOLDOWN_MS = 500;
const APPROVE_USER_COOLDOWN_MS = 1000;
const DENY_USER_COOLDOWN_MS = 1000;

export function registerMembershipHandlers(socket: PokerSocket): void {
  onMemberEvent(socket, SocketEvents.UPDATE_USER, async (payload: unknown) => {
    const auth = await getAuthorizedData(socket, UPDATE_USER_COOLDOWN_MS, SocketEvents.UPDATE_USER);
    if (!auth) return;
    const { userId, roomId, visitorId } = auth;
    if (!visitorId) return;

    const validation = UpdateUserSchema.safeParse(payload);
    if (!validation.success) {
      socket.emit(GameEvents.ERROR, validation.error.issues[0]?.message || 'Invalid payload');
      return;
    }
    const { name } = validation.data;

    if (!name?.trim()) return;
    const sanitizedName = sanitize(name, 20);
    if (!sanitizedName) return;

    try {
      // The room lock keeps a concurrent join from claiming the same name.
      await withRoomLock(roomId, async () => {
        if (await isNameTaken(roomId, sanitizedName, visitorId)) {
          socket.emit(GameEvents.ERROR, NAME_TAKEN_MESSAGE);
          return;
        }
        const user = await memberService.updateName(userId, sanitizedName);
        await RoomService.broadcastUserUpdate(roomId);
        socket.emit(GameEvents.USER_UPDATED, RoomService.toPublicUser(user, true));
      });
    } catch (e) {
      logger.error('Error updating user:', e);
    }
  });

  onMemberEvent(socket, SocketEvents.TOGGLE_OBSERVER, async (payload: unknown) => {
    const auth = await getAuthorizedData(
      socket,
      TOGGLE_OBSERVER_COOLDOWN_MS,
      SocketEvents.TOGGLE_OBSERVER,
    );
    if (!auth) return;
    const { userId, roomId } = auth;

    const validation = ToggleObserverSchema.safeParse(payload);
    if (!validation.success) {
      socket.emit(GameEvents.ERROR, validation.error.issues[0]?.message || 'Invalid payload');
      return;
    }
    const { isObserver } = validation.data;

    try {
      await withRoomLock(roomId, async () => {
        const user = await memberService.toggleObserver(userId, isObserver);
        recordUsage(isObserver ? 'observer.on' : 'observer.off');
        await RoomService.broadcastUserUpdate(roomId);
        socket.emit(GameEvents.USER_UPDATED, RoomService.toPublicUser(user, true));

        if (isObserver) {
          await RoomService.checkAutoReveal(roomId);
        }
      });
    } catch (e) {
      logger.error('Error toggling observer:', e);
    }
  });

  onMemberEvent(socket, SocketEvents.APPROVE_USER, async (payload: unknown) => {
    const auth = await getAuthorizedData(
      socket,
      APPROVE_USER_COOLDOWN_MS,
      SocketEvents.APPROVE_USER,
    );
    if (!auth) return;
    const { userId: requesterId, roomId } = auth;

    const validation = ApproveUserSchema.safeParse(payload);
    if (!validation.success) {
      socket.emit(GameEvents.ERROR, validation.error.issues[0]?.message || 'Invalid payload');
      return;
    }
    const { userId } = validation.data;

    logger.log(
      `APPROVE_USER: roomId=${roomId}, targetUserId=${userId}, requesterId=${requesterId}`,
    );

    try {
      await RoomService.approveUser(userId, roomId);
    } catch (e) {
      logger.error('Error approving user:', e);
    }
  });

  onMemberEvent(socket, SocketEvents.DENY_USER, async (payload: unknown) => {
    const auth = await getAuthorizedData(socket, DENY_USER_COOLDOWN_MS, SocketEvents.DENY_USER);
    if (!auth) return;
    const { roomId } = auth;

    const validation = DenyUserSchema.safeParse(payload);
    if (!validation.success) {
      socket.emit(GameEvents.ERROR, validation.error.issues[0]?.message || 'Invalid payload');
      return;
    }
    const { userId } = validation.data;

    logger.log(`DENY_USER: roomId=${roomId}, targetUserId=${userId}`);

    try {
      await RoomService.denyUser(userId, roomId);
    } catch (e) {
      logger.error('Error denying user:', e);
    }
  });
}
