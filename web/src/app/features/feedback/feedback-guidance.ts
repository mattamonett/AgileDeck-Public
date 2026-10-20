import type { FeedbackCategory } from '@poker/shared';

interface FeedbackGuidance {
  heading: string;
  helpful: readonly string[];
  skip: readonly string[];
  example?: string;
}

export const FEEDBACK_GUIDANCE: Record<FeedbackCategory, FeedbackGuidance> = {
  general: {
    heading: 'Make your feedback actionable',
    helpful: [
      'Say which part of the site you are commenting on.',
      'Describe what worked, what felt confusing, and what you hoped would happen.',
      'Mention when it happens or who it affects if that helps explain it.',
    ],
    skip: [
      'A vague rating without an example.',
      'Passwords, room secrets, or other private information.',
    ],
  },
  bug: {
    heading: 'Help us reproduce the bug',
    helpful: [
      'List the steps you took before the problem appeared.',
      'Describe what you expected and what actually happened.',
      'Include the device, browser, and whether it happens every time.',
    ],
    skip: [
      'Only saying that something is broken.',
      'Passwords, private information, or links to external files.',
    ],
  },
  feature_request: {
    heading: 'Explain the need behind the idea',
    helpful: [
      'Describe the task or problem the feature would help with.',
      'Say what you would like to be able to do and who would benefit.',
      'Mention a simple example of when you would use it.',
    ],
    skip: [
      'A feature name with no use case.',
      'Detailed technical instructions unless they explain the user need.',
    ],
  },
  new_character_request: {
    heading: 'Describe the whole character moment',
    helpful: [
      'Give the character a name and a short personality or visual description.',
      'Describe how it approaches a player’s card.',
      'Explain its action at the card and how the card visibly reacts.',
      'Say how it finishes or leaves. Add a short thought bubble only if you want one.',
      'Suggest small variations so repeated throws feel fresh.',
    ],
    skip: [
      'Only a name or “make it funny” without a movement and card interaction.',
      'Choosing an emoji or specifying 3D code; we can handle those details.',
    ],
    example: [
      'Name: Poppy the Puffin',
      'Personality: Cheerful and a little too proud of every landing.',
      'Approach: Flies in from either side with uneven wingbeats, then lands beside the card.',
      'At the card: Hesitates, taps a reachable lower corner with her beak, and gives a proud hop.',
      'Card response: That corner lifts slightly, rocks once, and settles back into place.',
      'Departure: She waddles two steps, flaps upward, and flies away.',
      'Thought bubble: “Nailed it!” appears just after the tap.',
      'Variation: She sometimes pauses before landing; the tap can land on either lower corner with a slightly different card rock.',
    ].join('\n'),
  },
};
