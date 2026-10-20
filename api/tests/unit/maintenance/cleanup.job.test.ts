const scheduleMock = jest.fn();
const mockFindStaleRooms = jest.fn<Promise<{ id: string }[]>, [unknown]>();

jest.mock('node-cron', () => ({
  schedule: scheduleMock,
}));

jest.mock('../../../src/platform/db/prisma', () => ({
  __esModule: true,
  default: {
    room: {
      findMany: (query: unknown) => mockFindStaleRooms(query),
      deleteMany: jest.fn(),
    },
    user: { deleteMany: jest.fn() },
    abuseQuota: { deleteMany: jest.fn() },
    rateLimitDaily: { deleteMany: jest.fn() },
    usageDaily: { deleteMany: jest.fn() },
    $executeRaw: jest.fn(),
  },
}));

import { startCleanupJob } from '../../../src/modules/maintenance/cleanup.job';
import prismaClient from '../../../src/platform/db/prisma';
import { setSiteConfig } from '../../../src/config/site-config';

const CLEANUP_DAYS = 90;

describe('cron cleanup', () => {
  const prisma = jest.mocked(prismaClient);

  beforeEach(() => {
    scheduleMock.mockReset();
  });
  afterEach(() => setSiteConfig());

  it('uses the operator retention settings', async () => {
    setSiteConfig({ limits: { inactiveRoomDays: 30, usageRetentionDays: 10 } });
    mockFindStaleRooms.mockResolvedValue([]);
    prisma.usageDaily.deleteMany.mockClear();
    const { cleanupInactiveRecords } =
      await import('../../../src/modules/maintenance/cleanup.service');
    const now = new Date('2024-06-01T00:00:00Z');
    await cleanupInactiveRecords(now);
    expect(mockFindStaleRooms).toHaveBeenCalledWith({
      where: { updatedAt: { lt: new Date('2024-05-02T00:00:00Z') } },
      select: { id: true },
    });
    // Ten UTC days, today included.
    expect(prisma.usageDaily.deleteMany).toHaveBeenCalledWith({
      where: { day: { lt: '2024-05-23' } },
    });
  });

  it('schedules daily cleanup with correct cron expression', () => {
    scheduleMock.mockImplementation(() => ({ stop: jest.fn() }));
    startCleanupJob();
    expect(scheduleMock).toHaveBeenCalledWith('0 0 * * *', expect.any(Function));
  });

  it(`deletes rooms older than ${CLEANUP_DAYS} days`, async () => {
    mockFindStaleRooms.mockResolvedValue([{ id: 'stale-room' }]);
    prisma.room.deleteMany.mockResolvedValue({ count: 1 });

    let scheduledTask: (() => Promise<void>) | undefined;
    scheduleMock.mockImplementation((_expr: string, callback: () => Promise<void>) => {
      scheduledTask = callback;
      return { stop: jest.fn() };
    });

    const now = new Date('2024-06-01T00:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    startCleanupJob();
    expect(scheduledTask).toBeDefined();

    await (scheduledTask as () => Promise<void>)();

    const expectedCutoff = new Date(now.getTime() - CLEANUP_DAYS * 24 * 60 * 60 * 1000);

    const roomArgs = prisma.room.deleteMany.mock.calls[0]?.[0] as {
      where: { id: string; updatedAt: { lt: Date } };
    };

    expect(roomArgs.where.id).toBe('stale-room');
    expect(roomArgs.where.updatedAt.lt.getTime()).toBe(expectedCutoff.getTime());
    expect(prisma.user.deleteMany).not.toHaveBeenCalled();
    // Usage counters keep 400 UTC days, today included.
    expect(prisma.usageDaily.deleteMany).toHaveBeenCalledWith({
      where: { day: { lt: '2023-04-29' } },
    });

    jest.useRealTimers();
  });

  it('skips stale rooms that still have connected members', async () => {
    mockFindStaleRooms.mockResolvedValue([{ id: 'busy-room' }, { id: 'idle-room' }]);
    prisma.room.deleteMany.mockReset().mockResolvedValue({ count: 1 });

    const { cleanupInactiveRecords } =
      await import('../../../src/modules/maintenance/cleanup.service');
    const deleted = await cleanupInactiveRecords(new Date(), (roomId) => roomId === 'busy-room');

    expect(deleted).toBe(1);
    expect(prisma.room.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.room.deleteMany).toHaveBeenCalledWith({
      where: { id: 'idle-room', updatedAt: { lt: expect.any(Date) } },
    });
  });

  it('handles cleanup failures without rejecting the scheduled task', async () => {
    mockFindStaleRooms.mockResolvedValue([{ id: 'stale-room' }]);
    prisma.room.deleteMany.mockRejectedValue(new Error('database unavailable'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    let scheduledTask: (() => Promise<void>) | undefined;
    scheduleMock.mockImplementation((_expr: string, callback: () => Promise<void>) => {
      scheduledTask = callback;
      return { stop: jest.fn() };
    });

    startCleanupJob();
    await expect(scheduledTask!()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith('Daily DB cleanup failed:', expect.any(Error));
    errorSpy.mockRestore();
  });
});
