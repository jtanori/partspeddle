/**
 * Transactional Outbox Pattern
 *
 * Guarantees atomic DB commit + event emission. Events are written to the outbox
 * table within the same transaction as the domain mutation. A relay worker polls
 * pending events and publishes them to the event bus.
 *
 * @see /project-knowledge/event-envelope-standard.md
 * @see /project-knowledge/queue-contracts.md
 */

import type { DomainEvent } from '../event-bus/domain-event.js';

export interface OutboxEntry {
  id: string;
  event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  aggregate_id: string;
  correlation_id: string;
  traceparent: string | null;
  status: 'pending' | 'processing' | 'published' | 'failed';
  retry_count: number;
  created_at: string;
  updated_at: string | null;
  published_at: string | null;
  last_error: string | null;
}

/**
 * Minimal database client interface for outbox operations.
 * Production implementation uses Supabase/postgres-js.
 */
export interface OutboxDbClient {
  insert(table: string, data: Record<string, unknown>): Promise<void>;
  query<T = unknown>(sql: string, params: unknown[]): Promise<T[]>;
  update(table: string, data: Record<string, unknown>, conditions: Record<string, unknown>): Promise<number>;
}

/**
 * Transactional outbox for durable event emission.
 */
export class Outbox {
  private readonly table = 'outbox';

  constructor(private readonly db: OutboxDbClient) {}

  /**
   * Insert an event into the outbox. Must be called within the same
   * database transaction as the domain mutation.
   */
  async insert(event: DomainEvent): Promise<void> {
    const now = new Date().toISOString();

    await this.db.insert(this.table, {
      id: crypto.randomUUID(),
      event_id: event.eventId,
      event_type: event.eventType,
      payload: event.payload,
      aggregate_id: event.aggregateId,
      correlation_id: event.correlationId,
      traceparent: (event.metadata as Record<string, unknown>)?.traceparent as string | undefined,
      status: 'pending',
      retry_count: 0,
      created_at: now,
      updated_at: null,
      published_at: null,
      last_error: null,
    });
  }

  /**
   * Retrieve pending events for publishing.
   */
  async getPending(limit = 100): Promise<OutboxEntry[]> {
    return this.db.query<OutboxEntry>(
      `SELECT * FROM ${this.table} WHERE status = 'pending' ORDER BY created_at ASC LIMIT $1`,
      [limit],
    );
  }

  /**
   * Mark an event as successfully published.
   */
  async markPublished(id: string): Promise<void> {
    await this.db.update(
      this.table,
      { status: 'published', published_at: new Date().toISOString() },
      { id },
    );
  }

  /**
   * Record a publish failure and increment retry count.
   */
  /**
   * Atomically claim a pending event for processing.
   * Returns true if the claim succeeded, false if another worker already claimed it.
   */
  async claimPending(id: string): Promise<boolean> {
    const affected = await this.db.update(
      this.table,
      { status: 'processing', updated_at: new Date().toISOString() },
      { id, status: 'pending' },
    );
    return affected > 0;
  }

  async markFailed(id: string, error: string): Promise<void> {
    const entries = await this.db.query<OutboxEntry>(
      `SELECT retry_count FROM ${this.table} WHERE id = $1`,
      [id],
    );
    const current = entries[0]?.retry_count ?? 0;
    await this.db.update(
      this.table,
      { status: 'pending', retry_count: current + 1, last_error: error },
      { id },
    );
  }

  /**
   * Get events that have exceeded the maximum retry count.
   * These are candidates for the dead-letter queue.
   */
  async getFailedForDlq(maxRetries: number): Promise<OutboxEntry[]> {
    return this.db.query<OutboxEntry>(
      `SELECT * FROM ${this.table} WHERE status != 'published' AND retry_count >= $1`,
      [maxRetries],
    );
  }
}
