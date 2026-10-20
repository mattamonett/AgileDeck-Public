import type { User } from '@prisma/client';
import * as userRepository from './user.repository';
import type { RoomBroadcaster } from './room-broadcaster';

export async function reconcileRoomUsers(
  broadcaster: RoomBroadcaster | undefined,
  roomId: string,
  preferredVisitorId?: string,
): Promise<User | null> {
  const users = await userRepository.findByRoomId(roomId);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const idsToDelete = new Set<string>();

  for (const user of users) {
    if (user.visitorId === null) {
      idsToDelete.add(user.id);
    }
  }

  const sockets = broadcaster ? await broadcaster.memberSockets(roomId) : [];
  const activeUserIds = new Set(
    sockets
      .map((socket) => socket.userId)
      .filter((userId): userId is string => !!userId && usersById.has(userId)),
  );

  const byVisitorId = new Map<string, User[]>();
  for (const user of users) {
    if (!user.visitorId) continue;
    const visitors = byVisitorId.get(user.visitorId) ?? [];
    visitors.push(user);
    byVisitorId.set(user.visitorId, visitors);
  }

  let preferredUser: User | null = null;
  for (const [visitorId, visitors] of byVisitorId) {
    if (visitors.length === 1) {
      const onlyUser = visitors[0];
      if (visitorId === preferredVisitorId && onlyUser) {
        preferredUser = onlyUser;
      }
      continue;
    }

    const canonical =
      visitors.find((user) => activeUserIds.has(user.id)) ??
      visitors.find((user) => user.isApproved && !!user.vote) ??
      visitors.find((user) => user.isApproved) ??
      visitors[0];
    if (!canonical) continue;

    for (const socket of sockets) {
      if (visitors.some((user) => user.id === socket.userId)) {
        socket.userId = canonical.id;
        if (canonical.isApproved) socket.admitToRoom(roomId);
      }
    }

    for (const user of visitors) {
      if (user.id !== canonical.id) idsToDelete.add(user.id);
    }

    if (visitorId === preferredVisitorId) preferredUser = canonical;
  }

  if (idsToDelete.size > 0) {
    await userRepository.deleteMany({
      roomId,
      id: { in: [...idsToDelete] },
    });
  }

  return preferredUser;
}
