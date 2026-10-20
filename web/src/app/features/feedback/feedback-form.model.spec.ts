import {
  draftAnswer,
  feedbackBodyLength,
  formatFeedbackBody,
  validateFeedbackDraft,
  type FeedbackDraft,
} from './feedback-form.model';

const FEEDBACK_AGREEMENT_VERSION = '0123456789abcdef';

const bugDraft: FeedbackDraft = {
  category: 'bug',
  title: 'Vote button problem',
  body: 'General draft',
  answers: {
    'bug:actual': ' The vote button does nothing. ',
    'bug:expected': 'My vote should appear.',
    'bug:steps': '   ',
    'feature_request:problem': 'Another draft',
  },
  agreementAccepted: true,
  agreementVersion: FEEDBACK_AGREEMENT_VERSION,
};

describe('feedback draft helpers', () => {
  it('reads general feedback from the body and other types from their own answers', () => {
    expect(draftAnswer({ ...bugDraft, category: 'general' }, 'details')).toBe('General draft');
    expect(draftAnswer(bugDraft, 'expected')).toBe('My vote should appear.');
    expect(draftAnswer(bugDraft, 'environment')).toBe('');
  });

  it('formats labelled sections and skips empty answers', () => {
    expect(formatFeedbackBody(bugDraft)).toBe(
      'What happened? \nThe vote button does nothing. \n \nWhat did you expect? \nMy vote should appear.',
    );
    expect(formatFeedbackBody({ ...bugDraft, category: 'general', body: '  hi  ' })).toBe('hi');
  });

  it('counts characters after normalizing line endings and composed forms', () => {
    expect(feedbackBodyLength('a\r\nb')).toBe(3);
    expect(feedbackBodyLength('é')).toBe(1);
  });

  it('builds the API payload for a valid draft', () => {
    expect(validateFeedbackDraft(bugDraft)).toEqual({
      ok: true,
      feedback: {
        category: 'bug',
        title: 'Vote button problem',
        body: formatFeedbackBody(bugDraft),
        agreementVersion: FEEDBACK_AGREEMENT_VERSION,
        agreementAccepted: true,
      },
    });
  });

  it('sends no agreement when the site asks for none', () => {
    expect(
      validateFeedbackDraft({ ...bugDraft, agreementAccepted: false, agreementVersion: null }),
    ).toEqual({
      ok: true,
      feedback: {
        category: 'bug',
        title: 'Vote button problem',
        body: formatFeedbackBody(bugDraft),
      },
    });
  });

  it('explains missing, short and unaccepted drafts', () => {
    expect(validateFeedbackDraft({ ...bugDraft, answers: {} })).toEqual({
      ok: false,
      message: 'Please fill in “What happened?”.',
    });
    expect(
      validateFeedbackDraft({ ...bugDraft, category: 'general', body: 'too short' }),
    ).toMatchObject({ ok: false, message: expect.stringContaining('at least 20 characters') });
    expect(validateFeedbackDraft({ ...bugDraft, agreementAccepted: false })).toMatchObject({
      ok: false,
      message: expect.stringContaining('agree'),
    });
  });
});
