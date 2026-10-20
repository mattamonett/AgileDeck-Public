import {
  CreateFeedbackSchema,
  FEEDBACK_BODY_MAX,
  FEEDBACK_CATEGORIES,
  FEEDBACK_TITLE_MAX,
} from '../../src/feedback/submission';

const FEEDBACK_AGREEMENT_VERSION = '0123456789abcdef';

const valid = {
  category: 'bug',
  title: 'Voting bug',
  body: 'The vote button stopped responding after I joined.',
  agreementVersion: FEEDBACK_AGREEMENT_VERSION,
  agreementAccepted: true,
};

describe('feedback submission', () => {
  it('normalizes safe plain text and accepts every category', () => {
    for (const category of FEEDBACK_CATEGORIES) {
      expect(
        CreateFeedbackSchema.parse({
          ...valid,
          category,
          title: '  Voting bug  ',
          body: '  First line\r\nSecond line with enough details.  ',
        }),
      ).toEqual({
        category,
        title: 'Voting bug',
        body: 'First line\nSecond line with enough details.',
        agreementVersion: FEEDBACK_AGREEMENT_VERSION,
        agreementAccepted: true,
      });
    }
  });

  it('accepts a submission without agreement fields for sites that ask for none', () => {
    const { agreementVersion: _version, agreementAccepted: _accepted, ...rest } = valid;
    expect(CreateFeedbackSchema.parse(rest)).toEqual(rest);
  });

  it('rejects missing, short, long, linked, scripted, or marked-up content', () => {
    for (const input of [
      { ...valid, category: 'other' },
      { ...valid, agreementAccepted: false },
      { ...valid, agreementVersion: '' },
      { ...valid, agreementVersion: 'x'.repeat(65) },
      { ...valid, title: 'bad' },
      { ...valid, title: 'x'.repeat(FEEDBACK_TITLE_MAX + 1) },
      { ...valid, body: 'too short' },
      { ...valid, body: 'x'.repeat(FEEDBACK_BODY_MAX + 1) },
      { ...valid, title: '<b>Bug</b>' },
      { ...valid, title: 'Visit example.com' },
      { ...valid, body: 'See https://example.com for the full problem.' },
      { ...valid, body: 'Use javascript:alert(1) to trigger this.' },
      { ...valid, body: '<script>alert(1)</script> in the field.' },
      { ...valid, body: 'This has a hidden\u200b character in the middle.' },
      { ...valid, extra: 'not allowed' },
    ])
      expect(CreateFeedbackSchema.safeParse(input).success).toBe(false);
  });
});
