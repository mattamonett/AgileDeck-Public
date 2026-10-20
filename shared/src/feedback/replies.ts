import { z } from 'zod';
import { plainText, safeText, textLength } from './plain-text';
import { FeedbackSubmissionStatusSchema } from './submission';

export const FEEDBACK_REPLY_MAX = 2000;
export const FEEDBACK_REPLY_PAGE_SIZE = 20;
export const CreateFeedbackReplySchema = z.strictObject({
  body: z
    .string()
    .transform((value) => plainText(value.replace(/\r\n?/g, '\n')))
    .refine(
      (value) => textLength(value) >= 1 && textLength(value) <= FEEDBACK_REPLY_MAX,
      'Replies must be 1–2,000 characters.',
    )
    .refine(
      (value) => safeText(value.replace(/\n/g, '')),
      'Replies must be plain text without links or markup.',
    ),
});
export const FeedbackReplySchema = z.strictObject({
  id: z.uuid(),
  feedbackId: z.uuid(),
  author: z.enum(['admin', 'author']),
  body: z.string(),
  createdAt: z.iso.datetime(),
  status: FeedbackSubmissionStatusSchema,
  rejectionReason: z.string().nullable(),
  isUnread: z.boolean(),
});
export type FeedbackReply = z.infer<typeof FeedbackReplySchema>;
export const FeedbackReplyPageSchema = z.strictObject({
  totalCount: z.number().int().nonnegative().default(0),
  items: z.array(FeedbackReplySchema).max(FEEDBACK_REPLY_PAGE_SIZE),
  nextCursor: z.uuid().nullable(),
  canReply: z.boolean(),
  hasUnread: z.boolean(),
});
export const ReadFeedbackRepliesSchema = z.strictObject({
  ids: z.array(z.uuid()).min(1).max(FEEDBACK_REPLY_PAGE_SIZE),
});
export const FeedbackReplyReadStateSchema = z.strictObject({
  hasUnread: z.boolean(),
});
