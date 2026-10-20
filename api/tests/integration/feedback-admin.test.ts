import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  OwnFeedbackItemSchema,
  OwnFeedbackPageSchema,
  FeedbackReplySchema,
  FeedbackReplyPageSchema,
  AdminPendingReviewSchema,
  AdminRoomPageSchema,
  AdminRoomDetailSchema,
} from '@poker/shared';
import { MigratedDatabase } from '../helpers/migrated-database';
import { startAdminTestServer, visitorCookie, type AdminTestServer } from '../helpers/admin-server';

describe('feedback admin', () => {
  const database = new MigratedDatabase('poker-admin-');
  let db: PrismaClient;
  let admin: AdminTestServer;
  let base: string;
  beforeAll(async () => {
    database.setUp();
    db = (await import('../../src/platform/db/prisma')).default;
    admin = await startAdminTestServer();
    base = admin.base;
  }, 30_000);
  beforeEach(async () => {
    await db.rateLimitDaily.deleteMany();
    await db.feedback.deleteMany();
    await db.room.deleteMany();
  });
  afterAll(async () => {
    await admin?.close();
    delete process.env.ADMIN_PASSWORD;
    if (db) await db.$disconnect();
    database.tearDown();
  });
  const openWorkflow = {
    workflowStatus: 'new',
    resolutionReason: null,
    resolutionNote: null,
    duplicateOfId: null,
  };
  function request(
    url: string,
    method = 'GET',
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    return admin.request(url, method, body, headers);
  }
  function create(status = 'published') {
    return db.feedback.create({
      data: {
        visitorId: 'private-author',
        category: 'bug',
        title: '<img src=x> Voting bug',
        body: 'A sufficiently detailed report.',
        status,
      },
    });
  }

  it('allows guarded admin replies on private feedback and tracks unread author replies separately', async () => {
    const item = await create('rejected');
    const suffix = '/feedback/' + item.id + '/replies';
    expect(
      (await request(suffix, 'POST', { body: 'We need more detail.' }, { Cookie: '' })).status,
    ).toBe(401);
    expect(
      (
        await request(
          suffix,
          'POST',
          { body: 'We need more detail.' },
          { Origin: 'https://evil.test' },
        )
      ).status,
    ).toBe(403);
    const reply = FeedbackReplySchema.parse(
      await (await request(suffix, 'POST', { body: 'Which browser did you use?' })).json(),
    );
    expect(reply).toMatchObject({ author: 'admin', status: 'published' });
    const authorReply = await db.feedbackReply.create({
      data: {
        feedbackId: item.id,
        author: 'author',
        body: 'It happens in Firefox.',
        status: 'published',
      },
    });
    const page = FeedbackReplyPageSchema.parse(await (await request(suffix)).json());
    expect(page.canReply).toBe(true);
    expect(page.hasUnread).toBe(true);
    expect(page.items).toHaveLength(2);
    expect(
      OwnFeedbackItemSchema.parse(await (await request('/feedback/' + item.id)).json())
        .hasUnreadReplies,
    ).toBe(true);
    expect(
      await (await request(suffix + '/read', 'POST', { ids: [authorReply.id] })).json(),
    ).toEqual({ hasUnread: false });
    expect(await db.feedbackReply.findUnique({ where: { id: authorReply.id } })).toMatchObject({
      authorReadAt: null,
      adminReadAt: expect.any(Date),
    });
  });

  it('requires the admin cookie for reads and cookie plus same-origin for writes before parsing', async () => {
    const item = await create();
    expect((await fetch(base + '/api/admin/feedback')).status).toBe(401);
    // A visitor cookie alone, or another browser's admin cookie, is not a session.
    expect(
      (await request('/feedback', 'GET', undefined, { Cookie: await visitorCookie() })).status,
    ).toBe(401);
    const adminPart = admin.cookie.split('; ')[1] ?? '';
    expect(
      (
        await request('/feedback', 'GET', undefined, {
          Cookie: `${await visitorCookie()}; ${adminPart}`,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await fetch(base + '/api/admin/feedback/' + item.id, {
          method: 'PATCH',
          headers: { Cookie: admin.cookie, 'Content-Type': 'application/json' },
          body: '[',
        })
      ).status,
    ).toBe(403);
    expect(
      (await request('/feedback/' + item.id, 'PATCH', {}, { Origin: 'https://evil.example' }))
        .status,
    ).toBe(403);
    expect(
      (await request('/feedback/' + item.id, 'PATCH', {}, { 'Content-Encoding': 'gzip' })).status,
    ).toBe(415);
    expect(
      (
        await request('/feedback/' + item.id, 'PATCH', {
          content: 'x'.repeat(9000),
        })
      ).status,
    ).toBe(413);
  });

  it('lists private submissions with filters and bounded pagination, without author identifiers', async () => {
    await create('rejected');
    for (let index = 0; index < 21; index++) await create();
    const page = OwnFeedbackPageSchema.parse(
      await (await request('/feedback?category=bug&workflowStatus=new&status=published')).json(),
    );
    expect(page.items).toHaveLength(20);
    expect(page.nextCursor).not.toBeNull();
    expect(page.items[0]).not.toHaveProperty('visitorId');
    const next = OwnFeedbackPageSchema.parse(
      await (
        await request(
          '/feedback?category=bug&workflowStatus=new&status=published&cursor=' + page.nextCursor,
        )
      ).json(),
    );
    expect(next.items).toHaveLength(1);
    expect(page.items.some((item) => item.id === next.items[0]?.id)).toBe(false);
    const privatePage = OwnFeedbackPageSchema.parse(
      await (await request('/feedback?status=rejected')).json(),
    );
    expect(privatePage.items).toHaveLength(1);
    expect((await request('/feedback?workflowStatus=unknown')).status).toBe(400);
    expect((await request('/feedback?category=general&cursor=' + page.nextCursor)).status).toBe(
      400,
    );
  });

  it('hides closed submissions unless requested or filtered by status', async () => {
    const open = await create();
    const closed = await create();
    await db.feedback.update({
      where: { id: closed.id },
      data: { workflowStatus: 'closed', resolutionReason: 'fixed' },
    });
    const ids = async (query: string) =>
      OwnFeedbackPageSchema.parse(await (await request('/feedback' + query)).json()).items.map(
        (item) => item.id,
      );
    expect(await ids('')).toEqual([open.id]);
    expect(await ids('?includeClosed=false')).toEqual([open.id]);
    expect((await ids('?includeClosed=true')).sort()).toEqual([open.id, closed.id].sort());
    expect(await ids('?workflowStatus=closed')).toEqual([closed.id]);
    expect((await request('/feedback?includeClosed=yes')).status).toBe(400);
  });

  it('lists rooms with accurate counts and activity, then exposes only member display details', async () => {
    const room = await db.room.create({
      data: {
        id: 'sprint-room_42',
        name: '<img src=x> Sprint planning',
        theme: 'vegas',
        mood: 'spicy',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-09-30T00:00:00.000Z'),
        users: {
          create: [
            { name: 'Alice', visitorId: 'private-alice', vote: '8' },
            {
              name: 'Bob',
              visitorId: 'private-bob',
              isObserver: true,
              isApproved: false,
            },
          ],
        },
      },
    });
    await db.issue.createMany({
      data: [
        { roomId: room.id, rootId: 'root-1', title: 'Open issue' },
        {
          roomId: room.id,
          rootId: 'root-2',
          title: 'Closed issue',
          status: 'closed',
        },
      ],
    });
    const page = AdminRoomPageSchema.parse(await (await request('/rooms')).json());
    expect(page.items).toEqual([
      {
        id: room.id,
        name: room.name,
        theme: 'vegas',
        mood: 'spicy',
        approvedMemberCount: 0,
        memberCount: 2,
        issueCount: 2,
        lastActivityAt: '2026-09-30T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    expect(page.nextCursor).toBeNull();
    const response: unknown = await (await request('/rooms/' + room.id)).json();
    const detail = AdminRoomDetailSchema.parse(response);
    expect(detail.room.theme).toBe('vegas');
    expect(detail.room.mood).toBe('spicy');
    expect(detail.users).toHaveLength(2);
    expect(detail.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Alice',
          isObserver: false,
          isApproved: true,
        }),
        expect.objectContaining({
          name: 'Bob',
          isObserver: true,
          isApproved: false,
        }),
      ]),
    );
    // Strict parsing rejects extra fields, including identity and private vote data.
    expect(JSON.stringify(response)).not.toContain('private-alice');
    expect(detail.users[0]).not.toHaveProperty('vote');
    expect((await fetch(base + '/api/admin/rooms')).status).toBe(401);
    expect(
      (
        await request('/rooms/' + room.id, 'GET', undefined, {
          Cookie: await visitorCookie(),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await request('/rooms', 'GET', undefined, {
          Origin: 'https://evil.test',
        })
      ).status,
    ).toBe(403);
    expect((await request('/rooms/invalid%3Croom')).status).toBe(400);
    expect((await request('/rooms?cursor=bad')).status).toBe(400);
    expect((await request('/rooms?limit=1000')).status).toBe(400);
    expect((await request('/rooms/10000000-0000-4000-8000-000000000001')).status).toBe(404);
  });

  it('retains approved membership counts after participants leave without exposing identities', async () => {
    const room = await db.room.create({
      data: { id: 'approval-history', name: 'History' },
    });
    await db.roomApproval.createMany({
      data: [
        { roomId: room.id, visitorId: 'returning-private' },
        { roomId: room.id, visitorId: 'departed-private' },
      ],
    });
    await db.user.createMany({
      data: [
        {
          roomId: room.id,
          visitorId: 'returning-private',
          name: 'Returning',
          isApproved: true,
        },
        {
          roomId: room.id,
          visitorId: 'pending-private',
          name: 'Pending',
          isApproved: false,
        },
      ],
    });
    const page = AdminRoomPageSchema.parse(await (await request('/rooms')).json());
    expect(page.items[0]).toMatchObject({
      approvedMemberCount: 2,
      memberCount: 2,
    });
    await db.user.deleteMany({ where: { roomId: room.id } });
    const response: unknown = await (await request('/rooms/' + room.id)).json();
    const detail = AdminRoomDetailSchema.parse(response);
    expect(detail.room).toMatchObject({
      approvedMemberCount: 2,
      memberCount: 0,
    });
    expect(detail.users).toEqual([]);
    expect(JSON.stringify(response)).not.toContain('private');
    const refreshed = AdminRoomPageSchema.parse(await (await request('/rooms')).json());
    expect(refreshed.items[0]).toMatchObject({
      approvedMemberCount: 2,
      memberCount: 0,
    });
  });

  it('retains approved names across departure and rejoin, with paginated legacy placeholders', async () => {
    const userRepository = await import('../../src/modules/rooms/user.repository');
    const room = await db.room.create({ data: { id: 'retained-names' } });
    let user = await userRepository.create({
      name: 'Alice',
      visitorId: 'named-private',
      isApproved: true,
      room: { connect: { id: room.id } },
    });
    await userRepository.update(user.id, { name: 'Alicia' });
    await userRepository.delete(user.id);
    let detail = AdminRoomDetailSchema.parse(await (await request('/rooms/' + room.id)).json());
    expect(detail.approvedMembers).toMatchObject([{ name: 'Alicia', isCurrent: false }]);
    user = await userRepository.create({
      name: 'Alice returns',
      visitorId: 'named-private',
      isApproved: true,
      room: { connect: { id: room.id } },
    });
    detail = AdminRoomDetailSchema.parse(await (await request('/rooms/' + room.id)).json());
    expect(detail.approvedMembers).toMatchObject([{ name: 'Alice returns', isCurrent: true }]);
    const pending = await userRepository.create({
      name: 'Pending',
      visitorId: 'pending-private',
      isApproved: false,
      room: { connect: { id: room.id } },
    });
    await userRepository.update(pending.id, { name: 'Still pending' });
    expect(await db.roomApproval.count({ where: { roomId: room.id } })).toBe(1);
    await userRepository.update(pending.id, { isApproved: true });
    await db.roomApproval.createMany({
      data: Array.from({ length: 50 }, (_, index) => ({
        roomId: room.id,
        visitorId: 'legacy-private-' + index,
      })),
    });
    detail = AdminRoomDetailSchema.parse(await (await request('/rooms/' + room.id)).json());
    expect(detail.approvedMembers).toHaveLength(50);
    expect(detail.approvedMembers.every((entry) => entry.name === null)).toBe(true);
    expect(detail.nextApprovedOffset).toBe(50);
    const response: unknown = await (
      await request('/rooms/' + room.id + '?approvedOffset=50')
    ).json();
    const next = AdminRoomDetailSchema.parse(response);
    expect(next.approvedMembers).toMatchObject([
      { name: 'Alice returns', isCurrent: true },
      { name: 'Still pending', isCurrent: true },
    ]);
    expect(next.nextApprovedOffset).toBeNull();
    expect(JSON.stringify(response)).not.toContain('private');
    expect((await request('/rooms/' + room.id + '?approvedOffset=-1')).status).toBe(400);
    await db.room.delete({ where: { id: room.id } });
    expect(await db.roomApproval.count({ where: { roomId: room.id } })).toBe(0);
  });

  it('collects missing roster details on rejoin and retains rate-limit history after departure', async () => {
    const userRepository = await import('../../src/modules/rooms/user.repository');
    const { RateLimitRecorder } = await import('../../src/modules/telemetry/rate-limit-telemetry');
    const { persistRateLimitBatch, rateLimitCutoff } =
      await import('../../src/modules/telemetry/rate-limit-stats.repository');
    await db.room.create({ data: { id: 'details-history' } });
    await db.roomApproval.create({
      data: { roomId: 'details-history', visitorId: 'returning-details' },
    });
    let detail = AdminRoomDetailSchema.parse(
      await (await request('/rooms/details-history')).json(),
    );
    expect(detail.approvedMembers[0]).toMatchObject({
      name: null,
      isObserver: null,
      createdAt: null,
      rateLimitCount: 0,
    });
    const user = await userRepository.create({
      name: 'Returning name',
      visitorId: 'returning-details',
      isApproved: true,
      room: { connect: { id: 'details-history' } },
    });
    await userRepository.updateObserverStatus(user.id, true);
    const recorder = new RateLimitRecorder(persistRateLimitBatch);
    recorder.record('returning-details');
    recorder.record('returning-details');
    recorder.record('unknown-identity');
    await recorder.flush();
    // New collector instance demonstrates that the persisted counts do not depend on its memory.
    const restarted = new RateLimitRecorder(persistRateLimitBatch);
    restarted.record('returning-details');
    await restarted.flush();
    expect(
      await db.rateLimitDaily.count({
        where: { visitorId: 'unknown-identity' },
      }),
    ).toBe(0);
    detail = AdminRoomDetailSchema.parse(
      await (
        await request(
          '/rooms/details-history?approvedSort=rateLimitCount&memberSort=rateLimitCount&memberDirection=desc',
        )
      ).json(),
    );
    expect(detail.users[0]).toMatchObject({
      name: 'Returning name',
      isObserver: true,
      rateLimitCount: 3,
    });
    expect(detail.approvedMembers[0]).toMatchObject({
      name: 'Returning name',
      isObserver: true,
      isApproved: true,
      createdAt: user.createdAt.toISOString(),
      rateLimitCount: 3,
      isCurrent: true,
    });
    expect(detail.approvedMembers[0]?.lastRateLimitAt).not.toBeNull();
    await userRepository.delete(user.id);
    detail = AdminRoomDetailSchema.parse(
      await (await request('/rooms/details-history?approvedSort=lastRateLimitAt')).json(),
    );
    expect(detail.users).toEqual([]);
    expect(detail.approvedMembers[0]).toMatchObject({
      name: 'Returning name',
      isObserver: true,
      createdAt: user.createdAt.toISOString(),
      rateLimitCount: 3,
      isCurrent: false,
    });
    const old = new Date();
    old.setUTCDate(old.getUTCDate() - 31);
    await db.rateLimitDaily.create({
      data: {
        visitorId: 'returning-details',
        day: old.toISOString().slice(0, 10),
        count: 100,
        lastHitAt: old,
      },
    });
    detail = AdminRoomDetailSchema.parse(await (await request('/rooms/details-history')).json());
    expect(detail.approvedMembers[0]?.rateLimitCount).toBe(3);
    restarted.record('returning-details');
    await restarted.flush();
    expect(
      await db.rateLimitDaily.count({
        where: { day: { lt: rateLimitCutoff() } },
      }),
    ).toBe(0);
  });

  it('bounds persisted telemetry while continuing to increment existing records at capacity', async () => {
    const { persistRateLimitBatch } =
      await import('../../src/modules/telemetry/rate-limit-stats.repository');
    await db.room.create({
      data: {
        id: 'bounded-stats',
        approvals: {
          create: [{ visitorId: 'at-capacity' }, { visitorId: 'new-at-capacity' }],
        },
      },
    });
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    await db.$executeRaw`WITH RECURSIVE sequence(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM sequence WHERE n < 99999)
      INSERT INTO RateLimitDaily(visitorId, day, count, lastHitAt) SELECT 'test-cap-' || n, ${day}, 1, ${now} FROM sequence`;
    await db.rateLimitDaily.create({
      data: { visitorId: 'at-capacity', day, count: 1, lastHitAt: now },
    });
    await persistRateLimitBatch([
      { visitorId: 'at-capacity', day, count: 2, lastHitAt: now },
      { visitorId: 'new-at-capacity', day, count: 10, lastHitAt: now },
    ]);
    expect(await db.rateLimitDaily.count()).toBe(100000);
    expect(
      (
        await db.rateLimitDaily.findUnique({
          where: { visitorId_day: { visitorId: 'at-capacity', day } },
        })
      )?.count,
    ).toBe(3);
    expect(
      await db.rateLimitDaily.count({
        where: { visitorId: 'new-at-capacity' },
      }),
    ).toBe(0);
  });

  it('sorts every room and member column and keeps the order across pages', async () => {
    const room = await db.room.create({
      data: { id: 'sorting', name: 'Zebra' },
    });
    await db.room.create({ data: { id: 'alpha', name: 'Alpha' } });
    await db.user.createMany({
      data: [
        {
          roomId: room.id,
          visitorId: 'alice',
          name: 'Alice',
          isObserver: true,
          isApproved: true,
          createdAt: new Date('2026-01-01'),
        },
        {
          roomId: room.id,
          visitorId: 'bob',
          name: 'Bob',
          isObserver: false,
          isApproved: false,
          createdAt: new Date('2026-02-01'),
        },
      ],
    });
    await db.roomApproval.createMany({
      data: [
        { roomId: room.id, visitorId: 'alice', lastKnownName: 'Alice' },
        { roomId: room.id, visitorId: 'departed', lastKnownName: 'Zoe' },
      ],
    });
    await db.issue.create({
      data: { roomId: room.id, rootId: 'sort', title: 'Issue' },
    });
    for (const sort of [
      'name',
      'approvedMemberCount',
      'memberCount',
      'issueCount',
      'lastActivityAt',
      'createdAt',
    ]) {
      const ascending = AdminRoomPageSchema.parse(
        await (await request('/rooms?sort=' + sort + '&direction=asc')).json(),
      );
      const descending = AdminRoomPageSchema.parse(
        await (await request('/rooms?sort=' + sort + '&direction=desc')).json(),
      );
      expect(ascending.items).toHaveLength(2);
      expect(descending.items).toHaveLength(2);
      if (sort !== 'lastActivityAt' && sort !== 'createdAt')
        expect(ascending.items[0]?.id).toBe('alpha');
    }
    const hitTime = new Date();
    const hitDay = hitTime.toISOString().slice(0, 10);
    await db.rateLimitDaily.createMany({
      data: [
        {
          visitorId: 'alice',
          day: hitDay,
          count: 1,
          lastHitAt: new Date(hitTime.getTime() - 1000),
        },
        { visitorId: 'bob', day: hitDay, count: 3, lastHitAt: hitTime },
        { visitorId: 'departed', day: hitDay, count: 5, lastHitAt: hitTime },
      ],
    });
    for (const sort of [
      'name',
      'isObserver',
      'isApproved',
      'createdAt',
      'rateLimitCount',
      'lastRateLimitAt',
    ]) {
      const asc = AdminRoomDetailSchema.parse(
        await (await request('/rooms/sorting?memberSort=' + sort + '&memberDirection=asc')).json(),
      );
      const desc = AdminRoomDetailSchema.parse(
        await (await request('/rooms/sorting?memberSort=' + sort + '&memberDirection=desc')).json(),
      );
      expect(asc.users.map((entry) => entry.name)).toEqual(['Alice', 'Bob']);
      expect(desc.users.map((entry) => entry.name)).toEqual(['Bob', 'Alice']);
    }
    const { findAdminRoom } = await import('../../src/modules/admin/room-admin.repository');
    await findAdminRoom('sorting', undefined, 0, 'createdAt', 'asc', 'name', 'desc');
    for (const sort of ['name', 'isCurrent', 'rateLimitCount', 'lastRateLimitAt']) {
      const detail = AdminRoomDetailSchema.parse(
        await (
          await request('/rooms/sorting?approvedSort=' + sort + '&approvedDirection=desc')
        ).json(),
      );
      expect(detail.approvedMembers.map((entry) => entry.name)).toEqual(['Zoe', 'Alice']);
    }
    expect((await request('/rooms?sort=visitorId')).status).toBe(400);
    expect((await request('/rooms/sorting?memberSort=vote')).status).toBe(400);
  });

  it('paginates rooms and members with stable ordering and rejects foreign or missing cursors', async () => {
    for (let index = 0; index < 51; index++) {
      await db.room.create({
        data: {
          id: 'planning-room_' + index,
          name: 'Room ' + index,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      });
    }
    const page = AdminRoomPageSchema.parse(await (await request('/rooms')).json());
    expect(page.items).toHaveLength(50);
    expect(page.nextCursor).not.toBeNull();
    const next = AdminRoomPageSchema.parse(
      await (await request('/rooms?cursor=' + page.nextCursor)).json(),
    );
    expect(next.items).toHaveLength(1);
    expect(next.nextCursor).toBeNull();
    expect(page.items.some((room) => room.id === next.items[0]?.id)).toBe(false);
    for (const sort of [
      'name',
      'memberCount',
      'approvedMemberCount',
      'issueCount',
      'createdAt',
      'lastActivityAt',
    ]) {
      const first = AdminRoomPageSchema.parse(
        await (await request('/rooms?sort=' + sort + '&direction=asc')).json(),
      );
      const second = AdminRoomPageSchema.parse(
        await (
          await request('/rooms?sort=' + sort + '&direction=asc&cursor=' + first.nextCursor)
        ).json(),
      );
      expect(first.items).toHaveLength(50);
      expect(second.items).toHaveLength(1);
      expect(new Set([...first.items, ...second.items].map((entry) => entry.id)).size).toBe(51);
      if (sort === 'name') {
        const names = [...first.items, ...second.items].map((entry) => entry.name);
        expect(names).toEqual([...names].sort());
      }
    }
    const room = page.items[0];
    const other = next.items[0];
    if (!room || !other) throw new Error('Missing room fixtures.');
    for (let index = 0; index < 51; index++) {
      await db.user.create({
        data: {
          roomId: room.id,
          name: 'User ' + index,
          visitorId: 'visitor-' + index,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      });
    }
    const detail = AdminRoomDetailSchema.parse(await (await request('/rooms/' + room.id)).json());
    expect(detail.room.memberCount).toBe(51);
    expect(detail.users).toHaveLength(50);
    const remainder = AdminRoomDetailSchema.parse(
      await (await request('/rooms/' + room.id + '?cursor=' + detail.nextCursor)).json(),
    );
    expect(remainder.users).toHaveLength(1);
    expect(remainder.nextCursor).toBeNull();
    expect(detail.users.some((user) => user.id === remainder.users[0]?.id)).toBe(false);
    expect((await request('/rooms/' + other.id + '?cursor=' + detail.nextCursor)).status).toBe(400);
    expect((await request('/rooms?cursor=10000000-0000-4000-8000-000000000001')).status).toBe(400);
    expect((await request('/rooms/' + room.id + '?cursor=bad')).status).toBe(400);
    const empty = AdminRoomDetailSchema.parse(await (await request('/rooms/' + other.id)).json());
    expect(empty.users).toEqual([]);
  });

  it('changes human workflow without changing publication and detects stale saves', async () => {
    const item = await create('rejected');
    const change = {
      previous: openWorkflow,
      next: { ...openWorkflow, workflowStatus: 'under_review' },
    };
    expect(
      (
        await request('/feedback/' + item.id, 'PATCH', {
          previous: openWorkflow,
          next: openWorkflow,
        })
      ).status,
    ).toBe(200);
    expect(
      (await db.feedback.findUniqueOrThrow({ where: { id: item.id } })).authorStatusUnread,
    ).toBe(false);
    const result = await request('/feedback/' + item.id, 'PATCH', change);
    expect(result.status).toBe(200);
    expect(
      (await db.feedback.findUniqueOrThrow({ where: { id: item.id } })).authorStatusUnread,
    ).toBe(true);
    const updated = OwnFeedbackItemSchema.parse(await result.json());
    expect(updated).toMatchObject({
      workflowStatus: 'under_review',
      status: 'rejected',
    });
    expect((await request('/feedback/' + item.id, 'PATCH', change)).status).toBe(409);
    const closed = {
      ...openWorkflow,
      workflowStatus: 'closed',
      resolutionReason: 'fixed',
      resolutionNote: 'Fixed after reconnecting.',
    };
    expect(
      (
        await request('/feedback/' + item.id, 'PATCH', {
          previous: change.next,
          next: closed,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request('/feedback/' + item.id, 'PATCH', {
          previous: closed,
          next: openWorkflow,
        })
      ).status,
    ).toBe(200);
    expect(await db.feedback.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject(
      openWorkflow,
    );
  });

  describe('manual review', () => {
    // A fresh admin server gives these tests their own per-minute budget.
    let outer: AdminTestServer | undefined;
    beforeAll(async () => {
      outer = admin;
      admin = await startAdminTestServer();
      base = admin.base;
    });
    afterAll(async () => {
      const review = admin;
      if (outer) {
        admin = outer;
        base = outer.base;
      }
      await review.close();
    });
    async function pendingReply(feedbackId: string, body = 'More detail.') {
      return db.feedbackReply.create({
        data: { feedbackId, author: 'author', body, status: 'pending' },
      });
    }

    it('lists only pending items and author replies, oldest first, with queue sizes', async () => {
      const published = await create();
      const pending = await db.feedback.create({
        data: {
          visitorId: 'private-author',
          category: 'general',
          title: 'Older pending',
          body: 'A sufficiently detailed report.',
          status: 'pending',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      });
      const newer = await create('pending');
      await create('rejected');
      const reply = await pendingReply(published.id);
      await db.feedbackReply.create({
        data: {
          feedbackId: published.id,
          author: 'admin',
          body: 'Legacy pending admin reply.',
          status: 'pending',
        },
      });
      await db.feedbackReply.create({
        data: {
          feedbackId: published.id,
          author: 'author',
          body: 'Already visible.',
          status: 'published',
        },
      });
      const review = AdminPendingReviewSchema.parse(await (await request('/pending')).json());
      expect(review.feedback.map((item) => item.id)).toEqual([pending.id, newer.id]);
      expect(review.feedbackCount).toBe(2);
      expect(review.feedback[0]).not.toHaveProperty('visitorId');
      expect(review.replies).toEqual([
        {
          reply: expect.objectContaining({ id: reply.id, status: 'pending' }),
          feedback: {
            id: published.id,
            category: 'bug',
            title: published.title,
            status: 'published',
          },
        },
      ]);
      expect(review.replyCount).toBe(1);
    });

    it('requires the admin session and same origin before reviewing', async () => {
      const item = await create('pending');
      const reply = await pendingReply(item.id);
      for (const url of [
        '/feedback/' + item.id + '/approve',
        '/feedback/' + item.id + '/reject',
        '/replies/' + reply.id + '/approve',
        '/replies/' + reply.id + '/reject',
      ]) {
        expect((await request(url, 'POST', { reason: '' }, { Cookie: '' })).status).toBe(401);
        expect(
          (await request(url, 'POST', { reason: '' }, { Origin: 'https://evil.example' })).status,
        ).toBe(403);
        expect(
          (
            await fetch(base + '/api/admin' + url, {
              method: 'POST',
              headers: { Cookie: admin.cookie },
            })
          ).status,
        ).toBe(403);
      }
      expect((await fetch(base + '/api/admin/pending')).status).toBe(401);
      expect(await db.feedback.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({
        status: 'pending',
      });
      expect(await db.feedbackReply.findUniqueOrThrow({ where: { id: reply.id } })).toMatchObject({
        status: 'pending',
      });
    });

    it('approves pending feedback once, notifies the author, and keeps workflow unchanged', async () => {
      const item = await create('pending');
      const result = await request('/feedback/' + item.id + '/approve', 'POST');
      expect(result.status).toBe(200);
      expect(OwnFeedbackItemSchema.parse(await result.json())).toMatchObject({
        id: item.id,
        status: 'published',
        rejectionReason: null,
        ...openWorkflow,
      });
      expect(await db.feedback.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({
        status: 'published',
        authorStatusUnread: true,
      });
      for (const action of ['approve', 'reject'])
        expect(
          (
            await request('/feedback/' + item.id + '/' + action, 'POST', {
              reason: '',
            })
          ).status,
        ).toBe(409);
      expect((await request('/feedback/' + crypto.randomUUID() + '/approve', 'POST')).status).toBe(
        404,
      );
      expect((await request('/feedback/not-a-uuid/approve', 'POST')).status).toBe(400);
    });

    it('rejects pending feedback with an optional bounded plain-text reason', async () => {
      const item = await create('pending');
      for (const reason of ['x'.repeat(501), 'Visit https://example.com', '<b>no</b>'])
        expect(
          (
            await request('/feedback/' + item.id + '/reject', 'POST', {
              reason,
            })
          ).status,
        ).toBe(400);
      expect((await request('/feedback/' + item.id + '/reject', 'POST', {})).status).toBe(400);
      expect((await request('/feedback/' + item.id + '/reject', 'POST')).status).toBe(400);
      expect((await db.feedback.findUniqueOrThrow({ where: { id: item.id } })).status).toBe(
        'pending',
      );
      const result = await request('/feedback/' + item.id + '/reject', 'POST', {
        reason: '  Please remove personal details.  ',
      });
      expect(result.status).toBe(200);
      expect(OwnFeedbackItemSchema.parse(await result.json())).toMatchObject({
        status: 'rejected',
        rejectionReason: 'Please remove personal details.',
      });
      const silent = await create('pending');
      expect(
        await (
          await request('/feedback/' + silent.id + '/reject', 'POST', {
            reason: '   ',
          })
        ).json(),
      ).toMatchObject({ status: 'rejected', rejectionReason: null });
      expect(await db.feedback.findUniqueOrThrow({ where: { id: silent.id } })).toMatchObject({
        authorStatusUnread: true,
      });
    });

    it('approves or rejects only pending author replies', async () => {
      const item = await create();
      const approved = await pendingReply(item.id, 'Approve me.');
      const rejected = await pendingReply(item.id, 'Reject me.');
      const adminReply = await db.feedbackReply.create({
        data: {
          feedbackId: item.id,
          author: 'admin',
          body: 'Legacy pending admin reply.',
          status: 'pending',
        },
      });
      const approval = await request('/replies/' + approved.id + '/approve', 'POST');
      expect(approval.status).toBe(200);
      expect(FeedbackReplySchema.parse(await approval.json())).toMatchObject({
        id: approved.id,
        status: 'published',
        rejectionReason: null,
      });
      const rejection = await request('/replies/' + rejected.id + '/reject', 'POST', {
        reason: 'Off topic for this report.',
      });
      expect(rejection.status).toBe(200);
      expect(FeedbackReplySchema.parse(await rejection.json())).toMatchObject({
        status: 'rejected',
        rejectionReason: 'Off topic for this report.',
      });
      expect(
        (
          await request('/replies/' + approved.id + '/reject', 'POST', {
            reason: '',
          })
        ).status,
      ).toBe(409);
      expect((await request('/replies/' + adminReply.id + '/approve', 'POST')).status).toBe(409);
      expect((await request('/replies/' + crypto.randomUUID() + '/approve', 'POST')).status).toBe(
        404,
      );
      expect(await db.feedback.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({
        authorStatusUnread: false,
        workflowStatus: 'new',
      });
    });

    it('lets only one of two concurrent reviews win', async () => {
      const item = await create('pending');
      const results = await Promise.all([
        request('/feedback/' + item.id + '/approve', 'POST'),
        request('/feedback/' + item.id + '/reject', 'POST', {
          reason: 'Duplicate of another report.',
        }),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    });
  });

  it('requires valid closure details and a published canonical original for duplicates', async () => {
    const item = await create();
    const original = await create();
    const privateItem = await create('rejected');
    const close = {
      ...openWorkflow,
      workflowStatus: 'closed',
      resolutionReason: 'duplicate',
    };
    const save = (next: unknown) =>
      request('/feedback/' + item.id, 'PATCH', {
        previous: openWorkflow,
        next,
      });
    expect((await save({ ...openWorkflow, workflowStatus: 'closed' })).status).toBe(400);
    expect((await save(close)).status).toBe(400);
    expect((await save({ ...close, duplicateOfId: item.id })).status).toBe(400);
    expect((await save({ ...close, duplicateOfId: privateItem.id })).status).toBe(400);
    expect((await save({ ...close, duplicateOfId: original.id })).status).toBe(200);
    expect(
      (
        await request('/feedback/' + original.id, 'PATCH', {
          previous: openWorkflow,
          next: { ...close, duplicateOfId: item.id },
        })
      ).status,
    ).toBe(400);
    expect((await request('/feedback/not-an-id')).status).toBe(400);
  });
  it('deletes a browser identity across rooms while preserving feedback and conversations', async () => {
    const visitorId = 'delete-this-visitor';
    const other = 'keep-this-visitor';
    for (const id of ['delete-room-a', 'delete-room-b']) {
      await db.room.create({
        data: {
          id,
          name: id,
          resultSnapshot: '[]',
          users: {
            create: [
              { name: 'Alice', visitorId, vote: '8' },
              { name: 'Bob', visitorId: other },
            ],
          },
          approvals: {
            create: [
              { visitorId, lastKnownName: 'Alice' },
              { visitorId: other, lastKnownName: 'Bob' },
            ],
          },
          observerPreferences: { create: { visitorId, isObserver: true } },
        },
      });
    }
    await db.visitorAgreement.create({
      data: {
        visitorId,
        version: 'test',
        text: 'Agreement',
        acceptedAt: new Date(),
      },
    });
    await db.feedbackAccess.create({ data: { visitorId } });
    await db.rateLimitDaily.create({
      data: { visitorId, day: '2026-09-30', count: 3, lastHitAt: new Date() },
    });
    const feedback = await db.feedback.create({
      data: {
        visitorId,
        category: 'bug',
        title: 'Preserved report',
        body: 'Preserved original text',
        replies: {
          create: [
            { author: 'author', body: 'Original reply' },
            { author: 'admin', body: 'Admin reply' },
          ],
        },
        votes: {
          create: [
            { visitorId, reaction: 'up' },
            { visitorId: other, reaction: 'up' },
          ],
        },
      },
    });
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(visitorId).digest('hex');
    await db.abuseQuota.createMany({
      data: [
        {
          key: 'visitor:' + hash,
          day: '2026-09-30',
          count: 1,
          expiresAt: new Date(),
        },
        {
          key: 'network:keep',
          day: '2026-09-30',
          count: 1,
          expiresAt: new Date(),
        },
      ],
    });
    const detail = AdminRoomDetailSchema.parse(
      await (await request('/rooms/delete-room-a')).json(),
    );
    const member = detail.approvedMembers.find((entry) => entry.name === 'Alice');
    if (!member) throw new Error('Missing Alice');
    const endpoint = '/rooms/delete-room-a/members/' + member.memberReference;
    expect((await request(endpoint, 'DELETE', { name: 'Wrong name' })).status).toBe(409);
    expect(await db.user.count({ where: { visitorId } })).toBe(2);
    expect(
      (await request(endpoint, 'DELETE', { name: 'Alice' }, { Origin: 'https://evil.example' }))
        .status,
    ).toBe(403);
    expect((await request(endpoint, 'DELETE', { name: 'Alice' })).status).toBe(204);
    for (const count of await Promise.all([
      db.user.count({ where: { visitorId } }),
      db.roomApproval.count({ where: { visitorId } }),
      db.observerPreference.count({ where: { visitorId } }),
      db.visitorAgreement.count({ where: { visitorId } }),
      db.feedbackAccess.count({ where: { visitorId } }),
      db.feedbackVote.count({ where: { visitorId } }),
      db.rateLimitDaily.count({ where: { visitorId } }),
      db.abuseQuota.count({ where: { key: 'visitor:' + hash } }),
    ]))
      expect(count).toBe(0);
    expect(await db.user.count({ where: { visitorId: other } })).toBe(2);
    expect(await db.room.count()).toBe(2);
    expect(await db.room.count({ where: { resultSnapshot: { not: null } } })).toBe(0);
    const retained = await db.feedback.findUniqueOrThrow({
      where: { id: feedback.id },
      include: { replies: true, votes: true },
    });
    expect(retained.visitorId).not.toBe(visitorId);
    expect(retained.body).toBe('Preserved original text');
    expect(retained.replies).toHaveLength(2);
    expect(retained.votes).toHaveLength(1);
    expect(await db.abuseQuota.count({ where: { key: 'network:keep' } })).toBe(1);
    expect((await request(endpoint, 'DELETE', { name: 'Alice' })).status).toBe(404);
  });

  it('deletes room records atomically with stale-confirmation protection, preserving other rooms and feedback', async () => {
    await db.room.create({
      data: {
        id: 'delete-room',
        name: 'Delete me',
        users: { create: { name: 'Alice', visitorId: 'room-delete-person' } },
        approvals: { create: { visitorId: 'room-delete-person' } },
        observerPreferences: { create: { visitorId: 'room-delete-person' } },
        issues: {
          create: { title: 'Delete this issue', rootId: 'delete-root' },
        },
      },
    });
    await db.room.create({ data: { id: 'keep-room' } });
    const feedback = await create();
    expect(
      (
        await request('/rooms/delete-room', 'DELETE', {
          name: 'Delete me',
          approvedMemberCount: 0,
        })
      ).status,
    ).toBe(409);
    expect(await db.room.count()).toBe(2);
    expect(
      (
        await request('/rooms/delete-room', 'DELETE', {
          name: 'Delete me',
          approvedMemberCount: 1,
        })
      ).status,
    ).toBe(204);
    expect(await db.room.count()).toBe(1);
    expect(await db.user.count()).toBe(0);
    expect(await db.roomApproval.count()).toBe(0);
    expect(await db.observerPreference.count()).toBe(0);
    expect(await db.issue.count()).toBe(0);
    expect(await db.feedback.findUnique({ where: { id: feedback.id } })).not.toBeNull();
  });

  it('rejects forged member references without deleting data', async () => {
    expect((await request('/rooms/missing/members/forged', 'DELETE', { name: null })).status).toBe(
      409,
    );
  });
  it('prevents delayed work from recreating records after a user deletion', async () => {
    const { withMemberContext } = await import('../../src/platform/concurrency/deletion-context');
    await db.room.create({
      data: {
        id: 'late-room',
        users: { create: { name: 'Late user', visitorId: 'late-visitor' } },
      },
    });
    const detail = AdminRoomDetailSchema.parse(await (await request('/rooms/late-room')).json());
    const member = detail.users[0];
    if (!member) throw new Error('Missing user');
    const release = Promise.withResolvers<void>();
    const pending = withMemberContext('late-visitor', 'late-room', async () => {
      await release.promise;
      await db.feedbackAccess.upsert({
        where: { visitorId: 'late-visitor' },
        create: { visitorId: 'late-visitor' },
        update: {},
      });
    });
    expect(
      (
        await request('/rooms/late-room/members/' + member.memberReference, 'DELETE', {
          name: 'Late user',
        })
      ).status,
    ).toBe(204);
    const rejected = expect(pending).rejects.toThrow('administrator deleted');
    release.resolve();
    await rejected;
    expect(await db.feedbackAccess.count({ where: { visitorId: 'late-visitor' } })).toBe(0);
  });
});
