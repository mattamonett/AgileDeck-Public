import type { PublicUser, PublicRoom, RoundTimer } from '@poker/shared';
export type { HealthStatus } from '@poker/shared';
import type { HealthStatus } from '@poker/shared';

// View models normalize nullable wire fields for existing templates.
export type User = Omit<PublicUser, 'vote' | 'hasVoted'> & {
  vote?: string;
  hasVoted?: boolean;
};
export type Room = Omit<PublicRoom, 'name' | 'roundTimer'> & {
  name: string;
  roundClock: RoundClock | null;
};

/** Round boundaries on this browser's clock; stoppedAt is null while the round runs. */
export interface RoundClock {
  startedAt: number;
  stoppedAt: number | null;
}

export function toUserView(user: PublicUser): User {
  const { vote, ...rest } = user;
  return { ...rest, ...(vote !== null ? { vote } : {}) };
}
function toRoundClock(timer: RoundTimer | null, receivedAt: number): RoundClock | null {
  if (!timer) return null;
  return {
    startedAt: receivedAt - timer.elapsedMs,
    stoppedAt: timer.running ? null : receivedAt,
  };
}
export function toRoomView(room: PublicRoom, receivedAt = Date.now()): Room {
  const { roundTimer, ...rest } = room;
  return { ...rest, name: room.name ?? '', roundClock: toRoundClock(roundTimer, receivedAt) };
}

export interface PokerState {
  currentUser: User | null;
  currentRoom: Room | null;
  users: User[];
  resultSnapshot: string | null;
  revealState: boolean;
  isCountdown: boolean;
  countdownValue: number;
  healthStatus: HealthStatus | null;
  isConnected: boolean;
  webVersion: string;
  apiVersion: string;
}
