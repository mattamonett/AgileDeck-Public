import { z } from 'zod';

export const RoomMoodSchema = z.enum(['friendly', 'playful', 'spicy']);
export type RoomMood = z.infer<typeof RoomMoodSchema>;

export const UpdateRoomMoodSchema = z.object({ mood: RoomMoodSchema });
export type UpdateRoomMoodPayload = z.input<typeof UpdateRoomMoodSchema>;
