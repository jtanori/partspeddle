# VINTRACK — Identity Domain Observability

## Purpose

Defines the observability instrumentation, telemetry, and operational visibility requirements for the Identity bounded context.

Identity is the root of trust. Its observability must be comprehensive, actionable, and available to operational staff without code-level access.

---

## Observability Philosophy

Every Identity operation must be:

* **Observable** — structured logs, traces, metrics emitted by default
* **Traceable** — correlation IDs propagate through auth webhooks, queues, and API calls
* **Measurable** — SLOs defined for critical paths
* **Alertable** — anomaly conditions trigger actionable alerts

Observability is mandatory infrastructure, not optional instrumentation.

---

## Structured Logging

### Log Levels

| Level | Use Case | Example |
|-------|----------|---------|
| `error` | Unhandled exceptions, invariant violations, DB constraint failures | `Auth sync trigger failed: FK violation` |
| `warn` | Recoverable anomalies, retry exhaustion, suspicious patterns | `Duplicate webhook received: idempotency collision` |
| `info` | Significant lifecycle events | `Seller activated: user_id=xxx` |
| `debug` | Detailed request/response for troubleshooting | `Profile update payload: {...}` |

### Required Log Fields

Every log entry MUST include:

```json
{
  "timestamp": "2026-01-01T00:00:00.000Z",
  "level": "info",
  "service": "identity-service",
  "correlationId": "uuid",
  "actorId": "uuid | system | anonymous",
  "event": "user.created",
  "message": "Human-readable description",
  "context": {
    "userId": "uuid",
    "route": "POST /v1/identity/sellers/register",
    "queueJobId": "bullmq-job-id",
    "durationMs": 45
  }
}
```

### Critical Log Events

| Event | Level | Context Fields |
|-------|-------|----------------|
| `user.created` | info | `userId`, `email`, `source` (webhook / api) |
| `user.suspended` | warn | `userId`, `reason`, `previousStatus`, `actorId` |
| `seller.activated` | info | `userId`, `sellerProfileId`, `activatedAt` |
| `seller.deactivated` | warn | `userId`, `sellerProfileId`, `reason` |
| `profile.updated` | info | `userId`, `changedFields` |
| `session.created` | debug | `userId`, `sessionType`, `ipAddress` |
| `session.revoked` | info | `userId`, `sessionId`, `revokeReason` |
| `webhook.received` | debug | `webhookType`, `eventId`, `signatureValid` |
| `webhook.processed` | info | `webhookType`, `eventId`, `processingDurationMs` |
| `webhook.failed` | error | `webhookType`, `eventId`, `error`, `retryCount` |
| `outbox.published` | debug | `eventType`, `outboxId`, `relayLatencyMs` |
| `outbox.retry_exhausted` | error | `eventType`, `outboxId`, `retryCount` |

---

## Distributed Tracing

### Trace Span Conventions

| Span Name | Operation | Tags |
|-----------|-----------|------|
| `identity.api.request` | HTTP request handling | `http.method`, `http.route`, `http.status_code` |
| `identity.db.query` | Postgres query execution | `db.operation`, `db.table`, `db.rows_affected` |
| `identity.queue.job` | BullMQ job execution | `queue.name`, `job.name`, `job.attempts` |
| `identity.webhook.process` | Supabase Auth webhook | `webhook.type`, `webhook.event_id` |
| `identity.outbox.relay` | Event outbox relay | `events.count`, `relay.batch_size` |
| `identity.auth.sync` | Auth user synchronization | `auth.user_id`, `sync.direction` |

### Trace Propagation

* **API Gateway → Identity Service**: `traceparent` header per W3C standard
* **Identity Service → Queue**: `traceparent` embedded in job metadata
* **Queue Worker → Downstream**: `traceparent` propagated via event payload `metadata.traceparent`
* **Webhook → Queue**: `traceparent` generated on webhook receipt, carried into async processing

### Critical Path Tracing

