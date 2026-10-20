import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer } from 'node:http';
import { encodeVisitorCookie, VISITOR_COOKIE_NAME } from '../../src/platform/http/visitor-session';
import type { PrismaClient, User } from '@prisma/client';
import type * as Stats from '../../src/modules/rooms/room-stats.repository';
import type * as StatsService from '../../src/modules/rooms/room-stats.service';
import type * as ThrowStats from '../../src/modules/rooms/throw-stats';
import type * as UserRepository from '../../src/modules/rooms/user.repository';
import { RoomStatsSchema } from '@poker/shared';
import { setSiteConfig } from '../../src/config/site-config';
import { MigratedDatabase } from '../helpers/migrated-database';

describe('persistent room stats', () => {
  const database = new MigratedDatabase('poker-stats-');
  let db: PrismaClient;
  let stats: typeof Stats;
  let throws: typeof StatsService;
  let throwStats: ThrowStats.ThrowStatsRecorder;
  let users: typeof UserRepository;
  let alice: User;
  let bob: User;

  beforeAll(async () => {
    database.setUp();
    db = (await import('../../src/platform/db/prisma')).default;
    stats = await import('../../src/modules/rooms/room-stats.repository');
    throws = await import('../../src/modules/rooms/room-stats.service');
    throwStats = (await import('../../src/modules/rooms/throw-stats')).throwStats;
    users = await import('../../src/modules/rooms/user.repository');
  }, 30000);
  beforeEach(async () => {
    await db.room.deleteMany();
    await db.room.create({ data: { id: 'room' } });
    await db.room.create({ data: { id: 'other' } });
    alice = await users.create({
      name: 'Alice',
      visitorId: 'alice',
      room: { connect: { id: 'room' } },
    });
    bob = await users.create({
      name: 'Bob',
      visitorId: 'bob',
      room: { connect: { id: 'room' } },
    });
  });
  afterAll(async () => {
    await db?.$disconnect();
    database.tearDown();
  });

  it('counts once per round across vote changes, clears, simultaneous requests and reconnects', async () => {
    await Promise.all([
      stats.setVoteWithStats(alice.id, '3'),
      stats.setVoteWithStats(alice.id, '5'),
    ]);
    await stats.setVoteWithStats(alice.id, null);
    await stats.setVoteWithStats(alice.id, '8');
    await users.delete(alice.id);
    await db.$disconnect();
    alice = await users.create({
      name: 'New name',
      visitorId: 'alice',
      room: { connect: { id: 'room' } },
    });
    await stats.setVoteWithStats(alice.id, '5');
    let result = await stats.readRoomStats('room', 'alice', 1, 'votesCast');
    expect(result?.totals.votesCast).toBe(1);
    expect(result?.members[0]).toMatchObject({
      name: 'New name',
      isYou: true,
      rank: 1,
    });
    await db.room.update({
      where: { id: 'room' },
      data: { roundNumber: { increment: 1 } },
    });
    await stats.setVoteWithStats(alice.id, '5');
    result = await stats.readRoomStats('room', 'alice', 1, 'votesCast');
    expect(result?.totals.votesCast).toBe(2);
    expect(result?.startedAt).not.toBeNull();
    expect(RoomStatsSchema.safeParse(result).success).toBe(true);
    expect(JSON.stringify(result)).not.toContain('visitorId');
    expect(JSON.stringify(result)).not.toContain('lastVotedRound');
  });

  it('does not count observers, pending members, revealed votes, or clearing an uncast vote', async () => {
    await stats.setVoteWithStats(alice.id, null);
    await users.updateObserverStatus(alice.id, true);
    await stats.setVoteWithStats(alice.id, '3');
    await db.user.update({
      where: { id: bob.id },
      data: { isApproved: false },
    });
    await stats.setVoteWithStats(bob.id, '3');
    await users.updateObserverStatus(alice.id, false);
    await db.room.update({ where: { id: 'room' }, data: { reveal: true } });
    await stats.setVoteWithStats(alice.id, '3');
    expect((await stats.readRoomStats('room', 'alice', 1, 'votesCast'))?.totals.votesCast).toBe(0);
  });

  it('credits buffered throws and barrages on flush with shared ranks', async () => {
    expect(await throws.recordInteraction('room', alice.id, 'alice', 'throw', bob.id)).toBe(true);
    expect(await throws.recordInteraction('room', bob.id, 'bob', 'barrage', alice.id)).toBe(true);
    expect((await stats.readRoomStats('room', 'alice', 1, 'throwsSent'))?.totals.throwsSent).toBe(
      0,
    );
    await throwStats.drain();
    const result = await stats.readRoomStats('room', 'alice', 1, 'throwsSent');
    expect(result?.totals).toEqual({
      votesCast: 0,
      throwsSent: 2,
      throwsReceived: 2,
      barragesSent: 1,
    });
    expect(result?.members.map((member) => member.rank)).toEqual([1, 1]);
    expect(result?.members.find((member) => member.name === 'Alice')).toMatchObject({
      throwsSent: 1,
      throwsReceived: 1,
    });
  });

  it('rejects spoofed identities, invalid targets, self throws, pending targets and revealed throws', async () => {
    const outsider = await users.create({
      name: 'Other',
      visitorId: 'other',
      room: { connect: { id: 'other' } },
    });
    expect(await throws.recordInteraction('room', alice.id, 'bob', 'throw', bob.id)).toBe(false);
    expect(await throws.recordInteraction('room', alice.id, null, 'throw', bob.id)).toBe(false);
    expect(await throws.recordInteraction('room', alice.id, 'alice', 'throw', outsider.id)).toBe(
      false,
    );
    expect(await throws.recordInteraction('room', alice.id, 'alice', 'throw', alice.id)).toBe(
      false,
    );
    expect(await throws.recordInteraction('room', alice.id, 'alice', 'throw')).toBe(false);
    await db.user.update({
      where: { id: bob.id },
      data: { isApproved: false },
    });
    expect(await throws.recordInteraction('room', alice.id, 'alice', 'throw', bob.id)).toBe(false);
    await db.room.update({ where: { id: 'room' }, data: { reveal: true } });
    expect(await throws.recordInteraction('room', alice.id, 'alice', 'throw', bob.id)).toBe(false);
    await throwStats.drain();
    expect((await stats.readRoomStats('room', 'alice', 1, 'throwsSent'))?.totals.throwsSent).toBe(
      0,
    );
  });

  it('drops buffered throws for approvals deleted before the flush', async () => {
    expect(await throws.recordInteraction('room', alice.id, 'alice', 'throw', bob.id)).toBe(true);
    await db.roomApproval.delete({
      where: { roomId_visitorId: { roomId: 'room', visitorId: 'bob' } },
    });
    await throwStats.drain();
    const result = await stats.readRoomStats('room', 'alice', 1, 'throwsSent');
    expect(result?.totals).toMatchObject({ throwsSent: 1, throwsReceived: 0 });
  });

  it('requires room approval and removes stats with approval and room deletion', async () => {
    await users.create({
      name: 'Pending',
      visitorId: 'pending',
      isApproved: false,
      room: { connect: { id: 'room' } },
    });
    expect(await stats.readRoomStats('room', 'pending', 1, 'votesCast')).toBeNull();
    expect(await stats.readRoomStats('other', 'alice', 1, 'votesCast')).toBeNull();
    await stats.setVoteWithStats(alice.id, '5');
    await db.roomApproval.delete({
      where: { roomId_visitorId: { roomId: 'room', visitorId: 'alice' } },
    });
    expect((await stats.readRoomStats('room', 'bob', 1, 'votesCast'))?.totals.votesCast).toBe(0);
    await db.room.delete({ where: { id: 'room' } });
    expect(await db.roomApproval.count({ where: { roomId: 'room' } })).toBe(0);
  });

  it('bounds pages and assigns global ranks when scores span pages', async () => {
    for (let index = 0; index < 26; index++)
      await db.roomApproval.create({
        data: { roomId: 'room', visitorId: `extra-${index}`, votesCast: index },
      });
    const first = await stats.readRoomStats('room', 'alice', 1, 'votesCast');
    const second = await stats.readRoomStats('room', 'alice', 2, 'votesCast');
    expect(first?.members).toHaveLength(25);
    expect(second?.members).toHaveLength(3);
    expect(second?.members.map((member) => member.rank)).toEqual([26, 26, 26]);
    expect(
      new Set([...(first?.members ?? []), ...(second?.members ?? [])].map((member) => member.id))
        .size,
    ).toBe(28);
  });
  async function nextRound() {
    await db.room.update({
      where: { id: 'room' },
      data: {
        reveal: false,
        roundNumber: { increment: 1 },
      },
    });
    await db.user.updateMany({
      where: { roomId: 'room' },
      data: { vote: null },
    });
  }

  it('credits reveals atomically once and keeps best streaks after a missed vote', async () => {
    await stats.setVoteWithStats(alice.id, '5');
    await stats.setVoteWithStats(bob.id, '5');
    const reveals = await Promise.all([
      stats.revealWithStats('room'),
      stats.revealWithStats('room'),
    ]);
    expect(reveals.filter(Boolean)).toHaveLength(1);
    await nextRound();
    await stats.setVoteWithStats(alice.id, '8');
    await stats.setVoteWithStats(bob.id, '8');
    await stats.setVoteWithStats(bob.id, null);
    await stats.revealWithStats('room');
    let result = await stats.readRoomStats('room', 'alice', 1, 'bestVoteStreak');
    expect(result?.roundsRevealed).toBe(2);
    expect(result?.unanimousRounds).toBe(1);
    expect(result?.members[0]).toMatchObject({
      name: 'Alice',
      bestVoteStreak: 2,
    });
    expect(result?.awards.onARoll).toMatchObject({ score: 2, winnerCount: 1 });
    await nextRound();
    await stats.revealWithStats('room');
    result = await stats.readRoomStats('room', 'alice', 1, 'bestVoteStreak');
    expect(result?.members[0]?.bestVoteStreak).toBe(2);
    expect(
      (
        await db.roomApproval.findUniqueOrThrow({
          where: {
            roomId_visitorId: { roomId: 'room', visitorId: 'alice' },
          },
        })
      ).currentVoteStreak,
    ).toBe(0);
    expect(RoomStatsSchema.safeParse(result).success).toBe(true);
  });

  it('pauses streaks while observing or away; uncertainty counts as participation, not harmony', async () => {
    await stats.setVoteWithStats(alice.id, '?');
    await stats.setVoteWithStats(bob.id, '?');
    await stats.revealWithStats('room');
    await nextRound();
    await users.updateObserverStatus(alice.id, true);
    await stats.setVoteWithStats(bob.id, '3');
    await stats.revealWithStats('room');
    await nextRound();
    await users.updateObserverStatus(alice.id, false);
    await users.delete(bob.id);
    await stats.setVoteWithStats(alice.id, '3');
    await stats.revealWithStats('room');
    bob = await users.create({
      name: 'Bob',
      visitorId: 'bob',
      room: { connect: { id: 'room' } },
    });
    await nextRound();
    await stats.setVoteWithStats(bob.id, '5');
    await stats.revealWithStats('room');
    const result = await stats.readRoomStats('room', 'alice', 1, 'bestVoteStreak');
    expect(result?.unanimousRounds).toBe(0);
    expect(result?.members.find((member) => member.name === 'Alice')?.bestVoteStreak).toBe(2);
    expect(result?.members.find((member) => member.name === 'Bob')?.bestVoteStreak).toBe(3);
    expect(await stats.revealWithStats('missing')).toBeNull();
  });

  it('stamps the reveal time once so the round timer freezes at the first reveal', async () => {
    await stats.setVoteWithStats(alice.id, '5');
    await stats.revealWithStats('room');
    const revealed = await db.room.findUniqueOrThrow({ where: { id: 'room' } });
    expect(revealed.roundRevealedAt).toBeInstanceOf(Date);

    expect(await stats.revealWithStats('room')).toBeNull();
    const again = await db.room.findUniqueOrThrow({ where: { id: 'room' } });
    expect(again.roundRevealedAt).toEqual(revealed.roundRevealedAt);
  });

  it('counts distinct accepted characters once across barrages and concurrent throws', async () => {
    await Promise.all([
      throws.recordInteraction('room', alice.id, 'alice', 'throw', bob.id, '📄'),
      throws.recordInteraction('room', alice.id, 'alice', 'barrage', bob.id, '📄'),
      throws.recordInteraction('room', alice.id, 'alice', 'throw', bob.id, '🚀'),
    ]);
    expect(
      await throws.recordInteraction('room', alice.id, 'alice', 'throw', bob.id, 'invalid'),
    ).toBe(false);
    await throwStats.drain();
    const result = await stats.readRoomStats('room', 'alice', 1, 'characterVariety');
    expect(result?.members[0]).toMatchObject({
      name: 'Alice',
      characterVariety: 2,
      throwsSent: 3,
    });
    expect(result?.awards.varietyShow).toMatchObject({
      score: 2,
      winnerCount: 1,
    });
    expect(result?.awardsStartedAt).not.toBeNull();
    expect(JSON.stringify(result)).not.toContain('charactersUsed');
  });

  it('keeps awards global across pages and bounds tied winner names', async () => {
    for (let index = 0; index < 30; index++) {
      await db.roomApproval.create({
        data: {
          roomId: 'room',
          visitorId: `winner-${index}`,
          lastKnownName: `Winner ${index}`,
          bestVoteStreak: 10,
          characterVariety: 4,
        },
      });
    }
    const result = await stats.readRoomStats('room', 'alice', 2, 'bestVoteStreak');
    expect(result?.awards.onARoll).toMatchObject({
      score: 10,
      winnerCount: 30,
    });
    expect(result?.awards.onARoll?.winners).toHaveLength(3);
    expect(result?.members.slice(0, 5).map((member) => member.rank)).toEqual([1, 1, 1, 1, 1]);
    expect(result?.members.at(-1)?.rank).toBe(31);
  });

  it('tracks active leaf issue spreads, hides and pauses them when disabled, and retains history', async () => {
    await db.issue.create({
      data: {
        id: 'parent',
        rootId: 'parent',
        roomId: 'room',
        title: 'Parent',
        status: 'in_progress',
      },
    });
    await db.issue.create({
      data: {
        id: 'issue',
        rootId: 'parent',
        parentId: 'parent',
        roomId: 'room',
        title: 'Checkout',
        status: 'in_progress',
        estimate: 5,
      },
    });
    await stats.setVoteWithStats(alice.id, '2');
    await stats.setVoteWithStats(bob.id, '13');
    await stats.revealWithStats('room');
    let result = await stats.readRoomStats('room', 'alice', 1, 'votesCast');
    expect(result?.issueStats).toMatchObject({
      estimated: 1,
      spiciest: { id: 'issue', firstMin: 2, firstMax: 13 },
      commonGround: null,
    });
    expect((await db.issue.findUniqueOrThrow({ where: { id: 'parent' } })).firstVoteMin).toBeNull();
    await nextRound();
    await stats.setVoteWithStats(alice.id, '5');
    await stats.setVoteWithStats(bob.id, '5');
    await stats.revealWithStats('room');
    result = await stats.readRoomStats('room', 'alice', 1, 'votesCast');
    expect(result?.issueStats?.commonGround).toMatchObject({
      firstMin: 2,
      firstMax: 13,
      latestMin: 5,
      latestMax: 5,
    });
    await db.room.update({
      where: { id: 'room' },
      data: { issuesEnabled: false },
    });
    await nextRound();
    await stats.setVoteWithStats(alice.id, '1');
    await stats.setVoteWithStats(bob.id, '21');
    await stats.revealWithStats('room');
    result = await stats.readRoomStats('room', 'alice', 1, 'votesCast');
    expect(result?.issueStats).toBeNull();
    expect(result?.awards.onARoll?.score).toBe(3);
    await db.room.update({
      where: { id: 'room' },
      data: { issuesEnabled: true },
    });
    result = await stats.readRoomStats('room', 'alice', 1, 'votesCast');
    expect(result?.issueStats?.commonGround?.latestMax).toBe(5);
    setSiteConfig({ features: { issues: false } });
    try {
      await nextRound();
      await stats.setVoteWithStats(alice.id, '8');
      await stats.setVoteWithStats(bob.id, '8');
      await stats.revealWithStats('room');
      result = await stats.readRoomStats('room', 'alice', 1, 'votesCast');
      expect(result?.issueStats).toBeNull();
    } finally {
      setSiteConfig();
    }
    result = await stats.readRoomStats('room', 'alice', 1, 'votesCast');
    expect(result?.issueStats?.commonGround?.latestMax).toBe(5);
    expect(RoomStatsSchema.safeParse(result).success).toBe(true);
    await db.issue.delete({ where: { id: 'parent' } });
    result = await stats.readRoomStats('room', 'alice', 1, 'votesCast');
    expect(result?.issueStats).toEqual({
      estimated: 0,
      spiciest: null,
      commonGround: null,
    });
  });

  it('does not create issue highlights without two numeric votes or an active issue', async () => {
    await stats.setVoteWithStats(alice.id, '2');
    await stats.setVoteWithStats(bob.id, '13');
    await stats.revealWithStats('room');
    await db.issue.create({
      data: {
        id: 'issue',
        rootId: 'issue',
        roomId: 'room',
        title: 'Question',
        status: 'in_progress',
      },
    });
    await nextRound();
    await stats.setVoteWithStats(alice.id, '?');
    await stats.setVoteWithStats(bob.id, '5');
    await stats.revealWithStats('room');
    expect((await db.issue.findUniqueOrThrow({ where: { id: 'issue' } })).firstVoteMin).toBeNull();
    const result = await stats.readRoomStats('room', 'alice', 1, 'votesCast');
    expect(result?.issueStats).toEqual({
      estimated: 0,
      spiciest: null,
      commonGround: null,
    });
  });

  it('protects the HTTP endpoint, validates input and limits repeated reads', async () => {
    const { createRoomStatsRouter } = await import('../../src/modules/rooms/room-stats.routes');
    const app = express();
    app.use(cookieParser());
    app.use('/api/rooms', createRoomStatsRouter());
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test port');
    const base = `http://127.0.0.1:${address.port}/api/rooms/room/stats`;
    const previousSecret = process.env.COOKIE_SIGNING_SECRET;
    process.env.COOKIE_SIGNING_SECRET = 'room-stats-test-secret';
    const httpVisitor = '11111111-1111-4111-8111-111111111111';
    await db.roomApproval.create({
      data: { roomId: 'room', visitorId: httpVisitor },
    });
    const cookie = `${VISITOR_COOKIE_NAME}=${encodeVisitorCookie(httpVisitor)}`;
    try {
      expect((await fetch(base)).status).toBe(401);
      expect(
        (
          await fetch(base, {
            headers: { Cookie: `${VISITOR_COOKIE_NAME}=forged` },
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await fetch(base, {
            headers: {
              Cookie: `${VISITOR_COOKIE_NAME}=${encodeVisitorCookie('22222222-2222-4222-8222-222222222222')}`,
            },
          })
        ).status,
      ).toBe(403);
      expect((await fetch(base + '?sort=visitorId', { headers: { Cookie: cookie } })).status).toBe(
        400,
      );
      const response = await fetch(base, { headers: { Cookie: cookie } });
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(RoomStatsSchema.safeParse(await response.json()).success).toBe(true);
      for (let index = 0; index < 25; index++) await fetch(base, { headers: { Cookie: cookie } });
      expect((await fetch(base, { headers: { Cookie: cookie } })).status).toBe(429);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      if (previousSecret === undefined) delete process.env.COOKIE_SIGNING_SECRET;
      else process.env.COOKIE_SIGNING_SECRET = previousSecret;
    }
  });
});
