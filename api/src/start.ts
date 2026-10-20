// Loads .env before any module reads the environment; nothing else loads it.
import 'dotenv/config';
import { readServerEnv } from './config/env';
import { legalSetupWarnings } from './config/legal-text';
import { loadSiteConfig } from './config/site-config';
import { startThrowStats } from './modules/rooms/throw-stats';
import { startRateLimitTelemetry } from './modules/telemetry/rate-limit-telemetry';
import { startUsageTelemetry } from './modules/telemetry/usage-telemetry';
import prisma, { initializeDatabase } from './platform/db/prisma';
import { createServer } from './server';
import { logger } from './platform/logger';

function logUnhandledFailures(): void {
  process.on('uncaughtException', (err) => {
    logger.error('CRITICAL: Uncaught Exception:', err);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('CRITICAL: Unhandled Rejection:', reason);
  });
}

async function start(): Promise<void> {
  const siteConfig = loadSiteConfig();
  await initializeDatabase();
  startRateLimitTelemetry();
  startUsageTelemetry();
  startThrowStats();

  logUnhandledFailures();
  logger.log('API starting up...');
  const env = readServerEnv();
  logger.log(
    env.adminEnabled
      ? 'Admin page: on at /admin.'
      : 'Admin page: off. Set ADMIN_PASSWORD to turn it on.',
  );
  for (const warning of legalSetupWarnings(siteConfig))
    logger.warn(`Terms and privacy: ${warning}.`);
  const server = createServer(env);
  server.start();

  const shutdown = async (signal: string) => {
    await server.stop(signal);
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void start().catch(async (error: unknown) => {
  logger.error('API startup failed:', error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
