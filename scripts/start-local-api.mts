import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { LOCAL_API_PORT, localApiEnv } from './local-env.mts';

const require = createRequire(import.meta.url);
const watch = process.argv.includes('--watch');
const apiDirectory = fileURLToPath(new URL('../api/', import.meta.url));
const argumentsToRun = watch
  ? [require.resolve('nodemon/bin/nodemon.js'), 'src/start.ts']
  : ['dist/start.js'];

const child = spawn(process.execPath, argumentsToRun, {
  cwd: apiDirectory,
  stdio: 'inherit',
  env: { ...localApiEnv(), PORT: LOCAL_API_PORT, NODE_ENV: 'development' },
});

child.on('error', (error) => {
  console.error(`Could not start the local API: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => child.kill(signal));
}
