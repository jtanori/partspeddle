/**
 * Session Worker
 *
 * Processes session revocation jobs from the `identity-sessions` queue.
 * Invalidates all active sessions for a user via the IdentityProvider.
 */

import type { Job } from 'bullmq';
import type { JobPayload } from '../../shared/queue/worker-factory.js';
import type { IdentityProvider } from '../application/ports/identity-provider.js';
import { logger } from '../../shared/observability/logger.js';

export interface SessionWorkerDeps {
  readonly identityProvider: IdentityProvider;
}

export async function sessionProcessor(
  deps: SessionWorkerDeps,
  job: Job<JobPayload>,
): Promise<void> {
  const { data, metadata } = job.data;
  const correlationId = metadata.correlationId;
  const userId = data.userId as string;

  logger.info('Processing session revocation', {
    userId,
    jobId: job.id,
    correlationId,
  });

  await deps.identityProvider.revokeSessions(userId);

  logger.info('Session revocation complete', {
    userId,
    correlationId,
  });
}
