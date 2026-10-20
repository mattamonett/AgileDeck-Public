import { z } from 'zod';
import type { FeedbackCategory } from './submission';

export const FEEDBACK_REACTIONS = {
  general: ['agree', 'disagree'],
  bug: ['seen_too'],
  feature_request: ['would_use', 'not_for_me'],
  new_character_request: ['would_throw', 'not_for_me'],
} as const satisfies Record<FeedbackCategory, readonly string[]>;
export const FeedbackReactionSchema = z.enum([
  'agree',
  'disagree',
  'seen_too',
  'would_use',
  'not_for_me',
  'would_throw',
]);
export type FeedbackReaction = z.infer<typeof FeedbackReactionSchema>;
export const FeedbackVoteInputSchema = z.strictObject({
  reaction: FeedbackReactionSchema,
});
export const FeedbackVoteCountsSchema = z.object({
  agree: z.number().int().nonnegative(),
  disagree: z.number().int().nonnegative(),
  seen_too: z.number().int().nonnegative(),
  would_use: z.number().int().nonnegative(),
  not_for_me: z.number().int().nonnegative(),
  would_throw: z.number().int().nonnegative(),
});
export type FeedbackVoteCounts = z.infer<typeof FeedbackVoteCountsSchema>;
export const FeedbackVoteStateSchema = z.object({
  voteCounts: FeedbackVoteCountsSchema,
  userVote: FeedbackReactionSchema.nullable(),
});
export type FeedbackVoteState = z.infer<typeof FeedbackVoteStateSchema>;
