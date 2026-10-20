import { getSiteAgreement, setSiteConfig } from '../../src/config/site-config';
const FEEDBACK_AGREEMENT_VERSION = getSiteAgreement().version;
const FEEDBACK_AGREEMENT_TEXT = getSiteAgreement().text;
import crypto from 'crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import type { PrismaClient } from '@prisma/client';
import { encodeVisitorCookie, VISITOR_COOKIE_NAME } from '../../src/platform/http/visitor-session';
import {
  FEEDBACK_CATEGORIES,
  FeedbackPageSchema,
  OwnFeedbackPageSchema,
  OwnFeedbackItemSchema,
  FeedbackReplySchema,
  FeedbackReplyPageSchema,
  CreateFeedbackSchema,
} from '@poker/shared';
import { MigratedDatabase } from '../helpers/migrated-database';

const agreement = {
  agreementVersion: FEEDBACK_AGREEMENT_VERSION,
  agreementAccepted: true,
};

describe('feedback HTTP API', () => {
  it('returns human workflow and closure details for every feedback type', async () => {
    await db.feedbackAccess.create({ data: { visitorId: visitor } });
    for (const category of FEEDBACK_CATEGORIES) {
      await db.feedback.create({
        data: {
          visitorId: visitor,
          category,
          title: 'Closed feedback',
          body: 'A sufficiently detailed feedback item.',
          workflowStatus: 'closed',
          resolutionReason: 'implemented',
          resolutionNote: 'Available in the latest update.',
        },
      });
    }
    const hidden = FeedbackPageSchema.parse(await (await request()).json());
    expect(hidden.items).toHaveLength(0);
    expect(Object.values(hidden.counts)).toEqual([0, 0, 0, 0]);
    const feed = FeedbackPageSchema.parse(
      await (await request('GET', '?includeClosed=true')).json(),
    );
    const mine = OwnFeedbackPageSchema.parse(await (await request('GET', '/mine')).json());
    expect(feed.items).toHaveLength(FEEDBACK_CATEGORIES.length);
    expect(mine.items).toHaveLength(FEEDBACK_CATEGORIES.length);
    for (const item of [...feed.items, ...mine.items]) {
      expect(item).toMatchObject({
        workflowStatus: 'closed',
        resolutionReason: 'implemented',
        resolutionNote: 'Available in the latest update.',
        duplicateOfId: null,
      });
    }
  });

  it('filters closed feedback before paging, ranking and counting while retaining owner history', async () => {
    await db.feedbackAccess.create({ data: { visitorId: visitor } });
    const open = await db.feedback.create({
      data: {
        visitorId: visitor,
        category: 'general',
        title: 'Open feedback',
        body: 'A sufficiently detailed feedback item.',
        workflowStatus: 'under_review',
      },
    });
    for (let index = 0; index < 21; index++)
      await db.feedback.create({
        data: {
          visitorId: visitor,
          category: 'general',
          title: 'Closed feedback',
          body: 'A sufficiently detailed feedback item.',
          workflowStatus: 'closed',
          resolutionReason: 'fixed',
          votes: {
            create: { visitorId: crypto.randomUUID(), reaction: 'agree' },
          },
        },
      });
    for (const sort of ['newest', 'top']) {
      const page = FeedbackPageSchema.parse(
        await (await request('GET', '?category=general&sort=' + sort)).json(),
      );
      expect(page.items.map((entry) => entry.id)).toEqual([open.id]);
      expect(page.counts.general).toBe(1);
      expect(page.nextCursor).toBeNull();
      const all = FeedbackPageSchema.parse(
        await (
          await request('GET', '?category=general&sort=' + sort + '&includeClosed=true')
        ).json(),
      );
      expect(all.items).toHaveLength(20);
      expect(all.counts.general).toBe(22);
      const more = FeedbackPageSchema.parse(
        await (
          await request(
            'GET',
            '?category=general&sort=' + sort + '&includeClosed=true&cursor=' + all.nextCursor,
          )
        ).json(),
      );
      expect(more.items).toHaveLength(2);
      expect(new Set([...all.items, ...more.items].map((entry) => entry.id)).size).toBe(22);
    }
    expect((await request('GET', '?includeClosed=invalid')).status).toBe(400);
    const mine = OwnFeedbackPageSchema.parse(await (await request('GET', '/mine')).json());
    expect(mine.items.some((entry) => entry.workflowStatus === 'closed')).toBe(true);
  });

  it('rejects malformed feedback before parsing for visitors without access', async () => {
    const response = await fetch(base + '/api/feedback', {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        Cookie: `${VISITOR_COOKIE_NAME}=${encodeVisitorCookie(visitor)}`,
      },
      body: '[',
    });
    expect(response.status).toBe(403);
  });

  it('enforces a durable network vote budget across fresh visitor identities', async () => {
    const entry = await db.feedback.create({
      data: {
        visitorId: 'author',
        category: 'general',
        title: 'Test feedback',
        body: 'A useful feedback description.',
      },
    });
    await db.abuseQuota.create({
      data: {
        key:
          'feedback-vote-network:' + crypto.createHash('sha256').update('127.0.0.1').digest('hex'),
        day: new Date().toISOString().slice(0, 10),
        count: 300,
        expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60_000),
      },
    });
    for (let i = 0; i < 2; i++) {
      visitor = crypto.randomUUID();
      await db.feedbackAccess.create({ data: { visitorId: visitor } });
      expect((await request('PUT', `/${entry.id}/vote`, { reaction: 'agree' })).status).toBe(429);
    }
    expect(await db.feedbackVote.count()).toBe(0);
  });

  it('ranks top feedback in the repository and pages after a cursor', async () => {
    const repository = await import('../../src/modules/feedback/feedback.repository');
    const make = (title: string, createdAt: Date) =>
      db.feedback.create({
        data: {
          visitorId: 'author',
          category: 'bug',
          title,
          body: 'A useful feedback description.',
          status: 'published',
          createdAt,
        },
      });
    const older = await make('Older', new Date('2026-01-01T00:00:00Z'));
    const newer = await make('Newer', new Date('2026-01-02T00:00:00Z'));
    const voted = await make('Voted', new Date('2025-12-01T00:00:00Z'));
    await db.feedbackVote.create({
      data: { feedbackId: voted.id, visitorId: 'v1', reaction: 'seen_too' },
    });
    const ranked = await repository.listTopFeedback('bug', 'seen_too', null, null, true);
    expect(ranked.map((entry) => entry.id)).toEqual([voted.id, newer.id, older.id]);
    const afterFirst = await repository.listTopFeedback('bug', 'seen_too', null, voted.id, true);
    expect(afterFirst.map((entry) => entry.id)).toEqual([newer.id, older.id]);
    await db.feedbackVote.deleteMany();
  });

  const database = new MigratedDatabase('poker-feedback-');
  const origin = 'http://localhost:4200';
  let db: PrismaClient;
  let server: ReturnType<typeof createServer>;
  let base: string;
  let visitor: string;

  beforeAll(async () => {
    database.setUp();
    const prismaModule = await import('../../src/platform/db/prisma');
    db = prismaModule.default;
    await prismaModule.initializeDatabase();
    const { createFeedbackRouter } = await import('../../src/modules/feedback/feedback.routes');
    const app = express();
    app.use(cookieParser());
    app.use(
      '/api/feedback',
      createFeedbackRouter((value) => value === origin),
    );
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = 'http://127.0.0.1:' + (server.address() as import('net').AddressInfo).port;
  }, 30_000);

  beforeEach(async () => {
    await db.abuseQuota.deleteMany();
    await db.$executeRaw`DELETE FROM "FeedbackVote"`;
    await db.feedback.deleteMany();
    await db.feedbackAccess.deleteMany();
    await db.visitorAgreement.deleteMany();
    await db.room.deleteMany();
    visitor = crypto.randomUUID();
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (db) await db.$disconnect();
    database.tearDown();
  });

  function request(
    method = 'GET',
    pathSuffix = '',
    body?: unknown,
    cookie = encodeVisitorCookie(visitor),
    requestOrigin = origin,
  ) {
    return fetch(base + '/api/feedback' + pathSuffix, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Origin: requestOrigin,
        Cookie: VISITOR_COOKIE_NAME + '=' + cookie,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async function replyParent(status = 'published') {
    await db.feedbackAccess.create({ data: { visitorId: visitor } });
    return db.feedback.create({
      data: {
        visitorId: visitor,
        category: 'bug',
        title: 'Reply test',
        body: 'A sufficiently detailed report.',
        status,
        workflowStatus: 'closed',
        resolutionReason: 'fixed',
      },
    });
  }

  it('allows only the original author to post, rejects role spoofing and authorizes before malformed bodies', async () => {
    const parent = await replyParent();
    const other = crypto.randomUUID();
    await db.feedbackAccess.create({ data: { visitorId: other } });
    const suffix = '/' + parent.id + '/replies';
    const forbidden = await fetch(base + '/api/feedback' + suffix, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        Cookie: VISITOR_COOKIE_NAME + '=' + encodeVisitorCookie(other),
      },
      body: '[',
    });
    expect(forbidden.status).toBe(403);
    expect(
      (
        await request('POST', suffix, {
          body: 'Thanks for investigating.',
          author: 'admin',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          'POST',
          suffix,
          { body: 'Thanks for investigating.' },
          encodeVisitorCookie(visitor),
          'https://evil.test',
        )
      ).status,
    ).toBe(403);
    const created = FeedbackReplySchema.parse(
      await (await request('POST', suffix, { body: 'Thanks for investigating.' })).json(),
    );
    expect(created).toMatchObject({
      author: 'author',
      status: 'pending',
      isUnread: false,
    });
    expect(created).not.toHaveProperty('workflowStatus');
    expect((await request('PUT', suffix + '/' + created.id, { body: 'Edited' })).status).toBe(404);
    expect((await request('POST', suffix, { body: 'Another reply.' })).status).toBe(201);
    expect((await request('POST', suffix, { body: 'Too many replies.' })).status).toBe(429);
    expect(await db.feedback.findUnique({ where: { id: parent.id } })).toMatchObject({
      workflowStatus: 'closed',
      resolutionReason: 'fixed',
    });
  });

  it('inherits parent visibility and reveals only published replies to other approved readers', async () => {
    const parent = await replyParent('rejected');
    const other = crypto.randomUUID();
    await db.feedbackAccess.create({ data: { visitorId: other } });
    const suffix = '/' + parent.id + '/replies';
    expect((await request('GET', suffix, undefined, encodeVisitorCookie(other))).status).toBe(404);
    expect((await request('GET', '/' + crypto.randomUUID() + '/replies')).status).toBe(404);
    for (const status of ['pending', 'published', 'rejected'])
      await db.feedbackReply.create({
        data: {
          feedbackId: parent.id,
          author: 'admin',
          body: status + ' reply',
          status,
          rejectionReason: 'Private reason',
        },
      });
    const owner = FeedbackReplyPageSchema.parse(await (await request('GET', suffix)).json());
    expect(owner.items).toHaveLength(3);
    expect(owner.totalCount).toBe(3);
    expect(owner.canReply).toBe(true);
    await db.feedback.update({
      where: { id: parent.id },
      data: { status: 'published' },
    });
    const reader = FeedbackReplyPageSchema.parse(
      await (await request('GET', suffix, undefined, encodeVisitorCookie(other))).json(),
    );
    expect(reader.items).toHaveLength(1);
    expect(reader.totalCount).toBe(1);
    const ownerFeed = FeedbackPageSchema.parse(
      await (await request('GET', '/?includeClosed=true')).json(),
    );
    const readerFeed = FeedbackPageSchema.parse(
      await (
        await request('GET', '/?includeClosed=true', undefined, encodeVisitorCookie(other))
      ).json(),
    );
    const mine = OwnFeedbackPageSchema.parse(await (await request('GET', '/mine')).json());
    expect(ownerFeed.items.find((item) => item.id === parent.id)?.replyCount).toBe(3);
    expect(readerFeed.items.find((item) => item.id === parent.id)?.replyCount).toBe(1);
    expect(mine.items.find((item) => item.id === parent.id)?.replyCount).toBe(3);
    expect(reader.canReply).toBe(false);
    expect(reader.hasUnread).toBe(false);
    expect(reader.items[0]).toMatchObject({
      rejectionReason: null,
      isUnread: false,
    });
    expect(
      (
        await request(
          'GET',
          suffix + '?cursor=' + owner.items.find((item) => item.status === 'pending')?.id,
          undefined,
          encodeVisitorCookie(other),
        )
      ).status,
    ).toBe(400);
    expect((await request('GET', suffix + '?cursor=bad')).status).toBe(400);
  });

  it('marks only displayed published replies read, preserves later publication and unread pages, and cascades parent deletion', async () => {
    const parent = await replyParent();
    const suffix = '/' + parent.id + '/replies';
    await db.feedbackReply.createMany({
      data: Array.from({ length: 21 }, (_, index) => ({
        feedbackId: parent.id,
        author: 'admin',
        body: 'Published reply ' + index,
        status: 'published',
      })),
    });
    const delayed = await db.feedbackReply.create({
      data: { feedbackId: parent.id, author: 'admin', body: 'Delayed check' },
    });
    const page = FeedbackReplyPageSchema.parse(await (await request('GET', suffix)).json());
    expect(page.items).toHaveLength(20);
    expect(page.hasUnread).toBe(true);
    expect(page.nextCursor).not.toBeNull();
    expect(
      await (
        await request('POST', suffix + '/read', {
          ids: page.items.map((item) => item.id),
        })
      ).json(),
    ).toEqual({ hasUnread: true });
    expect((await request('POST', suffix + '/read', { ids: [] })).status).toBe(400);
    const remaining = FeedbackReplyPageSchema.parse(
      await (await request('GET', suffix + '?cursor=' + page.nextCursor)).json(),
    );
    expect(
      await (
        await request('POST', suffix + '/read', {
          ids: remaining.items.map((item) => item.id),
        })
      ).json(),
    ).toEqual({ hasUnread: false });
    await db.feedbackReply.update({
      where: { id: delayed.id },
      data: { status: 'published' },
    });
    const mine = OwnFeedbackPageSchema.parse(await (await request('GET', '/mine')).json());
    expect(mine.items[0]?.hasUnreadReplies).toBe(true);
    await db.feedback.delete({ where: { id: parent.id } });
    expect(await db.feedbackReply.count()).toBe(0);
  });

  it('reports only human status changes and admin replies as updates, and clears status news per author', async () => {
    const parent = await replyParent();
    const other = crypto.randomUUID();
    await db.feedbackAccess.create({ data: { visitorId: other } });
    const updates = async (cookie = encodeVisitorCookie(visitor)) =>
      (await request('GET', '/mine/updates', undefined, cookie)).json();
    expect(await updates()).toEqual({ hasUpdates: false });
    await db.feedbackReply.create({
      data: {
        feedbackId: parent.id,
        author: 'author',
        body: 'Own reply',
        status: 'published',
      },
    });
    await db.feedbackReply.create({
      data: {
        feedbackId: parent.id,
        author: 'admin',
        body: 'Unchecked admin reply',
      },
    });
    expect(await updates()).toEqual({ hasUpdates: false });
    const adminReply = await db.feedbackReply.create({
      data: {
        feedbackId: parent.id,
        author: 'admin',
        body: 'Thanks!',
        status: 'published',
      },
    });
    expect(await updates()).toEqual({ hasUpdates: true });
    await db.feedbackReply.update({
      where: { id: adminReply.id },
      data: { authorReadAt: new Date() },
    });
    expect(await updates()).toEqual({ hasUpdates: false });

    await db.feedback.update({
      where: { id: parent.id },
      data: { authorStatusUnread: true },
    });
    expect(await updates()).toEqual({ hasUpdates: true });
    expect(await updates(encodeVisitorCookie(other))).toEqual({
      hasUpdates: false,
    });
    const mine = OwnFeedbackPageSchema.parse(await (await request('GET', '/mine')).json());
    expect(mine.items[0]?.hasStatusUpdate).toBe(true);

    expect(
      (await request('POST', '/mine/seen', { ids: [parent.id] }, undefined, 'https://evil.example'))
        .status,
    ).toBe(403);
    expect((await request('POST', '/mine/seen', { ids: [] })).status).toBe(400);
    expect(
      (await request('POST', '/mine/seen', { ids: [parent.id] }, encodeVisitorCookie(other)))
        .status,
    ).toBe(204);
    expect(await updates()).toEqual({ hasUpdates: true });
    expect((await request('POST', '/mine/seen', { ids: [parent.id] })).status).toBe(204);
    expect(await updates()).toEqual({ hasUpdates: false });
  });

  it('publishes admin replies at once and keeps author replies private until approved, without changing human status', async () => {
    const parent = await replyParent();
    const other = crypto.randomUUID();
    await db.feedbackAccess.create({ data: { visitorId: other } });
    const { createReply } = await import('../../src/modules/feedback/feedback-reply.service');
    const { reviewReply } = await import('../../src/modules/admin/feedback-admin.service');
    const admin = await createReply(
      parent.id,
      { kind: 'admin', network: 'local-admin' },
      'Thanks for the additional information.',
    );
    expect(admin).toMatchObject({ author: 'admin', status: 'published' });
    const author = await createReply(
      parent.id,
      { kind: 'visitor', visitorId: visitor, network: 'test' },
      'The bug still happens.',
    );
    expect(author).toMatchObject({ author: 'author', status: 'pending' });
    const suffix = '/' + parent.id + '/replies';
    const readerPage = async () =>
      FeedbackReplyPageSchema.parse(
        await (await request('GET', suffix, undefined, encodeVisitorCookie(other))).json(),
      );
    expect((await readerPage()).items.map((item) => item.id)).toEqual([admin.id]);
    const owner = FeedbackReplyPageSchema.parse(await (await request('GET', suffix)).json());
    expect(owner.items.map((item) => [item.id, item.status])).toEqual([
      [admin.id, 'published'],
      [author.id, 'pending'],
    ]);
    expect(owner.items[1]).not.toHaveProperty('canRetry');
    expect((await request('POST', suffix + '/' + author.id + '/retry')).status).toBe(404);
    expect(await reviewReply(author.id, { status: 'published' })).toMatchObject({
      status: 'published',
      rejectionReason: null,
    });
    expect((await readerPage()).items.map((item) => item.id)).toEqual([admin.id, author.id]);
    expect(await db.feedback.findUnique({ where: { id: parent.id } })).toMatchObject({
      workflowStatus: 'closed',
      resolutionReason: 'fixed',
      authorStatusUnread: false,
    });
  });

  it('commits durable reply budgets atomically with storage and bounds thread capacity', async () => {
    const parent = await replyParent();
    const { createReply } = await import('../../src/modules/feedback/feedback-reply.service');
    const actor = {
      kind: 'visitor' as const,
      visitorId: visitor,
      network: 'shared-network',
    };
    await Promise.all(
      Array.from({ length: 19 }, () => createReply(parent.id, actor, 'Budgeted reply.')),
    );
    const results = await Promise.allSettled([
      createReply(parent.id, actor, 'Last reply.'),
      createReply(parent.id, actor, 'Over budget.'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await db.feedbackReply.count()).toBe(20);
    expect((await db.abuseQuota.findMany()).map((row) => row.count)).toEqual([20, 20, 20]);
    await db.abuseQuota.deleteMany();
    await db.feedbackReply.createMany({
      data: Array.from({ length: 80 }, () => ({
        feedbackId: parent.id,
        author: 'admin',
        body: 'Stored reply.',
      })),
    });
    await expect(createReply(parent.id, actor, 'Over capacity.')).rejects.toThrow('storage limit');
    expect(await db.abuseQuota.count()).toBe(0);
  });

  it('retains shared network and global reply limits across identities and database reconnects', async () => {
    const parent = await replyParent();
    const { createReply } = await import('../../src/modules/feedback/feedback-reply.service');
    await createReply(
      parent.id,
      { kind: 'visitor', visitorId: visitor, network: 'shared-network' },
      'Initial reply.',
    );
    await db.abuseQuota.updateMany({
      where: { key: { startsWith: 'feedback-reply-network:' } },
      data: { count: 50 },
    });
    const other = crypto.randomUUID();
    const otherParent = await db.feedback.create({
      data: {
        visitorId: other,
        category: 'bug',
        title: 'Other report',
        body: 'Another sufficiently detailed report.',
      },
    });
    await db.$disconnect();
    await expect(
      createReply(
        otherParent.id,
        { kind: 'visitor', visitorId: other, network: 'shared-network' },
        'Over shared network budget.',
      ),
    ).rejects.toThrow('Daily abuse');
    expect(
      await db.abuseQuota.findFirst({
        where: { key: { startsWith: 'feedback-reply-global:' } },
      }),
    ).toMatchObject({ count: 1 });
    expect(await db.abuseQuota.count()).toBe(3);
    await db.abuseQuota.updateMany({
      where: { key: { startsWith: 'feedback-reply-global:' } },
      data: { count: 500 },
    });
    await expect(
      createReply(
        otherParent.id,
        { kind: 'visitor', visitorId: other, network: 'new-network' },
        'Over global budget.',
      ),
    ).rejects.toThrow('Daily abuse');
    expect(await db.feedbackReply.count()).toBe(1);
    expect(await db.abuseQuota.count()).toBe(3);
  });

  it('requires a valid approved visitor for both listing and posting', async () => {
    expect((await request('GET', '/access', undefined, 'invalid')).status).toBe(401);
    expect((await request('GET')).status).toBe(403);
    expect(
      (
        await request('POST', '', {
          category: 'general',
          title: 'Valid title',
          body: 'A long enough plain text message.',
        })
      ).status,
    ).toBe(403);
    await db.feedbackAccess.create({ data: { visitorId: visitor } });
    expect((await request('GET', '/access')).status).toBe(200);
  });

  it('keeps feedback access after the approving room is deleted', async () => {
    const user = await db.user.create({
      data: {
        room: { create: { id: 'room-feedback' } },
        name: 'Visitor',
        visitorId: visitor,
        isApproved: false,
      },
    });
    const userRepository = await import('../../src/modules/rooms/user.repository');
    await userRepository.update(user.id, { isApproved: true });
    await db.room.delete({ where: { id: 'room-feedback' } });
    expect((await request('GET', '/access')).status).toBe(200);
  });

  it('retains agreement acceptance after a room user is deleted', async () => {
    const userRepository = await import('../../src/modules/rooms/user.repository');
    const acceptedAt = new Date();
    const user = await userRepository.create({
      name: 'Visitor',
      room: { create: { id: 'agreement-room' } },
      visitorId: visitor,
      isApproved: false,
      agreementVersion: FEEDBACK_AGREEMENT_VERSION,
      agreementText: FEEDBACK_AGREEMENT_TEXT,
      agreementAcceptedAt: acceptedAt,
    });
    expect(user.agreementAcceptedAt).toEqual(acceptedAt);
    await db.room.delete({ where: { id: 'agreement-room' } });
    expect(await db.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(
      await db.visitorAgreement.findUnique({
        where: {
          visitorId_version: {
            visitorId: visitor,
            version: FEEDBACK_AGREEMENT_VERSION,
          },
        },
      }),
    ).toMatchObject({
      text: FEEDBACK_AGREEMENT_TEXT,
      acceptedAt,
    });
  });

  it('requires the current agreement before creating feedback or recording acceptance', async () => {
    await db.feedbackAccess.create({ data: { visitorId: visitor } });
    const payload = {
      category: 'general',
      title: 'Voting note',
      body: 'The vote button stopped responding after joining.',
    };
    for (const body of [
      payload,
      { ...payload, ...agreement, agreementAccepted: false },
      {
        ...payload,
        ...agreement,
        agreementVersion: 'old',
      },
    ]) {
      expect((await request('POST', '', body)).status).toBe(400);
    }
    expect(await db.feedback.count()).toBe(0);
    expect(await db.feedbackAccess.findUnique({ where: { visitorId: visitor } })).toMatchObject({
      agreementVersion: null,
      agreementText: null,
      agreementAcceptedAt: null,
    });
  });

  it('neither asks for nor records an agreement when the site requires none', async () => {
    setSiteConfig({ legal: { requireAgreement: false } });
    try {
      await db.feedbackAccess.create({ data: { visitorId: visitor } });
      const created = await request('POST', '', {
        category: 'general',
        title: 'Voting note',
        body: 'The vote button stopped responding after joining.',
      });
      expect(created.status).toBe(201);
      expect(await db.feedbackAccess.findUnique({ where: { visitorId: visitor } })).toMatchObject({
        agreementVersion: null,
        agreementText: null,
        agreementAcceptedAt: null,
      });
    } finally {
      setSiteConfig();
    }
  });

  it('saves plain text, lists it without author identity, and pages newest first', async () => {
    await db.feedbackAccess.create({ data: { visitorId: visitor } });
    const payload = {
      category: 'bug',
      title: 'Voting issue',
      body: 'The vote button stopped responding after joining.',
      ...agreement,
    };
    const created = await request('POST', '', payload);
    expect(created.status).toBe(201);
    expect(await db.feedbackAccess.findUnique({ where: { visitorId: visitor } })).toMatchObject({
      agreementVersion: FEEDBACK_AGREEMENT_VERSION,
      agreementText: FEEDBACK_AGREEMENT_TEXT,
      agreementAcceptedAt: expect.any(Date),
    });
    expect(await created.json()).toMatchObject({
      category: payload.category,
      title: payload.title,
      body: payload.body,
      status: 'pending',
      rejectionReason: null,
    });
    expect((await request('POST', '', payload)).status).toBe(429);
    await db.feedback.createMany({
      data: Array.from({ length: 21 }, (_, index) => ({
        id: crypto.randomUUID(),
        visitorId: crypto.randomUUID(),
        category: 'general',
        title: 'Note ' + index,
        body: 'A separate plain text comment with details.',
        createdAt: new Date(Date.now() + index * 1000),
      })),
    });
    const first = await (await request()).json();
    expect(first.counts).toEqual({
      general: 21,
      bug: 0,
      feature_request: 0,
      new_character_request: 0,
    });
    expect(first.items).toHaveLength(20);
    expect(first.items[0]).not.toHaveProperty('visitorId');
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await (await request('GET', '?cursor=' + first.nextCursor)).json();
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
  });

  it('keeps rejected feedback private and shows the admin reason only to its author', async () => {
    const otherVisitor = crypto.randomUUID();
    await db.feedbackAccess.createMany({
      data: [{ visitorId: visitor }, { visitorId: otherVisitor }],
    });
    const payload = {
      category: 'general',
      title: 'Private note',
      body: 'A sufficiently detailed private comment.',
      ...agreement,
    };
    const created = await (await request('POST', '', payload)).json();
    expect(created.status).toBe('pending');
    expect((await (await request()).json()).counts.general).toBe(0);
    expect((await (await request('GET', '/mine')).json()).items).toHaveLength(1);
    expect(
      (await (await request('GET', '/mine', undefined, encodeVisitorCookie(otherVisitor))).json())
        .items,
    ).toHaveLength(0);
    expect(
      (
        await request(
          'PUT',
          '/' + created.id + '/vote',
          { reaction: 'agree' },
          encodeVisitorCookie(otherVisitor),
        )
      ).status,
    ).toBe(404);
    const { reviewFeedback } = await import('../../src/modules/admin/feedback-admin.service');
    await reviewFeedback(created.id, {
      status: 'rejected',
      reason: 'Please share this privately instead.',
    });
    const mine = OwnFeedbackPageSchema.parse(await (await request('GET', '/mine')).json());
    expect(mine.items[0]).toMatchObject({
      status: 'rejected',
      workflowStatus: 'new',
      rejectionReason: 'Please share this privately instead.',
      hasStatusUpdate: true,
    });
    expect((await (await request()).json()).items).toHaveLength(0);
    expect(
      (await (await request('GET', '', undefined, encodeVisitorCookie(otherVisitor))).json()).items,
    ).toHaveLength(0);
    const publishable = await db.feedback.create({
      data: {
        visitorId: visitor,
        category: 'general',
        title: 'Publishable note',
        body: 'A sufficiently detailed safe comment.',
        status: 'pending',
      },
    });
    await reviewFeedback(publishable.id, { status: 'published' });
    expect(await db.feedback.findUnique({ where: { id: publishable.id } })).toMatchObject({
      status: 'published',
      rejectionReason: null,
    });
    const feed = await (
      await request('GET', '', undefined, encodeVisitorCookie(otherVisitor))
    ).json();
    expect(feed.counts.general).toBe(1);
    expect(feed.items[0]).not.toHaveProperty('safetyScores');
    expect(feed.items[0]).not.toHaveProperty('rejectionReason');
  });

  it('keeps pending feedback private from other visitors until an admin approves it', async () => {
    const otherVisitor = crypto.randomUUID();
    await db.feedbackAccess.createMany({
      data: [{ visitorId: visitor }, { visitorId: otherVisitor }],
    });
    const other = encodeVisitorCookie(otherVisitor);
    const created = await request('POST', '', {
      category: 'bug',
      title: 'Pending report',
      body: 'A sufficiently detailed bug report.',
      ...agreement,
    });
    expect(created.status).toBe(201);
    const pending = OwnFeedbackItemSchema.parse(await created.json());
    expect(pending).toMatchObject({
      status: 'pending',
      rejectionReason: null,
      workflowStatus: 'new',
    });
    expect(pending).not.toHaveProperty('triageStatus');
    for (const cookie of [other, encodeVisitorCookie(visitor)]) {
      const feed = FeedbackPageSchema.parse(
        await (await request('GET', '?includeClosed=true', undefined, cookie)).json(),
      );
      expect(feed.items).toHaveLength(0);
      expect(feed.counts.bug).toBe(0);
    }
    expect((await request('GET', '?cursor=' + pending.id, undefined, other)).status).toBe(400);
    expect(
      (await request('PUT', '/' + pending.id + '/vote', { reaction: 'seen_too' }, other)).status,
    ).toBe(404);
    expect((await request('GET', '/' + pending.id + '/replies', undefined, other)).status).toBe(
      404,
    );
    expect((await (await request('GET', '/mine', undefined, other)).json()).items).toHaveLength(0);
    expect((await request('POST', '/' + pending.id + '/retry')).status).toBe(404);
    const mine = OwnFeedbackPageSchema.parse(await (await request('GET', '/mine')).json());
    expect(mine.items[0]).toMatchObject({ id: pending.id, status: 'pending' });
    const { reviewFeedback } = await import('../../src/modules/admin/feedback-admin.service');
    await reviewFeedback(pending.id, { status: 'published' });
    const published = FeedbackPageSchema.parse(
      await (await request('GET', '', undefined, other)).json(),
    );
    expect(published.items.map((item) => item.id)).toEqual([pending.id]);
  });

  it('filters each type and paginates only within that type', async () => {
    await db.feedbackAccess.create({ data: { visitorId: visitor } });
    await db.feedback.createMany({
      data: [
        ...Array.from({ length: 21 }, (_, index) => ({
          id: crypto.randomUUID(),
          visitorId: visitor,
          category: 'bug',
          title: 'Bug ' + index,
          body: 'A plain text description of this bug.',
        })),
        {
          id: crypto.randomUUID(),
          visitorId: visitor,
          category: 'feature_request',
          title: 'Feature idea',
          body: 'A plain text description of this idea.',
        },
      ],
    });
    const first = await (await request('GET', '?category=bug')).json();
    expect(first.items).toHaveLength(20);
    expect(first.items.every((item: { category: string }) => item.category === 'bug')).toBe(true);
    expect(first.counts.bug).toBe(21);
    expect(first.counts.feature_request).toBe(1);
    const second = await (await request('GET', '?category=bug&cursor=' + first.nextCursor)).json();
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const feature = await (await request('GET', '?category=feature_request')).json();
    expect(feature.items).toHaveLength(1);
    expect(feature.items[0].title).toBe('Feature idea');
    expect(
      (await request('GET', '?category=feature_request&cursor=' + first.nextCursor)).status,
    ).toBe(400);
  });

  it('sorts by category support score, with newest entries breaking ties', async () => {
    await db.feedbackAccess.create({ data: { visitorId: visitor } });
    const oldId = crypto.randomUUID();
    const newerId = crypto.randomUUID();
    const newestId = crypto.randomUUID();
    await db.feedback.createMany({
      data: [oldId, newerId, newestId].map((id, index) => ({
        id,
        visitorId: crypto.randomUUID(),
        category: 'general',
        title: 'General note ' + index,
        body: 'A sufficiently detailed general note.',
        createdAt: new Date(Date.UTC(2026, 8, 27, 12, 0, index)),
      })),
    });
    for (const reaction of ['agree', 'agree']) {
      await db.$executeRaw`
        INSERT INTO "FeedbackVote" ("feedbackId", "visitorId", "reaction")
        VALUES (${oldId}, ${crypto.randomUUID()}, ${reaction})
      `;
    }
    for (const reaction of ['agree', 'agree', 'agree', 'disagree', 'disagree']) {
      await db.$executeRaw`
        INSERT INTO "FeedbackVote" ("feedbackId", "visitorId", "reaction")
        VALUES (${newerId}, ${crypto.randomUUID()}, ${reaction})
      `;
    }
    const newest = await (await request('GET', '?category=general')).json();
    expect(newest.items.map((entry: { id: string }) => entry.id)).toEqual([
      newestId,
      newerId,
      oldId,
    ]);
    const top = await (await request('GET', '?category=general&sort=top')).json();
    expect(top.items.map((entry: { id: string }) => entry.id)).toEqual([oldId, newerId, newestId]);
    expect((await request('GET', '?category=general&sort=bad')).status).toBe(400);
    expect((await request('GET', '?sort=top')).status).toBe(400);
  });

  it('paginates top results across the whole category without duplicates', async () => {
    await db.feedbackAccess.create({ data: { visitorId: visitor } });
    const ids = Array.from({ length: 22 }, () => crypto.randomUUID());
    await db.feedback.createMany({
      data: ids.map((id, index) => ({
        id,
        visitorId: crypto.randomUUID(),
        category: 'bug',
        title: 'Bug report ' + index,
        body: 'A sufficiently detailed bug report.',
        createdAt: new Date(Date.UTC(2026, 8, 27, 12, 0, index)),
      })),
    });
    const oldest = ids[0];
    if (!oldest) throw new Error('Missing oldest feedback item.');
    await db.$executeRaw`
      INSERT INTO "FeedbackVote" ("feedbackId", "visitorId", "reaction")
      VALUES (${oldest}, ${crypto.randomUUID()}, ${'seen_too'})
    `;
    const first = await (await request('GET', '?category=bug&sort=top')).json();
    expect(first.items).toHaveLength(20);
    expect(first.items[0].id).toBe(oldest);
    expect(first.items[1].id).toBe(ids[21]);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await (
      await request('GET', '?category=bug&sort=top&cursor=' + first.nextCursor)
    ).json();
    expect(second.items).toHaveLength(2);
    expect(second.items.map((entry: { id: string }) => entry.id)).toEqual([ids[2], ids[1]]);
    expect(second.nextCursor).toBeNull();
    expect(
      new Set([...first.items, ...second.items].map((entry: { id: string }) => entry.id)).size,
    ).toBe(22);
  });

  it('uses the matching support reactions for feature and character requests', async () => {
    await db.feedbackAccess.create({ data: { visitorId: visitor } });
    for (const [category, positive] of [
      ['feature_request', 'would_use'],
      ['new_character_request', 'would_throw'],
    ] as const) {
      const supportedId = crypto.randomUUID();
      const opposedId = crypto.randomUUID();
      await db.feedback.createMany({
        data: [
          {
            id: supportedId,
            visitorId: crypto.randomUUID(),
            category,
            title: 'Supported idea',
            body: 'A sufficiently detailed request.',
            createdAt: new Date('2026-09-27T12:00:00.000Z'),
          },
          {
            id: opposedId,
            visitorId: crypto.randomUUID(),
            category,
            title: 'Opposed idea',
            body: 'A sufficiently detailed request.',
            createdAt: new Date('2026-09-27T12:00:01.000Z'),
          },
        ],
      });
      await db.$executeRaw`
        INSERT INTO "FeedbackVote" ("feedbackId", "visitorId", "reaction")
        VALUES (${supportedId}, ${crypto.randomUUID()}, ${positive})
      `;
      await db.$executeRaw`
        INSERT INTO "FeedbackVote" ("feedbackId", "visitorId", "reaction")
        VALUES (${opposedId}, ${crypto.randomUUID()}, ${'not_for_me'})
      `;
      const top = await (await request('GET', '?category=' + category + '&sort=top')).json();
      expect(top.items.map((entry: { id: string }) => entry.id)).toEqual([supportedId, opposedId]);
    }
  });

  it('rejects invalid origins, unsafe text, and invalid cursors', async () => {
    await db.feedbackAccess.create({ data: { visitorId: visitor } });
    const payload = {
      category: 'general',
      title: 'Valid title',
      body: 'A long enough plain text message.',
      ...agreement,
    };
    expect(
      (await request('POST', '', payload, encodeVisitorCookie(visitor), 'https://evil.test'))
        .status,
    ).toBe(403);
    expect(
      (
        await request('POST', '', {
          ...payload,
          body: '<script>alert(1)</script> and more words',
        })
      ).status,
    ).toBe(400);
    expect((await request('GET', '?cursor=bad')).status).toBe(400);
    expect((await request('GET', '?category=unknown')).status).toBe(400);
    expect((await request('GET', '?cursor=' + crypto.randomUUID())).status).toBe(400);
    expect(await db.feedback.count()).toBe(0);
  });

  it('allows one category-specific vote per visitor, including changing and removing it', async () => {
    const otherVisitor = crypto.randomUUID();
    await db.feedbackAccess.createMany({
      data: [{ visitorId: visitor }, { visitorId: otherVisitor }],
    });
    const general = await db.feedback.create({
      data: {
        visitorId: otherVisitor,
        category: 'general',
        title: 'General note',
        body: 'A sufficiently detailed general note.',
      },
    });
    const bug = await db.feedback.create({
      data: {
        visitorId: otherVisitor,
        category: 'bug',
        title: 'Bug report',
        body: 'A sufficiently detailed bug report.',
      },
    });

    expect((await request('PUT', '/' + general.id + '/vote', { reaction: 'agree' })).status).toBe(
      200,
    );
    expect(
      (await request('GET', '?category=general').then((res) => res.json())).items[0],
    ).toMatchObject({
      voteCounts: { agree: 1, disagree: 0 },
      userVote: 'agree',
    });
    const changed = await request('PUT', '/' + general.id + '/vote', {
      reaction: 'disagree',
    });
    expect(await changed.json()).toMatchObject({
      voteCounts: { agree: 0, disagree: 1 },
      userVote: 'disagree',
    });
    expect(
      (await db.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS "count" FROM "FeedbackVote"`)[0]
        ?.count,
    ).toBe(1n);
    expect((await request('PUT', '/' + bug.id + '/vote', { reaction: 'agree' })).status).toBe(400);
    expect((await request('PUT', '/' + bug.id + '/vote', { reaction: 'seen_too' })).status).toBe(
      200,
    );
    expect((await request('DELETE', '/' + general.id + '/vote')).status).toBe(200);
    expect(
      (await db.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS "count" FROM "FeedbackVote"`)[0]
        ?.count,
    ).toBe(1n);
  });

  it('rejects self-votes, unapproved voters, invalid items, and invalid origins', async () => {
    await db.feedbackAccess.create({ data: { visitorId: visitor } });
    const own = await db.feedback.create({
      data: {
        visitorId: visitor,
        category: 'feature_request',
        title: 'Feature idea',
        body: 'A sufficiently detailed feature idea.',
      },
    });
    expect((await request('PUT', '/' + own.id + '/vote', { reaction: 'would_use' })).status).toBe(
      403,
    );
    expect(
      (
        await request(
          'PUT',
          '/' + own.id + '/vote',
          { reaction: 'would_use' },
          encodeVisitorCookie(crypto.randomUUID()),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          'PUT',
          '/' + own.id + '/vote',
          { reaction: 'would_use' },
          encodeVisitorCookie(visitor),
          'https://evil.test',
        )
      ).status,
    ).toBe(403);
    expect((await request('PUT', '/bad/vote', { reaction: 'would_use' })).status).toBe(400);
    expect(
      (
        await request('PUT', '/' + crypto.randomUUID() + '/vote', {
          reaction: 'would_use',
        })
      ).status,
    ).toBe(404);
    expect(
      (await db.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS "count" FROM "FeedbackVote"`)[0]
        ?.count,
    ).toBe(0n);
  });

  describe('operator settings', () => {
    afterEach(() => setSiteConfig());

    it('answers 404 everywhere without reading the session or database when feedback is off', async () => {
      await db.feedbackAccess.create({ data: { visitorId: visitor } });
      const parent = await db.feedback.create({
        data: {
          visitorId: visitor,
          category: 'bug',
          title: 'Hidden',
          body: 'A sufficiently detailed report.',
          status: 'published',
        },
      });
      setSiteConfig({ features: { feedback: false } });
      for (const [method, suffix, body] of [
        ['GET', '/access'],
        ['GET', ''],
        ['GET', '/mine/updates'],
        ['POST', '', { category: 'bug', title: 'New', body: 'Details.' }],
        ['PUT', `/${parent.id}/vote`, { reaction: 'seen_too' }],
        ['GET', `/${parent.id}/replies`],
        ['POST', `/${parent.id}/replies`, { body: 'Reply.' }],
      ] as const) {
        const response = await request(method, suffix, body, 'invalid');
        expect(response.status).toBe(404);
      }
      expect(await db.feedback.count()).toBe(1);
      expect(await db.feedbackReply.count()).toBe(0);
      setSiteConfig();
      expect((await request('GET', '/access')).status).toBe(200);
    });

    it('charges submissions against limits.daily.feedbackPosts', async () => {
      setSiteConfig({
        limits: {
          daily: {
            feedbackPosts: { perVisitor: 1, perNetwork: 2, perSite: 3 },
          },
        },
      });
      const repository = await import('../../src/modules/feedback/feedback.repository');
      const submit = async (visitorId: string, network: string) => {
        await db.feedbackAccess.upsert({
          where: { visitorId },
          create: { visitorId },
          update: {},
        });
        return repository.createFeedback(
          visitorId,
          network,
          CreateFeedbackSchema.parse({
            category: 'general',
            title: 'Configured',
            body: 'A useful feedback description.',
            ...agreement,
          }),
        );
      };
      await submit('a', 'n1');
      await expect(submit('a', 'n1')).rejects.toThrow('Daily abuse');
      await submit('b', 'n1');
      await expect(submit('c', 'n1')).rejects.toThrow('Daily abuse');
      await submit('d', 'n2');
      await expect(submit('e', 'n3')).rejects.toThrow('Daily abuse');
      expect(await db.feedback.count()).toBe(3);
    });

    it('charges votes against limits.daily.feedbackVotes', async () => {
      setSiteConfig({
        limits: {
          daily: {
            feedbackVotes: { perVisitor: 2, perNetwork: 10, perSite: 10 },
          },
        },
      });
      const repository = await import('../../src/modules/feedback/feedback.repository');
      const entry = await db.feedback.create({
        data: {
          visitorId: 'author',
          category: 'bug',
          title: 'Votes',
          body: 'A useful feedback description.',
          status: 'published',
        },
      });
      await repository.saveVote(entry.id, 'voter', 'n1', 'seen_too');
      await repository.removeVote(entry.id, 'voter', 'n1');
      await expect(repository.saveVote(entry.id, 'voter', 'n1', 'seen_too')).rejects.toThrow(
        'Daily abuse',
      );
      await repository.saveVote(entry.id, 'other', 'n1', 'seen_too');
    });

    it('charges visitor replies against limits.daily.feedbackReplies but keeps the admin budget fixed', async () => {
      setSiteConfig({
        limits: {
          daily: {
            feedbackReplies: { perVisitor: 1, perNetwork: 5, perSite: 3 },
          },
        },
      });
      const parent = await replyParent();
      const { createReply } = await import('../../src/modules/feedback/feedback-reply.service');
      const actor = {
        kind: 'visitor' as const,
        visitorId: visitor,
        network: 'net',
      };
      await createReply(parent.id, actor, 'First reply.');
      await expect(createReply(parent.id, actor, 'Second reply.')).rejects.toThrow('Daily abuse');
      const admin = { kind: 'admin' as const, network: 'local-admin' };
      await createReply(parent.id, admin, 'Admin reply one.');
      await createReply(parent.id, admin, 'Admin reply two.');
      // The admin shares the site-wide budget of three.
      await expect(createReply(parent.id, admin, 'Admin reply three.')).rejects.toThrow(
        'Daily abuse',
      );
      expect(await db.feedbackReply.count()).toBe(3);
    });
  });
});
