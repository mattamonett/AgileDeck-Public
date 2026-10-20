import { UpdateRoomMoodSchema } from '../../src/room/mood';

describe('room mood', () => {
  it('accepts only the three room moods', () => {
    for (const mood of ['friendly', 'playful', 'spicy']) {
      expect(UpdateRoomMoodSchema.parse({ mood })).toEqual({ mood });
    }
    for (const mood of [null, 'off', 'loud', 'mild', 2]) {
      expect(UpdateRoomMoodSchema.safeParse({ mood }).success).toBe(false);
    }
  });
});
