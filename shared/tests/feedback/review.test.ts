import { FEEDBACK_PAGE_SIZE, OwnFeedbackItemSchema } from '../../src/feedback/listing';
import { FeedbackReplySchema } from '../../src/feedback/replies';
import {
  AdminPendingReviewSchema,
  FEEDBACK_REJECTION_REASON_MAX,
  RejectFeedbackSubmissionSchema,
} from '../../src/feedback/review';
import { FeedbackSubmissionStatusSchema } from '../../src/feedback/submission';

describe('manual feedback review contract', () => {
  const own = {
    id: '10000000-0000-4000-8000-000000000001',
    category: 'bug',
    title: 'Feedback',
    body: 'A plain text comment',
    createdAt: '2026-09-27T00:00:00.000Z',
    status: 'pending',
    rejectionReason: null,
    hasUnreadReplies: false,
    hasStatusUpdate: false,
    replyCount: 0,
    workflowStatus: 'new',
    resolutionReason: null,
    resolutionNote: null,
    duplicateOfId: null,
  };
  const reply = {
    id: '20000000-0000-4000-8000-000000000001',
    feedbackId: own.id,
    author: 'author',
    body: 'More detail',
    createdAt: '2026-09-27T00:00:00.000Z',
    status: 'pending',
    rejectionReason: null,
    isUnread: false,
  };

  it('has no automated review states or scores', () => {
    expect(FeedbackSubmissionStatusSchema.options).toEqual(['pending', 'published', 'rejected']);
    expect(FeedbackSubmissionStatusSchema.safeParse('review_unavailable').success).toBe(false);
    expect(OwnFeedbackItemSchema.parse(own)).toEqual(own);
    for (const extra of [{ triageStatus: 'complete' }, { safetyScores: null }])
      expect(OwnFeedbackItemSchema.safeParse({ ...own, ...extra }).success).toBe(false);
    expect(FeedbackReplySchema.parse(reply)).toEqual(reply);
    expect(FeedbackReplySchema.safeParse({ ...reply, canRetry: false }).success).toBe(false);
  });

  it('normalizes optional plain text rejection reasons', () => {
    expect(RejectFeedbackSubmissionSchema.parse({ reason: '  ' })).toEqual({
      reason: null,
    });
    expect(RejectFeedbackSubmissionSchema.parse({ reason: ' Off topic\r\nSorry ' })).toEqual({
      reason: 'Off topic\nSorry',
    });
    expect(
      RejectFeedbackSubmissionSchema.parse({
        reason: 'x'.repeat(FEEDBACK_REJECTION_REASON_MAX),
      }).reason,
    ).toHaveLength(FEEDBACK_REJECTION_REASON_MAX);
    for (const input of [
      {},
      { reason: null },
      { reason: 'x'.repeat(FEEDBACK_REJECTION_REASON_MAX + 1) },
      { reason: 'See https://example.com' },
      { reason: '<b>no</b>' },
      { reason: 'ok', extra: true },
    ])
      expect(RejectFeedbackSubmissionSchema.safeParse(input).success).toBe(false);
  });

  it('bounds the admin pending review queue', () => {
    const review = {
      feedback: [own],
      feedbackCount: 1,
      replies: [
        {
          reply,
          feedback: {
            id: own.id,
            category: 'bug',
            title: 'Feedback',
            status: 'published',
          },
        },
      ],
      replyCount: 1,
    };
    expect(AdminPendingReviewSchema.parse(review)).toEqual(review);
    expect(
      AdminPendingReviewSchema.safeParse({
        ...review,
        feedback: Array(FEEDBACK_PAGE_SIZE + 1).fill(own),
      }).success,
    ).toBe(false);
    expect(AdminPendingReviewSchema.safeParse({ ...review, replyCount: -1 }).success).toBe(false);
  });
});
