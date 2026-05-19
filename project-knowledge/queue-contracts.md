# VINTRACK — Queue Contracts

## Purpose

Defines queue topology, job contracts, retry semantics, and dead-letter handling for BullMQ + Redis. Queues are authoritative workflow infrastructure.

---

## Infrastructure

- **BullMQ** for queue management
- **Redis** for queue storage and job state
- One Redis instance for MVP (clustering deferred post-MVP)

---

## Queue Naming

Format: `domain-purpose`

| Queue | Domain | Purpose |
|-------|--------|---------|
| `identity-onboarding` | Identity | Seller onboarding steps |
| `identity-webhooks` | Identity | Supabase Auth webhook processing |
| `identity-sessions` | Identity | Async session revocation |
| `identity-outbox-relay` | Identity | Event outbox polling |
| `transaction-orchestration` | Transactions | Checkout, escrow, settlement |
| `payment-webhooks` | Transactions | Stripe webhook processing |
| `cart-expiration` | Transactions | Abandoned cart cleanup |
| `inspection-timeouts` | Transactions | Inspection window expiration |
| `search-indexing` | Search | Algolia index updates |
| `ai-processing` | AI Intelligence | Image analysis, enrichment |
| `notification-delivery` | Notifications | Email/push dispatch |

**Rule:** Every queue is owned by exactly one domain. No shared generic queues.

---

## Job Contract

Every job must include:

```typescript
interface JobPayload {
  // Business data
  data: Record<string, unknown>;

  // Operational metadata
  metadata: {
    correlationId: string;
    causationId?: string;
    actorId: string;
    attempt: number;
    enqueuedAt: string;
  };
}
```

### Example

```typescript
await transactionQueue.add('process-checkout', {
  data: { cartId: 'uuid', buyerId: 'uuid' },
  metadata: {
    correlationId: 'uuid',
    actorId: 'uuid',
    attempt: 1,
    enqueuedAt: new Date().toISOString(),
  },
});
```

---

## Retry Semantics

### Default Retry Policy

```typescript
const defaultRetryPolicy = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000, // 2s initial
  },
};
```

### Retry Schedule

| Attempt | Delay | Total Elapsed |
|---------|-------|---------------|
| 1 | Immediate | 0s |
| 2 | 2s | 2s |
| 3 | 4s | 6s |

### Queue-Specific Policies

| Queue | Attempts | Backoff | Notes |
|-------|----------|---------|-------|
| `identity-onboarding` | 3 | exponential 2s | User-facing, fail fast |
| `payment-webhooks` | 5 | exponential 5s | External provider, be patient |
| `transaction-orchestration` | 3 | exponential 2s | Financial, alert on failure |
| `cart-expiration` | 1 | none | Best effort, no retry |
| `identity-outbox-relay` | 10 | exponential 1s | Critical, retry aggressively |

---

## Dead Letter Handling

### DLQ Naming

Format: `domain-purpose-dlq`

Examples: `transaction-orchestration-dlq`, `payment-webhooks-dlq`

### DLQ Behavior

1. Job fails all retries → moved to DLQ
2. Alert fires (P2) when DLQ length > 10
3. Operator inspects DLQ via dashboard or CLI
4. After fix, replay job manually or in batch
5. Job removed from DLQ after successful replay

### DLQ Retention

- 7 days in Redis
- After 7 days: log to `queue_dead_letter_logs` table for audit
- No automatic deletion without audit record

---

## Worker Concurrency

```typescript
const worker = new Worker('transaction-orchestration', processor, {
  connection: redis,
  concurrency: 5,
  limiter: {
    max: 10,
    duration: 1000, // 10 jobs/sec max
  },
});
```

### Concurrency Rules

| Queue | Concurrency | Rate Limit | Reason |
|-------|-------------|------------|--------|
| `payment-webhooks` | 3 | 5/sec | Stripe rate limits |
| `transaction-orchestration` | 5 | 10/sec | Prevent DB overload |
| `ai-processing` | 2 | 2/sec | Gemini API quotas |
| `search-indexing` | 3 | 5/sec | Algolia rate limits |
| `notification-delivery` | 10 | 50/sec | High volume expected |

---

## Job Idempotency

All financial and state-transition jobs must be idempotent.

### Idempotency Key

```typescript
interface IdempotencyConfig {
  key: string;        // business-key derived (e.g., `checkout:${cartId}`)
  ttl: number;        // seconds (default: 86400 = 24h)
}
```

### Implementation