The following workflows MUST generate end-to-end traces:

1. **User Registration**: `auth.users insert` → `handle_new_user trigger` → `profile creation` → `user.created event` → `outbox relay`
2. **Seller Onboarding**: `POST /sellers/register` → `queue: identity-onboarding` → `step updates` → `status transition` → `seller.activated event`
3. **Session Revocation**: `DELETE /sessions/me` → `queue: identity-sessions` → `batch revoke` → `Supabase token invalidation` → `session.revoked events`

---

## Metrics

### Business Metrics

| Metric Name | Type | Description | Labels |
|-------------|------|-------------|--------|
| `identity_user_registrations_total` | Counter | Total user registrations | `source` (webhook, api, import) |
| `identity_seller_activations_total` | Counter | Total seller activations | `activation_source` (onboarding, reinstatement) |
| `identity_seller_deactivations_total` | Counter | Total seller deactivations | `reason` (fraud, user_request, policy) |
| `identity_onboarding_completions_total` | Counter | Completed onboarding flows | `step_count` |
| `identity_onboarding_abandonments_total` | Counter | Abandoned onboarding flows | `last_step` |
| `identity_profile_updates_total` | Counter | Profile mutations | `field_count` |

### Operational Metrics

| Metric Name | Type | Description | Labels |
|-------------|------|-------------|--------|
| `identity_api_requests_total` | Counter | API request volume | `method`, `route`, `status_code` |
| `identity_api_latency_seconds` | Histogram | API response latency | `method`, `route` |
| `identity_db_query_latency_seconds` | Histogram | DB query latency | `operation`, `table` |
| `identity_db_query_errors_total` | Counter | DB query failures | `operation`, `error_code` |
| `identity_queue_jobs_total` | Counter | Jobs processed | `queue`, `status` (completed, failed, retried) |
| `identity_queue_job_duration_seconds` | Histogram | Job execution time | `queue`, `job_type` |
| `identity_webhook_received_total` | Counter | Webhooks received | `type`, `source` |
| `identity_webhook_processing_seconds` | Histogram | Webhook handling latency | `type` |
| `identity_outbox_backlog` | Gauge | Unpublished outbox rows | — |
| `identity_outbox_relay_latency_seconds` | Histogram | Time from occurred_at to published_at | — |
| `identity_session_active_gauge` | Gauge | Currently active sessions | `session_type` |

### SLOs

| SLO | Target | Measurement Window |
|-----|--------|-------------------|
| API p99 latency (read) | < 100ms | 1 hour |
| API p99 latency (write) | < 300ms | 1 hour |
| DB query p99 latency | < 50ms | 1 hour |
| Webhook processing latency | < 5s | 1 hour |
| Outbox relay latency | < 30s | 1 hour |
| Outbox backlog | < 1000 rows | 1 minute |
| Queue job success rate | > 99.9% | 1 hour |

---

## Alerting Rules

### P1 (Page Immediately)

| Condition | Threshold | Runbook |
|-----------|-----------|---------|
| `identity_db_query_errors_total` spike | > 10 errors/min | `runbooks/identity-db-failure.md` |
| `identity_outbox_backlog` critical | > 10,000 rows for > 5 min | `runbooks/identity-outbox-stall.md` |
| `identity_webhook_received_total` but `identity_webhook_processing_seconds` missing | Webhooks not processing for > 2 min | `runbooks/identity-webhook-stall.md` |
| Auth sync trigger failure rate | > 1% for > 5 min | `runbooks/identity-auth-sync-failure.md` |

### P2 (Page Within 15 Minutes)

| Condition | Threshold | Runbook |
|-----------|-----------|---------|
| Queue job failure rate | > 5% for > 10 min | `runbooks/identity-queue-degradation.md` |
| API p99 latency (write) | > 1s for > 10 min | `runbooks/identity-api-degradation.md` |
| Outbox relay latency | > 5 min for > 10 min | `runbooks/identity-outbox-lag.md` |

