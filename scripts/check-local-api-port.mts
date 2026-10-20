import { createServer } from 'node:net';
import { LOCAL_API_PORT } from './local-env.mts';

async function checkPort(port: number): Promise<void> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(() => resolve()));
  });
}

try {
  await checkPort(Number(LOCAL_API_PORT));
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown port error';
  console.error(
    `Local Poker port ${LOCAL_API_PORT} is unavailable. Stop the existing API before running migrations or starting another one. ${message}`,
  );
  process.exitCode = 1;
}
