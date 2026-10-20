import { CreateFeedbackSchema, FEEDBACK_BODY_MIN, type FeedbackCategory } from '@poker/shared';
import type { CreateFeedback } from './feedback-api.service';

export const FEEDBACK_CATEGORY_LABELS: Readonly<Record<FeedbackCategory, string>> = {
  general: 'General feedback',
  bug: 'Bug',
  feature_request: 'Feature request',
  new_character_request: 'New character request',
};

export interface FeedbackField {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly required: boolean;
}

export const FEEDBACK_FIELDS: Record<FeedbackCategory, readonly FeedbackField[]> = {
  general: [
    {
      id: 'details',
      label: 'Your feedback',
      placeholder: 'What worked well, felt confusing, or could be better?',
      required: true,
    },
  ],
  bug: [
    {
      id: 'actual',
      label: 'What happened?',
      placeholder: 'Describe the problem you saw.',
      required: true,
    },
    {
      id: 'expected',
      label: 'What did you expect?',
      placeholder: 'Describe what should have happened.',
      required: true,
    },
    {
      id: 'steps',
      label: 'Steps to reproduce',
      placeholder: 'What did you do just before the problem appeared?',
      required: false,
    },
    {
      id: 'environment',
      label: 'Device, browser, and frequency',
      placeholder: 'Which device and browser were you using? Does it happen every time?',
      required: false,
    },
  ],
  feature_request: [
    {
      id: 'problem',
      label: 'What are you trying to do?',
      placeholder: 'Describe the task or problem you need help with.',
      required: true,
    },
    {
      id: 'idea',
      label: 'How would this feature help?',
      placeholder: 'What would you like to be able to do?',
      required: true,
    },
    {
      id: 'example',
      label: 'Who would use it and when?',
      placeholder: 'Give an example or describe your current workaround.',
      required: false,
    },
  ],
  new_character_request: [
    {
      id: 'character',
      label: 'Character and personality',
      placeholder: 'Give it a name and describe its appearance or personality.',
      required: true,
    },
    {
      id: 'approach',
      label: 'Approach',
      placeholder: 'How does it travel toward a player’s card?',
      required: false,
    },
    {
      id: 'action',
      label: 'Action and card reaction',
      placeholder: 'What does it do at the card, and how does the card visibly react?',
      required: true,
    },
    {
      id: 'departure',
      label: 'Finish or departure',
      placeholder: 'How does the moment end?',
      required: false,
    },
    {
      id: 'extras',
      label: 'Thought bubble or variations',
      placeholder: 'Optional words or small changes to make repeated throws feel fresh.',
      required: false,
    },
  ],
};

/** What a visitor has typed so far; non-general answers are kept per type so switching keeps drafts. */
export interface FeedbackDraft {
  readonly category: FeedbackCategory;
  readonly title: string;
  readonly body: string;
  readonly answers: Readonly<Record<string, string>>;
  readonly agreementAccepted: boolean;
  /** The agreement version to accept, or null when the site asks for no agreement. */
  readonly agreementVersion: string | null;
}

export type FeedbackAnswers = Pick<FeedbackDraft, 'category' | 'body' | 'answers'>;

export type FeedbackSubmission =
  | { readonly ok: true; readonly feedback: CreateFeedback }
  | { readonly ok: false; readonly message: string };

export function answerKey(category: FeedbackCategory, fieldId: string): string {
  return `${category}:${fieldId}`;
}

export function draftAnswer(draft: FeedbackAnswers, fieldId: string): string {
  return draft.category === 'general'
    ? draft.body
    : (draft.answers[answerKey(draft.category, fieldId)] ?? '');
}

/** The body sent to the API: general feedback as typed, other types as labelled sections. */
export function formatFeedbackBody(draft: FeedbackAnswers): string {
  if (draft.category === 'general') return draft.body.trim();
  return (
    FEEDBACK_FIELDS[draft.category]
      .filter((field) => draftAnswer(draft, field.id).trim())
      .map((field) => `${field.label}\n${draftAnswer(draft, field.id).trim()}`)
      .join('\n\n')
      // Keep words separated when the shared plain-text validator removes newlines.
      .replace(/\r\n?|\n/g, ' \n')
  );
}

export function feedbackBodyLength(body: string): number {
  return Array.from(body.replace(/\r\n?/g, '\n').normalize('NFC')).length;
}

export function validateFeedbackDraft(draft: FeedbackDraft): FeedbackSubmission {
  const fields = FEEDBACK_FIELDS[draft.category];
  const missing = fields.find((field) => field.required && !draftAnswer(draft, field.id).trim());
  if (missing) return { ok: false, message: `Please fill in “${missing.label}”.` };
  const answerLength = fields.reduce(
    (length, field) =>
      length + Array.from(draftAnswer(draft, field.id).trim().normalize('NFC')).length,
    0,
  );
  if (answerLength < FEEDBACK_BODY_MIN) {
    return {
      ok: false,
      message: `Please include at least ${FEEDBACK_BODY_MIN} characters across your answers.`,
    };
  }
  const parsed = CreateFeedbackSchema.safeParse({
    category: draft.category,
    title: draft.title,
    body: formatFeedbackBody(draft),
    ...(draft.agreementVersion === null
      ? {}
      : { agreementVersion: draft.agreementVersion, agreementAccepted: draft.agreementAccepted }),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check your feedback fields.' };
  }
  return { ok: true, feedback: parsed.data };
}
