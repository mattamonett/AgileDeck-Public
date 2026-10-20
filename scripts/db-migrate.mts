import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { localApiEnv } from './local-env.mts';

const require = createRequire(import.meta.url);
const child = spawn(
  process.execPath,
  [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
  {
    cwd: fileURLToPath(new URL('../api/', import.meta.url)),
    stdio: 'inherit',
    env: localApiEnv(),
  },
);

child.on('error', (error) => {
  console.error(`Could not run migrations: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
