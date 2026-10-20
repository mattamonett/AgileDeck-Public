import { z } from 'zod';
import { FEEDBACK_BODY_MAX } from './submission';

export const FeedbackWorkflowStatusSchema = z.enum(['new', 'under_review', 'closed']);
export const FeedbackResolutionReasonSchema = z.enum([
  'implemented',
  'fixed',
  'duplicate',
  'not_planned',
  'unable_to_reproduce',
]);
export type FeedbackWorkflowStatus = z.infer<typeof FeedbackWorkflowStatusSchema>;
export type FeedbackResolutionReason = z.infer<typeof FeedbackResolutionReasonSchema>;

export const FeedbackWorkflowSchema = z
  .strictObject({
    workflowStatus: FeedbackWorkflowStatusSchema,
    resolutionReason: FeedbackResolutionReasonSchema.nullable(),
    resolutionNote: z.string().max(FEEDBACK_BODY_MAX).nullable(),
    duplicateOfId: z.uuid().nullable(),
  })
  .superRefine((value, context) => {
    if ((value.workflowStatus === 'closed') !== (value.resolutionReason !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['resolutionReason'],
        message: 'Closed feedback requires a resolution reason; open feedback cannot have one.',
      });
    }
    if (value.workflowStatus !== 'closed' && value.resolutionNote !== null) {
      context.addIssue({
        code: 'custom',
        path: ['resolutionNote'],
        message: 'Only closed feedback can have a resolution note.',
      });
    }
    if (value.duplicateOfId !== null && value.resolutionReason !== 'duplicate') {
      context.addIssue({
        code: 'custom',
        path: ['duplicateOfId'],
        message: 'Only duplicate feedback can reference another item.',
      });
    }
  });
export type FeedbackWorkflow = z.infer<typeof FeedbackWorkflowSchema>;

export const UpdateFeedbackWorkflowSchema = z
  .strictObject({
    previous: FeedbackWorkflowSchema,
    next: FeedbackWorkflowSchema,
  })
  .superRefine((value, context) => {
    if (value.next.resolutionReason === 'duplicate' && value.next.duplicateOfId === null) {
      context.addIssue({
        code: 'custom',
        path: ['next', 'duplicateOfId'],
        message: 'Choose the original feedback item for a duplicate.',
      });
    }
  });
export type UpdateFeedbackWorkflow = z.infer<typeof UpdateFeedbackWorkflowSchema>;
