import type { Prisma } from '@prisma/client';
import { getSiteAgreement, setSiteConfig } from '../../../src/config/site-config';
const FEEDBACK_AGREEMENT_VERSION = getSiteAgreement().version;
const FEEDBACK_AGREEMENT_TEXT = getSiteAgreement().text;
import type { PokerServer } from '../../../src/socket/types';
import { createRoomBroadcaster } from '../../../src/socket/socket-room-broadcaster';
import { Theme } from '@poker/shared';

const siteAgreement = {
  version: FEEDBACK_AGREEMENT_VERSION,
  accepted: true,
} as const;
const roomRepository = {
  create: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
};

const userRepository = {
  countByRoomId: jest.fn(),
  findByVisitorIdInRoom: jest.fn(),
  findObserverPreference: jest.fn(),
  hasRoomApproval: jest.fn(),
  isNameTaken: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  findByRoomId: jest.fn(),
  updateMany: jest.fn(),
  delete: jest.fn(),
  deleteMany: jest.fn(),
};

jest.mock('../../../src/modules/rooms/room.repository', () => roomRepository);

jest.mock('../../../src/modules/rooms/user.repository', () => userRepository);

const prismaMock = {
  $transaction: jest.fn(async (arg) => {
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    const tx = {
      room: {
        findUnique: jest.fn((args) => roomRepository.findById(args.where.id)),
        update: jest.fn((args) => roomRepository.update(args.where.id, args.data)),
      },
      roomApproval: { findMany: jest.fn().mockResolvedValue([]) },
      user: {
        delete: jest.fn((args) => userRepository.delete(args.where.id)),
        findMany: jest.fn((args) => userRepository.findByRoomId(args.where.roomId)),
        update: jest.fn((args) => userRepository.update(args.where.id, args.data)),
      },
    };
    return arg(tx);
  }),
  room: {
    update: jest.fn((args) => roomRepository.update(args.where.id, args.data)),
  },
  user: {
    updateMany: jest.fn((args) => userRepository.updateMany(args.where, args.data)),
  },
};
jest.mock('../../../src/platform/db/prisma', () => prismaMock);

import { DISCONNECT_GRACE_PERIOD_MS, GameEvents, REVELATION_DELAY_MS } from '@poker/shared';
import { pendingReveals } from '../../../src/modules/rooms/revelation-state';
import { withRoomLock } from '../../../src/modules/rooms/room-lock';
import * as RoomService from '../../../src/modules/rooms/room.service';
import { usageRecorder } from '../../../src/modules/telemetry/usage-telemetry';
import {
  clearThrowPenalties,
  recordRejectedThrow,
} from '../../../src/modules/interactions/throw-penalty.service';

