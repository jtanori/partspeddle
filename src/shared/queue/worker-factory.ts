import { Worker, type Job, type WorkerOptions } from 'bullmq';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { DomainError } from '../errors/domain-error.js';

/**
 * Canonical job payload shape enforced by all workers.
 *
 * @see /project-knowledge/queue-contracts.md
 */
export interface JobPayload {
  readonly data: Record<string, unknown>;
  readonly metadata: {
    readonly correlationId: string;
    readonly causationId?: string;
    readonly actorId: string;
    readonly attempt: number;
    readonly enqueuedAt: string;
  };
}

export type Processor = (job: Job<JobPayload>) => Promise<unknown>;

export interface WorkerFactoryOptions {
  readonly concurrency?: number;
  readonly limiter?: WorkerOptions['limiter'];
  readonly workerOptions?: Omit<WorkerOptions, 'connection' | 'concurrency' | 'limiter'>;
}

/**
 * Wraps a processor to validate the JobPayload shape before execution.
 */
function wrapProcessor(processor: Processor): Processor {
  return async (job: Job<JobPayload>) => {
    const payload = job.data;

    const meta = payload.metadata as Record<string, unknown>;
    if (typeof meta.correlationId !== 'string' || !meta.correlationId) {
      throw new DomainError(
        'SHARED_QUEUE_INVALID_PAYLOAD',
        'Job metadata must include correlationId',
        job.id ?? 'unknown',
        false,
      );
    }

    if (typeof meta.actorId !== 'string' || !meta.actorId) {
      throw new DomainError(
        'SHARED_QUEUE_INVALID_PAYLOAD',
        'Job metadata must include actorId',
        job.id ?? 'unknown',
        false,
      );
    }

    return processor(job);
  };
}

/**
 * Create a BullMQ worker with DLQ wiring and payload validation.
 *
 * On final failure (all retries exhausted), the job is moved to the DLQ queue
 * and removed from the original queue.
 *
 * @param queue - Main BullMQ queue being consumed
 * @param dlq - Dead-letter queue for exhausted jobs
 * @param processor - Business logic processor
 * @param redis - ioredis connection instance
 * @param options - Worker configuration
 */
export function createDomainWorker(
  queue: Queue,
  dlq: Queue,
  processor: Processor,
  redis: Redis,
  options: WorkerFactoryOptions = {},
): Worker {
  const wrapped = wrapProcessor(processor);

  const worker = new Worker<JobPayload>(
    queue.name,
    wrapped,
    {
      connection: redis,
      concurrency: options.concurrency ?? 5,
      ...options.workerOptions,
      ...(options.limiter ? { limiter: options.limiter } : {}),
    },
  );

  worker.on('failed', (job, _err) => {
    void (async () => {
      if (!job) return;

      const attemptsMade = job.attemptsMade;
      const totalAttempts = job.opts.attempts ?? 1;

      if (attemptsMade >= totalAttempts) {
        // Move to DLQ
        try {
          await dlq.add(job.name, job.data, {
            jobId: job.id ?? undefined,
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 0 },
          });
          await job.remove();
        } catch (dlqError) {
          // If DLQ insertion fails, leave the failed job in place for manual inspection
          console.error('Failed to move job to DLQ:', dlqError);
        }
      }
    })();
  });

  return worker;
}

/**
 * Gracefully close a worker.
 */
export async function closeWorker(worker: Worker): Promise<void> {
  await worker.close();
}
