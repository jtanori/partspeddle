import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDomainWorker, closeWorker } from '../worker-factory.js';
import { DomainError } from '../../errors/domain-error.js';

// Minimal mock for BullMQ Worker
const mockOn = vi.fn();
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock('bullmq', async () => {
  const actual = await vi.importActual<typeof import('bullmq')>('bullmq');
  return {
    ...actual,
    Worker: vi.fn().mockImplementation(() => ({
      on: mockOn,
      close: mockClose,
      name: 'mock-worker',
    })),
  };
});

import { Worker } from 'bullmq';

describe('createDomainWorker', () => {
  const mockRedis = {} as unknown as import('ioredis').Redis;
  const mockQueue = { name: 'identity-onboarding' } as unknown as import('bullmq').Queue;
  const mockDlq = {
    name: 'identity-onboarding-dlq',
    add: vi.fn().mockResolvedValue(undefined),
  } as unknown as import('bullmq').Queue;
  const processor = vi.fn().mockResolvedValue({ ok: true });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a worker with the queue name', () => {
    createDomainWorker(mockQueue, mockDlq, processor, mockRedis);

    expect(Worker).toHaveBeenCalledWith(
      'identity-onboarding',
      expect.any(Function),
      expect.objectContaining({
        connection: mockRedis,
        concurrency: 5,
      })
    );
  });

  it('allows custom concurrency', () => {
    createDomainWorker(mockQueue, mockDlq, processor, mockRedis, { concurrency: 10 });

    expect(Worker).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      expect.objectContaining({ concurrency: 10 })
    );
  });

  it('registers failed event handler for DLQ wiring', () => {
    createDomainWorker(mockQueue, mockDlq, processor, mockRedis);

    expect(mockOn).toHaveBeenCalledWith('failed', expect.any(Function));
  });

  it('wraps processor and validates payload shape', async () => {
    createDomainWorker(mockQueue, mockDlq, processor, mockRedis);

    // Extract the wrapped processor from Worker constructor call
    const calls = vi.mocked(Worker).mock.calls;
    const wrappedProcessor = calls[0][1] as (job: unknown) => Promise<unknown>;

    const validJob = {
      id: 'job-1',
      data: {
        data: { foo: 'bar' },
        metadata: {
          correlationId: '550e8400-e29b-41d4-a716-446655440000',
          actorId: 'system',
          attempt: 1,
          enqueuedAt: new Date().toISOString(),
        },
      },
    };

    await wrappedProcessor(validJob);
    expect(processor).toHaveBeenCalledWith(validJob);
  });

  it('rejects payload missing metadata', async () => {
    createDomainWorker(mockQueue, mockDlq, processor, mockRedis);

    const calls = vi.mocked(Worker).mock.calls;
    const wrappedProcessor = calls[0][1] as (job: unknown) => Promise<unknown>;

    const invalidJob = {
      id: 'job-2',
      data: { data: { foo: 'bar' } }, // missing metadata
    };

    await expect(wrappedProcessor(invalidJob)).rejects.toBeInstanceOf(DomainError);
  });

  it('rejects payload missing correlationId', async () => {
    createDomainWorker(mockQueue, mockDlq, processor, mockRedis);

    const calls = vi.mocked(Worker).mock.calls;
    const wrappedProcessor = calls[0][1] as (job: unknown) => Promise<unknown>;

    const invalidJob = {
      id: 'job-3',
      data: {
        data: { foo: 'bar' },
        metadata: {
          actorId: 'system',
          attempt: 1,
          enqueuedAt: new Date().toISOString(),
        },
      },
    };

    await expect(wrappedProcessor(invalidJob)).rejects.toBeInstanceOf(DomainError);
  });
});

describe('closeWorker', () => {
  it('closes the worker', async () => {
    const worker = { close: vi.fn().mockResolvedValue(undefined) } as unknown as Worker;

    await closeWorker(worker);

    expect(worker.close).toHaveBeenCalled();
  });
});
