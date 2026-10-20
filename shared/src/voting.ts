import { z } from 'zod';

// The complete set of valid vote values a player can submit.
export const VALID_VOTES = [
  '0.5',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '?',
] as const;
export type ValidVote = (typeof VALID_VOTES)[number];

export const VoteSchema = z.object({
  // Only permit the deck's known card values (or null to clear a vote).
  // This prevents arbitrary string injection that could skew the average.
  vote: z.enum(VALID_VOTES, { error: 'Invalid vote value' }).nullable(),
});
export type VotePayload = z.input<typeof VoteSchema>;

export const RevelationStartedSchema = z.object({
  seconds: z.number().finite().nonnegative(),
});
export const RevealStateSchema = z.boolean();

export const ResultSnapshotPlayerSchema = z.object({
  id: z.string().min(1),
  name: z.string().catch('Anonymous'),
  vote: z.string().nullable().optional(),
});
export const ResultSnapshotSchema = z.array(ResultSnapshotPlayerSchema);
