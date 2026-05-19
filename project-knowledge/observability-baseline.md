# VINTRACK — Observability Baseline

## Purpose

Minimum observability requirements for production. Not a full monitoring platform — enough to detect, diagnose, and recover from failures.

---

## Three Pillars

### Logs

- Structured JSON only
- Required fields: `timestamp`, `level`, `service`, `correlationId`, `message`
- Log levels: `error`, `warn`, `info`, `debug`
- Retention: 30 days

### Metrics

| Metric | Type | Alert |
|--------|------|-------|
| `api_requests_total` | Counter | — |
| `api_latency_seconds` | Histogram | p99 > 1s |
| `db_query_errors_total` | Counter | > 10/min |
| `queue_jobs_failed_total` | Counter | > 5/min |
| `outbox_backlog` | Gauge | > 1000 |

### Traces

- W3C `traceparent` propagation
- Span per: API request, DB query, queue job, webhook
- Retention: 7 days

---

## Alerting Tiers

| Tier | Response | Examples |
|------|----------|----------|
| P1 | Page immediately | DB down, payment pipeline stalled, auth failure spike |
| P2 | Respond within 15 min | Queue DLQ growing, API latency spike, webhook timeout |
| P3 | Next business day | Coverage drop, slow query pattern, non-critical error rate |

---

## Health Endpoints

```
GET /health/ready     # Returns 503 if DB or Redis unavailable
GET /health/live      # Returns 200 if process is running
GET /metrics          # Prometheus-compatible metrics endpoint
```

---

## Final Principle

Observability is not instrumentation. It is the ability to answer unknown-unknown questions. If you cannot explain a production incident with existing telemetry, the observability is insufficient.
