import type { Feedback } from '@prisma/client';
import {
  FeedbackCategorySchema,
  FeedbackReactionSchema,
  FeedbackWorkflowSchema,
  type FeedbackCategory,
  type FeedbackReaction,
  type FeedbackVoteCounts,
} from '@poker/shared';
import type { OwnVoteRow, VoteCountRow } from './feedback.repository';

/** The reaction that ranks an item up in "top" sorting for each category. */
export const TOP_REACTIONS: Record<FeedbackCategory, FeedbackReaction> = {
  general: 'agree',
  bug: 'seen_too',
  feature_request: 'would_use',
  new_character_request: 'would_throw',
};

/** The reaction that ranks an item down, if the category has one. */
export const DOWN_REACTIONS: Record<FeedbackCategory, FeedbackReaction | null> = {
  general: 'disagree',
  bug: null,
  feature_request: 'not_for_me',
  new_character_request: 'not_for_me',
};

export type VoteState = {
  voteCounts: FeedbackVoteCounts;
  userVote: FeedbackReaction | null;
};

export function ownFeedbackItem(entry: Feedback) {
  return {
    id: entry.id,
    category: entry.category,
    title: entry.title,
    body: entry.body,
    createdAt: entry.createdAt.toISOString(),
    status: entry.status,
    rejectionReason: entry.rejectionReason,
    ...feedbackWorkflow(entry),
  };
}

export function feedbackWorkflow(entry: Feedback) {
  return FeedbackWorkflowSchema.parse({
    workflowStatus: entry.workflowStatus,
    resolutionReason: entry.resolutionReason,
    resolutionNote: entry.resolutionNote,
    duplicateOfId: entry.duplicateOfId,
  });
}

/** Per-category published counts, ignoring categories that are no longer valid. */
export function categoryCounts(
  groups: { category: string; count: number }[],
): Record<FeedbackCategory, number> {
  const counts = {
    general: 0,
    bug: 0,
    feature_request: 0,
    new_character_request: 0,
  };
  for (const group of groups) {
    const parsed = FeedbackCategorySchema.safeParse(group.category);
    if (parsed.success) counts[parsed.data] = group.count;
  }
  return counts;
}

function emptyVoteCounts(): FeedbackVoteCounts {
  return {
    agree: 0,
    disagree: 0,
    seen_too: 0,
    would_use: 0,
    not_for_me: 0,
    would_throw: 0,
  };
}

/** Vote totals and the viewer's own vote for each requested item. */
export function voteStates(
  feedbackIds: string[],
  rows: { counts: VoteCountRow[]; own: OwnVoteRow[] },
): Map<string, VoteState> {
  const states = new Map<string, VoteState>();
  for (const id of feedbackIds) states.set(id, { voteCounts: emptyVoteCounts(), userVote: null });
  for (const group of rows.counts) {
    const state = states.get(group.feedbackId);
    const reaction = FeedbackReactionSchema.safeParse(group.reaction);
    if (state && reaction.success) {
      state.voteCounts[reaction.data] = Number(group.count);
    }
  }
  for (const vote of rows.own) {
    const state = states.get(vote.feedbackId);
    const reaction = FeedbackReactionSchema.safeParse(vote.reaction);
    if (state && reaction.success) state.userVote = reaction.data;
  }
  return states;
}
