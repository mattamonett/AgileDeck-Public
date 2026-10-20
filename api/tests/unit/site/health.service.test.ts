jest.mock('../../../src/platform/db/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      count: jest.fn(),
    },
  },
}));

import { getHealthStatus } from '../../../src/modules/site/health.service';
import prismaClient from '../../../src/platform/db/prisma';

describe('health service', () => {
  const prisma = jest.mocked(prismaClient);

  it('returns healthy when prisma responds', async () => {
    prisma.user.count.mockResolvedValue(5);
    const status = await getHealthStatus();
    expect(status.api).toBe('healthy');
    expect(status.db).toBe('healthy');
    expect(typeof status.timestamp).toBe('string');
  });

  it('returns unhealthy when prisma throws', async () => {
    prisma.user.count.mockRejectedValue(new Error('db down'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const status = await getHealthStatus();

    expect(status.api).toBe('healthy');
    expect(status.db).toBe('unhealthy');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
