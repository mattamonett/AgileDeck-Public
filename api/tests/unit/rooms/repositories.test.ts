jest.mock('../../../src/platform/db/prisma', () => {
  const db = {
    room: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    roomApproval: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    feedbackAccess: {
      upsert: jest.fn(),
    },
    visitorAgreement: {
      upsert: jest.fn(),
    },
    observerPreference: {
      findUnique: jest.fn(),
    },
  };
  return {
    __esModule: true,
    default: {
      ...db,
      $transaction: jest.fn((callback: (tx: typeof db) => Promise<unknown>) => callback(db)),
    },
  };
});

import * as roomRepository from '../../../src/modules/rooms/room.repository';
import * as userRepository from '../../../src/modules/rooms/user.repository';
import prismaClient from '../../../src/platform/db/prisma';

describe('repositories', () => {
  const prisma = jest.mocked(prismaClient);
  const now = new Date('2026-01-01T00:00:00Z');
  const room = {
    id: 'room-1',
    name: 'Room 1',
    createdAt: now,
    updatedAt: now,
    reveal: false,
    autoReveal: false,
    useMultiplier: false,
    multiplierValue: 1,
    theme: 'default',
    resultSnapshot: null,
    lobbyEnabled: false,
    issuesEnabled: true,
    mood: 'playful',
    statsStartedAt: null,
    roundNumber: 0,
    roundStartedAt: null,
    roundRevealedAt: null,
    roundsRevealed: 0,
    unanimousRounds: 0,
    awardsStartedAt: null,
  };
  const user = {
    id: 'user-1',
    name: 'User 1',
    createdAt: now,
    roomId: 'room-1',
    vote: null,
    isObserver: false,
    visitorId: 'visitor-1',
    isApproved: true,
    agreementVersion: null,
    agreementText: null,
    agreementAcceptedAt: null,
  };

  it('room repository delegates to prisma', async () => {
    const repo = roomRepository;
    prisma.room.create.mockResolvedValue(room);
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.room.update.mockResolvedValue(room);
    prisma.room.delete.mockResolvedValue(room);

    await repo.create({ id: 'room-1' });
    await repo.findById('room-1');
    await repo.update('room-1', { name: 'Room 1' });
    await repo.delete('room-1');

    expect(prisma.room.create).toHaveBeenCalledWith({ data: { id: 'room-1' } });
    expect(prisma.room.findUnique).toHaveBeenCalledWith({
      where: { id: 'room-1' },
    });
    expect(prisma.room.update).toHaveBeenCalledWith({
      where: { id: 'room-1' },
      data: { name: 'Room 1' },
    });
    expect(prisma.room.delete).toHaveBeenCalledWith({
      where: { id: 'room-1' },
    });
  });

  it('user repository delegates to prisma', async () => {
    const repo = userRepository;
    prisma.user.create.mockResolvedValue(user);
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.findMany.mockResolvedValue([user]);
    prisma.user.count.mockResolvedValue(1);
    prisma.user.update.mockResolvedValue(user);
    prisma.user.updateMany.mockResolvedValue({ count: 2 });
    prisma.user.delete.mockResolvedValue(user);
    prisma.observerPreference.findUnique.mockResolvedValue({
      roomId: 'room-1',
      visitorId: 'visitor-1',
      isObserver: true,
      updatedAt: now,
    });

    await repo.create({
      name: 'A',
      visitorId: 'visitor-1',
      room: { connect: { id: 'room-1' } },
    });
    await repo.findById('user-1');
    await repo.findByRoomId('room-1');
    await repo.findByVisitorIdInRoom('room-1', 'visitor-1');
    await repo.findObserverPreference('room-1', 'visitor-1');
    await repo.countByRoomId('room-1');
    await repo.update('user-1', { name: 'B' });
    await repo.updateMany({ roomId: 'room-1' }, { vote: '5' });
    await repo.delete('user-1');

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        name: 'A',
        visitorId: 'visitor-1',
        room: { connect: { id: 'room-1' } },
      },
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { roomId: 'room-1' },
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { roomId_visitorId: { roomId: 'room-1', visitorId: 'visitor-1' } },
    });
    expect(prisma.observerPreference.findUnique).toHaveBeenCalledWith({
      where: { roomId_visitorId: { roomId: 'room-1', visitorId: 'visitor-1' } },
    });
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { roomId: 'room-1' },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'B' },
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { roomId: 'room-1' },
      data: { vote: '5' },
    });
    expect(prisma.user.delete).toHaveBeenCalledWith({
      where: { id: 'user-1' },
    });
  });

  it('checks approved membership by room, user and visitor', async () => {
    const repo = userRepository;
    prisma.user.findFirst.mockResolvedValueOnce(user).mockResolvedValueOnce(null);

    await expect(repo.isApprovedMember('room-1', 'user-1', 'visitor-1')).resolves.toBe(true);
    await expect(repo.isApprovedMember('room-1', 'user-1', 'visitor-2')).resolves.toBe(false);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        roomId: 'room-1',
        id: 'user-1',
        visitorId: 'visitor-2',
        isApproved: true,
      },
      select: { id: true },
    });
  });
});