```typescript
async function processCheckout(job: Job) {
  const { cartId } = job.data.data;
  const idempotencyKey = `checkout:${cartId}`;

  const exists = await redis.get(`idempotency:${idempotencyKey}`);
  if (exists) {
    logger.info('Duplicate job detected, skipping', { cartId });
    return { status: 'already_processed', result: JSON.parse(exists) };
  }

  const result = await executeCheckout(cartId);
  await redis.setex(`idempotency:${idempotencyKey}`, 86400, JSON.stringify(result));
  return result;
}
```

---

## Scheduled Jobs

Use BullMQ's `Queue.add(name, data, { delay })` for:

- Cart expiration (delay: 24h)
- Inspection window timeout (delay: 72h)
- Session purge (delay: 90d, recurring)
- Outbox relay poll (delay: 2s–5s, recurring)

### Cron Jobs

```typescript
await queue.add('session-purge', {}, {
  repeat: { cron: '0 0 * * *' }, // Daily at midnight
});
```

---

## Monitoring

### Required Metrics

| Metric | Type | Alert Threshold |
|--------|------|-----------------|
| `queue_jobs_completed_total` | Counter | — |
| `queue_jobs_failed_total` | Counter | > 5/min |
| `queue_job_duration_seconds` | Histogram | p99 > 30s |
| `queue_waiting_count` | Gauge | > 100 for > 5 min |
| `dlq_length` | Gauge | > 10 |

### Health Check

```typescript
app.get('/health/queue', async (req, res) => {
  const waiting = await queue.getWaitingCount();
  const failed = await queue.getFailedCount();
  const healthy = waiting < 1000 && failed < 100;
  res.status(healthy ? 200 : 503).json({ waiting, failed });
});
```

---

## Outbox Pattern Governance

### Canonical Integration Boundary

**NO domain is allowed to publish directly to queues, Redis, or external brokers. EVER.**

The only valid event emission path is:

```
DB transaction (domain mutation + outbox insert) → relay worker → event bus
```

This guarantees transactional durability. Any code that bypasses the outbox violates architectural law.

### Ordering Guarantees

The outbox relay guarantees **per-aggregate ordering only**:

- Events with the same `aggregateId` are relayed in `created_at` ascending order
- Cross-aggregate ordering is NOT guaranteed
- Consumers must not assume global event ordering

### Failure Semantics

If the relay worker process crashes **AFTER publishing to the event bus but BEFORE marking the event as published**, the event will be duplicate-published on the next poll cycle.

This is acceptable **ONLY BECAUSE** consumers deduplicate by `eventId`. Without consumer idempotency, crash-recovery becomes unsafe.

### Concurrency Control

Multiple relay workers may run concurrently. The outbox uses **optimistic locking** via `claimPending()`:

```sql
UPDATE outbox
SET status = 'processing', updated_at = now()
WHERE id = $1 AND status = 'pending'
```

Only the worker that successfully updates the row may publish the event. Others skip it.

### Adaptive Polling (Future)

MVP uses a fixed poll interval (3s). For scale, adopt adaptive polling:

| Condition | Poll Interval |
|-----------|--------------|
| Idle (no pending events) | 5s |
| Active backlog | 500ms–1s |
| High backlog | Adaptive / backpressure |

Fixed polling creates unnecessary DB load when idle and unnecessary latency when active.

### Migration Naming Governance

All database migrations follow strict rules:

- **Format:** `YYYYMMDDHHMMSS_description.sql`
- **Immutability:** Once merged, a migration is frozen. Never edit a merged migration.
- **Additive preferred:** Add columns/tables; avoid destructive changes.
- **Rollback strategy:** Every migration must have a documented rollback procedure.

Supabase projects become migration graveyards without strict governance.

---

## Poison Jobs

Jobs that fail due to deterministic business-rule violations must NOT retry indefinitely.

Mark as poison and route directly to DLQ.

Examples of poison conditions:
- Invalid state machine transition (already validated before enqueue)
- Missing required aggregate (deleted since enqueue)
- Schema version mismatch
- Permanent validation failure (e.g., schema incompatibility)

**Poison event classification (required before M6):**

| Failure Type | Retry? | Reason |
|-------------|--------|--------|
| Network timeout | Yes | Transient |
| Broker unavailable | Yes | Transient |
| Validation failure | No | Permanent |
| Serialization corruption | No | Permanent |
| Schema incompatibility | Maybe | Requires operator decision |

Poison jobs bypass retry logic and trigger immediate alerting.

## Final Principle

Queues are not message buses. They are durable workflow infrastructure. Every job must be observable, retryable, and idempotent. If a queue grows without bound, the architecture has failed.
