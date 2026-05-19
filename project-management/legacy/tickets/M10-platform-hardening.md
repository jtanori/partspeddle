# M10 — Platform Hardening Tickets

> Operational resilience before production.

---

## T10.1 — Observability Completion

**Domain:** Shared
**Capability:** Monitoring

**Purpose:** Production-ready dashboards and alerting.

**Dependencies:** All previous milestones

**Architectural Constraints:**
- Grafana dashboards per domain
- P1/P2/P3 alert routing
- On-call runbook links
- 30-day log retention

**Deliverables:**
- Grafana dashboard definitions
- Alert rule configurations
- Runbook stubs

**Acceptance Criteria:**
- [ ] Dashboards cover all critical metrics
- [ ] P1 alerts page within 2 minutes
- [ ] Runbooks linked from alerts
- [ ] Log retention confirmed

**Observability:** Self-referential

**Failure Modes:**
- Alert fatigue → review and tune thresholds

---

## T10.2 — DLQ Tooling & Replay

**Domain:** Shared
**Capability:** Operational Recovery

**Purpose:** Enable manual intervention on failed jobs.

**Dependencies:** T1.4 (queue)

**Architectural Constraints:**
- CLI tool to inspect DLQ
- Replay single job or batch
- Audit log of all replays
- No automatic replay without review

**Deliverables:**
- `scripts/dlq-inspect.ts`
- `scripts/dlq-replay.ts`
- Replay audit logging

**Acceptance Criteria:**
- [ ] Inspect DLQ contents
- [ ] Replay single job
- [ ] Replay batch with confirmation
- [ ] Audit log records actor + timestamp

**Observability:**
- `dlq_replays_total` counter

**Failure Modes:**
- Replay of poison job → detect and abort

---

## T10.3 — Rate Limiting & Abuse Prevention

**Domain:** Shared
**Capability:** Protection

**Purpose:** Prevent abuse and ensure fair resource usage.

**Dependencies:** T1.6 (observability)

**Architectural Constraints:**
- Sliding window rate limits
- Per-user and per-IP tracking
- Redis-backed counters
- 429 responses with Retry-After

**Deliverables:**
- `src/shared/api/middleware/rate-limiter.ts`
- Rate limit configuration per endpoint
- Abuse detection (basic)

**Acceptance Criteria:**
- [ ] Rate limit enforced on all sensitive endpoints
- [ ] 429 returns Retry-After header
- [ ] Abuse spike triggers alert
- [ ] IP blocklist functional

**Observability:**
- `api_rate_limit_hits_total` counter
- `api_abuse_detections_total` counter

**Failure Modes:**
- Redis down → permissive fallback (fail open)

---

## T10.4 — Reconciliation Validation

**Domain:** Shared
**Capability:** Data Integrity

**Purpose:** Validate consistency across domain projections.

**Dependencies:** T6.5 (settlement), T8.3 (release)

**Architectural Constraints:**
- Daily reconciliation job
- Compare: transactions vs Stripe vs Vault
- Discrepancy alert → P1
- Manual correction procedure

**Deliverables:**
- `scripts/reconcile-transactions.ts`
- Reconciliation report generation
- Discrepancy alert rules

**Acceptance Criteria:**
- [ ] Daily reconciliation runs automatically
- [ ] Discrepancy detected within 24h
- [ ] Report generated with details
- [ ] Alert fires on mismatch

**Observability:**
- `reconciliation_discrepancies_total` counter

**Failure Modes:**
- Stripe API down → skip and retry next run
- Large discrepancy → P1 alert + manual investigation

---

## T10.5 — Load Testing

**Domain:** Shared
**Capability:** Performance Validation

**Purpose:** Verify system handles expected MVP load.

**Dependencies:** All milestones

**Architectural Constraints:**
- Smoke tests: 100 concurrent checkouts
- API latency p99 < 500ms
- DB connection pool < 80% utilization
- Queue backlog < 1000 jobs

**Deliverables:**
- `tests/load/checkout-smoke.test.ts`
- Load test configuration
- Performance baseline documentation

**Acceptance Criteria:**
- [ ] 100 concurrent checkouts complete successfully
- [ ] No data corruption under load
- [ ] p99 latency < 500ms
- [ ] Queue backlog remains < 1000

**Observability:**
- Load test metrics captured

**Failure Modes:**
- Load test failure → identify bottleneck, fix, rerun
