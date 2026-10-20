import { z } from 'zod';
import { FeedbackVoteStateSchema } from './reactions';
import { FeedbackCategorySchema, FeedbackSubmissionStatusSchema } from './submission';
import { type FeedbackWorkflow, FeedbackWorkflowSchema } from './workflow';

export const FEEDBACK_PAGE_SIZE = 20;

export const FeedbackIncludeClosedSchema = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');
export const FeedbackSortSchema = z.enum(['newest', 'top']);
export type FeedbackSort = z.infer<typeof FeedbackSortSchema>;

function validateWorkflow(value: FeedbackWorkflow, context: z.RefinementCtx): void {
  const result = FeedbackWorkflowSchema.safeParse({
    workflowStatus: value.workflowStatus,
    resolutionReason: value.resolutionReason,
    resolutionNote: value.resolutionNote,
    duplicateOfId: value.duplicateOfId,
  });
  if (!result.success) {
    for (const issue of result.error.issues) {
      context.addIssue({
        code: 'custom',
        path: issue.path,
        message: issue.message,
      });
    }
  }
}

export const FeedbackItemSchema = z
  .object({
    id: z.uuid(),
    category: FeedbackCategorySchema,
    title: z.string(),
    body: z.string(),
    createdAt: z.iso.datetime(),
    isOwn: z.boolean(),
    hasUnreadReplies: z.boolean().default(false),
    replyCount: z.number().int().nonnegative().default(0),
    ...FeedbackWorkflowSchema.shape,
  })
  .extend(FeedbackVoteStateSchema.shape)
  .superRefine(validateWorkflow);
export type FeedbackItem = z.infer<typeof FeedbackItemSchema>;
export const OwnFeedbackItemSchema = z
  .strictObject({
    id: z.uuid(),
    category: FeedbackCategorySchema,
    title: z.string(),
    body: z.string(),
    createdAt: z.iso.datetime(),
    status: FeedbackSubmissionStatusSchema,
    rejectionReason: z.string().nullable(),
    hasUnreadReplies: z.boolean().default(false),
    hasStatusUpdate: z.boolean().default(false),
    replyCount: z.number().int().nonnegative().default(0),
    ...FeedbackWorkflowSchema.shape,
  })
  .superRefine(validateWorkflow);
export type OwnFeedbackItem = z.infer<typeof OwnFeedbackItemSchema>;
export const OwnFeedbackPageSchema = z.strictObject({
  items: z.array(OwnFeedbackItemSchema).max(FEEDBACK_PAGE_SIZE),
  nextCursor: z.string().nullable(),
});
export const OwnFeedbackUpdatesSchema = z.strictObject({
  hasUpdates: z.boolean(),
});
export type OwnFeedbackUpdates = z.infer<typeof OwnFeedbackUpdatesSchema>;
export const SeenFeedbackStatusSchema = z.strictObject({
  ids: z.array(z.uuid()).min(1).max(FEEDBACK_PAGE_SIZE),
});
export const FeedbackCountsSchema = z.object({
  general: z.number().int().nonnegative(),
  bug: z.number().int().nonnegative(),
  feature_request: z.number().int().nonnegative(),
  new_character_request: z.number().int().nonnegative(),
});
export type FeedbackCounts = z.infer<typeof FeedbackCountsSchema>;
export const FeedbackPageSchema = z.object({
  counts: FeedbackCountsSchema,
  items: z.array(FeedbackItemSchema).max(FEEDBACK_PAGE_SIZE),
  nextCursor: z.string().nullable(),
});
export type FeedbackPage = z.infer<typeof FeedbackPageSchema>;
