/**
 * Outbox Relay Worker
 *
 * Polls the outbox table for pending events and publishes them to the event bus.
 * Implements retry with exponential backoff and dead-letter queue routing.
 *
 * @see /project-knowledge/queue-contracts.md
 */

import type { Outbox, OutboxEntry } from './outbox.js';

export interface EventPublisher {
  publish(entry: OutboxEntry): Promise<void>;
}

export interface DlqHandler {
  send(entry: OutboxEntry): Promise<void>;
}

export interface RelayWorkerOptions {
  /** Polling interval in milliseconds (default: 3000) */
  pollIntervalMs: number;
  /** Maximum publish retries before DLQ (default: 10) */
  maxRetries: number;
  /** Events processed per poll cycle (default: 100) */
  batchSize: number;
}

const DEFAULT_OPTIONS: RelayWorkerOptions = {
  pollIntervalMs: 3000,
  maxRetries: 10,
  batchSize: 100,
};

/**
 * Background worker that polls the outbox and relays events to the event bus.
 */
export class OutboxRelayWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly options: RelayWorkerOptions;

  constructor(
    private readonly outbox: Outbox,
    private readonly publisher: EventPublisher,
    private readonly dlq: DlqHandler,
    options?: Partial<RelayWorkerOptions>,
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Start the polling loop.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      this.poll().catch((error: unknown) => {
        // Unhandled polling errors are logged but not thrown to keep worker alive
        console.error('Outbox relay poll error:', error);
      });
    }, this.options.pollIntervalMs);
  }

  /**
   * Stop the polling loop.
   */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Check if the worker is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Execute a single poll cycle.
   *
   * @returns Number of events processed (published + moved to DLQ)
   */
  async poll(): Promise<number> {
    const pending = await this.outbox.getPending(this.options.batchSize);
    let processed = 0;

    for (const entry of pending) {
      // Skip events already exhausted (should not happen with proper DB query,
      // but guards against race conditions)
      if (entry.retry_count >= this.options.maxRetries) {
        await this.dlq.send(entry);
        processed++;
        continue;
      }

      // Optimistic locking: claim the event before publishing.
      // If another relay worker already claimed it, skip.
      const claimed = await this.outbox.claimPending(entry.id);
      if (!claimed) {
        continue;
      }

      try {
        // eventId is the canonical deduplication key and must never be mutated.
        // Consumers MUST treat eventId as the idempotency key.
        await this.publisher.publish(entry);
        await this.outbox.markPublished(entry.id);
        processed++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.outbox.markFailed(entry.id, message);
        processed++;

        // If this was the final retry, route to DLQ immediately
        if (entry.retry_count >= this.options.maxRetries) {
          await this.dlq.send(entry);
        }
      }
    }

    return processed;
  }
}
