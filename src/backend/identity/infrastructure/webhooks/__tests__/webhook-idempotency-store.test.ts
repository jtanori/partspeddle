import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  InMemoryWebhookIdempotencyStore,
  RedisWebhookIdempotencyStore,
} from '../webhook-idempotency-store.js';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/**
 * Quick Redis health check with fast timeout.
 * Returns true if Redis is reachable, false otherwise.
 */
async function isRedisAvailable(): Promise<boolean> {
  const probe = new Redis(REDIS_URL, {
    connectTimeout: 500,
    maxRetriesPerRequest: 0,
    enableReadyCheck: false,
    lazyConnect: true,
  });
  try {
    await probe.connect();
    await probe.ping();
    await probe.quit();
    return true;
  } catch {
    await probe.disconnect();
    return false;
  }
}

describe('InMemoryWebhookIdempotencyStore', () => {
  let store: InMemoryWebhookIdempotencyStore;

  beforeEach(() => {
    store = new InMemoryWebhookIdempotencyStore();
  });

  it('returns false for unprocessed events', async () => {
    const result = await store.isProcessed('supabase', 'evt-123');
    expect(result).toBe(false);
  });

  it('returns true for processed events', async () => {
    await store.markProcessed('supabase', 'evt-123');
    const result = await store.isProcessed('supabase', 'evt-123');
    expect(result).toBe(true);
  });

  it('returns false after TTL expires', async () => {
    await store.markProcessed('supabase', 'evt-123', -1);
    const result = await store.isProcessed('supabase', 'evt-123');
    expect(result).toBe(false);
  });

  it('isolates events by provider', async () => {
    await store.markProcessed('supabase', 'evt-123');
    const supabaseResult = await store.isProcessed('supabase', 'evt-123');
    const auth0Result = await store.isProcessed('auth0', 'evt-123');
    expect(supabaseResult).toBe(true);
    expect(auth0Result).toBe(false);
  });

  it('isolates events by event id', async () => {
    await store.markProcessed('supabase', 'evt-123');
    const result = await store.isProcessed('supabase', 'evt-456');
    expect(result).toBe(false);
  });

  it('clears all entries', async () => {
    await store.markProcessed('supabase', 'evt-123');
    store.clear();
    const result = await store.isProcessed('supabase', 'evt-123');
    expect(result).toBe(false);
  });
});

describe('RedisWebhookIdempotencyStore', () => {
  let store: RedisWebhookIdempotencyStore;
  let redis: Redis;
  let redisAvailable = false;

  beforeAll(async () => {
    redisAvailable = await isRedisAvailable();
  });

  beforeEach(async () => {
    if (!redisAvailable) return;
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      connectTimeout: 1000,
    });
    await redis.flushdb();
    store = new RedisWebhookIdempotencyStore(redis);
  });

  afterEach(async () => {
    if (!redisAvailable) return;
    await redis.quit();
  });

  it.skipIf(!redisAvailable)('returns false for unprocessed events', async () => {
    const result = await store.isProcessed('supabase', 'evt-123');
    expect(result).toBe(false);
  });

  it.skipIf(!redisAvailable)('returns true for processed events', async () => {
    await store.markProcessed('supabase', 'evt-123');
    const result = await store.isProcessed('supabase', 'evt-123');
    expect(result).toBe(true);
  });

  it.skipIf(!redisAvailable)('expires keys after TTL', async () => {
    await store.markProcessed('supabase', 'evt-123', 1);
    const before = await store.isProcessed('supabase', 'evt-123');
    expect(before).toBe(true);

    await new Promise((r) => setTimeout(r, 1100));

    const after = await store.isProcessed('supabase', 'evt-123');
    expect(after).toBe(false);
  });

  it.skipIf(!redisAvailable)('isolates events by provider', async () => {
    await store.markProcessed('supabase', 'evt-123');
    const supabaseResult = await store.isProcessed('supabase', 'evt-123');
    const auth0Result = await store.isProcessed('auth0', 'evt-123');
    expect(supabaseResult).toBe(true);
    expect(auth0Result).toBe(false);
  });
});

  it('returns false for unprocessed events', async () => {
    const result = await store.isProcessed('supabase', 'evt-123');
    expect(result).toBe(false);
  });

  it('returns true for processed events', async () => {
    await store.markProcessed('supabase', 'evt-123');
    const result = await store.isProcessed('supabase', 'evt-123');
    expect(result).toBe(true);
  });

  it('expires keys after TTL', async () => {
    await store.markProcessed('supabase', 'evt-123', 1);
    const before = await store.isProcessed('supabase', 'evt-123');
    expect(before).toBe(true);

    await new Promise((r) => setTimeout(r, 1100));

    const after = await store.isProcessed('supabase', 'evt-123');
    expect(after).toBe(false);
  });

  it('isolates events by provider', async () => {
    await store.markProcessed('supabase', 'evt-123');
    const supabaseResult = await store.isProcessed('supabase', 'evt-123');
    const auth0Result = await store.isProcessed('auth0', 'evt-123');
    expect(supabaseResult).toBe(true);
    expect(auth0Result).toBe(false);
  });
});
