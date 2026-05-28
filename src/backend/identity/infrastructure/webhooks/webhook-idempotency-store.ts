/**
 * Webhook Idempotency Store — Redis-backed deduplication.
 *
 * Key format: `webhook:idempotency:{auth_provider}:{event_id}`
 * Default TTL: 48 hours (exceeds the 24h minimum requirement).
 *
 * @see /project-knowledge/identity-webhook-contract.md
 */

import type { Redis } from 'ioredis';

const KEY_PREFIX = 'webhook:idempotency';
const DEFAULT_TTL_SECONDS = 48 * 60 * 60; // 48 hours

export interface WebhookIdempotencyStore {
  /**
   * Check if a webhook event has already been processed.
   */
  isProcessed(authProvider: string, eventId: string): Promise<boolean>;

  /**
   * Mark a webhook event as processed.
   */
  markProcessed(authProvider: string, eventId: string, ttlSeconds?: number): Promise<void>;
}

export class RedisWebhookIdempotencyStore implements WebhookIdempotencyStore {
  constructor(private readonly redis: Redis) {}

  async isProcessed(authProvider: string, eventId: string): Promise<boolean> {
    const key = this._key(authProvider, eventId);
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  async markProcessed(
    authProvider: string,
    eventId: string,
    ttlSeconds = DEFAULT_TTL_SECONDS
  ): Promise<void> {
    const key = this._key(authProvider, eventId);
    await this.redis.setex(key, ttlSeconds, '1');
  }

  private _key(authProvider: string, eventId: string): string {
    return `${KEY_PREFIX}:${authProvider}:${eventId}`;
  }
}

/**
 * In-memory implementation for unit testing.
 */
export class InMemoryWebhookIdempotencyStore implements WebhookIdempotencyStore {
  private readonly store = new Map<string, number>(); // key -> expiry timestamp

  isProcessed(authProvider: string, eventId: string): Promise<boolean> {
    const key = this._key(authProvider, eventId);
    const expiry = this.store.get(key);
    if (!expiry) return Promise.resolve(false);
    if (Date.now() > expiry) {
      this.store.delete(key);
      return Promise.resolve(false);
    }
    return Promise.resolve(true);
  }

  markProcessed(
    authProvider: string,
    eventId: string,
    ttlSeconds = DEFAULT_TTL_SECONDS
  ): Promise<void> {
    const key = this._key(authProvider, eventId);
    this.store.set(key, Date.now() + ttlSeconds * 1000);
    return Promise.resolve();
  }

  clear(): void {
    this.store.clear();
  }

  private _key(authProvider: string, eventId: string): string {
    return `${KEY_PREFIX}:${authProvider}:${eventId}`;
  }
}
