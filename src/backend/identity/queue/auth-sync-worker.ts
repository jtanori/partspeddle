/**
 * Auth Sync Worker
 *
 * Processes Supabase Auth webhook events from the identity-webhooks queue.
 * Mutates identity.users, identity.profiles, and emits domain events via outbox.
 *
 * Events:
 * - user.created → create identity.users + identity.profiles row
 * - user.updated → update identity.users email/status if changed
 * - user.deleted → soft-delete (status = deactivated)
 */

import type { Job } from 'bullmq';
import type postgres from 'postgres';
import type { JobPayload } from '../../shared/queue/worker-factory.js';
import { PostgresUserRepository } from '../infrastructure/persistence/user-repository.js';
import { logger } from '../../shared/observability/logger.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DomainEvent } from '../../../shared/event-bus/domain-event.js';
import { Outbox } from '../../../shared/outbox/outbox.js';
import { PostgresOutboxAdapter } from '../../shared/outbox/postgres-adapter.js';

export interface AuthSyncWorkerDeps {
  readonly sql: ReturnType<typeof postgres>;
}

export async function authSyncProcessor(
  deps: AuthSyncWorkerDeps,
  job: Job<JobPayload>,
): Promise<void> {
  const { data, metadata } = job.data;
  const correlationId = metadata.correlationId;
  const eventType = data.eventType as string;
  const userId = data.userId as string;

  logger.info('Processing auth sync job', {
    eventType,
    userId,
    jobId: job.id,
    correlationId,
  });

  const userRepo = new PostgresUserRepository(deps.sql);

  switch (eventType) {
    case 'user.created': {
      const email = data.email as string;

      // Idempotent: check if user already exists
      const existing = await userRepo.findById(userId);
      if (existing) {
        logger.info('User already exists, skipping creation', { userId, correlationId });
        return;
      }

      // Persist user + profile + outbox event atomically
      await deps.sql.begin(async (tx) => {
        await tx`
          INSERT INTO identity.users (id, email, status, created_at, updated_at)
          VALUES (${userId}, ${email}, 'active', NOW(), NOW())
          ON CONFLICT (id) DO NOTHING
        `;

        await tx`
          INSERT INTO identity.profiles (id, user_id, created_at, updated_at)
          VALUES (${crypto.randomUUID()}, ${userId}, NOW(), NOW())
          ON CONFLICT (id) DO NOTHING
        `;

        const event = new DomainEvent({
          eventType: 'identity.user_created',
          correlationId,
          actorId: 'system',
          domain: 'identity',
          aggregateId: userId,
          payload: { userId, email },
        });

        const outbox = new Outbox(new PostgresOutboxAdapter(tx));
        await outbox.insert(event);
      });

      logger.info('User and profile created from webhook', { userId, email, correlationId });
      break;
    }

    case 'user.updated': {
      const email = data.email as string;
      const user = await userRepo.findById(userId);

      if (!user) {
        // Out-of-order: update received before create
        logger.warn('User not found for update, will retry', { userId, correlationId });
        throw new DomainError(
          'IDENTITY_AUTH_SYNC_USER_NOT_FOUND',
          `User ${userId} not found for update. Possible out-of-order webhook.`,
          correlationId,
          true, // retryable
        );
      }

      // Only save if email changed (status changes are handled by domain methods)
      if (email && email !== user.email) {
        // Note: User aggregate does not support email mutation currently.
        // For MVP, we update directly via repository or re-create.
        // Since email is readonly on the aggregate, we use raw SQL via repo.
        await deps.sql`
          UPDATE identity.users
          SET email = ${email}, updated_at = NOW()
          WHERE id = ${userId}
        `;
        logger.info('User email updated from webhook', { userId, email, correlationId });
      }
      break;
    }

    case 'user.deleted': {
      const user = await userRepo.findById(userId);

      if (!user) {
        logger.info('User not found for deletion, already cleaned up', { userId, correlationId });
        return;
      }

      // Soft-delete via status change
      // Note: User aggregate has no 'deactivate' method yet; use raw SQL for MVP
      await deps.sql`
        UPDATE identity.users
        SET status = 'deactivated', updated_at = NOW()
        WHERE id = ${userId}
      `;

      logger.info('User soft-deleted from webhook', { userId, correlationId });
      break;
    }

    default:
      logger.warn('Unknown auth sync event type', { eventType, userId, correlationId });
  }
}