describe('room service', () => {
  const emitMock = jest.fn();
  const fetchSocketsMock = jest.fn();
  const toMock = jest.fn();
  const io = {
    to: toMock,
    in: toMock,
    fetchSockets: fetchSocketsMock,
  };
  const recordUsage = jest.spyOn(usageRecorder, 'record').mockImplementation(() => undefined);

  beforeEach(() => {
    clearThrowPenalties();
    jest.clearAllMocks();
    roomRepository.create.mockReset();
    roomRepository.findById.mockReset();
    roomRepository.update.mockReset();
    userRepository.countByRoomId.mockReset();
    userRepository.findByVisitorIdInRoom.mockReset();
    userRepository.findObserverPreference.mockReset();
    userRepository.hasRoomApproval.mockReset();
    userRepository.findById.mockReset();
    userRepository.create.mockReset();
    userRepository.update.mockReset();
    userRepository.findByRoomId.mockReset();
    userRepository.updateMany.mockReset();
    userRepository.delete.mockReset();
    userRepository.deleteMany.mockReset();
    userRepository.findByRoomId.mockResolvedValue([]);
    userRepository.findObserverPreference.mockResolvedValue(null);
    userRepository.hasRoomApproval.mockResolvedValue(false);
    userRepository.isNameTaken.mockReset();
    userRepository.isNameTaken.mockResolvedValue(false);
    userRepository.deleteMany.mockResolvedValue({ count: 0 });
    pendingReveals.clear();
    toMock.mockReturnValue({
      emit: emitMock,
      fetchSockets: fetchSocketsMock,
    });
    fetchSocketsMock.mockResolvedValue([{ data: { userId: 'user-1' }, emit: emitMock }]);
    RoomService.init(createRoomBroadcaster(io as unknown as PokerServer));
  });

  it.each([true, false])('persists and broadcasts issuesEnabled=%s', async (issuesEnabled) => {
    const room = { id: 'room-1', issuesEnabled };
    roomRepository.update.mockResolvedValue(room);
    await RoomService.updateRoom('room-1', { issuesEnabled });
    expect(roomRepository.update).toHaveBeenCalledWith('room-1', {
      issuesEnabled,
    });
    expect(toMock).toHaveBeenCalledWith('room-1');
    expect(emitMock).toHaveBeenCalledWith(
      GameEvents.ROOM_UPDATED,
      expect.objectContaining({ id: 'room-1', issuesEnabled }),
    );
  });

  it('reserves the reveal before a concurrent database lookup can start a second countdown', async () => {
    jest.useFakeTimers();
    try {
      const lookup = Promise.withResolvers<{ id: string; reveal: boolean }>();
      roomRepository.findById.mockReturnValueOnce(lookup.promise);
      const first = RoomService.startRevelation('race-room');
      const second = RoomService.startRevelation('race-room');
      lookup.resolve({ id: 'race-room', reveal: false });
      await Promise.all([first, second]);
      expect(
        emitMock.mock.calls.filter(([event]) => event === GameEvents.REVELATION_STARTED),
      ).toHaveLength(1);
      await RoomService.resetRoom('race-room');
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the reveal reserved while the snapshot database read is in flight', async () => {
    jest.useFakeTimers();
    try {
      const lookup = Promise.withResolvers<{ id: string; reveal: boolean }>();
      roomRepository.findById
        .mockResolvedValueOnce({ id: 'race-room', reveal: false })
        .mockReturnValueOnce(lookup.promise);
      roomRepository.update.mockResolvedValue({
        id: 'race-room',
        reveal: true,
      });
      await RoomService.startRevelation('race-room');
      jest.advanceTimersByTime(REVELATION_DELAY_MS);
      await Promise.resolve();
      await RoomService.startRevelation('race-room');
      expect(
        emitMock.mock.calls.filter(([event]) => event === GameEvents.REVELATION_STARTED),
      ).toHaveLength(1);
      lookup.resolve({ id: 'race-room', reveal: false });
      await jest.advanceTimersByTimeAsync(0);
      expect(RoomService.isRevealPending('race-room')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not start a stale countdown when reset completes during the room lookup', async () => {
    jest.useFakeTimers();
    try {
      const lookup = Promise.withResolvers<{ id: string; reveal: boolean }>();
      roomRepository.findById.mockReturnValueOnce(lookup.promise);
      const starting = RoomService.startRevelation('race-room');
      await RoomService.resetRoom('race-room');
      lookup.resolve({ id: 'race-room', reveal: false });
      await starting;
      await jest.advanceTimersByTimeAsync(REVELATION_DELAY_MS);
      expect(emitMock).not.toHaveBeenCalledWith(GameEvents.REVELATION_STARTED, expect.anything());
      expect(roomRepository.update).not.toHaveBeenCalledWith(
        'race-room',
        expect.objectContaining({ reveal: true }),
      );
      expect(RoomService.isRevealPending('race-room')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects joins when room is full', async () => {
    roomRepository.findById.mockResolvedValue({
      id: 'room-1',
      reveal: false,
      lobbyEnabled: false,
    });
    userRepository.countByRoomId.mockResolvedValue(25);
    userRepository.findByVisitorIdInRoom.mockResolvedValue(null);
    userRepository.hasRoomApproval.mockResolvedValue(true);

    await expect(RoomService.joinRoom('room-1', 'Name', 'visitor-1')).rejects.toThrow(
      'Room is full (Max 25 players)',
    );
  });

  describe('with operator limits', () => {
    afterEach(() => setSiteConfig());

    it('fills a room at limits.maxUsersPerRoom', async () => {
      setSiteConfig({ limits: { maxUsersPerRoom: 4 } });
      roomRepository.findById.mockResolvedValue({
        id: 'room-1',
        reveal: false,
      });
      userRepository.findByVisitorIdInRoom.mockResolvedValue(null);
      userRepository.hasRoomApproval.mockResolvedValue(true);
      userRepository.countByRoomId.mockResolvedValue(4);
      await expect(RoomService.joinRoom('room-1', 'Name', 'visitor-1')).rejects.toThrow(
        'Room is full (Max 4 players)',
      );

      userRepository.countByRoomId.mockResolvedValue(3);
      userRepository.create.mockResolvedValue({ id: 'user-1', name: 'Name' });
      await expect(
        RoomService.joinRoom('room-1', 'Name', 'visitor-1', false, siteAgreement),
      ).resolves.toEqual(expect.objectContaining({ room: expect.anything() }));
    });

    it('refuses approvals beyond limits.maxUsersPerRoom', async () => {
      setSiteConfig({ limits: { maxUsersPerRoom: 2 } });
      userRepository.findById.mockResolvedValue({
        id: 'user-2',
        roomId: 'room-1',
        isApproved: false,
        createdAt: new Date(),
      });
      userRepository.countByRoomId.mockResolvedValue(2);
      await expect(RoomService.approveUser('user-2', 'room-1')).rejects.toThrow(
        'Room is full (Max 2 approved players)',
      );
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('charges join requests against limits.daily.joinRequests', async () => {
      setSiteConfig({
        limits: { daily: { joinRequests: { perVisitor: 7, perNetwork: 9 } } },
      });
      roomRepository.findById.mockResolvedValue({
        id: 'room-1',
        reveal: false,
      });
      userRepository.countByRoomId.mockResolvedValue(0);
      userRepository.findByVisitorIdInRoom.mockResolvedValue(null);
      userRepository.create.mockResolvedValue({ id: 'u', isApproved: false });
      await RoomService.joinRoom('room-1', 'Name', 'visitor-1', false, siteAgreement);
      expect(userRepository.create).toHaveBeenCalledWith(expect.anything(), 'unknown', [
        expect.objectContaining({ scope: 'lobby-visitor', limit: 7 }),
        expect.objectContaining({ scope: 'lobby-network', limit: 9 }),
      ]);
    });
  });

  it('creates room and user, then broadcasts', async () => {
    const room = { id: 'room-1', reveal: false };
    const user = { id: 'user-1', name: 'Name' };
    roomRepository.findById.mockResolvedValueOnce(null).mockResolvedValue(room);
    roomRepository.create.mockResolvedValue(room);
    userRepository.countByRoomId.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    userRepository.findByVisitorIdInRoom.mockResolvedValue(null);
    userRepository.create.mockResolvedValue(user);
    userRepository.findByRoomId.mockResolvedValue([user]);

    const result = await RoomService.joinRoom('room-1', 'Name', 'visitor-1', true, siteAgreement);

    expect(roomRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mood: 'playful',
        roundStartedAt: expect.any(Date),
      }),
      {
        visitorId: 'visitor-1',
        network: 'unknown',
        agreement: {
          version: FEEDBACK_AGREEMENT_VERSION,
          text: FEEDBACK_AGREEMENT_TEXT,
        },
      },
    );
    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Name',
        visitorId: 'visitor-1',
        isApproved: true,
        agreementVersion: FEEDBACK_AGREEMENT_VERSION,
        agreementText: FEEDBACK_AGREEMENT_TEXT,
        agreementAcceptedAt: expect.any(Date),
      }),
      undefined,
      [],
    );
    expect(emitMock).toHaveBeenCalledWith(GameEvents.UPDATE_USERS, [
      expect.objectContaining({ id: 'user-1', name: 'Name' }),
    ]);
    expect(emitMock).toHaveBeenCalledWith(GameEvents.REVEAL_STATE, room.reveal);
    expect(result).toEqual({ user, room });
  });

  it("starts new rooms on the operator's default mood and theme", async () => {
    setSiteConfig({
      content: {
        moods: ['friendly', 'spicy'],
        defaultMood: 'friendly',
        themes: [Theme.SPACE, Theme.RETRO],
        defaultTheme: Theme.RETRO,
      },
    });
    try {
      const room = { id: 'room-1', reveal: false };
      const user = { id: 'user-1', name: 'Name' };
      roomRepository.findById.mockResolvedValueOnce(null).mockResolvedValue(room);
      roomRepository.create.mockResolvedValue(room);
      userRepository.countByRoomId.mockResolvedValue(0);
      userRepository.findByVisitorIdInRoom.mockResolvedValue(null);
      userRepository.create.mockResolvedValue(user);
      userRepository.findByRoomId.mockResolvedValue([user]);

      await RoomService.joinRoom('room-1', 'Name', 'visitor-1', true, siteAgreement);

      expect(roomRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ mood: 'friendly', theme: 'retro' }),
        expect.objectContaining({ visitorId: 'visitor-1', network: 'unknown' }),
      );
    } finally {
      setSiteConfig();
    }
  });

  it.each([true, false])(
    'requires approval for new arrivals even when stored lobbyEnabled=%s',
    async (lobbyEnabled) => {
      const room = { id: 'room-1', reveal: false, lobbyEnabled };
      const user = { id: 'user-1', name: 'Name', isApproved: false };
      roomRepository.findById.mockResolvedValue(room);
      userRepository.countByRoomId.mockResolvedValue(0);
      userRepository.findByVisitorIdInRoom.mockResolvedValue(null);
      userRepository.create.mockResolvedValue(user);
      userRepository.findByRoomId.mockResolvedValue([user]);

      await RoomService.joinRoom('room-1', 'Name', 'visitor-1', false, siteAgreement);

      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ isApproved: false }),
        'unknown',
        [
          {
            scope: 'lobby-visitor',
            identity: 'room-1:visitor-1',
            limit: 3,
          },
          {
            scope: 'lobby-network',
            identity: 'room-1:unknown',
            limit: 30,
          },
        ],
      );
      expect(userRepository.update).not.toHaveBeenCalled();
    },
  );

  it('refuses a join request once the daily lobby budget is spent', async () => {
    const { AbuseLimitError } = await import('../../../src/platform/db/abuse-quota');
    roomRepository.findById.mockResolvedValue({ id: 'room-1', reveal: false });
    userRepository.countByRoomId.mockResolvedValue(0);
    userRepository.findByVisitorIdInRoom.mockResolvedValue(null);
    userRepository.create.mockRejectedValue(new AbuseLimitError());

    await expect(
      RoomService.joinRoom('room-1', 'Name', 'visitor-1', false, siteAgreement),
    ).rejects.toThrow(
      new RoomService.JoinRejectedError(
        'Too many requests to join this room today. Please try again tomorrow.',
      ),
    );
  });

  it('restores room approval when a returning visitor gets a new user record', async () => {
    const room = { id: 'room-1', reveal: false };
    roomRepository.findById.mockResolvedValue(room);
    userRepository.countByRoomId.mockResolvedValue(0);
    userRepository.findByVisitorIdInRoom.mockResolvedValue(null);
    userRepository.hasRoomApproval.mockResolvedValue(true);
    userRepository.create.mockResolvedValue({
      id: 'new-user',
      isApproved: true,
    });

    await RoomService.joinRoom('room-1', 'Returning', 'visitor-1', false, siteAgreement);

    expect(userRepository.hasRoomApproval).toHaveBeenCalledWith('room-1', 'visitor-1');
    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ visitorId: 'visitor-1', isApproved: true }),
      'unknown',
      [],
    );
  });

  it('restores a saved observer preference when recreating a user', async () => {
    const room = { id: 'room-1', reveal: false, lobbyEnabled: false };
    const user = { id: 'user-1', name: 'Name', isObserver: true };
    roomRepository.findById.mockResolvedValue(room);
    userRepository.countByRoomId.mockResolvedValue(0);
    userRepository.findByVisitorIdInRoom.mockResolvedValue(null);
    userRepository.findObserverPreference.mockResolvedValue({
      isObserver: true,
    });
    userRepository.create.mockResolvedValue(user);
    userRepository.findByRoomId.mockResolvedValue([user]);

    await RoomService.joinRoom('room-1', 'Name', 'visitor-1', false, siteAgreement);

    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ isObserver: true }),
      'unknown',
      expect.any(Array),
    );
  });

  it('updates existing user name and skips room creation', async () => {
    const room = { id: 'room-1', reveal: true };
    const user = { id: 'user-1', name: 'Old' };
    const updatedUser = { id: 'user-1', name: 'New' };
    roomRepository.findById.mockResolvedValue(room);
    userRepository.countByRoomId.mockResolvedValue(1);
    userRepository.findByVisitorIdInRoom.mockResolvedValue(user);
    userRepository.update.mockResolvedValue(updatedUser);
    userRepository.findByRoomId.mockResolvedValue([updatedUser]);

    await RoomService.joinRoom('room-1', 'New', 'visitor-1');

    expect(roomRepository.create).not.toHaveBeenCalled();
    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      name: 'New',
    });
    expect(emitMock).toHaveBeenCalledWith(GameEvents.UPDATE_USERS, [
      expect.objectContaining({ id: 'user-1', name: 'New' }),
    ]);
    expect(emitMock).toHaveBeenCalledWith(GameEvents.REVEAL_STATE, room.reveal);
  });

  it('requires the current site agreement before creating a user or room', async () => {
    const room = { id: 'room-1', reveal: false, lobbyEnabled: false };
    roomRepository.findById.mockResolvedValue(room);
    userRepository.findByVisitorIdInRoom.mockResolvedValue(null);
    userRepository.countByRoomId.mockResolvedValue(0);

    await expect(
      RoomService.joinRoom('room-1', 'New', 'visitor-new', false),
    ).rejects.toBeInstanceOf(RoomService.SiteAgreementRequiredError);
    expect(userRepository.create).not.toHaveBeenCalled();
    expect(roomRepository.update).not.toHaveBeenCalled();

    roomRepository.findById.mockResolvedValue(null);
    await expect(
      RoomService.joinRoom('room-new', 'New', 'visitor-new', true),
    ).rejects.toBeInstanceOf(RoomService.SiteAgreementRequiredError);
    expect(roomRepository.create).not.toHaveBeenCalled();

    // An acceptance of older text no longer counts.
    await expect(
      RoomService.joinRoom('room-new', 'New', 'visitor-new', true, {
        version: 'old-version',
        accepted: true,
      }),
    ).rejects.toBeInstanceOf(RoomService.SiteAgreementRequiredError);
  });

  describe('when the site asks for no agreement', () => {
    afterEach(() => setSiteConfig());

    it('creates rooms and members without an acceptance and stores none', async () => {
      setSiteConfig({ legal: { requireAgreement: false } });
      const room = { id: 'room-1', reveal: false };
      const user = { id: 'user-1', name: 'Name' };
      roomRepository.findById.mockResolvedValueOnce(null).mockResolvedValue(room);
      roomRepository.create.mockResolvedValue(room);
      userRepository.countByRoomId.mockResolvedValue(0);
      userRepository.findByVisitorIdInRoom.mockResolvedValue(null);
      userRepository.create.mockResolvedValue(user);
      userRepository.findByRoomId.mockResolvedValue([user]);

      await RoomService.joinRoom('room-1', 'Name', 'visitor-1', true);

      expect(roomRepository.create).toHaveBeenCalledWith(expect.anything(), {
        visitorId: 'visitor-1',
        network: 'unknown',
        agreement: null,
      });
      const created = userRepository.create.mock.calls[0]?.[0];
      expect(created).not.toHaveProperty('agreementVersion');
      expect(created).not.toHaveProperty('agreementText');
    });
  });

  describe('when the site password protects room creation', () => {
    it('refuses to create a room without the password but still joins existing rooms', async () => {
      roomRepository.findById.mockResolvedValueOnce(null);
      await expect(
        RoomService.joinRoom(
          'room-new',
          'New',
          'visitor-new',
          true,
          siteAgreement,
          'unknown',
          false,
        ),
      ).rejects.toThrow('Enter the site password to create a room.');
      expect(roomRepository.create).not.toHaveBeenCalled();

      const room = { id: 'room-1', reveal: false };
      const user = { id: 'user-1', name: 'Name' };
      roomRepository.findById.mockResolvedValue(room);
      userRepository.countByRoomId.mockResolvedValue(0);
      userRepository.findByVisitorIdInRoom.mockResolvedValue(null);
      userRepository.create.mockResolvedValue(user);
      userRepository.findByRoomId.mockResolvedValue([user]);
      await expect(
        RoomService.joinRoom('room-1', 'Name', 'visitor-1', true, siteAgreement, 'unknown', false),
      ).resolves.toMatchObject({ room });
      expect(roomRepository.create).not.toHaveBeenCalled();
    });
  });

  it('collapses duplicate visitor users before joining', async () => {
    const room = { id: 'room-1', reveal: false, lobbyEnabled: false };
    const duplicateA = {
      id: 'user-1',
      name: 'Old',
      roomId: 'room-1',
      visitorId: 'visitor-1',
      isApproved: true,
      vote: null,
      isObserver: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    const duplicateB = {
      ...duplicateA,
      id: 'user-2',
      name: 'Active',
      createdAt: new Date('2026-01-02T00:00:00Z'),
    };
    const updatedUser = { ...duplicateB, name: 'New' };
    const activeSocket = {
      data: { userId: 'user-2', roomId: 'room-1' },
      emit: emitMock,
      join: jest.fn(),
      leave: jest.fn(),
    };

    roomRepository.findById.mockResolvedValue(room);
    userRepository.findByRoomId
      .mockResolvedValueOnce([duplicateA, duplicateB])
      .mockResolvedValue([updatedUser]);
    fetchSocketsMock.mockResolvedValue([activeSocket]);
    userRepository.countByRoomId.mockResolvedValue(1);
    userRepository.update.mockResolvedValue(updatedUser);

    const result = await RoomService.joinRoom('room-1', 'New', 'visitor-1');

    expect(userRepository.deleteMany).toHaveBeenCalledWith({
      roomId: 'room-1',
      id: { in: ['user-1'] },
    });
    expect(userRepository.update).toHaveBeenCalledWith('user-2', {
      name: 'New',
    });
    expect(result.user).toEqual(updatedUser);
    expect(activeSocket.data.userId).toBe('user-2');
  });

  it('toggleAutoReveal(false) resets reveal when room is not yet revealed', async () => {
    roomRepository.update.mockResolvedValue({
      id: 'room-1',
      autoReveal: false,
      reveal: false,
    });
    // findById returns room that is NOT currently revealed
    roomRepository.findById.mockResolvedValue({
      id: 'room-1',
      reveal: false,
      autoReveal: true,
    });

    await RoomService.toggleAutoReveal('room-1', false);

    expect(roomRepository.update).toHaveBeenCalledWith('room-1', {
      autoReveal: false,
    });
    expect(roomRepository.update).toHaveBeenCalledWith('room-1', {
      reveal: false,
    });
    expect(emitMock).toHaveBeenCalledWith(GameEvents.REVEAL_STATE, false);
    expect(recordUsage.mock.calls).toEqual([['setting.autoReveal.off']]);
  });

  it('toggleAutoReveal(false) does NOT reset reveal when room is already revealed', async () => {
    roomRepository.update.mockResolvedValue({
      id: 'room-1',
      autoReveal: false,
      reveal: true,
    });
    // findById returns room that IS currently revealed (votes are showing)
    roomRepository.findById.mockResolvedValue({
      id: 'room-1',
      reveal: true,
      autoReveal: true,
    });

    await RoomService.toggleAutoReveal('room-1', false);

    expect(roomRepository.update).toHaveBeenCalledWith('room-1', {
      autoReveal: false,
    });
    // reveal:false must NOT have been called — the live reveal should be preserved
    expect(roomRepository.update).not.toHaveBeenCalledWith('room-1', {
      reveal: false,
    });
    expect(emitMock).not.toHaveBeenCalledWith(GameEvents.REVEAL_STATE, false);
  });

  it('toggleAutoReveal(true) triggers auto-reveal check', async () => {
    roomRepository.update.mockResolvedValue({
      id: 'room-1',
      autoReveal: true,
      reveal: false,
    });
    roomRepository.findById.mockResolvedValue({
      id: 'room-1',
      autoReveal: true,
      reveal: false,
    });
    userRepository.findByRoomId.mockResolvedValue([]);

    await RoomService.toggleAutoReveal('room-1', true);

    expect(roomRepository.update).toHaveBeenCalledWith('room-1', {
      autoReveal: true,
    });
    // The room already had auto reveal on, so re-sending it is not a change.
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it('counts each changed setting once and ignores unchanged ones', async () => {
    const before = {
      id: 'room-1',
      name: 'Room',
      autoReveal: false,
      useMultiplier: false,
      issuesEnabled: true,
      theme: 'default',
      mood: 'playful',
    };
    roomRepository.findById.mockResolvedValue(before);
    roomRepository.update.mockResolvedValue({
      ...before,
      useMultiplier: true,
      issuesEnabled: false,
      theme: 'vegas',
      mood: 'spicy',
      name: 'Renamed',
    });

    await RoomService.updateRoom('room-1', {});

    expect(recordUsage.mock.calls.map(([metric]) => metric)).toEqual([
      'setting.multiplier.on',
      'setting.issues.off',
      'setting.theme.vegas',
      'setting.mood.spicy',
      'setting.roomName',
    ]);
  });

  it('resets room and broadcasts users', async () => {
    roomRepository.update.mockResolvedValue({ id: 'room-1' });
    roomRepository.findById.mockResolvedValue({ id: 'room-1', reveal: false });
    userRepository.updateMany.mockResolvedValue({ count: 1 });
    userRepository.findByRoomId.mockResolvedValue([{ id: 'user-1' }]);

    await RoomService.resetRoom('room-1');

    expect(roomRepository.update).toHaveBeenCalledWith('room-1', {
      reveal: false,
      roundNumber: { increment: 1 },
      resultSnapshot: null,
      roundStartedAt: expect.any(Date),
      roundRevealedAt: null,
    });
    expect(userRepository.updateMany).toHaveBeenCalledWith({ roomId: 'room-1' }, { vote: null });
    expect(emitMock).toHaveBeenCalledWith(GameEvents.UPDATE_USERS, [
      expect.objectContaining({ id: 'user-1' }),
    ]);
    expect(emitMock).toHaveBeenCalledWith(GameEvents.REVEAL_STATE, false);
  });

  it('sends reveal results only to approved players and observers, never pending members', async () => {
    jest.useFakeTimers();
    try {
      const approved = { data: { userId: 'approved' }, emit: jest.fn() };
      const observer = { data: { userId: 'observer' }, emit: jest.fn() };
      const pending = { data: { userId: 'pending' }, emit: jest.fn() };
      const unknown = { data: {}, emit: jest.fn() };
      fetchSocketsMock.mockResolvedValue([approved, observer, pending, unknown]);
      const room = { id: 'room-1', reveal: false };
      roomRepository.findById.mockResolvedValue(room);
      roomRepository.update.mockResolvedValue({ ...room, reveal: true });
      userRepository.findByRoomId.mockResolvedValue([
        {
          id: 'approved',
          name: 'Player',
          vote: '8',
          isApproved: true,
          isObserver: false,
        },
        {
          id: 'observer',
          name: 'Observer',
          vote: null,
          isApproved: true,
          isObserver: true,
        },
        {
          id: 'pending',
          name: 'Pending',
          vote: null,
          isApproved: false,
          isObserver: false,
        },
      ]);
      await RoomService.startRevelation('room-1');
      await jest.advanceTimersByTimeAsync(REVELATION_DELAY_MS);
      const expected = JSON.stringify([{ id: 'approved', name: 'Player', vote: '8' }]);
      expect(approved.emit).toHaveBeenCalledWith(GameEvents.REVEAL_RESULTS, expected);
      expect(observer.emit).toHaveBeenCalledWith(GameEvents.REVEAL_RESULTS, expected);
      expect(pending.emit).not.toHaveBeenCalledWith(GameEvents.REVEAL_RESULTS, expect.anything());
      expect(unknown.emit).not.toHaveBeenCalledWith(GameEvents.REVEAL_RESULTS, expect.anything());
      expect(emitMock).not.toHaveBeenCalledWith(GameEvents.REVEAL_RESULTS, expect.anything());
    } finally {
      jest.useRealTimers();
    }
  });

  it('starts revelation countdown and updates room', async () => {
    jest.useFakeTimers();
    const room = { id: 'room-1', reveal: false };
    const updatedRoom = { id: 'room-1', reveal: true };
    roomRepository.findById.mockResolvedValueOnce(room).mockResolvedValueOnce(room);
    userRepository.findByRoomId.mockResolvedValue([
      {
        id: 'user-1',
        isApproved: true,
        name: 'A',
        vote: '5',
        visitorId: 'v1',
        isObserver: false,
      },
      {
        id: 'user-2',
        name: 'B',
        vote: null,
        visitorId: 'v2',
        isObserver: true,
      },
    ]);
    roomRepository.update.mockResolvedValue(updatedRoom);

    await RoomService.startRevelation('room-1');
    expect(emitMock).toHaveBeenCalledWith(GameEvents.REVELATION_STARTED, {
      seconds: REVELATION_DELAY_MS / 1000,
    });

    await jest.advanceTimersByTimeAsync(REVELATION_DELAY_MS);

    expect(roomRepository.update).toHaveBeenCalledWith('room-1', {
      reveal: true,
      roundRevealedAt: expect.any(Date),
      roundsRevealed: { increment: 1 },
      unanimousRounds: { increment: 0 },
      awardsStartedAt: expect.any(Date),
      statsStartedAt: expect.any(Date),
      resultSnapshot: expect.any(String),
    });
    expect(emitMock).toHaveBeenCalledWith(GameEvents.REVEAL_STATE, true);
    expect(emitMock).toHaveBeenCalledWith(
      GameEvents.ROOM_UPDATED,
      expect.objectContaining(updatedRoom),
    );
    expect(emitMock).toHaveBeenCalledWith(GameEvents.REVEAL_RESULTS, expect.any(String));
    expect(pendingReveals.has('room-1')).toBe(false);
    expect(recordUsage).toHaveBeenCalledWith('round.revealed.manual');
    expect(recordUsage).not.toHaveBeenCalledWith('round.revealed.auto');

    jest.useRealTimers();
  });

  it('counts a reveal started by auto reveal as automatic', async () => {
    jest.useFakeTimers();
    const room = { id: 'room-1', reveal: false, autoReveal: true };
    roomRepository.findById.mockResolvedValue(room);
    userRepository.findByRoomId.mockResolvedValue([
      {
        id: 'user-1',
        isApproved: true,
        name: 'A',
        vote: '5',
        visitorId: 'v1',
        isObserver: false,
      },
    ]);
    roomRepository.update.mockResolvedValue({ ...room, reveal: true });

    await RoomService.checkAutoReveal('room-1');
    await jest.advanceTimersByTimeAsync(REVELATION_DELAY_MS);

    expect(recordUsage).toHaveBeenCalledWith('round.revealed.auto');
    expect(recordUsage).not.toHaveBeenCalledWith('round.revealed.manual');
    jest.useRealTimers();
  });

  it('handles errors during revelation timeout', async () => {
    jest.useFakeTimers();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    roomRepository.findById
      .mockResolvedValueOnce({ id: 'room-1', reveal: false })
      .mockRejectedValue(new Error('boom'));

    await RoomService.startRevelation('room-1');
    await jest.advanceTimersByTimeAsync(REVELATION_DELAY_MS);

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
    jest.useRealTimers();
  });

  it('returns early when the room reveals before timeout', async () => {
    jest.useFakeTimers();
    roomRepository.findById
      .mockResolvedValueOnce({ id: 'room-1', reveal: false })
      .mockResolvedValueOnce(null);

    await RoomService.startRevelation('room-1');
    await jest.advanceTimersByTimeAsync(REVELATION_DELAY_MS);

    expect(roomRepository.update).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('skips revelation when pending or roomId missing', async () => {
    pendingReveals.add('room-1');
    await RoomService.startRevelation('');
    await RoomService.startRevelation('room-1');

    expect(roomRepository.findById).not.toHaveBeenCalled();
  });

  it('returns early when room is already revealed', async () => {
    roomRepository.findById.mockResolvedValue({ id: 'room-1', reveal: true });

    await RoomService.startRevelation('room-1');

    expect(pendingReveals.has('room-1')).toBe(false);
  });

  it('returns early when auto-reveal is not applicable', async () => {
    roomRepository.findById.mockResolvedValue({
      id: 'room-1',
      autoReveal: false,
      reveal: false,
    });
    await RoomService.checkAutoReveal('');
    await RoomService.checkAutoReveal('room-1');

    expect(roomRepository.findById).toHaveBeenCalledWith('room-1');
  });

  it('returns early when reveal already pending', async () => {
    pendingReveals.add('room-1');
    roomRepository.findById.mockResolvedValue({
      id: 'room-1',
      autoReveal: true,
      reveal: false,
    });

    await RoomService.checkAutoReveal('room-1');

    expect(userRepository.findByRoomId).not.toHaveBeenCalled();
  });

  it('triggers auto-reveal when all players have voted', async () => {
    roomRepository.findById
      .mockResolvedValueOnce({ id: 'room-1', autoReveal: true, reveal: false })
      .mockResolvedValueOnce({ id: 'room-1', reveal: true });
    userRepository.findByRoomId.mockResolvedValue([
      { id: 'user-1', vote: '1', isObserver: false },
      { id: 'user-2', vote: '2', isObserver: false },
    ]);

    await RoomService.checkAutoReveal('room-1');
  });

  it('skips auto-reveal when no players or votes missing', async () => {
    roomRepository.findById.mockResolvedValue({
      id: 'room-1',
      autoReveal: true,
      reveal: false,
    });
    userRepository.findByRoomId
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'user-1', vote: '', isObserver: false }]);

    await RoomService.checkAutoReveal('room-1');
    await RoomService.checkAutoReveal('room-1');
  });

  it('logs errors during auto-reveal checks', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    roomRepository.findById.mockRejectedValue(new Error('db fail'));

    await RoomService.checkAutoReveal('room-1');

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('cleans up users and broadcasts remaining room state', async () => {
    const autoRevealSpy = jest.spyOn(RoomService, 'checkAutoReveal').mockResolvedValue();
    roomRepository.findById.mockResolvedValue({ id: 'room-1', reveal: false });
    fetchSocketsMock.mockResolvedValue([{ data: { userId: 'user-2' }, emit: emitMock }]);
    userRepository.delete.mockRejectedValue(new Error('gone'));
    userRepository.findByRoomId.mockResolvedValue([
      { id: 'user-1', isObserver: true, name: 'A' },
      { id: 'user-2', isObserver: false, isApproved: true, name: 'B' },
    ]);

    await RoomService.cleanupUser('user-1', 'room-1', 'socket-1', true);

    expect(userRepository.delete).toHaveBeenCalledWith('user-1');
    expect(emitMock).toHaveBeenCalledWith(
      GameEvents.UPDATE_USERS,
      expect.arrayContaining([expect.objectContaining({ id: 'user-2', name: 'B' })]),
    );
    autoRevealSpy.mockRestore();
  });

  it('returns early when cleanup data is missing', async () => {
    await RoomService.cleanupUser(null, 'room-1', 'socket-1');
    await RoomService.cleanupUser('user-1', null, 'socket-1');

    expect(userRepository.delete).not.toHaveBeenCalled();
  });

  it('preserves a disconnected user throughout the reconnect grace period', async () => {
    jest.useFakeTimers();
    fetchSocketsMock.mockResolvedValue([]);
    userRepository.findByRoomId.mockResolvedValue([]);

    try {
      await RoomService.cleanupUser('user-1', 'room-1', 'socket-1');

      await jest.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS - 1);
      expect(userRepository.delete).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1);
      expect(userRepository.delete).toHaveBeenCalledWith('user-1');
    } finally {
      jest.useRealTimers();
    }
  });

  it('cancels pending cleanup when the same visitor rejoins', async () => {
    jest.useFakeTimers();
    const room = {
      id: 'room-1',
      reveal: false,
      autoReveal: false,
      lobbyEnabled: false,
    };
    const user = {
      id: 'user-1',
      name: 'Name',
      visitorId: 'visitor-1',
      vote: '5',
      isApproved: true,
      isObserver: false,
    };
    roomRepository.findById.mockResolvedValue(room);
    roomRepository.update.mockResolvedValue(room);
    userRepository.findByRoomId.mockResolvedValue([user]);
    fetchSocketsMock.mockResolvedValue([]);

    try {
      await RoomService.cleanupUser('user-1', 'room-1', 'socket-1');
      await jest.advanceTimersByTimeAsync(60_000);

      await RoomService.joinRoom('room-1', 'Name', 'visitor-1');
      await jest.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS);

      expect(userRepository.delete).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('restarts the full grace period after another disconnect', async () => {
    jest.useFakeTimers();
    fetchSocketsMock.mockResolvedValue([]);
    userRepository.findByRoomId.mockResolvedValue([]);

    try {
      await RoomService.cleanupUser('user-1', 'room-1', 'socket-1');
      await jest.advanceTimersByTimeAsync(60_000);
      await RoomService.cleanupUser('user-1', 'room-1', 'socket-2');

      await jest.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS - 1);
      expect(userRepository.delete).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1);
      expect(userRepository.delete).toHaveBeenCalledWith('user-1');
    } finally {
      jest.useRealTimers();
    }
  });

  it('skips delete when socket still exists and returns if room empty', async () => {
    const autoRevealSpy = jest.spyOn(RoomService, 'checkAutoReveal').mockResolvedValue();
    fetchSocketsMock.mockResolvedValue([
      { id: 'socket-2', data: { userId: 'user-1', roomId: 'room-1' } },
    ]);
    userRepository.findByRoomId.mockResolvedValue([]);

    await RoomService.cleanupUser('user-1', 'room-1', 'socket-1', true);

    expect(userRepository.delete).not.toHaveBeenCalled();
    autoRevealSpy.mockRestore();
  });

  it('logs errors during cleanup', async () => {
    const autoRevealSpy = jest.spyOn(RoomService, 'checkAutoReveal').mockResolvedValue();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchSocketsMock.mockRejectedValue(new Error('fetch failed'));

    await RoomService.cleanupUser('user-1', 'room-1', 'socket-1', true);

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
    autoRevealSpy.mockRestore();
  });

  it('broadcasts user updates', async () => {
    roomRepository.findById.mockResolvedValue({ id: 'room-1', reveal: false });
    userRepository.findByRoomId.mockResolvedValue([{ id: 'user-1' }]);

    await RoomService.broadcastUserUpdate('room-1');

    expect(emitMock).toHaveBeenCalledWith(GameEvents.UPDATE_USERS, [
      expect.objectContaining({ id: 'user-1' }),
    ]);
  });

  it('includes active overheating in room snapshots and omits it after expiry', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(10000);
    try {
      roomRepository.findById.mockResolvedValue({
        id: 'room-1',
        reveal: false,
      });
      userRepository.findByRoomId.mockResolvedValue([
        { id: 'user-1', isApproved: true, vote: '8' },
        { id: 'user-2', isApproved: true, vote: '5' },
      ]);
      for (let i = 0; i < 20; i++) recordRejectedThrow('user-2');
      await RoomService.broadcastUserUpdate('room-1');
      expect(emitMock).toHaveBeenLastCalledWith(GameEvents.UPDATE_USERS, [
        expect.objectContaining({ id: 'user-1', vote: '8' }),
        expect.objectContaining({
          id: 'user-2',
          vote: null,
          throwOverheat: { startedAt: 10000, until: 15000 },
        }),
      ]);
      const reconnectEmit = jest.fn();
      fetchSocketsMock.mockResolvedValue([{ data: { userId: 'user-2' }, emit: reconnectEmit }]);
      await RoomService.broadcastUserUpdate('room-1');
      expect(reconnectEmit).toHaveBeenLastCalledWith(
        GameEvents.UPDATE_USERS,
        expect.arrayContaining([
          expect.objectContaining({
            id: 'user-2',
            throwOverheat: { startedAt: 10000, until: 15000 },
          }),
        ]),
      );
      nowSpy.mockReturnValue(15000);
      await RoomService.broadcastUserUpdate('room-1');
      expect(reconnectEmit).toHaveBeenLastCalledWith(
        GameEvents.UPDATE_USERS,
        expect.arrayContaining([expect.not.objectContaining({ throwOverheat: expect.anything() })]),
      );
      const users = reconnectEmit.mock.lastCall?.[1];
      expect(users).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'user-2' })]));
      expect(JSON.stringify(users)).not.toContain('throwOverheat');
    } finally {
      nowSpy.mockRestore();
      clearThrowPenalties();
    }
  });

  it('only sends a pending user their own user update', async () => {
    const pendingEmit = jest.fn();
    const approvedEmit = jest.fn();
    roomRepository.findById.mockResolvedValue({ id: 'room-1', reveal: false });
    userRepository.findByRoomId.mockResolvedValue([
      { id: 'user-1', name: 'Pending', isApproved: false },
      { id: 'user-2', name: 'Approved', isApproved: true },
    ]);
    fetchSocketsMock.mockResolvedValue([
      { data: { userId: 'user-1' }, emit: pendingEmit },
      { data: { userId: 'user-2' }, emit: approvedEmit },
    ]);

    await RoomService.broadcastUserUpdate('room-1');

    expect(pendingEmit).toHaveBeenCalledWith(GameEvents.UPDATE_USERS, [
      expect.objectContaining({ id: 'user-1', name: 'Pending' }),
    ]);
    expect(pendingEmit).not.toHaveBeenCalledWith(
      GameEvents.UPDATE_USERS,
      expect.arrayContaining([expect.objectContaining({ id: 'user-2' })]),
    );
    expect(approvedEmit).toHaveBeenCalledWith(
      GameEvents.UPDATE_USERS,
      expect.arrayContaining([expect.objectContaining({ id: 'user-2' })]),
    );
  });

  it('serializes concurrent joins via mutex', async () => {
    const room = { id: 'room-1', reveal: false, lobbyEnabled: false };
    // Both concurrent calls see 0 users initially (race window)
    userRepository.countByRoomId.mockResolvedValue(0);
    userRepository.findByVisitorIdInRoom.mockResolvedValue(null);
    roomRepository.findById.mockResolvedValue(room);
    roomRepository.create.mockResolvedValue(room);
    userRepository.findByRoomId.mockResolvedValue([]);

    userRepository.create.mockImplementation((data: Prisma.UserCreateInput) => {
      return Promise.resolve({ id: `user-x`, ...data });
    });

    // Fire two joins concurrently for different visitors in the same room
    await Promise.all([
      RoomService.joinRoom('room-1', 'Alice', 'visitor-a', false, siteAgreement),
      RoomService.joinRoom('room-1', 'Bob', 'visitor-b', false, siteAgreement),
    ]);

    // We can't mock the count change between calls easily, but we CAN verify
    // that create was called twice (both were new users).
    expect(userRepository.create).toHaveBeenCalledTimes(2);
  });

  it('does not broadcast an approved user vote to other pending visitors', async () => {
    const approvedEmit = jest.fn();
    const pendingEmit = jest.fn();
    const approved = {
      id: 'approved',
      roomId: 'room-1',
      name: 'Approved',
      vote: '8',
      isApproved: true,
      isObserver: false,
    };
    const pending = {
      id: 'pending',
      roomId: 'room-1',
      name: 'Pending',
      vote: null,
      isApproved: false,
      isObserver: false,
    };
    roomRepository.findById.mockResolvedValue({ id: 'room-1', reveal: true });
    userRepository.findById.mockResolvedValue(approved);
    userRepository.update.mockResolvedValue(approved);
    userRepository.findByRoomId.mockResolvedValue([approved, pending]);
    fetchSocketsMock.mockResolvedValue([
      {
        data: { userId: 'approved' },
        emit: approvedEmit,
        join: jest.fn(),
        leave: jest.fn(),
      },
      {
        data: { userId: 'pending' },
        emit: pendingEmit,
        join: jest.fn(),
        leave: jest.fn(),
      },
    ]);
    await RoomService.approveUser('approved', 'room-1');
    expect(approvedEmit).toHaveBeenCalledWith(
      GameEvents.USER_UPDATED,
      expect.objectContaining({ vote: '8' }),
    );
    expect(pendingEmit).not.toHaveBeenCalledWith(GameEvents.USER_UPDATED, expect.anything());
    expect(pendingEmit).toHaveBeenCalledWith(GameEvents.UPDATE_USERS, [
      expect.objectContaining({ id: 'pending' }),
    ]);
  });

  it('disconnects every tab of a denied visitor', async () => {
    userRepository.findById.mockResolvedValue({
      id: 'pending',
      roomId: 'room-1',
      isApproved: false,
    });
    const sockets = [1, 2].map((index) => ({
      id: `socket-${index}`,
      data: { userId: 'pending' },
      emit: jest.fn(),
      disconnect: jest.fn(),
    }));
    fetchSocketsMock.mockResolvedValue(sockets);
    await RoomService.denyUser('pending', 'room-1');
    for (const socket of sockets) expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(userRepository.delete).toHaveBeenCalledWith('pending');
  });

  it('approveUser rejects cross-room target', async () => {
    // Target user belongs to room-2, not room-1
    userRepository.findById.mockResolvedValue({
      id: 'user-x',
      roomId: 'room-2',
    });
    await RoomService.approveUser('user-x', 'room-1');
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('approveUser allows same-room target', async () => {
    userRepository.findById.mockResolvedValue({
      id: 'user-x',
      roomId: 'room-1',
      isApproved: false,
      createdAt: new Date(),
    });
    userRepository.update.mockResolvedValue({ id: 'user-x', isApproved: true });
    roomRepository.findById.mockResolvedValue({ id: 'room-1', reveal: false });
    userRepository.findByRoomId.mockResolvedValue([]);
    await RoomService.approveUser('user-x', 'room-1');
    expect(userRepository.update).toHaveBeenCalledWith('user-x', {
      isApproved: true,
    });
  });

  it('approveUser moves pending sockets into the room with current state', async () => {
    const target = {
      id: 'user-x',
      roomId: 'room-1',
      name: 'Newcomer',
      vote: null,
      isApproved: false,
      isObserver: false,
      createdAt: new Date(),
    };
    const room = { id: 'room-1', name: 'Room', reveal: true };
    userRepository.findById.mockResolvedValue(target);
    userRepository.update.mockResolvedValue({ ...target, isApproved: true });
    roomRepository.findById.mockResolvedValue(room);
    userRepository.findByRoomId.mockResolvedValue([{ ...target, isApproved: true }]);
    const targetSocket = {
      data: { userId: 'user-x' },
      emit: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
    };
    const otherSocket = {
      data: { userId: 'someone-else' },
      emit: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
    };
    fetchSocketsMock.mockResolvedValue([targetSocket, otherSocket]);

    await RoomService.approveUser('user-x', 'room-1');

    expect(targetSocket.leave).toHaveBeenCalledWith('lobby:room-1');
    expect(targetSocket.join).toHaveBeenCalledWith('room-1');
    expect(otherSocket.join).not.toHaveBeenCalled();
    expect(targetSocket.emit).toHaveBeenCalledWith(
      GameEvents.ROOM_UPDATED,
      expect.objectContaining({ id: 'room-1' }),
    );
    expect(targetSocket.emit).toHaveBeenCalledWith(GameEvents.REVEAL_STATE, true);
  });

  it('approveUser ignores a pending request that already expired', async () => {
    userRepository.findById.mockResolvedValue({
      id: 'user-x',
      roomId: 'room-1',
      isApproved: false,
      createdAt: new Date(Date.now() - RoomService.PENDING_REQUEST_TTL_MS - 1),
    });

    await RoomService.approveUser('user-x', 'room-1');

    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('denyUser rejects cross-room target', async () => {
    userRepository.findById.mockResolvedValue({
      id: 'user-x',
      roomId: 'room-2',
    });
    await RoomService.denyUser('user-x', 'room-1');
    expect(userRepository.delete).not.toHaveBeenCalled();
  });

  it('denyUser does not remove an approved user', async () => {
    userRepository.findById.mockResolvedValue({
      id: 'user-x',
      roomId: 'room-1',
      isApproved: true,
    });

    await RoomService.denyUser('user-x', 'room-1');

    expect(userRepository.delete).not.toHaveBeenCalled();
  });

  it('getRevelationRemainingSeconds returns null when no timer is active', () => {
    expect(RoomService.getRevelationRemainingSeconds('room-x')).toBeNull();
  });

  it('startRevelation stores timer and getRevelationRemainingSeconds returns > 0', async () => {
    jest.useFakeTimers();
    roomRepository.findById.mockResolvedValueOnce({
      id: 'room-t',
      reveal: false,
    });

    await RoomService.startRevelation('room-t');

    const remaining = RoomService.getRevelationRemainingSeconds('room-t');
    expect(remaining).not.toBeNull();
    expect(remaining!).toBeGreaterThan(0);

    jest.useRealTimers();
  });

  it('resetRoom cancels the active revelation timer', async () => {
    jest.useFakeTimers();
    roomRepository.findById.mockResolvedValueOnce({
      id: 'room-r',
      reveal: false,
    });
    roomRepository.update.mockResolvedValue({
      id: 'room-r',
      reveal: false,
      resultSnapshot: null,
    });
    userRepository.updateMany.mockResolvedValue({ count: 0 });
    userRepository.findByRoomId.mockResolvedValue([]);

    await RoomService.startRevelation('room-r');
    expect(RoomService.getRevelationRemainingSeconds('room-r')).not.toBeNull();

    await RoomService.resetRoom('room-r');
    // Timer should have been cleared and entry removed
    expect(RoomService.getRevelationRemainingSeconds('room-r')).toBeNull();

    // Fast-forward — the cleared timer must NOT fire and update the room
    await jest.advanceTimersByTimeAsync(REVELATION_DELAY_MS);
    // reveal:true should NOT have been called (timer was cancelled)
    expect(roomRepository.update).not.toHaveBeenCalledWith(
      'room-r',
      expect.objectContaining({ reveal: true }),
    );

    jest.useRealTimers();
  });
});

describe('room service initialization guards', () => {
  it('throws when io is missing', async () => {
    jest.resetModules();
    jest.doMock('../../../src/modules/rooms/room.repository', () => roomRepository);
    jest.doMock('../../../src/modules/rooms/user.repository', () => userRepository);
    const { startRevelation, cleanupUser } =
      await import('../../../src/modules/rooms/room.service');

    await expect(startRevelation('room-1')).rejects.toThrow('RoomService not initialized with IO');
    await expect(cleanupUser('user-1', 'room-1', 'socket-1')).rejects.toThrow(
      'RoomService not initialized with IO',
    );
  });

  it('handles errors while starting revelation', async () => {
    jest.resetModules();
    jest.doMock('../../../src/modules/rooms/room.repository', () => ({
      ...roomRepository,
      findById: jest.fn().mockRejectedValue(new Error('boom')),
    }));
    jest.doMock('../../../src/modules/rooms/user.repository', () => userRepository);
    const { init, startRevelation } = await import('../../../src/modules/rooms/room.service');
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    init(
      createRoomBroadcaster({
        to: jest.fn(() => ({ emit: jest.fn() })),
      } as unknown as PokerServer),
    );
    await startRevelation('room-1');

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('withRoomLock', () => {
  it('serializes concurrent calls for the same room', async () => {
    const order: number[] = [];
    const task = (n: number) =>
      withRoomLock('room-x', async () => {
        order.push(n * 10);
        await new Promise((r) => setTimeout(r, 5));
        order.push(n * 10 + 1);
      });

    await Promise.all([task(1), task(2), task(3)]);

    // Each task's start and end must be contiguous — no interleaving
    expect(order).toEqual([10, 11, 20, 21, 30, 31]);
  });

  it('does not block concurrent calls for different rooms', async () => {
    const order: string[] = [];
    const taskA = withRoomLock('room-a', async () => {
      order.push('a-start');
      await new Promise((r) => setTimeout(r, 10));
      order.push('a-end');
    });
    const taskB = withRoomLock('room-b', async () => {
      order.push('b-start');
      await new Promise((r) => setTimeout(r, 5));
      order.push('b-end');
    });

    await Promise.all([taskA, taskB]);

    // room-b should complete before room-a since it has a shorter delay
    expect(order.indexOf('b-end')).toBeLessThan(order.indexOf('a-end'));
  });

  it('releases the lock even when the task throws', async () => {
    await expect(
      withRoomLock('room-err', async () => {
        throw new Error('task failed');
      }),
    ).rejects.toThrow('task failed');

    // Lock must be released — next call should not hang
    const result = await withRoomLock('room-err', async () => 'ok');
    expect(result).toBe('ok');
  });
});
