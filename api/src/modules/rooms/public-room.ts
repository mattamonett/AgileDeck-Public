import type { User, Room } from '@prisma/client';
import { type PublicUser, type PublicRoom, type RoundTimer } from '@poker/shared';
import { getThrowOverheat } from '../interactions/throw-penalty.service';
import { parseRoomMood, parseRoomTheme } from './room-appearance';
import { getSiteConfig } from '../../config/site-config';

export function toPublicUser(user: User, reveal: boolean): PublicUser {
  const throwOverheat = getThrowOverheat(user.id);
  return {
    ...(throwOverheat ? { throwOverheat } : {}),
    id: user.id,
    name: user.name,
    vote: reveal ? user.vote : null,
    hasVoted: !!user.vote,
    isObserver: user.isObserver,
    isApproved: user.isApproved,
  };
}

function toRoundTimer(room: Room, now: number): RoundTimer | null {
  if (!room.roundStartedAt) return null;
  const startedAt = room.roundStartedAt.getTime();
  if (!room.reveal) return { elapsedMs: Math.max(0, now - startedAt), running: true };
  if (!room.roundRevealedAt) return null;
  return {
    elapsedMs: Math.max(0, room.roundRevealedAt.getTime() - startedAt),
    running: false,
  };
}

export function toPublicRoom(room: Room, now = Date.now()): PublicRoom {
  return {
    id: room.id,
    name: room.name,
    reveal: room.reveal,
    autoReveal: room.autoReveal,
    useMultiplier: room.useMultiplier,
    multiplierValue: room.multiplierValue,
    theme: parseRoomTheme(room.theme),
    lobbyEnabled: room.lobbyEnabled,
    issuesEnabled: room.issuesEnabled && getSiteConfig().features.issues,
    mood: parseRoomMood(room.mood),
    roundTimer: toRoundTimer(room, now),
  };
}
