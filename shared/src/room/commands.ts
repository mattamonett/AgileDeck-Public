import { z } from 'zod';
import { SiteAgreementAcceptanceSchema } from '../legal/agreement';

/**
 * Names and room IDs. Only a plain space: other whitespace, such as a line
 * break, would let a name forge API log lines.
 */
export const ROOM_TEXT_REGEX = /^[a-zA-Z0-9 \-_]+$/;
const ALPHANUMERIC_ERROR =
  'Only alphanumeric characters, spaces, hyphens, and underscores are allowed';

export const JoinRoomSchema = z.object({
  roomId: z.string().trim().min(1).max(50).regex(ROOM_TEXT_REGEX, ALPHANUMERIC_ERROR),
  userName: z.string().trim().min(1).max(20).regex(ROOM_TEXT_REGEX, ALPHANUMERIC_ERROR),
  createRoomIntent: z.boolean().optional(),
  siteAgreement: SiteAgreementAcceptanceSchema.optional(),
});
export type JoinRoomPayload = z.input<typeof JoinRoomSchema>;

export const UpdateRoomNameSchema = z.object({
  name: z.string().trim().min(1).max(50).regex(ROOM_TEXT_REGEX, ALPHANUMERIC_ERROR),
});
export type UpdateRoomNamePayload = z.input<typeof UpdateRoomNameSchema>;

export const ToggleAutoRevealSchema = z.object({
  autoReveal: z.boolean(),
});
export type ToggleAutoRevealPayload = z.input<typeof ToggleAutoRevealSchema>;

export const ToggleIssuesSchema = z.object({
  issuesEnabled: z.boolean(),
});
export type ToggleIssuesPayload = z.input<typeof ToggleIssuesSchema>;

export const UpdateMultiplierSchema = z.object({
  useMultiplier: z.boolean(),
  multiplierValue: z
    .union([z.string(), z.number()])
    .pipe(z.coerce.number<string | number>().finite().min(0.01).max(100)),
});
export type UpdateMultiplierPayload = z.input<typeof UpdateMultiplierSchema>;

export const UpdateUserSchema = z.object({
  name: z.string().trim().min(1).max(20).regex(ROOM_TEXT_REGEX, ALPHANUMERIC_ERROR),
});
export type UpdateUserPayload = z.input<typeof UpdateUserSchema>;

export const ToggleObserverSchema = z.object({
  isObserver: z.boolean(),
});
export type ToggleObserverPayload = z.input<typeof ToggleObserverSchema>;

export const ApproveUserSchema = z.object({
  userId: z.string().min(1).max(100),
});
export type ApproveUserPayload = z.input<typeof ApproveUserSchema>;

export const DenyUserSchema = z.object({
  userId: z.string().min(1).max(100),
});
export type DenyUserPayload = z.input<typeof DenyUserSchema>;
