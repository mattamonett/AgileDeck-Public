import {
  ApproveUserSchema,
  DenyUserSchema,
  JoinRoomSchema,
  ToggleAutoRevealSchema,
  ToggleIssuesSchema,
  ToggleObserverSchema,
  UpdateMultiplierSchema,
  UpdateRoomNameSchema,
  UpdateUserSchema,
} from '../../src/room/commands';

const FEEDBACK_AGREEMENT_VERSION = '0123456789abcdef';

describe('room command schemas', () => {
  it('accepts only boolean values for the room issues setting', () => {
    expect(ToggleIssuesSchema.parse({ issuesEnabled: false })).toEqual({
      issuesEnabled: false,
    });
    expect(ToggleIssuesSchema.parse({ issuesEnabled: true })).toEqual({
      issuesEnabled: true,
    });
    for (const payload of [{}, { issuesEnabled: 'false' }, { issuesEnabled: 1 }, null]) {
      expect(ToggleIssuesSchema.safeParse(payload).success).toBe(false);
    }
  });

  describe('JoinRoomSchema', () => {
    it('should validate valid data', () => {
      const data = {
        roomId: 'room1',
        userName: 'user1',
        createRoomIntent: true,
      };
      expect(JoinRoomSchema.parse(data)).toEqual(data);
      expect(
        JoinRoomSchema.parse({
          roomId: 'room1',
          userName: 'user1',
          siteAgreement: {
            version: FEEDBACK_AGREEMENT_VERSION,
            accepted: true,
          },
        }).siteAgreement,
      ).toEqual({ version: FEEDBACK_AGREEMENT_VERSION, accepted: true });
    });

    it('should fail on invalid data', () => {
      expect(() => JoinRoomSchema.parse({})).toThrow();
      expect(() => JoinRoomSchema.parse({ roomId: '', userName: '' })).toThrow();
      for (const siteAgreement of [
        { version: FEEDBACK_AGREEMENT_VERSION, accepted: false },
        { version: '', accepted: true },
      ]) {
        expect(
          JoinRoomSchema.safeParse({
            roomId: 'room1',
            userName: 'user1',
            siteAgreement,
          }).success,
        ).toBe(false);
      }
    });

    it('allows spaces but no other whitespace, so names cannot forge log lines', () => {
      expect(JoinRoomSchema.safeParse({ roomId: 'my room', userName: 'Ada L' }).success).toBe(true);
      for (const text of ['a\nb', 'a\rb', 'a\tb', 'a b', 'a b']) {
        expect(JoinRoomSchema.safeParse({ roomId: text, userName: 'user1' }).success).toBe(false);
        expect(JoinRoomSchema.safeParse({ roomId: 'room1', userName: text }).success).toBe(false);
        expect(UpdateUserSchema.safeParse({ name: text }).success).toBe(false);
        expect(UpdateRoomNameSchema.safeParse({ name: text }).success).toBe(false);
      }
    });
  });

  describe('UpdateRoomNameSchema', () => {
    it('should validate valid data', () => {
      expect(UpdateRoomNameSchema.parse({ name: 'New Name' })).toEqual({
        name: 'New Name',
      });
    });
  });

  describe('ToggleAutoRevealSchema', () => {
    it('should validate valid data', () => {
      expect(ToggleAutoRevealSchema.parse({ autoReveal: true })).toEqual({
        autoReveal: true,
      });
    });
  });

  describe('UpdateMultiplierSchema', () => {
    it('should transform string multiplier to number', () => {
      const result = UpdateMultiplierSchema.parse({
        useMultiplier: true,
        multiplierValue: '5',
      });
      expect(result).toEqual({ useMultiplier: true, multiplierValue: 5 });
    });

    it('should keep number multiplier as number', () => {
      const result = UpdateMultiplierSchema.parse({
        useMultiplier: true,
        multiplierValue: 10,
      });
      expect(result).toEqual({ useMultiplier: true, multiplierValue: 10 });
    });

    it('should reject non-finite and out-of-range multipliers', () => {
      expect(() =>
        UpdateMultiplierSchema.parse({
          useMultiplier: true,
          multiplierValue: 'NaN',
        }),
      ).toThrow();
      expect(() =>
        UpdateMultiplierSchema.parse({
          useMultiplier: true,
          multiplierValue: Infinity,
        }),
      ).toThrow();
      expect(() =>
        UpdateMultiplierSchema.parse({
          useMultiplier: true,
          multiplierValue: 0,
        }),
      ).toThrow();
      expect(() =>
        UpdateMultiplierSchema.parse({
          useMultiplier: true,
          multiplierValue: 101,
        }),
      ).toThrow();
    });
  });

  describe('UpdateUserSchema', () => {
    it('should validate valid data', () => {
      expect(UpdateUserSchema.parse({ name: 'Bob' })).toEqual({ name: 'Bob' });
    });
  });

  describe('ToggleObserverSchema', () => {
    it('should validate valid data', () => {
      expect(ToggleObserverSchema.parse({ isObserver: true })).toEqual({
        isObserver: true,
      });
    });
  });

  describe('User Management', () => {
    it('should validate ApproveUserSchema', () => {
      expect(ApproveUserSchema.parse({ userId: 'u1' })).toEqual({
        userId: 'u1',
      });
    });
    it('should validate DenyUserSchema', () => {
      expect(DenyUserSchema.parse({ userId: 'u1' })).toEqual({ userId: 'u1' });
    });
  });
});

describe('strict editable boundaries', () => {
  it.each([true, false, null, [], [2], {}, undefined])(
    'rejects nonnumeric multiplier input %j',
    (multiplierValue) => {
      expect(
        UpdateMultiplierSchema.safeParse({
          useMultiplier: true,
          multiplierValue,
        }).success,
      ).toBe(false);
    },
  );
  it('rejects blank identities and trims meaningful names', () => {
    expect(JoinRoomSchema.safeParse({ roomId: ' ', userName: 'Name' }).success).toBe(false);
    expect(UpdateUserSchema.safeParse({ name: ' ' }).success).toBe(false);
    expect(UpdateRoomNameSchema.parse({ name: ' Room ' }).name).toBe('Room');
    expect(ApproveUserSchema.safeParse({ userId: '' }).success).toBe(false);
  });
});
