import { configureAdminDeletion } from '../modules/admin/admin-deletion.service';
import { onMemberEvent } from './member-event';
import { recordRateLimitHit } from '../modules/telemetry/rate-limit-telemetry';
import { registerMembershipHandlers } from './handlers/membership.handlers';
import { registerRoomSettingsHandlers } from './handlers/room-settings.handlers';
import { registerVotingHandlers } from './handlers/voting.handlers';
import { randomUUID } from 'crypto';
import { getHealthStatus } from '../modules/site/health.service';
import * as RoomService from '../modules/rooms/room.service';
import { HEALTH_BUDGET } from './rate-limits';
import { SocketEvents, GameEvents } from '@poker/shared';
import { socketNetworkKey } from './authorization';
import { authenticateConnection } from './connection-auth';
import { registerInteractionHandlers } from './handlers/interaction.handlers';
import { registerJoinHandlers } from './handlers/join.handlers';
import { guardSocketMessages } from './replay-guard';
import { createRoomBroadcaster } from './socket-room-broadcaster';
import type { PokerServer, PokerSocket } from './types';
import { logger } from '../platform/logger';

export function setupSocket(io: PokerServer): void {
  // Services reach clients only through this port.
  const broadcaster = createRoomBroadcaster(io);
  configureAdminDeletion(broadcaster);
  RoomService.init(broadcaster);

  io.use(authenticateConnection);

  io.on('connection', (socket: PokerSocket) => {
    logger.log('User connected:', socket.id);

    socket.data.userId = null;
    socket.data.roomId = null;
    socket.data.connectionNonce = randomUUID();
    socket.data.lastClientSeq = 0;

    guardSocketMessages(socket);
    const membership = registerJoinHandlers(socket);
    registerVotingHandlers(socket);
    registerRoomSettingsHandlers(socket);
    registerMembershipHandlers(socket);
    registerInteractionHandlers(io, socket);

    onMemberEvent(socket, SocketEvents.CHECK_HEALTH, async () => {
      const clientIp = socket.data.clientIp || 'unknown';
      if (!HEALTH_BUDGET.consume(socketNetworkKey(clientIp))) {
        recordRateLimitHit(socket.data.visitorId);
        socket.emit(GameEvents.ERROR, 'Too many health checks. Please try again later.');
        return;
      }

      const status = await getHealthStatus();
      socket.emit(GameEvents.HEALTH_STATUS, status);
    });

    socket.on(SocketEvents.DISCONNECT, async (reason: string) => {
      membership.invalidate();
      const { userId, roomId } = socket.data;
      await RoomService.cleanupUser(userId, roomId, socket.id);
      logger.log(`User disconnected: ${socket.id}, Reason: ${reason}`);
    });
  });
}
