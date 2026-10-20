import { context } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = fileURLToPath(new URL('.', import.meta.url));
const bundleDirectory = fileURLToPath(
  new URL('../../output/character-preview/dist/', import.meta.url),
);
await mkdir(bundleDirectory, { recursive: true });
const bundle = await context({
  entryPoints: [join(directory, 'preview.js')],
  bundle: true,
  format: 'esm',
  outfile: join(bundleDirectory, 'preview.js'),
  sourcemap: true,
  logLevel: 'warning',
});
await bundle.rebuild();
if (process.argv.includes('--build-only')) {
  await bundle.dispose();
} else {
  await bundle.watch();
  createServer(async (req, res) => {
    const files = {
      '/': join(directory, 'index.html'),
      '/preview.js': join(bundleDirectory, 'preview.js'),
      '/preview.js.map': join(bundleDirectory, 'preview.js.map'),
    };
    const path = files[req.url];
    if (!path) {
      res.writeHead(404).end();
      return;
    }
    try {
      res.setHeader(
        'Content-Type',
        path.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8',
      );
      res.end(await readFile(path));
    } catch {
      res.writeHead(500).end('Preview unavailable');
    }
  }).listen(4430, '127.0.0.1', () => console.log('Character preview: http://localhost:4430'));
}
