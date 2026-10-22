import type { Room, User } from '@prisma/client';
import { NUDGE_TARGET_COOLDOWN_MS, type NudgeEvent, type NudgeLevel } from '@poker/shared';
import { HOUR_MS } from '../../platform/time';
import { checkRateLimit } from '../../platform/concurrency/action-cooldowns';

const MAX_TRACKED_TARGETS = 10_000;
// Levels only matter within one round, so a stale entry is safe to forget.
const LEVEL_TTL_MS = HOUR_MS;

interface NudgeCount {
  round: number;
  level: NudgeLevel;
  expiresAt: number;
}

const nudgeCounts = new Map<string, NudgeCount>();

/** Only someone the room is actually waiting on can be nudged. */
export function canBeNudged(
  room: Pick<Room, 'id' | 'reveal'>,
  target: Pick<User, 'id' | 'roomId' | 'isApproved' | 'isObserver' | 'vote'>,
  sourceUserId: string,
): boolean {
  return (
    !room.reveal &&
    target.id !== sourceUserId &&
    target.roomId === room.id &&
    target.isApproved &&
    !target.isObserver &&
    !target.vote
  );
}

function nextLevel(roomId: string, targetUserId: string, round: number): NudgeLevel {
  const key = `${roomId}:${targetUserId}`;
  const now = Date.now();
  const current = nudgeCounts.get(key);
  const level: NudgeLevel =
    current && current.round === round && current.expiresAt > now
      ? current.level === 1
        ? 2
        : 3
      : 1;
  nudgeCounts.delete(key);
  nudgeCounts.set(key, { round, level, expiresAt: now + LEVEL_TTL_MS });
  // Map order is insertion order, so the first key is the least recently nudged.
  while (nudgeCounts.size > MAX_TRACKED_TARGETS) {
    const oldest = nudgeCounts.keys().next().value;
    if (oldest === undefined) break;
    nudgeCounts.delete(oldest);
  }
  return level;
}

/**
 * Claims the target's cooldown and returns the event to broadcast, or null while
 * they were nudged too recently. Call only after canBeNudged.
 */
export function claimNudge(
  room: Pick<Room, 'id' | 'roundNumber'>,
  targetUserId: string,
  sourceUserId: string,
): NudgeEvent | null {
  if (!checkRateLimit(`${room.id}:${targetUserId}:nudged`, NUDGE_TARGET_COOLDOWN_MS)) return null;
  return {
    targetUserId,
    sourceUserId,
    level: nextLevel(room.id, targetUserId, room.roundNumber),
  };
}