### P3 (Ticket / Next Business Day)

| Condition | Threshold | Runbook |
|-----------|-----------|---------|
| Onboarding abandonment rate | > 30% for > 24 hours | `runbooks/identity-onboarding-funnel.md` |
| Session anomaly (unusual IP geolocation) | > 50 anomalies/hour | `runbooks/identity-session-anomaly.md` |
| Profile update error rate | > 1% for > 1 hour | `runbooks/identity-profile-errors.md` |

---

## Health Endpoints

### Service Health

`GET /health/identity`

```json
{
  "status": "healthy",
  "checks": {
    "database": { "status": "pass", "latencyMs": 12 },
    "redis": { "status": "pass", "latencyMs": 3 },
    "outbox_relay": { "status": "pass", "backlog": 23, "relayLagMs": 450 },
    "webhook_processor": { "status": "pass", "lastProcessedAt": "2026-01-01T00:00:00Z" }
  },
  "timestamp": "2026-01-01T00:00:00Z"
}
```

### Readiness Probe

`GET /ready/identity`

Returns `503` if:

* Database connection pool exhausted
* Outbox backlog > 50,000 rows
* Redis unavailable (queues cannot enqueue)

---

## Dashboards

### Identity Operational Dashboard (Grafana)

**Row: Registration Funnel**

* `identity_user_registrations_total` — rate per 5m
* `identity_seller_activations_total` — rate per 5m
* `identity_onboarding_completions_total` vs `identity_onboarding_abandonments_total`

**Row: API Performance**

* `identity_api_requests_total` by route
* `identity_api_latency_seconds` p50/p95/p99 heatmap
* `identity_api_requests_total{status_code=~"5.."}` — error rate

**Row: Queue & Event Health**

* `identity_queue_jobs_total` by queue and status
* `identity_outbox_backlog` — current value
* `identity_outbox_relay_latency_seconds` p99

**Row: Security & Trust**

* `identity_user_suspensions_total` by reason
* `identity_session_active_gauge` by type
* `identity_webhook_received_total` vs processed

---

## Audit Log Requirements

The following operations MUST create immutable audit records (separate from operational logs, stored in `identity_audit_logs`):

| Operation | Actor | Data Captured |
|-----------|-------|---------------|
| User status change | Admin ID or `system` | `previous_status`, `new_status`, `reason` |
| Role change | Admin ID | `previous_role`, `new_role` |
| Seller activation | System | `seller_profile_id`, `stripe_account_id`, `activated_at` |
| Seller deactivation | Admin or system | `reason`, `listings_affected_count` (projected) |
| Session revocation | User or admin | `session_id`, `revoke_reason`, `ip_address` |
| Profile update | User | `changed_fields` (diff only) |

```sql
CREATE TABLE identity_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation VARCHAR(100) NOT NULL,
    actor_id UUID,
    target_id UUID NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    previous_state JSONB,
    new_state JSONB,
    reason TEXT,
    ip_address INET,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_identity_audit_logs_target ON identity_audit_logs(target_id, occurred_at DESC);
CREATE INDEX idx_identity_audit_logs_actor ON identity_audit_logs(actor_id, occurred_at DESC);
```

Retention: 7 years (regulatory requirement for financial platform identity records).

---

## Correlation ID Propagation Checklist

* [ ] API Gateway injects `X-Correlation-Id` if absent
* [ ] Identity API handlers propagate correlation ID to repositories
* [ ] Repository transactions include correlation ID in outbox rows
* [ ] Queue job metadata includes correlation ID
* [ ] Webhook handlers extract or generate correlation ID
* [ ] All log entries include correlation ID
* [ ] Traces use correlation ID as `trace_id` or linked span attribute
* [ ] Error responses include correlation ID

---

## Final Principle

Identity observability must provide operational certainty. If an identity mutation occurred, the system must be able to answer: who, what, when, where, and why — within seconds of querying.
