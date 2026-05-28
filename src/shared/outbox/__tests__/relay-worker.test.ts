import { describe, it, expect, beforeEach } from 'vitest';
import { DomainEvent } from '../../event-bus/domain-event.js';
import { OutboxRelayWorker } from '../relay-worker.js';
import type { Outbox, OutboxEntry } from '../outbox.js';

// ─── Mock outbox ────────────────────────────────────────────────────────────
class MockOutbox implements Outbox {
  private entries: OutboxEntry[] = [];
  private idCounter = 0;

  async insert(event: DomainEvent): Promise<void> {
    this.entries.push({
      id: `outbox-${++this.idCounter}`,
      event_id: event.eventId,
      event_type: event.eventType,
      payload: event.payload,
      aggregate_id: event.aggregateId,
      correlation_id: event.correlationId,
      status: 'pending',
      retry_count: 0,
      created_at: new Date().toISOString(),
      published_at: null,
      last_error: null,
    });
  }

  async getPending(limit: number): Promise<OutboxEntry[]> {
    return this.entries.filter((e) => e.status === 'pending').slice(0, limit);
  }

  async markPublished(id: string): Promise<void> {
    const entry = this.entries.find((e) => e.id === id);
    if (entry) {
      entry.status = 'published';
      entry.published_at = new Date().toISOString();
    }
  }

  async markFailed(id: string, error: string): Promise<void> {
    const entry = this.entries.find((e) => e.id === id);
    if (entry) {
      entry.status = 'pending';
      entry.retry_count++;
      entry.last_error = error;
    }
  }

  async getFailedForDlq(maxRetries: number): Promise<OutboxEntry[]> {
    return this.entries.filter((e) => e.retry_count >= maxRetries && e.status !== 'published');
  }

  async claimPending(id: string): Promise<boolean> {
    const entry = this.entries.find((e) => e.id === id && e.status === 'pending');
    if (entry) {
      entry.status = 'processing';
      entry.updated_at = new Date().toISOString();
      return true;
    }
    return false;
  }

  getEntries(): OutboxEntry[] {
    return this.entries;
  }
}

// ─── Mock event publisher ───────────────────────────────────────────────────
class MockEventPublisher {
  published: OutboxEntry[] = [];
  private shouldFail = false;
  private failCount = 0;
  private attemptCount = 0;

  setFailPattern(count: number) {
    this.shouldFail = true;
    this.failCount = count;
  }

  clearFailPattern() {
    this.shouldFail = false;
    this.failCount = 0;
  }

  async publish(entry: OutboxEntry): Promise<void> {
    this.attemptCount++;
    if (this.shouldFail && this.attemptCount <= this.failCount) {
      throw new Error(`Publish failed (attempt ${this.attemptCount})`);
    }
    this.published.push(entry);
  }

  getPublished(): OutboxEntry[] {
    return this.published;
  }

  resetAttempts() {
    this.attemptCount = 0;
  }
}

// ─── Mock DLQ handler ───────────────────────────────────────────────────────
class MockDlqHandler {
  entries: OutboxEntry[] = [];

