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
import { assertPreflight } from './lib/infra-preflight.js';

// ─── Configuration ──────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/**
 * Centralized registry of tables to reset between tests.
 * No ad-hoc truncation inside tests.
 */
const TEST_RESET_TABLES = [
  'outbox',
  'identity.users',
  'identity.profiles',
  'identity.seller_profiles',
  'identity.buyer_profiles',
  'identity.onboarding_steps',
];

// ─── Shared State ───────────────────────────────────────────────────────────

let sql: ReturnType<typeof postgres>;
let redis: Redis;
let preflightPassed = false;

// ─── Lifecycle Hooks ────────────────────────────────────────────────────────

beforeAll(async () => {
  // Fast-fail if infrastructure is unavailable
  await assertPreflight();
  preflightPassed = true;

  sql = postgres(DATABASE_URL, {
    max: 5,
    connect_timeout: 2,
    onnotice: () => {}, // suppress NOTICE spam during tests
  });

  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    connectTimeout: 1000,
  });

  // Flush Redis to ensure clean state
  await redis.flushdb();

  // Suppress Postgres NOTICE messages for this session
  await sql`SET client_min_messages TO WARNING`;

  // Verify DB connectivity
  const result = await sql`SELECT 1 as connected`;
  if (result[0].connected !== 1) {
    throw new Error('Database connectivity check failed');
  }
});

afterAll(async () => {
  if (!preflightPassed) return;
  await sql.end({ timeout: 2 });
  await redis.quit();
});

beforeEach(async () => {
  if (!preflightPassed) return;
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
