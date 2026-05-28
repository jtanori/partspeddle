/**
 * Test Database Setup Script
 *
 * Programmatically creates the test database schema by running migrations
 * in lexicographic order. Validates migration naming and rejects duplicates.
 *
 * Usage:
 *   npx tsx tests/scripts/setup-test-db.ts
 *
 * Environment:
 *   DATABASE_URL — required
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import postgres from 'postgres';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

interface Migration {
  filename: string;
  timestamp: string;
  sql: string;
}

/**
 * Extract YYYYMMDDHHMMSS timestamp from migration filename.
 */
function extractTimestamp(filename: string): string | null {
  const match = /^(\d{14})_/.exec(filename);
  return match?.[1] ?? null;
}

/**
 * Validate migration filename format: YYYYMMDDHHMMSS_description.sql
 */
function validateFilename(filename: string): boolean {
  return /^\d{14}_[a-z0-9_]+\.sql$/.test(filename);
}

/**
 * Load and validate all migrations from the migrations directory.
 * Sorted lexicographically (timestamp order).
 */
async function loadMigrations(): Promise<Migration[]> {
  const files = await readdir(MIGRATIONS_DIR);
  const sqlFiles = files.filter((f) => f.endsWith('.sql'));

  const migrations: Migration[] = [];
  const timestamps = new Set<string>();

  for (const filename of sqlFiles) {
    if (!validateFilename(filename)) {
      throw new Error(
        `Invalid migration filename: ${filename}. ` +
          `Expected format: YYYYMMDDHHMMSS_description.sql (lowercase, underscores only)`
      );
    }

    const timestamp = extractTimestamp(filename);
    if (!timestamp) {
      throw new Error(`Could not extract timestamp from: ${filename}`);
    }

    if (timestamps.has(timestamp)) {
      throw new Error(`Duplicate migration timestamp: ${timestamp}`);
    }
    timestamps.add(timestamp);

    const sql = await readFile(join(MIGRATIONS_DIR, filename), 'utf-8');
    migrations.push({ filename, timestamp, sql });
  }

  // Sort lexicographically by filename (which sorts by timestamp prefix)
  migrations.sort((a, b) => a.filename.localeCompare(b.filename));

  return migrations;
}

/**
 * Run all migrations in a single transaction.
 * If any migration fails, the entire transaction is rolled back.
 */
async function runMigrations(sql: ReturnType<typeof postgres>): Promise<void> {
  const migrations = await loadMigrations();

  // eslint-disable-next-line no-console
  console.log(`Found ${migrations.length} migration(s):`);
  for (const m of migrations) {
    // eslint-disable-next-line no-console
    console.log(`  - ${m.filename}`);
  }

  await sql.begin(async (tx) => {
    for (const migration of migrations) {
      // eslint-disable-next-line no-console
      console.log(`Applying: ${migration.filename}`);
      await tx.unsafe(migration.sql);
    }
  });

  // eslint-disable-next-line no-console
  console.log('All migrations applied successfully.');
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 10,
  });

  try {
    // Verify connectivity
    const result = await sql`SELECT 1 as connected`;
    // eslint-disable-next-line no-console
    console.log(`Database connected: ${result[0].connected === 1}`);

    await runMigrations(sql);
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('Database setup failed:', message);
  process.exit(1);
});
