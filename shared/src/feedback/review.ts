import { z } from 'zod';
import { FEEDBACK_PAGE_SIZE, OwnFeedbackItemSchema } from './listing';
import { plainText, safeText, textLength } from './plain-text';
import { FeedbackReplySchema } from './replies';
import { FeedbackCategorySchema, FeedbackSubmissionStatusSchema } from './submission';

export const FEEDBACK_REJECTION_REASON_MAX = 500;
/** An admin's rejection; a blank reason is stored as no reason. */
export const RejectFeedbackSubmissionSchema = z.strictObject({
  reason: z
    .string()
    .transform((value) => plainText(value.replace(/\r\n?/g, '\n')))
    .refine(
      (value) => textLength(value) <= FEEDBACK_REJECTION_REASON_MAX,
      'Rejection reasons must be at most 500 characters.',
    )
    .refine(
      (value) => safeText(value.replace(/\n/g, '')),
      'Rejection reasons must be plain text without links or markup.',
    )
    .transform((value) => (value === '' ? null : value)),
});
export type RejectFeedbackSubmission = z.infer<typeof RejectFeedbackSubmissionSchema>;
export type RejectFeedbackSubmissionInput = z.input<typeof RejectFeedbackSubmissionSchema>;
export const AdminPendingReplySchema = z.strictObject({
  reply: FeedbackReplySchema,
  feedback: z.strictObject({
    id: z.uuid(),
    category: FeedbackCategorySchema,
    title: z.string(),
    status: FeedbackSubmissionStatusSchema,
  }),
});
export type AdminPendingReply = z.infer<typeof AdminPendingReplySchema>;
/** The oldest submissions waiting for review, with the size of each queue. */
export const AdminPendingReviewSchema = z.strictObject({
  feedback: z.array(OwnFeedbackItemSchema).max(FEEDBACK_PAGE_SIZE),
  feedbackCount: z.number().int().nonnegative(),
  replies: z.array(AdminPendingReplySchema).max(FEEDBACK_PAGE_SIZE),
  replyCount: z.number().int().nonnegative(),
});
export type AdminPendingReview = z.infer<typeof AdminPendingReviewSchema>;
