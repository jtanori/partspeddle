import postgres from 'postgres';
import { validateSupabaseEnv } from './env.js';
import { DomainError } from '../errors/domain-error.js';

/**
 * Shared PostgreSQL connection pool for raw SQL, transactions,
 * and the transactional outbox pattern.
 *
 * Uses the `postgres` library (lightweight, ESM-native) with:
 * - max 20 connections
 * - 5s connect timeout
 * - 5s statement_timeout via SET LOCAL
 * - idle connection cleanup
 *
 * @see /project-knowledge/service-role-governance.md
 */

let sharedPool: ReturnType<typeof postgres> | null = null;

export interface PoolConfig {
  readonly max?: number;
  readonly connectTimeout?: number;
  readonly idleTimeout?: number;
  readonly queryTimeoutMs?: number;
}

const DEFAULT_CONFIG: Required<PoolConfig> = {
  max: 20,
  connectTimeout: 5,
  idleTimeout: 20,
  queryTimeoutMs: 5000,
};

/**
 * Create or retrieve the shared PostgreSQL pool.
 *
 * Singleton pattern — all domains share one pool for MVP.
 */
export function createPool(config: PoolConfig = {}): ReturnType<typeof postgres> {
  if (!sharedPool) {
    const env = validateSupabaseEnv();
    const merged = { ...DEFAULT_CONFIG, ...config };

    sharedPool = postgres(env.databaseUrl, {
      max: merged.max,
      connect_timeout: merged.connectTimeout,
      idle_timeout: merged.idleTimeout,

      // Apply statement_timeout to every connection so queries are
      // cancelled by Postgres, not just by application-level Promise.race.
      connection: {
        statement_timeout: merged.queryTimeoutMs,
      },
    });
  }

  return sharedPool;
}

/**
 * Close the shared PostgreSQL pool.
 *
 * Used during graceful shutdown and tests.
 */
export async function closePool(): Promise<void> {
  if (sharedPool) {
    await sharedPool.end({ timeout: 5 });
    sharedPool = null;
  }
}

/**
 * Execute a callback within a transaction.
 *
 * The callback receives a transaction-scoped sql instance.
 * If the callback throws, the transaction is rolled back automatically.
 *
 * Example:
 * ```typescript
 * await executeInTransaction(async (tx) => {
 *   await tx`INSERT INTO outbox ...`;
 *   await tx`UPDATE sellers SET ...`;
 * });
 * ```
 */
export async function executeInTransaction<T>(
  callback: (tx: ReturnType<typeof postgres>) => Promise<T>,
): Promise<T> {
  const pool = createPool();

  const result = await pool.begin(async (tx) => {
    return await callback(tx);
  });

  return result as T;
}

/**
 * Application-level query timeout wrapper.
 *
 * **IMPORTANT:** This does NOT cancel the underlying Postgres query.
 * The query continues executing and consuming a connection slot until
 * Postgres's `statement_timeout` fires.
 *
 * Use this wrapper for:
 * - Fast-fail in application logic
 * - User-facing API endpoints
 *
 * True query cancellation is handled by `statement_timeout` in the pool config.
 */
export async function withTimeout<T>(query: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(
        new DomainError(
          'SHARED_DB_QUERY_TIMEOUT',
          `Query timed out after ${ms}ms`,
          'system',
          false,
        ),
      );
    }, ms);
  });

  return Promise.race([query, timeout]);
}
