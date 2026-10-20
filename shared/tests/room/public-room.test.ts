import {
  JoinedSchema,
  PublicRoomSchema,
  PublicUserSchema,
  PublicUsersSchema,
} from '../../src/room/public-room';

const user = {
  id: 'user',
  name: 'Player',
  vote: null,
  hasVoted: false,
  isObserver: false,
  isApproved: true,
};
const room = {
  id: 'room',
  name: null,
  reveal: false,
  autoReveal: false,
  useMultiplier: false,
  multiplierValue: 1,
  theme: 'default',
  lobbyEnabled: true,
  issuesEnabled: true,
  mood: 'playful',
  roundTimer: null,
};

describe('public room contracts', () => {
  it('accepts round timers as elapsed time and rejects clock-like or negative values', () => {
    const running = {
      ...room,
      roundTimer: { elapsedMs: 95_000, running: true },
    };
    expect(PublicRoomSchema.parse(running)).toEqual(running);
    for (const roundTimer of [
      undefined,
      { elapsedMs: -1, running: true },
      { elapsedMs: 1.5, running: false },
      { elapsedMs: 1000 },
      { startedAt: 1, running: true },
    ])
      expect(PublicRoomSchema.safeParse({ ...room, roundTimer }).success).toBe(false);
  });
  it('preserves null fields and omits absent optional fields', () => {
    expect(PublicUserSchema.parse(user)).toEqual(user);
    const overheated = { ...user, throwOverheat: { startedAt: 10, until: 20 } };
    expect(PublicUsersSchema.parse([overheated])).toEqual([overheated]);
    expect(PublicRoomSchema.parse(room)).toEqual(room);
    expect(JoinedSchema.parse({ user, room, connectionNonce: 'nonce' })).toEqual({
      user,
      room,
      connectionNonce: 'nonce',
    });
    expect(JoinedSchema.safeParse({ user, room }).success).toBe(false);
  });

  it('rejects malformed server payloads before consumers access fields', () => {
    for (const value of [null, [], {}, { ...user, vote: 5 }, { ...user, isApproved: 'true' }])
      expect(PublicUserSchema.safeParse(value).success).toBe(false);
    expect(PublicRoomSchema.safeParse({ ...room, multiplierValue: Infinity }).success).toBe(false);
  });
});
