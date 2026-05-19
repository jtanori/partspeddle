/**
 * Vitest Integration Test Setup
 *
 * Provides global lifecycle hooks for integration tests:
 * - DB connection pool initialization
 * - Redis connection initialization
 * - Table truncation between tests (isolation)
 * - Redis flush between test suites
 *
 * @see /project-knowledge/runtime-governance.md
 */

import { beforeAll, afterAll, beforeEach } from 'vitest';
import postgres from 'postgres';
import Redis from 'ioredis';

// ─── Configuration ──────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/**
 * Centralized registry of tables to reset between tests.
 * No ad-hoc truncation inside tests.
 */
const TEST_RESET_TABLES = [
  'outbox',
  'identity.profiles',
  'identity.seller_profiles',
  'identity.buyer_profiles',
  'identity.onboarding_steps',
];

// ─── Shared State ───────────────────────────────────────────────────────────

let sql: ReturnType<typeof postgres>;
let redis: Redis;

// ─── Lifecycle Hooks ────────────────────────────────────────────────────────

beforeAll(async () => {
  sql = postgres(DATABASE_URL, {
    max: 5,
    connect_timeout: 10,
  });

  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  // Flush Redis to ensure clean state
  await redis.flushdb();

  // Verify DB connectivity
  const result = await sql`SELECT 1 as connected`;
  if (result[0]?.connected !== 1) {
    throw new Error('Database connectivity check failed');
  }
});

afterAll(async () => {
  await sql?.end({ timeout: 5 });
  await redis?.quit();
});

beforeEach(async () => {
  // Reset all registered tables between tests
  for (const table of TEST_RESET_TABLES) {
    try {
      await sql`TRUNCATE TABLE ${sql(table)} RESTART IDENTITY CASCADE`;
    } catch {
      // Table may not exist yet (migration not applied in this context)
      // Silently skip — tests for non-existent tables will fail appropriately
    }
  }
});

// ─── Exports for tests ──────────────────────────────────────────────────────

export { sql, redis };
