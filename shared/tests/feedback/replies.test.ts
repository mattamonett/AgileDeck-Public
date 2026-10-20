import { CreateFeedbackReplySchema, ReadFeedbackRepliesSchema } from '../../src/feedback/replies';

describe('feedback replies', () => {
  it('validates immutable plain text replies without client roles or workflow fields', () => {
    expect(
      CreateFeedbackReplySchema.parse({
        body: '  First line\r\nSecond line  ',
      }),
    ).toEqual({ body: 'First line\nSecond line' });
    expect(CreateFeedbackReplySchema.safeParse({ body: '😀'.repeat(2000) }).success).toBe(true);
    for (const body of [
      '',
      ' ',
      'x'.repeat(2001),
      'Visit https://example.com',
      '<b>hello</b>',
      'hello\u0000there',
    ]) {
      expect(CreateFeedbackReplySchema.safeParse({ body }).success).toBe(false);
    }
    for (const extra of [
      { author: 'admin' },
      { workflowStatus: 'new' },
      { feedbackId: 'someone-else' },
    ]) {
      expect(
        CreateFeedbackReplySchema.safeParse({
          body: 'Thanks for looking into this.',
          ...extra,
        }).success,
      ).toBe(false);
    }
    const id = '10000000-0000-4000-8000-000000000001';
    expect(ReadFeedbackRepliesSchema.safeParse({ ids: [id] }).success).toBe(true);
    expect(ReadFeedbackRepliesSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(ReadFeedbackRepliesSchema.safeParse({ ids: Array(21).fill(id) }).success).toBe(false);
  });
});
