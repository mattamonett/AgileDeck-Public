import { z } from 'zod';

export const RoomStatsQuerySchema = z.object({
  roomId: z.string().trim().min(1).max(100).toLowerCase(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  sort: z
    .enum([
      'votesCast',
      'throwsSent',
      'throwsReceived',
      'barragesSent',
      'bestVoteStreak',
      'characterVariety',
    ])
    .default('votesCast'),
});
export type RoomStatsMetric = z.infer<typeof RoomStatsQuerySchema>['sort'];
const count = z.number().int().nonnegative();
export const RoomStatsCountsSchema = z.object({
  votesCast: count,
  throwsSent: count,
  throwsReceived: count,
  barragesSent: count,
});
const awardMember = z.object({
  id: z.string(),
  name: z.string(),
  isYou: z.boolean(),
});
const award = z
  .object({
    score: count.positive(),
    winnerCount: count.positive(),
    winners: z.array(awardMember).min(1).max(3),
  })
  .nullable();
const issueHighlight = z
  .object({
    id: z.string(),
    title: z.string(),
    firstMin: z.number().finite().nonnegative(),
    firstMax: z.number().finite().nonnegative(),
    latestMin: z.number().finite().nonnegative(),
    latestMax: z.number().finite().nonnegative(),
    tiedCount: count.positive(),
  })
  .nullable();
export const RoomStatsSchema = z.object({
  roomName: z.string(),
  startedAt: z.string().datetime().nullable(),
  awardsStartedAt: z.string().datetime().nullable(),
  roundsRevealed: count,
  unanimousRounds: count,
  awards: z.object({ onARoll: award, varietyShow: award }),
  issueStats: z
    .object({
      estimated: count,
      spiciest: issueHighlight,
      commonGround: issueHighlight,
    })
    .nullable(),
  totals: RoomStatsCountsSchema,
  participants: count,
  page: count,
  pageSize: count.positive(),
  members: z.array(
    RoomStatsCountsSchema.extend({
      id: z.string(),
      name: z.string(),
      isYou: z.boolean(),
      rank: count,
      bestVoteStreak: count,
      characterVariety: count,
    }),
  ),
});
export type RoomStats = z.infer<typeof RoomStatsSchema>;
