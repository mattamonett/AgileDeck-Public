import { z } from 'zod';
import type { ThrowOverheat } from '../throwables/projectiles';
import { type RoomMood, RoomMoodSchema } from './mood';

export interface PublicUser {
  throwOverheat?: ThrowOverheat;
  id: string;
  name: string;
  vote: string | null;
  hasVoted: boolean;
  isObserver: boolean;
  isApproved: boolean;
}

/**
 * Round time measured on the server. Elapsed time (not a timestamp) keeps
 * clients independent of their own clock skew; a stopped timer is frozen at reveal.
 */
export interface RoundTimer {
  elapsedMs: number;
  running: boolean;
}

export interface PublicRoom {
  roundTimer: RoundTimer | null;
  issuesEnabled: boolean;
  mood: RoomMood;
  id: string;
  name: string | null;
  reveal: boolean;
  autoReveal: boolean;
  useMultiplier: boolean;
  multiplierValue: number;
  theme: string;
  lobbyEnabled: boolean;
}

export const PublicUserSchema: z.ZodType<PublicUser> = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    vote: z.string().nullable(),
    hasVoted: z.boolean(),
    isObserver: z.boolean(),
    isApproved: z.boolean(),
    throwOverheat: z
      .object({ startedAt: z.number().finite(), until: z.number().finite() })
      .optional(),
  })
  .transform(({ throwOverheat, ...user }) => ({
    ...user,
    ...(throwOverheat ? { throwOverheat } : {}),
  }));
export const PublicUsersSchema = z.array(PublicUserSchema);

export const PublicRoomSchema: z.ZodType<PublicRoom> = z.object({
  id: z.string().min(1),
  name: z.string().nullable(),
  reveal: z.boolean(),
  autoReveal: z.boolean(),
  useMultiplier: z.boolean(),
  multiplierValue: z.number().finite(),
  theme: z.string(),
  lobbyEnabled: z.boolean(),
  issuesEnabled: z.boolean(),
  mood: RoomMoodSchema,
  roundTimer: z
    .object({
      elapsedMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      running: z.boolean(),
    })
    .nullable(),
});

export const JoinedSchema = z.object({
  user: PublicUserSchema,
  room: PublicRoomSchema,
  connectionNonce: z.string().min(1),
});
