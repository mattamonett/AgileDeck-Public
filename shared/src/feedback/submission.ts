import { z } from 'zod';
import { AgreementVersionSchema } from '../legal/agreement';
import { plainText, safeText, textLength } from './plain-text';

export const FEEDBACK_CATEGORIES = [
  'general',
  'bug',
  'feature_request',
  'new_character_request',
] as const;
export const FEEDBACK_TITLE_MIN = 5;
export const FEEDBACK_TITLE_MAX = 100;
export const FEEDBACK_BODY_MIN = 20;
export const FEEDBACK_BODY_MAX = 2000;

export const FeedbackCategorySchema = z.enum(FEEDBACK_CATEGORIES);
export type FeedbackCategory = z.infer<typeof FeedbackCategorySchema>;

export const CreateFeedbackSchema = z.strictObject({
  /** Absent when the site does not ask for an agreement. */
  agreementVersion: AgreementVersionSchema.optional(),
  agreementAccepted: z
    .literal(true, 'You must agree to the site terms before submitting feedback.')
    .optional(),
  category: FeedbackCategorySchema,
  title: z
    .string()
    .transform(plainText)
    .refine(
      (value) => textLength(value) >= FEEDBACK_TITLE_MIN && textLength(value) <= FEEDBACK_TITLE_MAX,
      'Title must be 5–100 characters.',
    )
    .refine(safeText, 'Title must be plain text without links or markup.'),
  body: z
    .string()
    .transform((value) => plainText(value.replace(/\r\n?/g, '\n')))
    .refine(
      (value) => textLength(value) >= FEEDBACK_BODY_MIN && textLength(value) <= FEEDBACK_BODY_MAX,
      'Details must be 20–2,000 characters.',
    )
    .refine(
      (value) => safeText(value.replace(/\n/g, '')),
      'Details must be plain text without links or markup.',
    ),
});
export type CreateFeedbackInput = z.input<typeof CreateFeedbackSchema>;

/** New items and author replies stay private as `pending` until an admin reviews them. */
export const FeedbackSubmissionStatusSchema = z.enum(['pending', 'published', 'rejected']);
export type FeedbackSubmissionStatus = z.infer<typeof FeedbackSubmissionStatusSchema>;
