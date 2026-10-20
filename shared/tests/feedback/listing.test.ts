import {
  FEEDBACK_PAGE_SIZE,
  FeedbackIncludeClosedSchema,
  FeedbackItemSchema,
  FeedbackPageSchema,
  FeedbackSortSchema,
} from '../../src/feedback/listing';

describe('feedback listing', () => {
  it('hides closed feedback by default and accepts only explicit boolean strings', () => {
    expect(FeedbackIncludeClosedSchema.parse(undefined)).toBe(false);
    expect(FeedbackIncludeClosedSchema.parse('false')).toBe(false);
    expect(FeedbackIncludeClosedSchema.parse('true')).toBe(true);
    for (const value of ['invalid', '', true, ['true']]) {
      expect(FeedbackIncludeClosedSchema.safeParse(value).success).toBe(false);
    }
  });

  it('pages by twenty and sorts by newest or top', () => {
    expect(FEEDBACK_PAGE_SIZE).toBe(20);
    expect(FeedbackSortSchema.options).toEqual(['newest', 'top']);
  });

  it('accepts bounded output shapes and rejects malformed responses', () => {
    const item = {
      id: '10000000-0000-4000-8000-000000000001',
      category: 'general',
      title: 'Feedback',
      body: 'A plain text comment',
      createdAt: '2026-09-27T00:00:00.000Z',
      isOwn: false,
      hasUnreadReplies: false,
      replyCount: 0,
      workflowStatus: 'new',
      resolutionReason: null,
      resolutionNote: null,
      duplicateOfId: null,
      voteCounts: {
        agree: 0,
        disagree: 0,
        seen_too: 0,
        would_use: 0,
        not_for_me: 0,
        would_throw: 0,
      },
      userVote: null,
    };
    expect(FeedbackItemSchema.parse(item)).toEqual(item);
    expect(FeedbackItemSchema.safeParse({ ...item, replyCount: -1 }).success).toBe(false);
    expect(FeedbackItemSchema.safeParse({ ...item, replyCount: 1.5 }).success).toBe(false);
    expect(FeedbackItemSchema.safeParse({ ...item, workflowStatus: 'closed' }).success).toBe(false);
    expect(FeedbackItemSchema.safeParse({ ...item, resolutionReason: 'fixed' }).success).toBe(
      false,
    );
    const counts = {
      general: 1,
      bug: 0,
      feature_request: 0,
      new_character_request: 0,
    };
    expect(
      FeedbackPageSchema.parse({ items: [item], nextCursor: null, counts }).items,
    ).toHaveLength(1);
    expect(
      FeedbackPageSchema.safeParse({
        items: Array(21).fill(item),
        nextCursor: null,
        counts,
      }).success,
    ).toBe(false);
    expect(
      FeedbackPageSchema.safeParse({
        items: [item],
        nextCursor: null,
        counts: { ...counts, bug: -1 },
      }).success,
    ).toBe(false);
    expect(FeedbackItemSchema.safeParse({ ...item, createdAt: 'yesterday' }).success).toBe(false);
  });
});
