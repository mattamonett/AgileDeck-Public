import type { DefaultEventsMap, Server, Socket } from 'socket.io';
import type { SocketData } from '@poker/shared';

export type PokerServer = Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;
export type PokerSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;
export type AuthorizedSocketData = SocketData & {
  userId: string;
  roomId: string;
};
