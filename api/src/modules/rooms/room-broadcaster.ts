import type { GameEvents } from '@poker/shared';

/**
 * A connected socket as services see it. Fields read the socket's live state,
 * so a value can change while a service awaits other work.
 */
export interface MemberSocket {
  readonly id: string;
  /** Writable so duplicate memberships can be folded into one user. */
  userId: string | null;
  readonly roomId: string | null;
  readonly visitorId: string | null;
  emit(event: GameEvents, ...args: unknown[]): void;
  /** Closes the underlying connection. */
  disconnect(): void;
  /** Moves the socket out of the room's lobby and into the approved room. */
  admitToRoom(roomId: string): void;
}

/**
 * How services reach connected clients without depending on Socket.IO. The
 * socket layer builds the implementation and injects it at startup.
 */
export interface RoomBroadcaster {
  /** Emits to every approved member of the room; pending members wait in a lobby. */
  emitToRoom(roomId: string, event: GameEvents, ...args: unknown[]): void;
  /** Sockets of approved members of the room. */
  approvedSockets(roomId: string): Promise<MemberSocket[]>;
  /** Sockets of every member of the room, approved or pending. */
  memberSockets(roomId: string): Promise<MemberSocket[]>;
  /** Every connected socket. */
  allSockets(): Promise<MemberSocket[]>;
  /** Sockets connected to this process, read synchronously. */
  localSockets(): MemberSocket[];
}
