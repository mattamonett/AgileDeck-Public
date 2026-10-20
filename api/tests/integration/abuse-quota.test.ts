import { getSiteAgreement, setSiteConfig } from '../../src/config/site-config';
const FEEDBACK_AGREEMENT_VERSION = getSiteAgreement().version;
import type { PrismaClient } from '@prisma/client';
import { Server } from 'socket.io';
import { createRoomBroadcaster } from '../../src/socket/socket-room-broadcaster';
import type { SiteAgreementAcceptance } from '@poker/shared';
import type * as RoomRepository from '../../src/modules/rooms/room.repository';
import type * as RoomService from '../../src/modules/rooms/room.service';
import type * as Quotas from '../../src/platform/db/abuse-quota';
import { MigratedDatabase } from '../helpers/migrated-database';

describe('durable abuse budgets and lobby capacity with SQLite', () => {
  const database = new MigratedDatabase('poker-abuse-');
  let db: PrismaClient;
  let repository: typeof RoomRepository;
  let rooms: typeof RoomService;
  let quotas: typeof Quotas;
  const io = new Server();
  const agreement: SiteAgreementAcceptance = {
    version: FEEDBACK_AGREEMENT_VERSION,
    accepted: true,
  };

  beforeAll(async () => {
    database.setUp();
    db = (await import('../../src/platform/db/prisma')).default;
    repository = await import('../../src/modules/rooms/room.repository');
    rooms = await import('../../src/modules/rooms/room.service');
    quotas = await import('../../src/platform/db/abuse-quota');
    rooms.init(createRoomBroadcaster(io));
  }, 30_000);

  beforeEach(async () => {
    await db.room.deleteMany();
    await db.abuseQuota.deleteMany();
    await db.feedback.deleteMany();
    await db.feedbackAccess.deleteMany();
    await db.visitorAgreement.deleteMany();
    await db.room.create({ data: { id: 'room' } });
  });

  afterEach(() => setSiteConfig());

  afterAll(async () => {
    await db?.$disconnect();
    database.tearDown();
  });

  it('cannot reset visitor creation quotas with a new room name or database reconnect', async () => {
    for (let i = 0; i < 5; i++)
      await repository.create(
        { id: `created-${i}` },
        {
          visitorId: 'creator',
          network: 'network',
          agreement: getSiteAgreement(),
        },
      );
    await db.$disconnect();
    await expect(
      repository.create(
        { id: 'sixth' },
        {
          visitorId: 'creator',
          network: 'network',
          agreement: getSiteAgreement(),
        },
      ),
    ).rejects.toThrow(quotas.AbuseLimitError);
    expect(await db.room.findUnique({ where: { id: 'sixth' } })).toBeNull();
    expect(
      (
        await db.abuseQuota.findMany({
          where: { key: { startsWith: 'create-' } },
        })
      ).every((row) => row.count === 5),
    ).toBe(true);
  });

  it('cannot reset network creation quotas with fresh visitor cookies', async () => {
    for (let i = 0; i < 20; i++)
      await repository.create(
        { id: `created-${i}` },
        {
          visitorId: `visitor-${i}`,
          network: 'network',
          agreement: getSiteAgreement(),
        },
      );
    await expect(
      repository.create(
        { id: 'twenty-first' },
        {
          visitorId: 'fresh',
          network: 'network',
          agreement: getSiteAgreement(),
        },
      ),
    ).rejects.toThrow(quotas.AbuseLimitError);
    expect(
      await db.abuseQuota.count({
        where: { key: { startsWith: 'create-visitor:' } },
      }),
    ).toBe(20);
  });

  it('charges a new creator the new-visitor budgets before creating a room without agreements', async () => {
    const day = new Date().toISOString().slice(0, 10);
    const { createHash } = await import('node:crypto');
    await db.abuseQuota.create({
      data: {
        key: `register-network:${createHash('sha256').update('network').digest('hex')}`,
        day,
        count: 99,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await repository.create(
      { id: 'first-free' },
      { visitorId: 'new-1', network: 'network', agreement: null },
    );
    await expect(
      repository.create(
        { id: 'refused' },
        { visitorId: 'new-2', network: 'network', agreement: null },
      ),
    ).rejects.toThrow(quotas.AbuseLimitError);
    expect(await db.room.findUnique({ where: { id: 'refused' } })).toBeNull();
    // A known browser ID is not new.
    await db.roomApproval.create({
      data: { roomId: 'room', visitorId: 'known' },
    });
    await expect(
      repository.create(
        { id: 'known-room' },
        { visitorId: 'known', network: 'network', agreement: null },
      ),
    ).resolves.toMatchObject({ id: 'known-room' });
    expect(await db.visitorAgreement.count()).toBe(0);
  });

  it('rolls back earlier counters when a later quota is exhausted', async () => {
    await quotas.claimDailyQuotas([{ scope: 'network', identity: 'shared', limit: 1 }]);
    await expect(
      quotas.claimDailyQuotas([
        { scope: 'visitor', identity: 'new', limit: 5 },
        { scope: 'network', identity: 'shared', limit: 1 },
      ]),
    ).rejects.toThrow(quotas.AbuseLimitError);
    expect(await db.abuseQuota.count()).toBe(1);
  });

  it('enforces a budget atomically under concurrent requests', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        quotas.claimDailyQuotas([{ scope: 'concurrent', identity: 'same', limit: 3 }]),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(3);
    expect((await db.abuseQuota.findFirstOrThrow()).count).toBe(3);
  });

  it('bounds fresh identities in existing rooms and rolls back rejected memberships', async () => {
    const users = await import('../../src/modules/rooms/user.repository');
    for (let i = 0; i < 100; i++) {
      await users.create(
        {
          name: 'Pending',
          room: { connect: { id: 'room' } },
          visitorId: `fresh-${i}`,
          isApproved: false,
          agreementVersion: FEEDBACK_AGREEMENT_VERSION,
          agreementText: 'Accepted terms',
          agreementAcceptedAt: new Date(),
        },
        'network',
      );
    }
    await expect(
      users.create(
        {
          name: 'Pending',
          room: { connect: { id: 'room' } },
          visitorId: 'rejected',
          isApproved: false,
          agreementVersion: FEEDBACK_AGREEMENT_VERSION,
          agreementText: 'Accepted terms',
          agreementAcceptedAt: new Date(),
        },
        'network',
      ),
    ).rejects.toThrow(quotas.AbuseLimitError);
    expect(await db.user.count()).toBe(100);
    expect(await db.visitorAgreement.count()).toBe(100);
    const existing = await db.user.findFirstOrThrow({
      where: { visitorId: 'fresh-0' },
    });
    await db.user.delete({ where: { id: existing.id } });
    await expect(
      users.create(
        {
          name: 'Returning',
          room: { connect: { id: 'room' } },
          visitorId: 'fresh-0',
          isApproved: false,
          agreementVersion: FEEDBACK_AGREEMENT_VERSION,
          agreementText: 'Accepted terms',
          agreementAcceptedAt: new Date(),
        },
        'network',
      ),
    ).resolves.toMatchObject({ visitorId: 'fresh-0' });
  });

  it('keeps the new-visitor budgets when the site stores no agreements', async () => {
    const users = await import('../../src/modules/rooms/user.repository');
    const join = (visitorId: string, roomId = 'room') =>
      users.create(
        {
          name: 'Pending',
          room: { connect: { id: roomId } },
          visitorId,
          isApproved: false,
        },
        'network',
      );
    for (let i = 0; i < 100; i++) await join(`fresh-${i}`);
    await expect(join('rejected')).rejects.toThrow(quotas.AbuseLimitError);
    expect(await db.user.count()).toBe(100);
    expect(await db.visitorAgreement.count()).toBe(0);
    // A browser the site already knows is not new, in this room or another.
    await db.room.create({ data: { id: 'other' } });
    await expect(join('fresh-0', 'other')).resolves.toMatchObject({
      visitorId: 'fresh-0',
    });
    await db.feedbackAccess.create({ data: { visitorId: 'feedback-only' } });
    await expect(join('feedback-only')).resolves.toMatchObject({
      visitorId: 'feedback-only',
    });
    // Without a network (internal callers) nothing is charged.
    await expect(
      users.create({
        name: 'Internal',
        room: { connect: { id: 'room' } },
        visitorId: 'internal',
      }),
    ).resolves.toMatchObject({ visitorId: 'internal' });
  });

  it('reserves approved participant capacity independently from a full lobby', async () => {
    await db.user.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({
        roomId: 'room',
        name: 'Pending',
        visitorId: `pending-${i}`,
        isApproved: false,
      })),
    });
    await db.roomApproval.create({
      data: { roomId: 'room', visitorId: 'returning' },
    });
    const result = await rooms.joinRoom('room', 'Returning', 'returning', false, agreement);
    expect(result.user.isApproved).toBe(true);
    await expect(rooms.joinRoom('room', 'New', 'new', false, agreement)).rejects.toThrow(
      'Max 10 pending',
    );
  });

  it('reclaims expired offline pending slots before admitting another request', async () => {
    await db.user.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({
        roomId: 'room',
        name: 'Expired',
        visitorId: `expired-${i}`,
        isApproved: false,
        createdAt: new Date(Date.now() - 6 * 60_000),
      })),
    });
    const result = await rooms.joinRoom('room', 'New', 'new', false, agreement);
    expect(result.user.isApproved).toBe(false);
    expect(await db.user.count({ where: { roomId: 'room' } })).toBe(1);
  });

  it('cannot approve a pending participant past the approved room limit', async () => {
    await db.user.createMany({
      data: Array.from({ length: 25 }, (_, i) => ({
        roomId: 'room',
        name: 'Approved',
        visitorId: `approved-${i}`,
        isApproved: true,
      })),
    });
    const pending = await db.user.create({
      data: {
        roomId: 'room',
        name: 'Pending',
        visitorId: 'pending',
        isApproved: false,
      },
    });
    await expect(rooms.approveUser(pending.id, 'room')).rejects.toThrow('Max 25 approved');
    expect((await db.user.findUniqueOrThrow({ where: { id: pending.id } })).isApproved).toBe(false);
  });

  it('cleans only expired quotas and old orphan identities, preserving room and feedback records', async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 91 * 24 * 60 * 60_000);
    for (const visitorId of ['orphan', 'recent', 'approved', 'present', 'author']) {
      await db.visitorAgreement.create({
        data: {
          visitorId,
          version: agreement.version,
          text: 'terms',
          acceptedAt: visitorId === 'recent' ? now : old,
        },
      });
      await db.feedbackAccess.create({
        data: {
          visitorId,
          approvedAt: visitorId === 'recent' ? now : old,
        },
      });
    }
    await db.roomApproval.create({
      data: { roomId: 'room', visitorId: 'approved' },
    });
    await db.user.create({
      data: { roomId: 'room', visitorId: 'present', name: 'Present' },
    });
    await db.feedback.create({
      data: {
        visitorId: 'author',
        category: 'feature',
        title: 'Feedback',
        body: 'Keep identity',
      },
    });
    await db.abuseQuota.createMany({
      data: [
        { key: 'expired', day: 'old', count: 1, expiresAt: old },
        {
          key: 'current',
          day: 'now',
          count: 1,
          expiresAt: new Date(now.getTime() + 60_000),
        },
      ],
    });
    const { cleanupInactiveRecords } =
      await import('../../src/modules/maintenance/cleanup.service');
    await cleanupInactiveRecords(now);
    expect((await db.visitorAgreement.findMany()).map((row) => row.visitorId).sort()).toEqual([
      'approved',
      'author',
      'present',
      'recent',
    ]);
    expect((await db.feedbackAccess.findMany()).map((row) => row.visitorId).sort()).toEqual([
      'approved',
      'author',
      'present',
      'recent',
    ]);
    expect((await db.abuseQuota.findMany()).map((row) => row.key)).toEqual(['current']);
  });

  describe('operator limits from config/site.json', () => {
    const create = (id: string, visitorId: string, network = 'network') =>
      repository.create({ id }, { visitorId, network, agreement: getSiteAgreement() });

    it('charges room creation against limits.daily.roomsCreated', async () => {
      setSiteConfig({
        limits: {
          daily: {
            roomsCreated: { perVisitor: 2, perNetwork: 3, perSite: 4 },
          },
        },
      });
      await create('a1', 'a');
      await create('a2', 'a');
      await expect(create('a3', 'a')).rejects.toThrow(quotas.AbuseLimitError);
      await create('b1', 'b');
      await expect(create('c1', 'c')).rejects.toThrow(quotas.AbuseLimitError);
      await create('d1', 'd', 'other');
      await expect(create('e1', 'e', 'third')).rejects.toThrow(quotas.AbuseLimitError);
      expect(await db.room.count()).toBe(5);
    });

    it('stops creating rooms at limits.maxRooms', async () => {
      setSiteConfig({ limits: { maxRooms: 2 } });
      await create('second', 'a');
      await expect(create('third', 'b')).rejects.toThrow('Room capacity reached');
      expect(await db.room.count()).toBe(2);
    });

    it('limits new visitors per network and site with limits.daily.newVisitors', async () => {
      setSiteConfig({
        limits: { daily: { newVisitors: { perNetwork: 2, perSite: 3 } } },
      });
      const users = await import('../../src/modules/rooms/user.repository');
      const join = (visitorId: string, network: string) =>
        users.create(
          {
            name: visitorId,
            room: { connect: { id: 'room' } },
            visitorId,
            isApproved: false,
            agreementVersion: FEEDBACK_AGREEMENT_VERSION,
            agreementText: 'Accepted terms',
            agreementAcceptedAt: new Date(),
          },
          network,
        );
      await join('one', 'n1');
      await join('two', 'n1');
      await expect(join('three', 'n1')).rejects.toThrow(quotas.AbuseLimitError);
      await join('four', 'n2');
      await expect(join('five', 'n3')).rejects.toThrow(quotas.AbuseLimitError);
      expect(await db.user.count()).toBe(3);
    });

    it('deletes inactive rooms and unlinked identities after limits.inactiveRoomDays', async () => {
      setSiteConfig({ limits: { inactiveRoomDays: 7 } });
      const now = new Date();
      const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60_000);
      const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60_000);
      await db.room.create({ data: { id: 'stale', updatedAt: eightDaysAgo } });
      await db.room.create({ data: { id: 'fresh', updatedAt: sixDaysAgo } });
      for (const [visitorId, acceptedAt] of [
        ['old', eightDaysAgo],
        ['young', sixDaysAgo],
      ] as const)
        await db.visitorAgreement.create({
          data: {
            visitorId,
            version: agreement.version,
            text: 'terms',
            acceptedAt,
          },
        });
      const { cleanupInactiveRecords } =
        await import('../../src/modules/maintenance/cleanup.service');
      await expect(cleanupInactiveRecords(now)).resolves.toBe(1);
      expect((await db.room.findMany()).map((room) => room.id).sort()).toEqual(['fresh', 'room']);
      expect((await db.visitorAgreement.findMany()).map((row) => row.visitorId)).toEqual(['young']);
    });
  });
});
