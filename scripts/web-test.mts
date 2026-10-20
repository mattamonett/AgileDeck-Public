// Runs the web unit tests with a limited set of character (throw-scene) specs.
//
// Each character spec plays its whole animation frame by frame, so together they are most
// of the web test time. Every other web spec always runs. Of the throw-scene specs, only
// the two heaviest characters run, plus any spec whose imports (followed through web/src)
// include a file that changed since the base. A change to shared helper code therefore runs
// every spec that uses it, and a dependency or test config change runs them all.
//
// Base: TEST_BASE if set (CI), else origin/main, else main. Uncommitted and untracked
// files count as changed. `--all` runs everything; other arguments pass through to ng test.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, 'web');
const sceneDir = 'web/src/app/features/room/throw-scene/';
const ALWAYS = new Set([
  `${sceneDir}characters/rocket/rocket-trick.spec.ts`,
  `${sceneDir}characters/car/racing-car.spec.ts`,
]);
// Changes that can affect every spec at once.
const RUN_ALL_PATTERNS = [
  /^package(-lock)?\.json$/,
  /^web\/package(-lock)?\.json$/,
  /^web\/(angular|tsconfig[^/]*)\.json$/,
  /^web\/vitest\.config\.mjs$/,
  /^scripts\/web-test\.mts$/,
];

const args = process.argv.slice(2);
const runAll = args.includes('--all');
const passThrough = args.filter((arg) => arg !== '--all');

function git(...gitArgs: string[]): string {
  return execFileSync('git', gitArgs, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Repo-relative paths changed since the merge base with the base ref, or null when unknown. */
function changedFiles(): string[] | null {
  const candidates = process.env['TEST_BASE']
    ? [process.env['TEST_BASE']]
    : ['origin/main', 'main'];
  for (const base of candidates) {
    if (!base || /^0+$/.test(base)) continue;
    try {
      const mergeBase = git('merge-base', base, 'HEAD').trim();
      return [
        ...lines(git('diff', '--name-only', mergeBase)),
        ...lines(git('ls-files', '--others', '--exclude-standard')),
      ];
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function specFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return specFiles(path);
    return /\.(spec|test)\.ts$/.test(entry.name) ? [relative(root, path)] : [];
  });
}

const importPattern = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

/** Repo-relative path prefixes for the web tsconfig path aliases that point into web/src. */
function webAliases(): [alias: string, target: string][] {
  const configPath = join(web, 'tsconfig.json');
  const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
  const paths: Record<string, string[]> = config?.compilerOptions?.paths ?? {};
  return Object.entries(paths).flatMap(([alias, [target]]) => {
    if (!target || !alias.endsWith('/*') || !target.endsWith('/*')) return [];
    const resolved = relative(root, join(web, target.slice(0, -1)));
    return resolved.startsWith('web/src/')
      ? [[alias.slice(0, -1), `${resolved}/`] as [string, string]]
      : [];
  });
}
const aliases = webAliases();

/** The repo-relative path an import specifier names, or null for a package import. */
function importTarget(file: string, specifier: string): string | null {
  if (specifier.startsWith('.')) return join(dirname(file), specifier);
  const alias = aliases.find(([prefix]) => specifier.startsWith(prefix));
  return alias ? alias[1] + specifier.slice(alias[0].length) : null;
}
// A file that imports this many local modules is a hub, such as the renderer or model
// registry that pulls in every character. Following imports through a hub would tie every
// spec to every character, so only the hub's own spec (hub.spec.ts) looks through it.
const HUB_IMPORTS = 15;
const importCache = new Map<string, string[]>();

/** Repo-relative web source files the given file imports directly. */
function importsOf(file: string): string[] {
  const cached = importCache.get(file);
  if (cached) return cached;
  const imports: string[] = [];
  const source = readFileSync(join(root, file), 'utf8');
  for (const match of source.matchAll(importPattern)) {
    const target = importTarget(file, match[1] ?? '');
    if (!target) continue;
    const path = [`${target}.ts`, join(target, 'index.ts'), target].find(
      (candidate) => /\.(ts|mjs|js)$/.test(candidate) && existsSync(join(root, candidate)),
    );
    if (path) imports.push(path);
  }
  importCache.set(file, imports);
  return imports;
}

/** The spec and the web source files it depends on, not looking through other specs' hubs. */
function specDependencies(spec: string): Set<string> {
  const ownSource = spec.replace(/\.(spec|test)\.ts$/, '.ts');
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    const imports = importsOf(file);
    if (file !== ownSource && imports.length >= HUB_IMPORTS) return;
    seen.add(file);
    imports.forEach(visit);
  };
  visit(spec);
  return seen;
}

function selectSpecs(): { specs: string[]; reason: string } {
  const all = specFiles(join(web, 'src'));
  if (runAll) return { specs: all, reason: '--all' };
  const changed = changedFiles();
  if (!changed) return { specs: all, reason: 'no base to compare against' };
  if (changed.some((file) => RUN_ALL_PATTERNS.some((pattern) => pattern.test(file))))
    return { specs: all, reason: 'a dependency or test config file changed' };
  const changedSet = new Set(changed);
  const specs = all.filter(
    (spec) =>
      !spec.startsWith(sceneDir) ||
      ALWAYS.has(spec) ||
      [...specDependencies(spec)].some((file) => changedSet.has(file)),
  );
  return { specs, reason: 'limited character tests' };
}

const { specs, reason } = selectSpecs();
const scene = specs.filter((spec) => spec.startsWith(sceneDir));
console.log(
  `Web tests (${reason}): ${specs.length} spec files, ${scene.length} of them throw-scene:` +
    scene.map((spec) => `\n  ${spec.slice(sceneDir.length)}`).join(''),
);
const result = spawnSync(
  'npx',
  [
    'ng',
    'test',
    '--watch=false',
    ...(reason === 'limited character tests'
      ? specs.map((spec) => `--include=${relative(web, join(root, spec))}`)
      : []),
    ...passThrough,
  ],
  { cwd: web, stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
