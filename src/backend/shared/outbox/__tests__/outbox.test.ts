import { describe, it, expect, beforeEach } from 'vitest';
import { DomainEvent } from '../../../../shared/event-bus/domain-event.js';
import { Outbox } from '../outbox.js';

// ─── In-memory DB adapter for testing ───────────────────────────────────────
interface InMemoryRow {
  id: string;
  event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  aggregate_id: string;
  correlation_id: string;
  status: string;
  retry_count: number;
  created_at: string;
  published_at: string | null;
  last_error: string | null;
}

class InMemoryDbClient {
  private rows: InMemoryRow[] = [];

  async insert(table: string, data: Record<string, unknown>): Promise<void> {
    if (table === 'outbox') {
      this.rows.push(data as unknown as InMemoryRow);
    }
  }

  async query<T>(sql: string, _params: unknown[]): Promise<T[]> {
    if (sql.includes("status = 'pending'")) {
      return this.rows.filter((r) => r.status === 'pending') as unknown as T[];
    }
    if (sql.includes('retry_count >=')) {
      const maxRetries = Number(_params[0]);
      return this.rows.filter(
        (r) => r.retry_count >= maxRetries && r.status !== 'published'
      ) as unknown as T[];
    }
    return this.rows as unknown as T[];
  }

  async update(
    table: string,
    data: Record<string, unknown>,
    conditions: Record<string, unknown>
  ): Promise<number> {
    if (table === 'outbox') {
      const row = this.rows.find((r) =>
        Object.entries(conditions).every(
          ([key, value]) => (r as Record<string, unknown>)[key] === value
        )
      );
      if (row) {
        Object.assign(row, data);
        return 1;
      }
    }
    return 0;
  }

  getRows(): InMemoryRow[] {
    return this.rows;
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Outbox', () => {
  let db: InMemoryDbClient;
  let outbox: Outbox;

  const sampleEvent = new DomainEvent({
    eventType: 'seller.activated',
    correlationId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    actorId: 'system',
    domain: 'identity',
    aggregateId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    payload: { sellerProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
  });

  beforeEach(() => {
    db = new InMemoryDbClient();
    outbox = new Outbox(db as unknown as Parameters<typeof Outbox>[0]);
  });

  it('inserts event with pending status', async () => {
    await outbox.insert(sampleEvent);

    const rows = db.getRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].event_type).toBe('seller.activated');
  });

  it('stores all event fields correctly', async () => {
    await outbox.insert(sampleEvent);

    const row = db.getRows()[0];
    expect(row.event_id).toBe(sampleEvent.eventId);
    expect(row.event_type).toBe(sampleEvent.eventType);
    expect(row.aggregate_id).toBe(sampleEvent.aggregateId);
    expect(row.correlation_id).toBe(sampleEvent.correlationId);
    expect(row.payload).toEqual(sampleEvent.payload);
    expect(row.retry_count).toBe(0);
    expect(row.updated_at).toBeNull();
  });

  it('getPending returns only pending events', async () => {
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

    const pending = await outbox.getPending(10);
    expect(pending).toHaveLength(2);
  });

  it('markPublished updates status and published_at', async () => {
    await outbox.insert(sampleEvent);
    const row = db.getRows()[0];

    await outbox.markPublished(row.id);

    const updated = db.getRows()[0];
    expect(updated.status).toBe('published');
    expect(updated.published_at).toBeTruthy();
  });

  it('markFailed increments retry_count and sets last_error', async () => {
    await outbox.insert(sampleEvent);
    const row = db.getRows()[0];

    await outbox.markFailed(row.id, 'Connection timeout');

    const updated = db.getRows()[0];
    expect(updated.status).toBe('pending');
    expect(updated.retry_count).toBe(1);
    expect(updated.last_error).toBe('Connection timeout');
  });

  it('claimPending acquires a pending event', async () => {
    await outbox.insert(sampleEvent);
    const row = db.getRows()[0];

    const claimed = await outbox.claimPending(row.id);

    expect(claimed).toBe(true);
    const updated = db.getRows()[0];
    expect(updated.status).toBe('processing');
    expect(updated.updated_at).toBeTruthy();
  });

  it('claimPending returns false if event is not pending', async () => {
    await outbox.insert(sampleEvent);
    const row = db.getRows()[0];
    await outbox.markPublished(row.id);

    const claimed = await outbox.claimPending(row.id);

    expect(claimed).toBe(false);
  });

  it('claimPending prevents double-claim by concurrent workers', async () => {
    await outbox.insert(sampleEvent);
    const row = db.getRows()[0];

    const first = await outbox.claimPending(row.id);
    const second = await outbox.claimPending(row.id);

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('getFailedForDlq returns events exceeding max retries', async () => {
    await outbox.insert(sampleEvent);
    const row = db.getRows()[0];

    // Simulate 10 failures
    for (let i = 0; i < 10; i++) {
      await outbox.markFailed(row.id, `Attempt ${i + 1} failed`);
    }

    const dlqCandidates = await outbox.getFailedForDlq(10);
    expect(dlqCandidates).toHaveLength(1);
    expect(dlqCandidates[0].retry_count).toBe(10);
  });

  it('does not return published events in getFailedForDlq', async () => {
    await outbox.insert(sampleEvent);
    const row = db.getRows()[0];

    await outbox.markPublished(row.id);

    const dlqCandidates = await outbox.getFailedForDlq(10);
    expect(dlqCandidates).toHaveLength(0);
  });
});
