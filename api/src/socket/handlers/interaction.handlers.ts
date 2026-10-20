import { recordInteraction } from '../../modules/rooms/room-stats.service';
import { onMemberEvent } from '../member-event';
import { recordThrowableUsage, recordUsage } from '../../modules/telemetry/usage-telemetry';
import { GameEvents, SocketEvents, NudgeSchema, ProjectileSchema } from '@poker/shared';
import type { ProjectileEvent } from '@poker/shared';
import { sanitize } from '../sanitize';
import { findMember, findRoom, listRoomMembers } from '../../modules/rooms/room-lookup.service';
import { getAuthorizedData, isAuthorized } from '../authorization';
import type { AuthorizedSocketData, PokerServer, PokerSocket } from '../types';
import { getThrowOverheat } from '../../modules/interactions/throw-penalty.service';
import { admitThrow } from '../../modules/interactions/throw-guard';
import { isAvailableInteraction } from '../../modules/interactions/seasonal-throwables.service';
import { canBeNudged, claimNudge } from '../../modules/interactions/nudge.service';
import { parseRoomMood } from '../../modules/rooms/room-appearance';
import { getSiteConfig } from '../../config/site-config';

/** Minimum time between one member's repeats of each action. */
const NUDGE_COOLDOWN_MS = 1000;

const DEFAULT_PROJECTILE = '\uD83D\uDCC4';
// Projectiles are deliberately fast-paced. Keep a small per-player guard so a
// compromised client cannot flood every player in a room with broadcasts.
const PROJECTILE_RATE_LIMIT_MS = 100;
const BARRAGE_RATE_LIMIT_MS = 2000;
// One click nudges everyone left, so it gets a slower limit than a single nudge.
const NUDGE_STRAGGLERS_RATE_LIMIT_MS = 5000;
async function getThrowAuthorization(
  socket: PokerSocket,
  limitMs: number,
  action: SocketEvents,
): Promise<AuthorizedSocketData | null> {
  const { userId, roomId, visitorId } = socket.data;
  if (!userId || !roomId) return null;
  const admitted = await admitThrow(
    {
      userId,
      roomId,
      visitorId,
      isMember: () => isAuthorized(userId, roomId, visitorId),
    },
    limitMs,
    action,
  );
  return admitted ? { ...socket.data, userId, roomId } : null;
}

async function isTargetInRoom(targetUserId: string, roomId: string): Promise<boolean> {
  const target = await findMember(targetUserId);
  return !!target && target.roomId === roomId && target.isApproved;
}

function createProjectileEvent(
  sourceUserId: string,
  targetUserId: string,
  emoji: string,
): ProjectileEvent {
  const side = Math.random() > 0.5 ? 'left' : 'right';
  const startX = side === 'left' ? -(300 + Math.random() * 200) : 300 + Math.random() * 200;
  // Start closer to the target's height. The client supplies the upward arc,
  // so this reads as a throw instead of an object dropping in from above.
  const startY = Math.floor(Math.random() * 120) - 60;

  return {
    sourceUserId,
    targetUserId,
    emoji,
    side,
    offsetX: Math.floor(Math.random() * 40) - 20,
    offsetY: Math.floor(Math.random() * 20) + 70,
    rotation: Math.floor(Math.random() * 360),
    id: Math.random().toString(36).slice(2, 11),
    startX,
    startY,
  };
}

