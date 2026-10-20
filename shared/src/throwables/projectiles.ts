import { z } from 'zod';
import { VALID_INTERACTION_CHARACTERS } from './catalog';

const INTERACTION_EMOJI_MAX_LENGTH = 8;
const INVALID_EMOJI_ERROR = 'Invalid emoji character';

/** An optional throwable emoji; an empty value means the thrower's default. */
const OptionalInteractionEmojiSchema = z
  .string()
  .max(INTERACTION_EMOJI_MAX_LENGTH)
  .optional()
  .refine((val) => !val || VALID_INTERACTION_CHARACTERS.has(val), {
    message: INVALID_EMOJI_ERROR,
  });

export const ProjectileSchema = z.object({
  targetUserId: z.string().min(1).max(100),
  emoji: OptionalInteractionEmojiSchema,
});
export type ProjectilePayload = z.input<typeof ProjectileSchema>;

export interface ProjectileEvent {
  sourceUserId: string;
  targetUserId: string;
  emoji: string;
  side: 'left' | 'right';
  offsetX: number;
  offsetY: number;
  rotation: number;
  id: string;
  startX: number;
  startY: number;
}

export interface ThrowOverheat {
  startedAt: number;
  until: number;
}

export const ProjectileBarrageSchema = z.object({
  sourceUserId: z.string().min(1),
  targetUserId: z.string().min(1),
  emoji: z.string().min(1),
});
export const ProjectileEventSchema = ProjectileBarrageSchema.extend({
  id: z.string().min(1),
  side: z.enum(['left', 'right']),
  offsetX: z.number().finite(),
  offsetY: z.number().finite(),
  rotation: z.number().finite(),
  startX: z.number().finite(),
  startY: z.number().finite(),
});
