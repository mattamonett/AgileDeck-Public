import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import { MigratedDatabase, PRISMA_DIRECTORY, sqliteUrl } from '../helpers/migrated-database';

/** The SQL Prisma would run to turn the migrated database into schema.prisma. */
function pendingSchemaChanges(url: string, shadowFile: string): string {
  return execFileSync(
    process.execPath,
    [
      require.resolve('prisma/build/index.js'),
      'migrate',
      'diff',
      '--from-url',
      url,
      '--to-schema-datamodel',
      path.join(PRISMA_DIRECTORY, 'schema.prisma'),
      '--shadow-database-url',
      sqliteUrl(shadowFile),
      '--script',
    ],
    { encoding: 'utf8', stdio: 'pipe' },
  );
}

function normalize(sql: string): string {
  return sql
    .replace(/"/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')')
    .trim();
}

describe('migrations', () => {
  const database = new MigratedDatabase('poker-schema-drift-');
  afterAll(() => database.tearDown());

  it('build exactly the schema in schema.prisma', async () => {
    database.setUp();
    const script = pendingSchemaChanges(database.url, path.join(database.directory, 'shadow.db'));
    // Prisma always redefines SQLite tables whose columns use dbgenerated()
    // defaults, even when nothing changed. Accept such a redefinition only when
    // the table it would create is identical to the migrated one.
    const redefinitions = [...script.matchAll(/CREATE TABLE "new_(\w+)" \(([\s\S]*?)\n\);/g)];
    const redefined = new Set(redefinitions.map(([, table]) => table));
    const db = new PrismaClient({ datasources: { db: { url: database.url } } });
    const migratedSql = async (type: string, name: string) =>
      normalize(
        (
          await db.$queryRawUnsafe<{ sql: string }[]>(
            'SELECT sql FROM sqlite_master WHERE type = ? AND name = ?',
            type,
            name,
          )
        )[0]?.sql ?? '',
      );
    const unexplained: string[] = [];
    try {
      for (const [, table, body] of redefinitions)
        expect(await migratedSql('table', table ?? '')).toBe(
          normalize(`CREATE TABLE "${table}" (${body ?? ''})`),
        );
      const rest = script
        .replace(/CREATE TABLE "new_\w+" \([\s\S]*?\n\);/g, '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('--'));
      for (const line of rest) {
        const table =
          /^INSERT INTO "new_(\w+)" .* FROM "\1";$/.exec(line)?.[1] ??
          /^DROP TABLE "(\w+)";$/.exec(line)?.[1] ??
          /^ALTER TABLE "new_(\w+)" RENAME TO "\1";$/.exec(line)?.[1];
        if (table && redefined.has(table)) continue;
        if (/^PRAGMA (defer_foreign_keys|foreign_keys)=(ON|OFF);$/.test(line)) continue;
        // Recreating an index of a redefined table is fine when it already exists unchanged.
        const index = /^CREATE (?:UNIQUE )?INDEX "(\w+)" ON "(\w+)"/.exec(line);
        if (
          index &&
          redefined.has(index[2] ?? '') &&
          (await migratedSql('index', index[1] ?? '')) === normalize(line.replace(/;$/, ''))
        )
          continue;
        unexplained.push(line);
      }
    } finally {
      await db.$disconnect();
    }
    expect(unexplained).toEqual([]);
  }, 60_000);
});
