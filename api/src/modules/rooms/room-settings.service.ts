import { GameEvents } from '@poker/shared';
import type { Prisma, Room } from '@prisma/client';
import { recordRoomSettingChanges } from '../telemetry/usage.service';
import { toPublicRoom } from './public-room';
import { requireBroadcaster, revelationService } from './room-runtime';
import * as roomRepository from './room.repository';

export async function updateRoom(roomId: string, data: Prisma.RoomUpdateInput): Promise<Room> {
  const before = await roomRepository.findById(roomId);
  const room = await roomRepository.update(roomId, data);
  if (before) recordRoomSettingChanges(before, room);
  requireBroadcaster().emitToRoom(roomId, GameEvents.ROOM_UPDATED, toPublicRoom(room));
  return room;
}

export async function toggleAutoReveal(roomId: string, autoReveal: boolean): Promise<void> {
  await updateRoom(roomId, { autoReveal });

  if (!autoReveal) {
    // Turning auto-reveal off must not collapse a reveal already in progress.
    const room = await roomRepository.findById(roomId);
    if (room && !room.reveal) {
      await roomRepository.update(roomId, { reveal: false });
      requireBroadcaster().emitToRoom(roomId, GameEvents.REVEAL_STATE, false);
    }
  } else {
    await revelationService().checkAutoReveal(roomId);
  }
}
