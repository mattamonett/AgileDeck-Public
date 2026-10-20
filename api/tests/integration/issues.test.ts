import crypto from 'crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import type { PrismaClient } from '@prisma/client';
import { GameEvents, IssueStatus } from '@poker/shared';
import { encodeVisitorCookie, VISITOR_COOKIE_NAME } from '../../src/platform/http/visitor-session';
import { setSiteConfig } from '../../src/config/site-config';
import { MigratedDatabase } from '../helpers/migrated-database';

describe('issue HTTP API with SQLite and room broadcasts', () => {
  it('rejects malformed imports before parsing for missing sessions and unapproved visitors', async () => {
    const endpoint = `${base}/api/rooms/room-a/issues/import?userId=${userId}`;
    const headers = { Origin: origin, 'Content-Type': 'application/json' };
    expect((await fetch(endpoint, { method: 'POST', headers, body: '[' })).status).toBe(401);
    expect(
      (
        await fetch(endpoint, {
          method: 'POST',
          headers: {
            ...headers,
            Cookie: `${VISITOR_COOKIE_NAME}=${encodeVisitorCookie(crypto.randomUUID())}`,
          },
          body: '[',
        })
      ).status,
    ).toBe(403);
  });

  it('rejects compressed imports from approved users instead of inflating them', async () => {
    const { gzipSync } = await import('node:zlib');
    const response = await fetch(`${base}/api/rooms/room-a/issues/import?userId=${userId}`, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        Cookie: `${VISITOR_COOKIE_NAME}=${encodeVisitorCookie(visitor)}`,
      },
      body: new Uint8Array(gzipSync('[]')),
    });
    expect(response.status).toBe(415);
  });

  const database = new MigratedDatabase('poker-issues-');
  const visitor = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const otherUserId = crypto.randomUUID();
  const pendingUserId = crypto.randomUUID();
  const origin = 'http://localhost:4200';
  let db: PrismaClient;
  let server: ReturnType<typeof createServer>;
  let io: Server;
  let base: string;
  let clients: Socket[] = [];

  beforeAll(async () => {
    database.setUp();
    const prismaModule = await import('../../src/platform/db/prisma');
    db = prismaModule.default;
    await prismaModule.initializeDatabase();
    const { createIssuesRouter } = await import('../../src/modules/issues/issues.routes');
    const app = express();
    server = createServer(app);
    io = new Server(server);
    app.use(cookieParser());
    app.use(
      '/api/rooms',
      createIssuesRouter(io, (value: string) => value === origin),
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as import('net').AddressInfo).port}`;
    io.on('connection', (socket) => {
      socket.join(socket.handshake.auth.roomId);
    });
  }, 30_000);

  beforeEach(async () => {
    await db.room.deleteMany();
    await db.room.create({
      data: {
        id: 'room-a',
        users: {
          create: [
            { id: userId, name: 'Player', visitorId: visitor },
            {
              id: pendingUserId,
              name: 'Pending',
              visitorId: crypto.randomUUID(),
              isApproved: false,
            },
          ],
        },
      },
    });
    await db.room.create({
      data: {
        id: 'room-b',
        users: {
          create: {
            id: otherUserId,
            name: 'Other',
            visitorId: visitor,
          },
        },
      },
    });
  });
  afterEach(() => {
    clients.forEach((client) => client.disconnect());
    clients = [];
  });
  afterAll(async () => {
    if (io) await new Promise<void>((resolve) => io.close(() => resolve()));
    if (db) await db.$disconnect();
    database.tearDown();
  });

  async function request(
    method = 'GET',
    options: {
      room?: string;
      user?: string;
      id?: string;
      body?: unknown;
      cookie?: string;
      cursor?: string;
      origin?: string;
    } = {},
  ) {
    const url =
      `${base}/api/rooms/${options.room ?? 'room-a'}/issues${options.id ? '/' + options.id : ''}` +
      `?userId=${options.user ?? userId}${options.cursor ? '&cursor=' + encodeURIComponent(options.cursor) : ''}`;
    return fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Origin: options.origin ?? origin,
        Cookie: `${VISITOR_COOKIE_NAME}=${options.cookie ?? encodeVisitorCookie(visitor)}`,
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  }
  async function create(title: string, parentId?: string) {
    const response = await request('POST', {
      body: { title, ...(parentId ? { parentId } : {}) },
    });
    expect(response.status).toBe(201);
    return (await response.json()).id as string;
  }

  it('imports nested issues atomically and exports the full board with fresh server metadata', async () => {
    const previous = await create('Previously active');
    await request('PUT', { id: previous, body: { status: 'in_progress' } });
    const response = await request('POST', {
      id: 'import',
      body: [
        {
          title: 'Imported',
          id: previous,
          createdAt: '1900-01-01',
          issueNumber: 'TASK-1',
          subIssues: [{ title: 'Child', status: 'in_progress', estimate: 3 }],
        },
      ],
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ count: 2 });
    const exported = await (await request('GET', { id: 'export' })).json();
    const imported = exported.find((issue: { title: string }) => issue.title === 'Imported');
    expect(imported.id).not.toBe(previous);
    expect(imported.createdAt).not.toContain('1900');
    expect(imported.status).toBe('in_progress');
    expect(imported.subIssues[0]).toMatchObject({
      title: 'Child',
      estimate: 3,
      status: 'in_progress',
    });
    expect(exported.find((issue: { id: string }) => issue.id === previous).status).toBe('open');
    const bad = await request('POST', {
      id: 'import',
      body: [{ title: 'Good' }, { title: 'Bad', subIssues: [{ title: '' }] }],
    });
    expect(bad.status).toBe(400);
    expect(await db.issue.count()).toBe(3);
  });

  it('rejects an over-capacity batch without inserting any of it', async () => {
    await db.issue.createMany({
      data: Array.from({ length: 4999 }, () => {
        const id = crypto.randomUUID();
        return { id, rootId: id, roomId: 'room-a', title: 'Existing' };
      }),
    });
    const response = await request('POST', {
      id: 'import',
      body: [{ title: 'New parent', subIssues: [{ title: 'New child' }] }],
    });
    expect(response.status).toBe(409);
    expect(await db.issue.count()).toBe(4999);
    expect(await db.issue.count({ where: { title: { startsWith: 'New' } } })).toBe(0);
  });

  it('caps each import at 500 issues and a durable daily budget', async () => {
    const tooMany = await request('POST', {
      id: 'import',
      body: [
        {
          title: 'Root',
          subIssues: Array.from({ length: 500 }, (_, i) => ({
            title: `Child ${i}`,
          })),
        },
      ],
    });
    expect(tooMany.status).toBe(400);
    expect(await db.issue.count()).toBe(0);

    await db.abuseQuota.deleteMany();
    expect((await request('POST', { id: 'import', body: [{ title: 'Daily' }] })).status).toBe(201);
    const key = 'import-visitor:' + crypto.createHash('sha256').update(visitor).digest('hex');
    const quota = await db.abuseQuota.findFirstOrThrow({ where: { key } });
    expect(quota.count).toBe(1);
    await db.abuseQuota.update({
      where: { key_day: { key, day: quota.day } },
      data: { count: 20 },
    });
    const over = await request('POST', {
      id: 'import',
      body: [{ title: 'Over budget' }],
    });
    expect(over.status).toBe(429);
    expect(await db.issue.count({ where: { title: 'Over budget' } })).toBe(0);
    await db.abuseQuota.deleteMany();
  });

  it('parses request bodies only on issue routes', async () => {
    const response = await fetch(`${base}/api/rooms/room-a/elsewhere`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: '[',
    });
    expect(response.status).toBe(404);
  });

  it('authorizes import and export and exports roots beyond the first page', async () => {
    for (const [method, id] of [
      ['POST', 'import'],
      ['GET', 'export'],
    ] as const) {
      expect(
        (
          await request(method, {
            id,
            user: otherUserId,
            ...(method === 'POST' ? { body: [{ title: 'Unauthorized' }] } : {}),
          })
        ).status,
      ).toBe(403);
    }
    expect(
      (
        await request('POST', {
          id: 'import',
          origin: 'https://untrusted.example',
          body: [{ title: 'Bad origin' }],
        })
      ).status,
    ).toBe(403);
    const imported = await request('POST', {
      id: 'import',
      body: Array.from({ length: 51 }, (_, i) => ({ title: `Issue ${i}` })),
    });
    expect(imported.status).toBe(201);
    expect((await (await request()).json()).issues).toHaveLength(50);
    expect(await (await request('GET', { id: 'export' })).json()).toHaveLength(51);
  });

  it('requires matching room, user, signed session and approval for every verb', async () => {
    const id = await create('Protected');
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      const options = {
        ...(method === 'PUT' || method === 'DELETE' ? { id } : {}),
        ...(method === 'POST' || method === 'PUT' ? { body: { title: 'Attack' } } : {}),
      };
      for (const mismatch of [{ user: otherUserId }, { room: 'room-b' }, { user: pendingUserId }]) {
        expect((await request(method, { ...options, ...mismatch })).status).toBe(403);
      }
      expect((await request(method, { ...options, user: '' })).status).toBe(400);
      expect((await request(method, { ...options, cookie: 'forged' })).status).toBe(401);
    }
    expect(
      (
        await request('POST', {
          body: { title: 'Attack' },
          origin: 'https://evil.example',
        })
      ).status,
    ).toBe(403);
    expect(await db.issue.count()).toBe(1);
  });

  it('scopes parents and target issues to the room, strips client timestamps and returns UTC', async () => {
    const response = await request('POST', {
      body: {
        title: 'Root',
        createdAt: '1900-01-01',
        lastModifiedAt: '1900-01-01',
      },
    });
    expect(response.status).toBe(201);
    const id = (await response.json()).id;
    const first = (await (await request()).json()).issues[0];
    expect(first.createdAt).toMatch(/Z$/);
    expect(new Date(first.createdAt).getUTCFullYear()).toBeGreaterThan(2020);
    expect(
      (
        await request('PUT', {
          id,
          body: {
            title: 'Renamed',
            createdAt: '1900-01-01',
            lastModifiedAt: '1900-01-01',
          },
        })
      ).status,
    ).toBe(200);
    const updated = (await (await request()).json()).issues[0];
    expect(updated.createdAt).toBe(first.createdAt);
    expect(updated.lastModifiedAt).toMatch(/Z$/);
    expect(updated.title).toBe('Renamed');
    for (const method of ['PUT', 'DELETE'])
      expect(
        (
          await request(method, {
            room: 'room-b',
            user: otherUserId,
            id,
            ...(method === 'PUT' ? { body: { title: 'Attack' } } : {}),
          })
        ).status,
      ).toBe(404);
    expect(
      (
        await request('POST', {
          room: 'room-b',
          user: otherUserId,
          body: { title: 'Attack', parentId: id },
        })
      ).status,
    ).toBe(404);
    for (const body of [
      { title: ' ' },
      { title: 'a'.repeat(201) },
      { title: 'Bad', url: 'javascript:alert(1)' },
      { title: 'Bad', estimate: '3' },
      { title: 'Bad', status: 'invalid' },
    ]) {
      expect((await request('POST', { body })).status).toBe(400);
    }
    expect((await request('GET', { cursor: 'garbage' })).status).toBe(400);
  });

  it('pages 50 roots with complete descendants, stable ordering and a cursor surviving deletion', async () => {
    const date = new Date('2026-01-01T00:00:00Z');
    const ids = Array.from({ length: 52 }, () => crypto.randomUUID())
      .sort()
      .reverse();
    await db.issue.createMany({
      data: ids.map((id) => ({
        id,
        roomId: 'room-a',
        rootId: id,
        title: id,
        createdAt: date,
      })),
    });
    const child = await create('Child', ids[0]);
    await create('Grandchild', child);
    await request('PUT', {
      id: ids[51]!,
      body: { status: IssueStatus.IN_PROGRESS },
    });
    const first = await (await request()).json();
    expect(first.activeIssue.id).toBe(ids[51]);
    expect(first.issues.map((issue: { id: string }) => issue.id)).toEqual(ids.slice(0, 50));
    expect(first.issues[0].subIssues[0].subIssues[0].title).toBe('Grandchild');
    await request('PUT', { id: ids[51]!, body: { title: 'Edited oldest' } });
    await request('DELETE', { id: ids[49]! });
    await create('New arrival');
    const second = await (await request('GET', { cursor: first.nextCursor })).json();
    expect(second.issues.map((issue: { id: string }) => issue.id)).toEqual(ids.slice(50));
    expect(second.nextCursor).toBeNull();
    expect(second.activeIssue.id).toBe(ids[51]);
  });

  it('applies status rules atomically across branches and cascades deletes', async () => {
    const root = await create('Root');
    const child = await create('Child', root);
    const grandchild = await create('Grandchild', child);
    const other = await create('Other branch');
    await request('PUT', {
      id: grandchild,
      body: { status: IssueStatus.IN_PROGRESS },
    });
    expect(
      (await db.issue.findMany({ where: { status: IssueStatus.IN_PROGRESS } }))
        .map((row) => row.id)
        .sort(),
    ).toEqual([root, child, grandchild].sort());
    await request('PUT', {
      id: other,
      body: { status: IssueStatus.IN_PROGRESS },
    });
    expect(
      (await db.issue.findMany({ where: { status: IssueStatus.IN_PROGRESS } })).map(
        (row) => row.id,
      ),
    ).toEqual([other]);
    await request('PUT', {
      id: grandchild,
      body: { status: IssueStatus.CLOSED },
    });
    expect(await db.issue.count({ where: { status: IssueStatus.CLOSED } })).toBe(3);
    expect((await request('DELETE', { id: root })).status).toBe(204);
    expect(await db.issue.count()).toBe(1);
    await db.room.delete({ where: { id: 'room-a' } });
    expect(await db.issue.count()).toBe(0);
  });

  it('clears closed issues without removing open subissues or other rooms', async () => {
    const done = await create('Done');
    const doneChild = await create('Done child', done);
    const mixed = await create('Mixed');
    const mixedOpen = await create('Mixed open', mixed);
    const mixedDone = await create('Mixed done', mixed);
    const open = await create('Open');
    for (const id of [doneChild, done, mixed, mixedDone])
      await db.issue.update({
        where: { id },
        data: { status: IssueStatus.CLOSED },
      });
    await db.issue.create({
      data: {
        id: crypto.randomUUID(),
        roomId: 'room-b',
        rootId: crypto.randomUUID(),
        title: 'Other room',
        status: IssueStatus.CLOSED,
      },
    });
    const closed = (method: string, user?: string) =>
      request(method, { id: 'closed', ...(user ? { user } : {}) });

    const preview = await closed('GET');
    expect(preview.status).toBe(200);
    expect(await preview.json()).toEqual({ count: 3 });
    expect((await closed('DELETE', pendingUserId)).status).toBe(403);
    expect(
      (
        await request('DELETE', {
          id: 'closed',
          origin: 'https://evil.example',
        })
      ).status,
    ).toBe(403);
    expect(await db.issue.count({ where: { roomId: 'room-a' } })).toBe(6);

    const cleared = await closed('DELETE');
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toEqual({ count: 3 });
    expect(
      (await db.issue.findMany({ where: { roomId: 'room-a' } })).map((row) => row.id).sort(),
    ).toEqual([mixed, mixedOpen, open].sort());
    expect(await db.issue.count({ where: { roomId: 'room-b' } })).toBe(1);
    expect(await (await closed('DELETE')).json()).toEqual({ count: 0 });
  });

  it('closes the active issue and starts the next open one in board order', async () => {
    const oldest = await create('Oldest');
    const middle = await create('Middle');
    const subissue = await create('Subissue', middle);
    const newest = await create('Newest');
    const order = [oldest, middle, subissue, newest];
    for (const [index, id] of order.entries())
      await db.issue.update({
        where: { id },
        data: { createdAt: new Date(Date.UTC(2026, 0, index + 1)) },
      });
    const next = async () => {
      const response = await request('POST', { id: 'next' });
      expect(response.status).toBe(200);
      return ((await response.json()) as { id: string | null }).id;
    };
    const statuses = async () =>
      Object.fromEntries((await db.issue.findMany()).map((row) => [row.title, row.status]));

    expect(await next()).toBe(newest);
    expect(await next()).toBe(middle);
    expect(await statuses()).toMatchObject({
      Newest: IssueStatus.CLOSED,
      Middle: IssueStatus.IN_PROGRESS,
      Subissue: IssueStatus.OPEN,
    });
    expect(await next()).toBe(subissue);
    expect(await next()).toBe(oldest);
    expect(await statuses()).toMatchObject({
      Middle: IssueStatus.CLOSED,
      Subissue: IssueStatus.CLOSED,
      Oldest: IssueStatus.IN_PROGRESS,
    });
    expect(await next()).toBeNull();
    expect(await db.issue.count({ where: { status: { not: IssueStatus.CLOSED } } })).toBe(0);

    await request('PUT', { id: newest, body: { status: IssueStatus.OPEN } });
    await request('PUT', {
      id: oldest,
      body: { status: IssueStatus.IN_PROGRESS },
    });
    expect(await next()).toBe(newest);
    expect((await request('POST', { id: 'next', user: pendingUserId })).status).toBe(403);
    expect((await request('POST', { id: 'next', origin: 'https://evil.example' })).status).toBe(
      403,
    );
  });

  it('notifies both clients in the affected room after successful writes only', async () => {
    async function client(roomId: string) {
      const socket = connect(base, {
        auth: { roomId },
        transports: ['websocket'],
        forceNew: true,
      });
      clients.push(socket);
      await new Promise<void>((resolve) => socket.on('connect', resolve));
      return socket;
    }
    const a = await client('room-a');
    const b = await client('room-a');
    const foreign = await client('room-b');
    const foreignChanged = jest.fn();
    foreign.on(GameEvents.ISSUES_CHANGED, foreignChanged);
    const next = (socket: Socket) =>
      new Promise((resolve) => socket.once(GameEvents.ISSUES_CHANGED, resolve));
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const id = (await db.issue.findFirst())?.id;
      const events = Promise.all([next(a), next(b)]);
      await request(method, {
        ...(id ? { id } : {}),
        ...(method !== 'DELETE' ? { body: { title: 'Live' } } : {}),
      });
      expect(await events).toEqual([{ roomId: 'room-a' }, { roomId: 'room-a' }]);
    }
    const changed = jest.fn();
    a.on(GameEvents.ISSUES_CHANGED, changed);
    await request('POST', {
      body: { title: 'Bad', url: 'javascript:alert(1)' },
    });
    expect(changed).not.toHaveBeenCalled();
    expect(foreignChanged).not.toHaveBeenCalled();
  });

  it('persists optional external numbers for roots and children, preserves omitted values and clears them', async () => {
    const rootResponse = await request('POST', {
      body: { title: 'Root', issueNumber: ' 001234 ' },
    });
    expect(rootResponse.status).toBe(201);
    const root = (await rootResponse.json()).id;
    const childResponse = await request('POST', {
      body: { title: 'Child', parentId: root, issueNumber: 'TASK-123' },
    });
    expect(childResponse.status).toBe(201);
    const child = (await childResponse.json()).id;
    let page = await (await request()).json();
    expect(page.issues[0].issueNumber).toBe('001234');
    expect(page.issues[0].subIssues[0].issueNumber).toBe('TASK-123');
    await request('PUT', {
      id: child,
      body: { status: IssueStatus.IN_PROGRESS },
    });
    page = await (await request()).json();
    expect(page.activeIssue.issueNumber).toBe('TASK-123');
    expect(
      (
        await request('PUT', {
          id: child,
          body: { issueNumber: 'x'.repeat(100) },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request('PUT', {
          id: child,
          body: { issueNumber: 'x'.repeat(101) },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request('POST', {
          body: { title: 'Invalid', issueNumber: 'x'.repeat(101) },
        })
      ).status,
    ).toBe(400);
    await request('PUT', { id: child, body: { issueNumber: '' } });
    await request('PUT', { id: root, body: { issueNumber: null } });
    page = await (await request()).json();
    expect(page.issues[0].issueNumber).toBeUndefined();
    expect(page.issues[0].subIssues[0].issueNumber).toBeUndefined();
    expect((await db.issue.findUniqueOrThrow({ where: { id: child } })).issueNumber).toBeNull();
  });

  it('queues concurrent issue snapshots and room writes without SQLite lock timeouts', async () => {
    const { listIssues, exportIssues } = await import('../../src/modules/issues/issue.service');
    const id = await create('Concurrent issue');
    const started = Date.now();
    await Promise.all(
      Array.from({ length: 20 }, async (_, index) => {
        const [page, exported] = await Promise.all([
          listIssues('room-a', userId, visitor),
          exportIssues('room-a', userId, visitor),
          db.room.update({
            where: { id: 'room-a' },
            data: { name: `Update ${index}` },
          }),
        ]);
        expect(page.issues[0]?.id).toBe(id);
        expect(exported[0]?.id).toBe(id);
      }),
    );
    expect(Date.now() - started).toBeLessThan(2000);
    expect(await db.$queryRaw`PRAGMA journal_mode`).toEqual([{ journal_mode: 'wal' }]);
    const sync = await db.$queryRaw<{ synchronous: bigint }[]>`PRAGMA synchronous`;
    expect(Number(sync[0]?.synchronous)).toBe(2);
    expect(await db.$queryRaw`PRAGMA quick_check`).toEqual([{ quick_check: 'ok' }]);
  });

  it('rolls back every write after a transaction fails in WAL mode', async () => {
    await expect(
      db.$transaction(async (tx) => {
        await tx.room.update({
          where: { id: 'room-a' },
          data: { name: 'Must roll back' },
        });
        await tx.issue.create({
          data: {
            id: 'rollback-issue',
            rootId: 'rollback-issue',
            roomId: 'room-a',
            title: 'Must roll back',
          },
        });
        throw new Error('Forced failure');
      }),
    ).rejects.toThrow('Forced failure');
    expect(await db.issue.count()).toBe(0);
    expect((await db.room.findUniqueOrThrow({ where: { id: 'room-a' } })).name).toBeNull();
  });

  describe('operator settings', () => {
    afterEach(() => setSiteConfig());

    it('answers 404 on every issue route when issues are turned off', async () => {
      await create('Kept');
      setSiteConfig({ features: { issues: false } });
      for (const [method, options] of [
        ['GET', {}],
        ['GET', { id: 'export' }],
        ['POST', { body: { title: 'New' } }],
        ['POST', { id: 'import', body: [{ title: 'Imported' }] }],
        ['DELETE', { id: 'closed' }],
        ['GET', { cookie: 'invalid' }],
      ] as const)
        expect((await request(method, options)).status).toBe(404);
      expect(await db.issue.count()).toBe(1);
      setSiteConfig();
      expect((await request('GET')).status).toBe(200);
    });

    it('charges imports against limits.daily.issueImports', async () => {
      await db.abuseQuota.deleteMany();
      setSiteConfig({
        limits: {
          daily: {
            issueImports: { perVisitor: 1, perNetwork: 5, perSite: 5 },
          },
        },
      });
      const imported = () => request('POST', { id: 'import', body: [{ title: 'Configured' }] });
      expect((await imported()).status).toBe(201);
      expect((await imported()).status).toBe(429);
      expect(await db.issue.count({ where: { title: 'Configured' } })).toBe(1);
      await db.abuseQuota.deleteMany();
    });
  });

  it('rate limits excessive requests', async () => {
    let status = 200;
    for (let index = 0; index < 121 && status !== 429; index++) status = (await request()).status;
    expect(status).toBe(429);
  });
});
