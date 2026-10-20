import {
  AdminPendingReviewSchema,
  type AdminPendingReview,
  type UpdateFeedbackWorkflow,
} from '@poker/shared';
import type { Feedback } from '@prisma/client';

import { AdminError } from './admin-errors';
import type { ReplyAccess } from '../feedback/reply-access';
import * as feedbackAdminRepository from './feedback-admin.repository';
import type { ReviewDecision, ReviewOutcome } from './feedback-admin.repository';
import { replyItem } from '../feedback/feedback-reply.service';

export type { ReviewDecision } from './feedback-admin.repository';
export { findAdminFeedback, listAdminFeedback } from './feedback-admin.repository';

function validateWorkflowReferences(
  id: string,
  change: UpdateFeedbackWorkflow,
  entry: Feedback | null,
  original: Feedback | null,
  dependents: number,
): void {
  if (!entry) throw new AdminError(404, 'Feedback item not found.');
  if (change.next.duplicateOfId !== null) {
    if (change.next.duplicateOfId === id)
      throw new AdminError(400, 'Feedback cannot be a duplicate of itself.');
    if (!original || original.status !== 'published')
      throw new AdminError(400, 'Choose a published original feedback item.');
    if (original.resolutionReason === 'duplicate')
      throw new AdminError(400, 'Choose the original item rather than another duplicate.');
  }
  if (change.next.resolutionReason === 'duplicate' && dependents > 0)
    throw new AdminError(
      400,
      'This item already has duplicates. Update their references before marking it as a duplicate.',
    );
}

export function updateFeedbackWorkflow(id: string, change: UpdateFeedbackWorkflow) {
  return feedbackAdminRepository.updateFeedbackWorkflow(
    id,
    change,
    ({ entry, original, dependents }) =>
      validateWorkflowReferences(id, change, entry, original, dependents),
  );
}

const ADMIN_ACCESS: ReplyAccess = {
  role: 'admin',
  canReply: true,
  privateView: true,
};

export async function listPendingReview(): Promise<AdminPendingReview> {
  const pending = await feedbackAdminRepository.listPendingReview();
  return AdminPendingReviewSchema.parse({
    feedback: pending.feedback.map((entry) => ({
      ...feedbackAdminRepository.adminFeedbackItem(entry),
      hasUnreadReplies: false,
    })),
    feedbackCount: pending.feedbackCount,
    replies: pending.replies.map(({ feedback, ...reply }) => ({
      reply: replyItem(reply, ADMIN_ACCESS),
      feedback,
    })),
    replyCount: pending.replyCount,
  });
}

function reviewed<T>(outcome: ReviewOutcome<T>, missing: string): T {
  switch (outcome.kind) {
    case 'missing':
      throw new AdminError(404, missing);
    case 'reviewed':
      throw new AdminError(409, 'This was already reviewed. Reload the pending list.');
    case 'updated':
      return outcome.entry;
  }
}

export async function reviewFeedback(id: string, decision: ReviewDecision) {
  return reviewed(
    await feedbackAdminRepository.reviewFeedback(id, decision),
    'Feedback item not found.',
  );
}

export async function reviewReply(replyId: string, decision: ReviewDecision) {
  return replyItem(
    reviewed(await feedbackAdminRepository.reviewReply(replyId, decision), 'Reply not found.'),
    ADMIN_ACCESS,
  );
}
