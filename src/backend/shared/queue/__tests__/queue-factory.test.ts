import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDomainQueue, DEFAULT_RETRY_POLICY } from '../queue-factory.js';

// Mock BullMQ to avoid Redis dependency in unit tests
vi.mock('bullmq', () => ({
  Queue: Object.setPrototypeOf(function (this: unknown, name: string, opts?: unknown) {
    // @ts-expect-error - mock constructor property assignment
    this.name = name;
    // @ts-expect-error - mock constructor property assignment
    this.opts = opts ?? {};
  }, Object.getPrototypeOf(vi.fn())),
}));

describe('createDomainQueue', () => {
  const mockRedis = {} as unknown as import('ioredis').Redis;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates main queue and DLQ with correct names', () => {
    const { queue, dlq } = createDomainQueue('identity', 'onboarding', mockRedis);

    expect(queue.name).toBe('identity-onboarding');
    expect(dlq.name).toBe('identity-onboarding-dlq');
  });

  it('applies default retry policy to main queue', () => {
    const { queue } = createDomainQueue('identity', 'onboarding', mockRedis);

    // @ts-expect-error - accessing internal mock opts for verification
    expect(queue.opts.defaultJobOptions).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
  });

  it('allows overriding default job options', () => {
    const customOptions = { attempts: 5, backoff: { type: 'fixed', delay: 1000 } };
    const { queue } = createDomainQueue('identity', 'onboarding', mockRedis, customOptions);

    // @ts-expect-error - accessing internal mock opts for verification
    expect(queue.opts.defaultJobOptions.attempts).toBe(5);
    // @ts-expect-error - accessing internal mock opts for verification
    expect(queue.opts.defaultJobOptions.backoff).toEqual({ type: 'fixed', delay: 1000 });
  });

  it('DLQ does not inherit retry policy', () => {
    const { dlq } = createDomainQueue('identity', 'onboarding', mockRedis);

    // @ts-expect-error - accessing internal mock opts for verification
    expect(dlq.opts.defaultJobOptions.attempts).toBeUndefined();
  });
});

describe('DEFAULT_RETRY_POLICY', () => {
  it('has 3 attempts with exponential backoff', () => {
    expect(DEFAULT_RETRY_POLICY.attempts).toBe(3);
    expect(DEFAULT_RETRY_POLICY.backoff).toEqual({
      type: 'exponential',
      delay: 2000,
    });
  });
});
