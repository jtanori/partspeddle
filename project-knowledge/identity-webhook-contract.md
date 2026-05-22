# Identity Webhook Contract

> Contract, semantics, and failure modes for hosted auth provider synchronization.
> Owning domain: Identity
> Last updated: 2026-05-19

---

## Overview

VINTRACK receives webhook events from Supabase Auth to synchronize the `auth.users` lifecycle into the `identity` bounded context. Webhooks are a **reconciliation mechanism**, not the primary user provisioning path. The primary path is **lazy provisioning** on the first authenticated API request (see `T2.2B`).

---

## Event Types

| Event | Direction | Action | Idempotency Key |
|-------|-----------|--------|-----------------|
| `user.created` | Supabase → VINTRACK | Create `identity.users` + `identity.profiles` | `supabase:{user_id}:created` |
| `user.updated` | Supabase → VINTRACK | Update `identity.users` email | `supabase:{user_id}:updated:{timestamp}` |
| `user.deleted` | Supabase → VINTRACK | Soft-delete (`status = deactivated`) | `supabase:{user_id}:deleted` |

---

## Security

### Signature Verification

All webhooks carry a JWT in the `Authorization: Bearer <token>` header. The token is verified using `SUPABASE_JWT_SECRET` with HS256.

```
issuer:  ${SUPABASE_URL}/auth/v1
audience: authenticated
clock_tolerance: 30s
```

### Response Codes

| Code | When |
|------|------|
| 202 Accepted | Valid signature, enqueued for processing |
| 200 OK | Duplicate webhook (idempotency hit) |
| 401 Unauthorized | Invalid or missing JWT |
| 400 Bad Request | Malformed payload |
| 500 Internal Error | Unexpected processing failure |

---

## Idempotency

### Key Format

```
webhook:idempotency:{auth_provider}:{event_id}
```

- `auth_provider`: `supabase` (future-proofs multi-provider)
- `event_id`: composite of `event_type:user_id:timestamp`

### TTL

- Minimum: 24 hours
- Default: 48 hours
- Store: Redis (`SETEX`)

### Deduplication Behavior

1. Webhook arrives → check Redis key
2. Key exists → return 200 (deduplicated)
3. Key absent → enqueue job → set Redis key
4. If Redis set fails after enqueue → worst case: job processes twice (handler is idempotent)

---

## Ordering & Out-of-Order Handling

### Expected Order

```
user.created → user.updated → user.deleted
```

### Out-of-Order Scenarios

| Scenario | Mitigation |
|----------|------------|
| `user.updated` before `user.created` | Auth sync worker throws retryable `IDENTITY_AUTH_SYNC_USER_NOT_FOUND`. BullMQ retries with exponential backoff. |
| `user.deleted` before `user.created` | Worker returns success (user not found = already cleaned up). |
| Duplicate `user.created` | User repository upsert (ON CONFLICT) + idempotency store prevents redundant work. |

### Retry Policy

- Max attempts: 5
- Backoff: exponential, 2s initial delay
- Dead-letter queue: `identity-webhooks-dlq`

---

## Reconciliation

### Trigger

- Scheduled: daily cron job
- On-demand: admin endpoint or manual invocation

### Algorithm

1. Query `auth.users LEFT JOIN identity.users` for orphans
2. Filter out `deleted_at IS NOT NULL` rows
3. For each orphan:
   - Create `identity.users` row (preserving original `id`)
   - Create `identity.profiles` row
   - Log backfill action

### Governance

- Reconciliation uses the auth provider API to verify users still exist before backfill (future enhancement).
- Orphan detection metric: `identity_reconciliation_orphans_found`

---

## Failure Modes

| Scenario | Likelihood | Impact | Mitigation |
|----------|-----------|--------|-----------|
| Supabase webhook delivery failure | Medium | High | Retry + reconciliation covers gaps |
| Redis eviction before TTL | Low | Medium | 48h TTL + monitor eviction rate |
| Out-of-order webhook | Low | Medium | Retryable error + backoff |
| Invalid webhook signature | Low | High | 401 response, log attempt |
| Reconciliation creates stale data | Low | Low | Verify user exists at provider before backfill |

---

## Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `identity_webhook_received_total` | Counter | `event_type`, `status` |
| `identity_webhook_processing_seconds` | Histogram | `event_type` |
| `identity_webhook_dedup_total` | Counter | `auth_provider` |
| `identity_reconciliation_orphans_found` | Gauge | — |
| `identity_reconciliation_backfilled_total` | Counter | `entity` |

---

## Related Documents

- `T2.6` — Supabase Auth Webhook Handler
- `T2.6A` — Hosted Auth Webhook Synchronization
- `T2.6B` — Webhook Reconciliation Governance
- `src/identity/infrastructure/webhooks/supabase-auth-webhook.ts`
- `src/identity/queue/auth-sync-worker.ts`
- `src/identity/queue/reconciliation-job.ts`
