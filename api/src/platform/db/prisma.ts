import { assertDeletionContext } from '../concurrency/deletion-context';
import { PrismaClient } from '@prisma/client';
import { logger } from '../logger';

export function sqliteConnectionUrl(url: string): string {
  const separator = url.indexOf('?');
  const file = separator === -1 ? url : url.slice(0, separator);
  const params = new URLSearchParams(separator === -1 ? '' : url.slice(separator + 1));
  // Prisma uses BEGIN IMMEDIATE even for read transactions. A single connection
  // queues work instead of blocking engine workers on competing SQLite locks.
  params.set('connection_limit', '1');
  return `${file}?${params.toString()}`;
}

const databaseUrl = process.env.DATABASE_URL;
const prisma = new PrismaClient(
  databaseUrl ? { datasourceUrl: sqliteConnectionUrl(databaseUrl) } : undefined,
);

prisma.$use(async (params, next) => {
  assertDeletionContext();
  return next(params);
});

export async function initializeDatabase(): Promise<void> {
  const mode = await prisma.$queryRaw<{ journal_mode: string }[]>`PRAGMA journal_mode = WAL`;
  if (mode[0]?.journal_mode !== 'wal') {
    throw new Error('SQLite WAL mode could not be enabled. Refusing to start.');
  }
  // Do not trade power-loss durability for throughput. This connection is also
  // the one used for requests, since the pool is limited to a single connection.
  await prisma.$executeRaw`PRAGMA synchronous = FULL`;
  logger.log('[DB] SQLite ready: WAL, synchronous=FULL, connection_limit=1');
}

export default prisma;
