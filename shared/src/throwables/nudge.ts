import { z } from 'zod';

export const NudgeSchema = z.object({
  targetUserId: z.string().min(1).max(100),
});
export type NudgePayload = z.input<typeof NudgeSchema>;

export const NudgeLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type NudgeLevel = z.infer<typeof NudgeLevelSchema>;
export const NudgeEventSchema = z.object({
  targetUserId: z.string().min(1),
  sourceUserId: z.string().min(1),
  /** Repeat nudges in one round get louder, up to the yell at level 3. */
  level: NudgeLevelSchema,
});
export type NudgeEvent = z.infer<typeof NudgeEventSchema>;
