import type { SocketData } from '@poker/shared';
import type { MemberSocket, RoomBroadcaster } from '../modules/rooms/room-broadcaster';
import { lobbyChannel, memberChannels } from './channels';
import type { PokerServer } from './types';

/** The Socket.IO surface a MemberSocket wraps: local and remote sockets both fit. */
interface ChannelSocket {
  readonly id: string;
  readonly data: SocketData;
  emit(event: string, ...args: unknown[]): unknown;
  disconnect(close: boolean): unknown;
  join(channel: string): unknown;
  leave(channel: string): unknown;
}

function memberSocket(socket: ChannelSocket): MemberSocket {
  return {
    id: socket.id,
    get userId() {
      return socket.data.userId;
    },
    set userId(userId: string | null) {
      socket.data.userId = userId;
    },
    get roomId() {
      return socket.data.roomId;
    },
    get visitorId() {
      return socket.data.visitorId;
    },
    emit(event, ...args) {
      socket.emit(event, ...args);
    },
    disconnect() {
      socket.disconnect(true);
    },
    admitToRoom(roomId) {
      socket.leave(lobbyChannel(roomId));
      socket.join(roomId);
    },
  };
}

/** Adapts the Socket.IO server to the RoomBroadcaster port that services use. */
export function createRoomBroadcaster(io: PokerServer): RoomBroadcaster {
  return {
    emitToRoom(roomId, event, ...args) {
      io.to(roomId).emit(event, ...args);
    },
    async approvedSockets(roomId) {
      return (await io.in(roomId).fetchSockets()).map(memberSocket);
    },
    async memberSockets(roomId) {
      return (await io.in(memberChannels(roomId)).fetchSockets()).map(memberSocket);
    },
    async allSockets() {
      return (await io.fetchSockets()).map(memberSocket);
    },
    localSockets() {
      return [...io.sockets.sockets.values()].map(memberSocket);
    },
  };
}
