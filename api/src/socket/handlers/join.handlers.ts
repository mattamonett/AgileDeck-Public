import { randomUUID } from 'crypto';
import { GameEvents, JoinRoomSchema, SocketEvents } from '@poker/shared';
import { AbuseLimitError } from '../../platform/db/abuse-quota';
import { recordRateLimitHit } from '../../modules/telemetry/rate-limit-telemetry';
import { isUnlockedFor } from '../../modules/site/site-access';
import { JOIN_BUDGET, JOIN_NETWORK_BUDGET } from '../rate-limits';
import { withRoomLock } from '../../modules/rooms/room-lock';
import { sanitize } from '../sanitize';
import { findMember } from '../../modules/rooms/room-lookup.service';
import { getHealthStatus } from '../../modules/site/health.service';
import * as RoomService from '../../modules/rooms/room.service';
import { isAuthorized, socketNetworkKey } from '../authorization';
import { lobbyChannel, memberChannels } from '../channels';
import { onMemberEvent } from '../member-event';
import type { PokerSocket } from '../types';
import { logger } from '../../platform/logger';

const GENERIC_JOIN_ERROR = 'Could not join the room. Please try again.';
/**
 * A socket outside any room is closed after this long, so idle connections
 * cannot hold the transport capacity that admission shares across the site.
 */
export const UNJOINED_SOCKET_TIMEOUT_MS = 60_000;

function joinErrorMessage(error: unknown): string {
  return error instanceof RoomService.JoinRejectedError || error instanceof AbuseLimitError
    ? error.message
    : GENERIC_JOIN_ERROR;
}

/** Lets the disconnect handler cancel an in-flight join and pending expiry. */
export interface MembershipSession {
  invalidate(): void;
}

/**
 * Registers JOIN_ROOM and LEAVE_ROOM. One join may be in flight per socket;
 * leaving or disconnecting bumps the membership version so a late join result
 * is discarded and cleaned up instead of restoring room subscriptions.
 */
