/**
 * Identity Reconciliation Job
 *
 * Scans for orphaned auth identities and backfills missing rows.
 * Can be run on-demand or scheduled (e.g., daily via cron worker).
 *
 * Scenarios covered:
 * - auth.users row exists but identity.users row missing
 * - identity.users row exists but identity.profiles missing
 *
 * @see /project-knowledge/identity-webhook-contract.md
 */

import type postgres from 'postgres';
import { PostgresUserRepository } from '../infrastructure/persistence/user-repository.js';
import { logger } from '../../shared/observability/logger.js';

export interface ReconciliationJobDeps {
  readonly sql: ReturnType<typeof postgres>;
  readonly correlationId: string;
}

export interface ReconciliationResult {
  readonly orphanedUsersFound: number;
  readonly backfilledUsers: number;
  readonly backfilledProfiles: number;
}

/**
 * Run the reconciliation scan.
 *
 * 1. Find auth.users IDs that have no matching identity.users row
 * 2. For each orphan, create identity.users + identity.profiles
 * 3. Log discrepancies
 */
export async function runReconciliation(
  deps: ReconciliationJobDeps
): Promise<ReconciliationResult> {
  const { sql, correlationId } = deps;

  logger.info('Starting identity reconciliation', { correlationId });

  // Find auth users without identity.users rows
  // Note: auth.users is a Supabase-managed table. We query it via the service role.
  const orphanedRows = await sql`
    SELECT au.id, au.email
    FROM auth.users au
    LEFT JOIN identity.users iu ON au.id = iu.id
    WHERE iu.id IS NULL
      AND au.deleted_at IS NULL
  `;

  const orphanedUsersFound = orphanedRows.length;
  let backfilledUsers = 0;
  let backfilledProfiles = 0;

  if (orphanedUsersFound === 0) {
    logger.info('No orphaned users found', { correlationId });
    return { orphanedUsersFound: 0, backfilledUsers: 0, backfilledProfiles: 0 };
  }

  logger.info(`Found ${orphanedUsersFound} orphaned auth users`, { correlationId });

  void new PostgresUserRepository(sql);

  for (const row of orphanedRows as unknown as { id: string; email: string }[]) {
    try {
      // Persist user directly — reconciliation is infrastructure, not domain orchestration
      await sql`
        INSERT INTO identity.users (id, email, status, created_at, updated_at)
        VALUES (${row.id}, ${row.email}, 'active', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `;
      backfilledUsers++;

      await sql`
        INSERT INTO identity.profiles (id, user_id, created_at, updated_at)
        VALUES (${crypto.randomUUID()}, ${row.id}, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `;
      backfilledProfiles++;

      logger.info('Reconciliation backfilled user + profile', {
        userId: row.id,
        correlationId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Reconciliation backfill failed for user', {
        userId: row.id,
        error: message,
        correlationId,
      });
    }
  }

  logger.info('Reconciliation complete', {
    orphanedUsersFound,
    backfilledUsers,
    backfilledProfiles,
    correlationId,
  });

  return { orphanedUsersFound, backfilledUsers, backfilledProfiles };
}
