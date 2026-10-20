/**
 * Pending members wait in a separate Socket.IO room so room-wide broadcasts reach
 * only approved members. Room IDs cannot contain ':', so names cannot collide.
 */
export function lobbyChannel(roomId: string): string {
  return `lobby:${roomId}`;
}

/** Every socket of a room's members, approved or pending. */
export function memberChannels(roomId: string): string[] {
  return [roomId, lobbyChannel(roomId)];
}