  async send(entry: OutboxEntry): Promise<void> {
    this.entries.push(entry);
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('OutboxRelayWorker', () => {
  let outbox: MockOutbox;
  let publisher: MockEventPublisher;
  let dlq: MockDlqHandler;
  let worker: OutboxRelayWorker;

  const sampleEvent = new DomainEvent({
    eventType: 'seller.activated',
    correlationId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    actorId: 'system',
    domain: 'identity',
    aggregateId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    payload: { sellerProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
  });

  beforeEach(() => {
    outbox = new MockOutbox();
    publisher = new MockEventPublisher();
    dlq = new MockDlqHandler();
    worker = new OutboxRelayWorker(outbox, publisher, dlq, {
      pollIntervalMs: 100,
      maxRetries: 3,
      batchSize: 10,
    });
  });

  it('poll fetches pending events and publishes them', async () => {
    await outbox.insert(sampleEvent);

    const processed = await worker.poll();

    expect(processed).toBe(1);
    expect(publisher.getPublished()).toHaveLength(1);
    expect(publisher.getPublished()[0].event_type).toBe('seller.activated');
  });

  it('poll marks published events as published', async () => {
    await outbox.insert(sampleEvent);

    await worker.poll();

    const entries = outbox.getEntries();
    expect(entries[0].status).toBe('published');
    expect(entries[0].published_at).toBeTruthy();
  });

  it('poll retries failed events', async () => {
    await outbox.insert(sampleEvent);
    publisher.setFailPattern(2);

    // First poll: fails, increments retry
    await worker.poll();
    expect(outbox.getEntries()[0].retry_count).toBe(1);
    expect(outbox.getEntries()[0].status).toBe('pending');

    // Second poll: fails again, increments retry
    await worker.poll();
    expect(outbox.getEntries()[0].retry_count).toBe(2);

    // Third poll: succeeds (fail pattern exhausted after 2 failures)
    await worker.poll();
    expect(outbox.getEntries()[0].status).toBe('published');
    expect(outbox.getEntries()[0].retry_count).toBe(2);
  });

  it('poll moves exhausted events to DLQ', async () => {
    await outbox.insert(sampleEvent);
    publisher.setFailPattern(999); // Always fails

    // Exceed max retries (3 failures = maxRetries reached)
    for (let i = 0; i < 3; i++) {
      await worker.poll();
    }

    const entries = outbox.getEntries();
    expect(entries[0].retry_count).toBe(3);

    // DLQ'd on the 3rd poll when maxRetries was reached
    expect(dlq.entries).toHaveLength(1);
    expect(dlq.entries[0].event_type).toBe('seller.activated');
  });

  it('poll returns count of processed events', async () => {
    await outbox.insert(sampleEvent);
    await outbox.insert(
      new DomainEvent({
        eventType: 'listing.published',
        correlationId: '6ba7b810-9dad-11d1-80b4-00c04fd430c9',
        actorId: 'system',
        domain: 'marketplace',
        aggregateId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
        payload: { listingId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12' },
      })
    );

    const processed = await worker.poll();

    expect(processed).toBe(2);
    expect(publisher.getPublished()).toHaveLength(2);
  });

  it('start and stop control polling loop', async () => {
    await outbox.insert(sampleEvent);

    worker.start();
    expect(worker.isRunning()).toBe(true);

    // Wait for at least one poll
    await new Promise((r) => setTimeout(r, 250));

    worker.stop();
    expect(worker.isRunning()).toBe(false);

    // Should have published at least once
    expect(publisher.getPublished().length).toBeGreaterThanOrEqual(1);
  });

  it('does not re-publish already published events', async () => {
    await outbox.insert(sampleEvent);

    await worker.poll();
    expect(publisher.getPublished()).toHaveLength(1);

    // Second poll should not publish again
    const processed = await worker.poll();
    expect(processed).toBe(0);
    expect(publisher.getPublished()).toHaveLength(1);
  });

  it('records last_error on publish failure', async () => {
    await outbox.insert(sampleEvent);
    publisher.setFailPattern(1);

    await worker.poll();

    const entry = outbox.getEntries()[0];
    expect(entry.last_error).toContain('Publish failed');
  });

  it('preserves event_id through relay as idempotency key', async () => {
    await outbox.insert(sampleEvent);

    await worker.poll();

    const published = publisher.getPublished();
    expect(published).toHaveLength(1);
    expect(published[0].event_id).toBe(sampleEvent.eventId);
  });

  it('prevents double-publish with concurrent workers', async () => {
    await outbox.insert(sampleEvent);

    // Create a second worker sharing the same outbox and publisher
    const worker2 = new OutboxRelayWorker(outbox, publisher, dlq, {
      pollIntervalMs: 100,
      maxRetries: 3,
      batchSize: 10,
    });

    // Both workers poll simultaneously
    const [processed1, processed2] = await Promise.all([worker.poll(), worker2.poll()]);

    // Only one should have successfully published
    expect(publisher.getPublished()).toHaveLength(1);
    // Total processed count may be 0+1 or 1+0 depending on which worker won the claim
    expect(processed1 + processed2).toBeGreaterThanOrEqual(1);
  });
});
