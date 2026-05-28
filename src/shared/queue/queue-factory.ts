import { Queue, type JobsOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import { deriveQueueNames } from './naming.js';

/**
 * Default retry policy for all domain queues.
 *
 * @see /project-knowledge/queue-contracts.md
 */
export const DEFAULT_RETRY_POLICY: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: {
    count: 100,
  },
  removeOnFail: {
    count: 0, // Keep all failed jobs until worker moves them to DLQ
  },
};

export interface DomainQueuePair {
  readonly queue: Queue;
  readonly dlq: Queue;
}

/**
 * Create a domain-scoped BullMQ queue with its companion DLQ.
 *
 * @param domain - Owning bounded context (e.g., 'identity')
 * @param purpose - Queue purpose (e.g., 'onboarding')
 * @param redis - ioredis connection instance
 * @param defaultJobOptions - Override default retry policy
 */
export function createDomainQueue(
  domain: string,
  purpose: string,
  redis: Redis,
  defaultJobOptions?: JobsOptions
): DomainQueuePair {
  const names = deriveQueueNames(domain, purpose);

  const queue = new Queue(names.queue, {
    connection: redis,
    defaultJobOptions: {
      ...DEFAULT_RETRY_POLICY,
      ...defaultJobOptions,
    },
  });

  const dlq = new Queue(names.dlq, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 0 },
    },
  });

  return { queue, dlq };
}
