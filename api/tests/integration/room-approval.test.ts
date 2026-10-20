import type { PrismaClient } from '@prisma/client';
import type * as UserRepository from '../../src/modules/rooms/user.repository';
import { MigratedDatabase } from '../helpers/migrated-database';

describe('persistent room approval with SQLite', () => {
  const database = new MigratedDatabase('poker-approval-');
  let db: PrismaClient;
  let users: typeof UserRepository;

  beforeAll(async () => {
    database.setUp();
    db = (await import('../../src/platform/db/prisma')).default;
    users = await import('../../src/modules/rooms/user.repository');
  }, 30_000);

  beforeEach(async () => {
    await db.room.deleteMany();
    await db.room.create({ data: { id: 'room-1' } });
    await db.room.create({ data: { id: 'room-2' } });
  });

  afterAll(async () => {
    await db?.$disconnect();
    database.tearDown();
  });

  it('retains granted approval after deletion and database reconnection, scoped to room and visitor', async () => {
    const user = await users.create({
      name: 'Returning',
      visitorId: 'visitor-1',
      room: { connect: { id: 'room-1' } },
      isApproved: false,
    });
    expect(await users.hasRoomApproval('room-1', 'visitor-1')).toBe(false);
    await users.update(user.id, { isApproved: true });
    await users.delete(user.id);
    await db.$disconnect();
    expect(await users.hasRoomApproval('room-1', 'visitor-1')).toBe(true);
    expect(await users.hasRoomApproval('room-2', 'visitor-1')).toBe(false);
    expect(await users.hasRoomApproval('room-1', 'visitor-2')).toBe(false);
    const returning = await users.create({
      name: 'Renamed',
      visitorId: 'visitor-1',
      room: { connect: { id: 'room-1' } },
      isApproved: await users.hasRoomApproval('room-1', 'visitor-1'),
    });
    expect(returning.isApproved).toBe(true);
    expect(await db.roomApproval.count()).toBe(1);
  });

  it('remembers room creators and does not remember pending visitors', async () => {
    const creator = await users.create({
      name: 'Creator',
      visitorId: 'creator',
      room: { connect: { id: 'room-1' } },
      isApproved: true,
    });
    const pending = await users.create({
      name: 'Pending',
      visitorId: 'pending',
      room: { connect: { id: 'room-1' } },
      isApproved: false,
    });
    await users.delete(creator.id);
    await users.delete(pending.id);
    expect(await users.hasRoomApproval('room-1', 'creator')).toBe(true);
    expect(await users.hasRoomApproval('room-1', 'pending')).toBe(false);
  });

  it('rolls back approval if saving the persistent grant fails', async () => {
    const user = await users.create({
      name: 'Pending',
      visitorId: 'visitor-1',
      room: { connect: { id: 'room-1' } },
      isApproved: false,
    });
    await db.$executeRawUnsafe(`CREATE TRIGGER fail_approval BEFORE INSERT ON "RoomApproval"
      BEGIN SELECT RAISE(ABORT, 'test approval failure'); END`);
    try {
      await expect(users.update(user.id, { isApproved: true })).rejects.toThrow();
      expect((await users.findById(user.id))?.isApproved).toBe(false);
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER fail_approval');
    }
  });

  it('keeps grants after members leave and removes them with the room', async () => {
    await db.roomApproval.create({ data: { roomId: 'room-1', visitorId: 'approved' } });
    await db.user.create({
      data: { roomId: 'room-1', visitorId: 'approved', name: 'Approved', isApproved: true },
    });
    await db.user.deleteMany();
    expect(await users.hasRoomApproval('room-1', 'approved')).toBe(true);
    await db.room.delete({ where: { id: 'room-1' } });
    expect(await db.roomApproval.count()).toBe(0);
  });
});
