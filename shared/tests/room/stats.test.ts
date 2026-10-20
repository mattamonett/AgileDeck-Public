import { RoomStatsQuerySchema, RoomStatsSchema } from '../../src/room/stats';

describe('room stats contracts', () => {
  it('defaults to participation and a bounded first page', () => {
    expect(RoomStatsQuerySchema.parse({ roomId: 'ROOM' })).toEqual({
      roomId: 'room',
      page: 1,
      sort: 'votesCast',
    });
  });
  it.each([
    { page: 0 },
    { page: 'no' },
    { page: 1.5 },
    { page: 100001 },
    { sort: 'visitorId' },
    { sort: 'reactionsSent' },
    { roomId: '' },
  ])('rejects invalid query fields %j', (fields) => {
    expect(RoomStatsQuerySchema.safeParse({ roomId: 'room', ...fields }).success).toBe(false);
  });
  it('rejects incomplete stats responses', () => {
    expect(RoomStatsSchema.safeParse({ roomName: 'Room', totals: { votesCast: -1 } }).success).toBe(
      false,
    );
  });
});

it.each(['bestVoteStreak', 'characterVariety'])('accepts the %s leaderboard category', (sort) => {
  expect(RoomStatsQuerySchema.parse({ roomId: 'room', sort }).sort).toBe(sort);
});
