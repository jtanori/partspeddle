/**
 * Webhook Deduplication Integration Tests
 *
 * Verifies Redis-backed idempotency store works end-to-end.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { redis } from '../../setup-integration.js';
import {
  RedisWebhookIdempotencyStore,
  InMemoryWebhookIdempotencyStore,
} from '../../../src/backend/identity/infrastructure/webhooks/webhook-idempotency-store.js';

describe('Webhook Deduplication (integration)', () => {
  beforeEach(async () => {
    await redis.flushdb();
  });

  it('deduplicates identical webhook events via Redis', async () => {
    const store = new RedisWebhookIdempotencyStore(redis);
    const eventId = 'evt-abc-123';

    const first = await store.isProcessed('supabase', eventId);
    expect(first).toBe(false);

    await store.markProcessed('supabase', eventId);

    const second = await store.isProcessed('supabase', eventId);
    expect(second).toBe(true);
  });

  it('isolates events across auth providers', async () => {
    const store = new RedisWebhookIdempotencyStore(redis);

    await store.markProcessed('supabase', 'evt-123');
    await store.markProcessed('auth0', 'evt-456');

    expect(await store.isProcessed('supabase', 'evt-123')).toBe(true);
    expect(await store.isProcessed('supabase', 'evt-456')).toBe(false);
    expect(await store.isProcessed('auth0', 'evt-123')).toBe(false);
    expect(await store.isProcessed('auth0', 'evt-456')).toBe(true);
  });

  it('expires deduplication entries after TTL', async () => {
    const store = new RedisWebhookIdempotencyStore(redis);
    await store.markProcessed('supabase', 'evt-short', 1); // 1 second TTL

    expect(await store.isProcessed('supabase', 'evt-short')).toBe(true);

    await new Promise((r) => setTimeout(r, 1100));

    expect(await store.isProcessed('supabase', 'evt-short')).toBe(false);
  });
});

describe('InMemoryWebhookIdempotencyStore', () => {
  let store: InMemoryWebhookIdempotencyStore;

  beforeEach(() => {
    store = new InMemoryWebhookIdempotencyStore();
  });

  it('deduplicates processed events', async () => {
    await store.markProcessed('supabase', 'evt-123');
    expect(await store.isProcessed('supabase', 'evt-123')).toBe(true);
    expect(await store.isProcessed('supabase', 'evt-456')).toBe(false);
  });
});
