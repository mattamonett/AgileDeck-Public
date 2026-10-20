/** Development defaults shared by the local API and migration scripts. */
export const LOCAL_API_PORT = '3300';

/** Relative to api/prisma/schema.prisma, so the database is api/prisma/poker.db. */
export const LOCAL_DATABASE_URL = 'file:./poker.db';

export function localApiEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL,
  };
}