export function registerInteractionHandlers(io: PokerServer, socket: PokerSocket): void {
  onMemberEvent(socket, SocketEvents.NUDGE, async (payload: unknown) => {
    const auth = await getAuthorizedData(socket, NUDGE_COOLDOWN_MS, SocketEvents.NUDGE);
    if (!auth) return;
    const { roomId, userId } = auth;

    const validation = NudgeSchema.safeParse(payload);
    if (!validation.success) {
      socket.emit(GameEvents.ERROR, validation.error.issues[0]?.message || 'Invalid payload');
      return;
    }

    const [room, target] = await Promise.all([
      findRoom(roomId),
      findMember(validation.data.targetUserId),
    ]);
    if (!room || !target || !canBeNudged(room, target, userId)) return;
    const nudge = claimNudge(room, target.id, userId);
    if (!nudge) return;
    recordUsage('nudge.single');
    io.to(roomId).emit(GameEvents.NUDGED, nudge);
  });

  onMemberEvent(socket, SocketEvents.NUDGE_STRAGGLERS, async () => {
    const auth = await getAuthorizedData(
      socket,
      NUDGE_STRAGGLERS_RATE_LIMIT_MS,
      SocketEvents.NUDGE_STRAGGLERS,
    );
    if (!auth) return;
    const { roomId, userId } = auth;

    const [room, members] = await Promise.all([findRoom(roomId), listRoomMembers(roomId)]);
    if (!room) return;
    let nudged = false;
    for (const member of members) {
      if (!canBeNudged(room, member, userId)) continue;
      const nudge = claimNudge(room, member.id, userId);
      if (!nudge) continue;
      nudged = true;
      io.to(roomId).emit(GameEvents.NUDGED, nudge);
    }
    if (nudged) recordUsage('nudge.stragglers');
  });

  onMemberEvent(socket, SocketEvents.THROW_PROJECTILE, async (payload: unknown) => {
    // Checked first so a site without throwing never charges overheat for it.
    if (!getSiteConfig().content.throwables) return;
    const auth = await getThrowAuthorization(
      socket,
      PROJECTILE_RATE_LIMIT_MS,
      SocketEvents.THROW_PROJECTILE,
    );
    if (!auth) return;
    const { roomId, userId } = auth;

    const validation = ProjectileSchema.safeParse(payload);
    if (!validation.success) {
      socket.emit(GameEvents.ERROR, validation.error.issues[0]?.message || 'Invalid payload');
      return;
    }
    const { targetUserId, emoji } = validation.data;
    if (targetUserId === userId) return;

    const room = await findRoom(roomId);
    if (!room || room.reveal || !targetUserId || !(await isTargetInRoom(targetUserId, roomId))) {
      return;
    }

    const char = sanitize(emoji || DEFAULT_PROJECTILE, 5);
    if (isAvailableInteraction(char, parseRoomMood(room.mood)) && !getThrowOverheat(userId)) {
      if (!(await recordInteraction(roomId, userId, auth.visitorId, 'throw', targetUserId, char)))
        return;
      recordUsage('throw.single');
      recordThrowableUsage(char);
      io.to(roomId).emit(
        GameEvents.PROJECTILE_THROWN,
        createProjectileEvent(userId, targetUserId, char),
      );
    }
  });

  onMemberEvent(socket, SocketEvents.BARRAGE_PROJECTILE, async (payload: unknown) => {
    // Checked first so a site without throwing never charges overheat for it.
    if (!getSiteConfig().content.throwables) return;
    const auth = await getThrowAuthorization(
      socket,
      BARRAGE_RATE_LIMIT_MS,
      SocketEvents.BARRAGE_PROJECTILE,
    );
    if (!auth) return;
    const { roomId, userId } = auth;

    const validation = ProjectileSchema.safeParse(payload);
    if (!validation.success) {
      socket.emit(GameEvents.ERROR, validation.error.issues[0]?.message || 'Invalid payload');
      return;
    }
    const { targetUserId, emoji } = validation.data;
    if (targetUserId === userId) return;

    const room = await findRoom(roomId);
    if (!room || room.reveal || !targetUserId || !(await isTargetInRoom(targetUserId, roomId))) {
      return;
    }

    const char = sanitize(emoji || DEFAULT_PROJECTILE, 5);
    if (isAvailableInteraction(char, parseRoomMood(room.mood)) && !getThrowOverheat(userId)) {
      if (!(await recordInteraction(roomId, userId, auth.visitorId, 'barrage', targetUserId, char)))
        return;
      recordUsage('throw.barrage');
      recordThrowableUsage(char);
      io.to(roomId).emit(GameEvents.PROJECTILE_BARRAGE, {
        sourceUserId: userId,
        targetUserId,
        emoji: char,
      });
    }
  });
}
