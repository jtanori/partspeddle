/**
 * Webhook Worker
 *
 * BullMQ worker wrapper that consumes from the `identity-webhooks` queue
 * and delegates to the auth sync processor.
 */

import type { Job } from 'bullmq';
import type postgres from 'postgres';
import type { JobPayload } from '../../shared/queue/worker-factory.js';
import { authSyncProcessor } from './auth-sync-worker.js';

export interface WebhookWorkerDeps {
  readonly sql: ReturnType<typeof postgres>;
}

export async function webhookProcessor(
  deps: WebhookWorkerDeps,
  job: Job<JobPayload>
): Promise<void> {
  await authSyncProcessor(deps, job);
}
