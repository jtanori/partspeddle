import type { Queue } from 'bullmq';

export interface QueueStatus {
  readonly name: string;
  readonly waiting: number;
  readonly active: number;
  readonly completed: number;
  readonly failed: number;
  readonly delayed: number;
}

export interface QueueHealthResult {
  readonly healthy: boolean;
  readonly queues: readonly QueueStatus[];
}

/**
 * Thresholds for queue health determination.
 */
const HEALTH_THRESHOLDS = {
  maxWaiting: 1000,
  maxFailed: 100,
};

/**
 * Check the health of all provided queues.
 *
 * A queue system is considered healthy if every queue has:
 * - waiting count below 1000
 * - failed count below 100
 */
export async function checkQueueHealth(queues: Queue[]): Promise<QueueHealthResult> {
  const statuses = await Promise.all(
    queues.map(async (queue) => {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);

      return {
        name: queue.name,
        waiting,
        active,
        completed,
        failed,
        delayed,
      };
    })
  );

  const healthy = statuses.every(
    (s) => s.waiting < HEALTH_THRESHOLDS.maxWaiting && s.failed < HEALTH_THRESHOLDS.maxFailed
  );

  return { healthy, queues: statuses };
}
