import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** The API's prisma/ folder: schema.prisma and the migrations. */
export const PRISMA_DIRECTORY = path.resolve(__dirname, '../../prisma');

/** A `file:` URL Prisma accepts on every platform. */
export function sqliteUrl(file: string): string {
  return 'file:' + file.replace(/\\/g, '/');
}

/** Applies the migrations next to `schema` to the SQLite database at `url`. */
export function deployMigrations(
  url: string,
  schema = path.join(PRISMA_DIRECTORY, 'schema.prisma'),
): void {
  execFileSync(
    process.execPath,
    [require.resolve('prisma/build/index.js'), 'migrate', 'deploy', '--schema', schema],
    { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' },
  );
}

/**
 * A temporary SQLite database with every migration applied, for tests that run
 * real queries. DATABASE_URL points at it from setUp until tearDown, so import
 * the Prisma client only after setUp.
 */
export class MigratedDatabase {
  /** A private temporary folder; tests may keep other files in it too. */
  readonly directory: string;
  readonly file: string;
  readonly url: string;
  private readonly previousUrl = process.env.DATABASE_URL;

  constructor(prefix: string) {
    this.directory = mkdtempSync(path.join(tmpdir(), prefix));
    this.file = path.join(this.directory, 'test.db');
    this.url = sqliteUrl(this.file);
  }

  setUp(): void {
    writeFileSync(this.file, '');
    process.env.DATABASE_URL = this.url;
    this.migrate();
  }

  /** Applies any migration not yet recorded; deploying again changes nothing. */
  migrate(): void {
    deployMigrations(this.url);
  }

  tearDown(): void {
    if (this.previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = this.previousUrl;
    rmSync(this.directory, { recursive: true, force: true });
  }
}
