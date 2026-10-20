import prisma from '../../platform/db/prisma';
import type { HealthStatus } from '@poker/shared';
import { logger } from '../../platform/logger';

const MIN_CHECK_DURATION_MS = 300;

export async function getHealthStatus(): Promise<HealthStatus> {
  let dbStatus: HealthStatus['db'] = 'healthy';
  try {
    // A simple count is often more reliable for health checks than raw SQL on some SQLite setups
    await prisma.user.count();
  } catch (e) {
    dbStatus = 'unhealthy';
    logger.error('DB Health Check Failed:', e);
  }

  // Artificial delay so the UI 'Checking...' state is visible
  await new Promise((resolve) => setTimeout(resolve, MIN_CHECK_DURATION_MS));

  const status: HealthStatus = {
    api: 'healthy',
    db: dbStatus,
    timestamp: new Date().toISOString(),
  };

  return status;
}
