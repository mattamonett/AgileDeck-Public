import { getSiteAgreement } from '../../src/config/site-config';
const FEEDBACK_AGREEMENT_VERSION = getSiteAgreement().version;
import type { PrismaClient } from '@prisma/client';
import { Server } from 'socket.io';
import { createRoomBroadcaster } from '../../src/socket/socket-room-broadcaster';
import { NAME_TAKEN_JOIN_MESSAGE } from '@poker/shared';
import type { SiteAgreementAcceptance } from '@poker/shared';
import type * as RoomService from '../../src/modules/rooms/room.service';
import type * as UserRepository from '../../src/modules/rooms/user.repository';
import { MigratedDatabase } from '../helpers/migrated-database';

describe('unique display names within a room with SQLite', () => {
  const database = new MigratedDatabase('poker-names-');
  let db: PrismaClient;
  let rooms: typeof RoomService;
  let users: typeof UserRepository;
  const io = new Server();
  const agreement: SiteAgreementAcceptance = {
    version: FEEDBACK_AGREEMENT_VERSION,
    accepted: true,
  };
  const join = (name: string, visitorId: string, create = false) =>
    rooms.joinRoom('room', name, visitorId, create, agreement, '203.0.113.1');

  beforeAll(async () => {
    database.setUp();
    db = (await import('../../src/platform/db/prisma')).default;
    rooms = await import('../../src/modules/rooms/room.service');
    users = await import('../../src/modules/rooms/user.repository');
    rooms.init(createRoomBroadcaster(io));
  }, 30_000);

  beforeEach(async () => {
    await db.room.deleteMany();
    await db.abuseQuota.deleteMany();
    await join('Matt', 'owner', true);
  });

  afterAll(async () => {
    await db?.$disconnect();
    database.tearDown();
  });

  it('refuses a join request that copies a member name, ignoring case and spaces', async () => {
    await expect(join('Matt', 'impostor')).rejects.toThrow(NAME_TAKEN_JOIN_MESSAGE);
    await expect(join(' m a t T ', 'impostor')).rejects.toThrow(NAME_TAKEN_JOIN_MESSAGE);
    expect(await db.user.findFirst({ where: { visitorId: 'impostor' } })).toBeNull();

    const { user } = await join('Matthew', 'newcomer');
    expect(user).toMatchObject({ name: 'Matthew', isApproved: false });
  });

  it('reserves the name of an approved member who is offline', async () => {
    const owner = await db.user.findFirstOrThrow({
      where: { visitorId: 'owner' },
    });
    await users.delete(owner.id);

    await expect(join('matt', 'impostor')).rejects.toThrow(NAME_TAKEN_JOIN_MESSAGE);
    const { user } = await join('Matt', 'owner');
    expect(user).toMatchObject({ name: 'Matt', isApproved: true });
  });

  it('refuses a second pending request with the same name', async () => {
    await join('Sam', 'first');
    await expect(join('SAM', 'second')).rejects.toThrow(NAME_TAKEN_JOIN_MESSAGE);
  });

  it('refuses a rejoin that renames into a taken name but keeps the member', async () => {
    await join('Sam', 'sam');
    await expect(join('Matt', 'sam')).rejects.toThrow(NAME_TAKEN_JOIN_MESSAGE);
    expect(await db.user.findFirst({ where: { visitorId: 'sam' } })).toMatchObject({ name: 'Sam' });
  });

  it('checks renames against other members only', async () => {
    await join('Sam', 'sam');
    expect(await users.isNameTaken('room', 'MATT', 'sam')).toBe(true);
    expect(await users.isNameTaken('room', 'Matt', 'owner')).toBe(false);
    expect(await users.isNameTaken('room', 'Alex', 'sam')).toBe(false);
  });
});
