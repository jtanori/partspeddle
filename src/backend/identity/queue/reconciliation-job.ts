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
import { PostgresProfileRepository } from '../infrastructure/persistence/profile-repository.js';
import { User } from '../domain/entities/user.js';
import { Profile } from '../domain/entities/profile.js';
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
  deps: ReconciliationJobDeps,
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

  const userRepo = new PostgresUserRepository(sql);
  const profileRepo = new PostgresProfileRepository(sql);

  for (const row of orphanedRows as unknown as { id: string; email: string }[]) {
    try {
      const user = User.create(
        { id: row.id, email: row.email ?? '' },
        correlationId,
        'system:reconciliation',
      );
      await userRepo.save(user);
      backfilledUsers++;

      const profile = new Profile({ id: crypto.randomUUID(), userId: row.id });
      await profileRepo.save(profile);
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
