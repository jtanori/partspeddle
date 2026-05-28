/**
 * Infrastructure Preflight Checks
 *
 * Fast-fail validation for external dependencies.
 * Used by integration tests and CI to avoid misleading "hang" states.
 *
 * @see project-governance/runtime/runtime-governance-kernel.md Section 14
 */

import Redis from 'ioredis';
import postgres from 'postgres';

export interface PreflightResult {
  readonly ok: boolean;
  readonly redis: boolean;
  readonly postgres: boolean;
  readonly errors: string[];
}

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres';

/**
 * Check Redis availability with aggressive timeout.
 * Target: <500ms for test environments.
 */
async function checkRedis(): Promise<boolean> {
  const redis = new Redis(REDIS_URL, {
    connectTimeout: 500,
    maxRetriesPerRequest: 0,
    enableReadyCheck: false,
    lazyConnect: true,
  });
  try {
    await redis.connect();
    await redis.ping();
    await redis.quit();
    return true;
  } catch {
    try {
      redis.disconnect();
    } catch {
      // intentional noop — disconnect failure already means Redis is down
    }
    return false;
  }
}

/**
 * Check Postgres availability with aggressive timeout.
 * Target: <1000ms for test environments.
 */
async function checkPostgres(): Promise<boolean> {
  const sql = postgres(DATABASE_URL, {
    max: 1,
    connect_timeout: 1,
  });
  try {
    const result = await sql`SELECT 1 as connected`;
    await sql.end({ timeout: 1 });
    return result[0].connected === 1;
  } catch {
    try {
      await sql.end({ timeout: 1 });
    } catch {
      // intentional noop — end failure already means Postgres is down
    }
    return false;
  }
}

/**
 * Run full preflight check.
 * Returns detailed status for each dependency.
 */
export async function runPreflight(): Promise<PreflightResult> {
  const [redis, pg] = await Promise.all([checkRedis(), checkPostgres()]);
  const errors: string[] = [];

  if (!redis) errors.push(`Redis unavailable at ${REDIS_URL}`);
  if (!pg) errors.push(`Postgres unavailable at ${DATABASE_URL}`);

  return {
    ok: redis && pg,
    redis,
    postgres: pg,
    errors,
  };
}

/**
 * Assert preflight passes or throw with actionable error.
 */
export async function assertPreflight(): Promise<void> {
  const result = await runPreflight();
  if (!result.ok) {
    throw new Error(
      `INFRA_PRECHECK FAILED:\n${result.errors.map((e) => `  - ${e}`).join('\n')}\n\n` +
        `Start infrastructure: npm run infra:up\n` +
        `Or skip integration tests: vitest run --config vitest.unit.config.ts`
    );
  }
}
