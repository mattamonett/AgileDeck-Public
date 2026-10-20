import {
  AdminRoomQuerySchema,
  AdminRoomMemberQuerySchema,
  AdminRoomPageSchema,
  AdminRoomDetailSchema,
} from '../../src/admin/rooms';

const room = {
  id: 'sprint-room_42',
  name: null,
  theme: 'default',
  mood: 'playful',
  approvedMemberCount: 6,
  memberCount: 0,
  issueCount: 0,
  lastActivityAt: '2026-09-30T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('admin room contracts', () => {
  it('bounds pages and validates counts, dates and cursors', () => {
    expect(AdminRoomPageSchema.safeParse({ items: [room], nextCursor: null }).success).toBe(true);
    for (const invalid of [
      { items: Array.from({ length: 51 }, () => room), nextCursor: null },
      { items: [{ ...room, memberCount: -1 }], nextCursor: null },
      { items: [{ ...room, theme: 123 }], nextCursor: null },
      { items: [{ ...room, mood: 'off' }], nextCursor: null },
      { items: [{ ...room, approvedMemberCount: -1 }], nextCursor: null },
      { items: [{ ...room, createdAt: 'yesterday' }], nextCursor: null },
      { items: [room], nextCursor: 'invalid/room' },
    ])
      expect(AdminRoomPageSchema.safeParse(invalid).success).toBe(false);
    expect(AdminRoomQuerySchema.safeParse({ cursor: room.id }).success).toBe(true);
    expect(AdminRoomQuerySchema.safeParse({ limit: '10000' }).success).toBe(false);
  });

  it('accepts room-code cursors while keeping member cursors UUID-only', () => {
    expect(AdminRoomPageSchema.safeParse({ items: [room], nextCursor: room.id }).success).toBe(
      true,
    );
    expect(AdminRoomMemberQuerySchema.safeParse({ cursor: room.id }).success).toBe(false);
    for (const cursor of ['', 'x'.repeat(51), 'room/escape', '<script>']) {
      expect(AdminRoomQuerySchema.safeParse({ cursor }).success).toBe(false);
    }
  });

  it('rejects private identity and vote fields in member details', () => {
    const user = {
      memberReference: 'test-reference',
      rateLimitCount: 0,
      lastRateLimitAt: null,
      id: '10000000-0000-4000-8000-000000000001',
      name: 'Alice',
      isObserver: false,
      isApproved: true,
      createdAt: room.createdAt,
    };
    const detail = {
      room,
      approvedMembers: [],
      nextApprovedOffset: null,
      users: [user],
      nextCursor: null,
    };
    expect(AdminRoomDetailSchema.safeParse(detail).success).toBe(true);
    for (const extra of [{ visitorId: 'private' }, { vote: '8' }]) {
      expect(
        AdminRoomDetailSchema.safeParse({
          ...detail,
          users: [{ ...user, ...extra }],
        }).success,
      ).toBe(false);
    }
  });
});
