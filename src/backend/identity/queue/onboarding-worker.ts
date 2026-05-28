/**
 * Onboarding Worker
 *
 * Processes onboarding step completion jobs from the `identity-onboarding` queue.
 * Updates seller profile status and emits domain events.
 */

import type { Job } from 'bullmq';
import type postgres from 'postgres';
import type { JobPayload } from '../../shared/queue/worker-factory.js';
import { PostgresSellerProfileRepository } from '../infrastructure/persistence/seller-profile-repository.js';
import { logger } from '../../shared/observability/logger.js';
import { DomainError } from '../../../shared/errors/domain-error.js';

export interface OnboardingWorkerDeps {
  readonly sql: ReturnType<typeof postgres>;
}

export async function onboardingProcessor(
  deps: OnboardingWorkerDeps,
  job: Job<JobPayload>
): Promise<void> {
  const { data, metadata } = job.data;
  const correlationId = metadata.correlationId;
  const userId = data.userId as string;
  const step = data.step as 'identity' | 'banking' | 'tax' | 'terms';

  logger.info('Processing onboarding step', {
    userId,
    step,
    jobId: job.id,
    correlationId,
  });

  const repo = new PostgresSellerProfileRepository(deps.sql);
  const profile = await repo.findByUserId(userId);

  if (!profile) {
    throw new DomainError(
      'IDENTITY_SELLER_NOT_FOUND',
      `Seller profile not found for user ${userId}`,
      correlationId,
      false
    );
  }

  profile.completeOnboardingStep(step, correlationId, userId);
  await repo.save(profile);

  logger.info('Onboarding step completed', {
    userId,
    step,
    completedSteps: profile.onboardingState.completedSteps,
    correlationId,
  });
}
