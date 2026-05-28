import { describe, it, expect, vi } from 'vitest';
import { checkQueueHealth } from '../health.js';

function createMockQueue(
  name: string,
  counts: {
    waiting?: number;
    active?: number;
    completed?: number;
    failed?: number;
    delayed?: number;
  }
) {
  return {
    name,
    getWaitingCount: vi.fn().mockResolvedValue(counts.waiting ?? 0),
    getActiveCount: vi.fn().mockResolvedValue(counts.active ?? 0),
    getCompletedCount: vi.fn().mockResolvedValue(counts.completed ?? 0),
    getFailedCount: vi.fn().mockResolvedValue(counts.failed ?? 0),
    getDelayedCount: vi.fn().mockResolvedValue(counts.delayed ?? 0),
  } as unknown as import('bullmq').Queue;
}

describe('checkQueueHealth', () => {
  it('returns healthy when all queues are within thresholds', async () => {
    const queues = [
      createMockQueue('identity-onboarding', { waiting: 10, failed: 5 }),
      createMockQueue('transaction-orchestration', { waiting: 50, failed: 0 }),
    ];

    const result = await checkQueueHealth(queues);

    expect(result.healthy).toBe(true);
    expect(result.queues).toHaveLength(2);
    expect(result.queues[0].waiting).toBe(10);
    expect(result.queues[0].failed).toBe(5);
  });

  it('returns unhealthy when waiting exceeds threshold', async () => {
    const queues = [createMockQueue('identity-onboarding', { waiting: 1500, failed: 0 })];

    const result = await checkQueueHealth(queues);

    expect(result.healthy).toBe(false);
  });

  it('returns unhealthy when failed exceeds threshold', async () => {
    const queues = [createMockQueue('identity-onboarding', { waiting: 10, failed: 150 })];

    const result = await checkQueueHealth(queues);

    expect(result.healthy).toBe(false);
  });

  it('returns unhealthy when any queue exceeds thresholds', async () => {
    const queues = [
      createMockQueue('identity-onboarding', { waiting: 10, failed: 5 }),
      createMockQueue('transaction-orchestration', { waiting: 10, failed: 200 }),
    ];

    const result = await checkQueueHealth(queues);

    expect(result.healthy).toBe(false);
  });
});