export function registerJoinHandlers(socket: PokerSocket): MembershipSession {
  let joining = false;
  let membershipVersion = 0;
  let pendingExpiry: ReturnType<typeof setTimeout> | undefined;
  let expiryVersion = 0;
  let unjoinedTimeout: ReturnType<typeof setTimeout> | undefined;
  const clearPendingExpiry = () => {
    expiryVersion++;
    clearTimeout(pendingExpiry);
    pendingExpiry = undefined;
  };
  const scheduleUnjoinedTimeout = () => {
    clearTimeout(unjoinedTimeout);
    unjoinedTimeout = setTimeout(() => {
      if (socket.disconnected || socket.data.roomId) return;
      // A join still running may yet commit; check again once it settles.
      if (joining) scheduleUnjoinedTimeout();
      else socket.disconnect(true);
    }, UNJOINED_SOCKET_TIMEOUT_MS);
    unjoinedTimeout.unref();
  };
  scheduleUnjoinedTimeout();

  onMemberEvent(socket, SocketEvents.JOIN_ROOM, async (payload: unknown) => {
    if (joining || socket.disconnected) {
      socket.emit(GameEvents.ERROR, 'A room join is already in progress.');
      return;
    }
    const validation = JoinRoomSchema.safeParse(payload);
    if (!validation.success) {
      socket.emit(
        GameEvents.ERROR,
        validation.error.issues[0]?.message || 'Invalid join room payload',
      );
      return;
    }
    const data = validation.data;

    // visitorId is ONLY read from the secure HttpOnly cookie parsed in middleware.
    // This prevents message replay attacks and XSS-based session hijacking.
    const vId = socket.data.visitorId;
    const cleanName = sanitize(data.userName, 20) || 'Anonymous';
    const cleanRoomId = sanitize(data.roomId, 50).toLowerCase();
    const clientIp = socket.data.clientIp || 'unknown';

    if (!cleanRoomId || !vId) {
      logger.warn(
        `JOIN_ROOM rejected: missing roomId or visitorId in handshake (socket ${socket.id})`,
      );
      return;
    }

    if (!JOIN_NETWORK_BUDGET.consume(socketNetworkKey(clientIp))) {
      recordRateLimitHit(vId);
      socket.emit(
        GameEvents.ERROR,
        'Too many join attempts from this network. Please wait a moment and try again.',
      );
      return;
    }

    if (!JOIN_BUDGET.consume(`${vId}:${cleanRoomId}`)) {
      recordRateLimitHit(vId);
      socket.emit(GameEvents.ERROR, 'Too many join attempts. Please slow down and try again.');
      return;
    }

    // Do not join the Socket.IO room until the database join succeeds. Joining
    // first lets a failed (for example, full) join receive room broadcasts.
    const currentData = socket.data;
    const oldRoomId = currentData.roomId;
    const oldUserId = currentData.userId;
    logger.log(`${cleanName} joining room ${cleanRoomId}`);
    joining = true;
    const version = ++membershipVersion;
    let acquired: Awaited<ReturnType<typeof RoomService.joinRoom>> | undefined;
    let committed = false;
    const abandoned = () => socket.disconnected || version !== membershipVersion;
    try {
      if (socket.disconnected || version !== membershipVersion) return;
      const result = await RoomService.joinRoom(
        cleanRoomId,
        cleanName,
        vId,
        data.createRoomIntent ?? false,
        data.siteAgreement,
        clientIp,
        isUnlockedFor('room-creation', socket.request.headers.cookie, vId),
      );
      acquired = result;
      const { room } = result;
      if (abandoned()) return;

      if (oldRoomId && oldRoomId !== cleanRoomId) {
        for (const channel of memberChannels(oldRoomId)) socket.leave(channel);
        await RoomService.cleanupUser(oldUserId, oldRoomId, socket.id, true);
      }
      if (abandoned()) return;
      // Commit under the room lock so approval, denial, cleanup and deletion
      // either see this socket or have already removed the user row.
      const user = await withRoomLock(cleanRoomId, async () => {
        if (abandoned()) return null;
        const current = await findMember(result.user.id);
        if (current?.roomId !== cleanRoomId || current.visitorId !== vId || abandoned())
          return null;
        await socket.join(current.isApproved ? cleanRoomId : lobbyChannel(cleanRoomId));
        socket.data.roomId = cleanRoomId;
        socket.data.userId = current.id;
        committed = true;
        return current;
      });
      if (!user) {
        if (!abandoned()) socket.emit(GameEvents.ERROR, GENERIC_JOIN_ERROR);
        return;
      }
      socket.data.connectionNonce = randomUUID();
      socket.data.lastClientSeq = 0;
      clearPendingExpiry();
      if (!user.isApproved) {
        const deadlineVersion = expiryVersion;
        const stillPending = () =>
          !socket.disconnected &&
          deadlineVersion === expiryVersion &&
          socket.data.userId === user.id &&
          socket.data.roomId === cleanRoomId;
        const remaining = Math.max(
          0,
          (user.createdAt?.getTime() ?? Date.now()) +
            RoomService.PENDING_REQUEST_TTL_MS -
            Date.now(),
        );
        pendingExpiry = setTimeout(() => {
          void withRoomLock(cleanRoomId, async () => {
            if (!stillPending()) return;
            const approved = await isAuthorized(user.id, cleanRoomId);
            if (approved || !stillPending()) return;
            socket.emit(GameEvents.ERROR, 'Your pending room request expired. Please join again.');
            socket.disconnect(true);
          }).catch((error) => logger.error('Pending room expiry failed:', error));
        }, remaining);
        pendingExpiry.unref();
      }

      // joinRoom broadcasts before this socket knows its userId. Broadcast
      // again now so this socket receives the correct room roster.
      await RoomService.broadcastUserUpdate(cleanRoomId);
      if (socket.disconnected || version !== membershipVersion) return;

      socket.emit(GameEvents.JOINED, {
        user: RoomService.toPublicUser(user, true),
        room: RoomService.toPublicRoom(room),
        connectionNonce: socket.data.connectionNonce,
      });
      const health = await getHealthStatus();
      if (abandoned()) return;
      socket.emit(GameEvents.HEALTH_STATUS, health);

      // A socket that joins or reconnects mid-countdown still shows the
      // remaining time instead of missing the countdown.
      const remainingSeconds = RoomService.getRevelationRemainingSeconds(cleanRoomId);
      if (remainingSeconds !== null && remainingSeconds > 0) {
        socket.emit(GameEvents.REVELATION_STARTED, {
          seconds: remainingSeconds,
        });
      }
    } catch (e) {
      if (e instanceof AbuseLimitError) recordRateLimitHit(vId);
      if (e instanceof RoomService.SiteAgreementRequiredError) {
        socket.emit(GameEvents.ERROR, e.message);
        return;
      }
      if (!(e instanceof RoomService.JoinRejectedError)) logger.error('Error joining room:', e);
      socket.emit(GameEvents.ERROR, joinErrorMessage(e));
    } finally {
      try {
        if (acquired && !committed) {
          for (const channel of memberChannels(cleanRoomId)) socket.leave(channel);
          await RoomService.cleanupUser(
            acquired.user.id,
            cleanRoomId,
            socket.id,
            !acquired.user.isApproved || !socket.disconnected,
          );
        }
      } finally {
        joining = false;
      }
    }
  });

  onMemberEvent(socket, SocketEvents.LEAVE_ROOM, async () => {
    membershipVersion++;
    clearPendingExpiry();
    const { userId, roomId } = socket.data;
    if (roomId) {
      for (const channel of memberChannels(roomId)) socket.leave(channel);
      socket.data.roomId = null;
      socket.data.userId = null;
      scheduleUnjoinedTimeout();
      await RoomService.cleanupUser(userId, roomId, socket.id, true);
    }
  });

  return {
    invalidate() {
      membershipVersion++;
      clearPendingExpiry();
      clearTimeout(unjoinedTimeout);
    },
  };
}
