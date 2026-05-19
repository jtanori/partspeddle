# M1 — Runtime Foundations Tickets

> Architectural work units. No business logic. No UI.

---

## T1.1 — Repository & Runtime Initialization

**Domain:** Shared
**Capability:** Runtime Bootstrap

**Purpose:** Generate the entire foundational file system upon which all subsequent implementation depends. This ticket is the root of reproducibility — if cloned elsewhere, these files must recreate the runtime environment exactly.

**Dependencies:** None

**Architectural Constraints:**
- TypeScript 5.x strict mode (`strict: true`)
- ESM modules only (`"type": "module"`)
- Exact version pinning (no `^` or `~`)
- Node.js 20+ LTS

**Deliverables:**

| File | Purpose |
|------|---------|
| `package.json` | Dependencies, scripts, engine requirements |
| `tsconfig.json` | TypeScript 5.x strict, ESM, NodeNext resolution |
| `eslint.config.js` | No-explicit-any, no-floating-promises, cross-domain import guards |
| `.prettierrc` | Single quotes, trailing commas, 100-char width |
| `.gitignore` | Node, build, env, OS ignore patterns |
| `.env.example` | All required environment variables documented |
| `docker-compose.dev.yml` | Postgres + Redis with healthchecks |
| `vitest.config.ts` | Base test config with coverage thresholds |
| `vitest.unit.config.ts` | Unit test isolation |
| `vitest.integration.config.ts` | Integration test setup |
| `src/app.ts` | Express bootstrap with `/health/ready` and `/health/live` |
| `src/shared/observability/logger.ts` | Structured JSON logger |
| `src/shared/errors/domain-error.ts` | Base domain error class |
| `src/<domain>/...` | Full directory scaffold per `module-template.md` |

**Acceptance Criteria:**
- [ ] `npm install` succeeds with zero warnings
- [ ] `npm run typecheck` passes (`tsc --noEmit`)
- [ ] `npm run lint` passes with zero errors
- [ ] `npm run infra:up` starts Postgres + Redis
- [ ] `npm run dev` starts API server on port 3000
- [ ] `GET /health/ready` returns 200
- [ ] Directory structure matches `repository-structure.md`
- [ ] All files committed to git with descriptive message

**Observability:** N/A

**Failure Modes:**
- Engine mismatch → `package.json` `engines` field blocks install
- Port conflict → `.env.example` documents `PORT` override
- Docker unavailable → document local Postgres/Redis install steps

---

## T1.2 — Shared Event Envelope Library

**Domain:** Shared
**Capability:** Event Infrastructure

**Purpose:** Implement canonical event envelope as TypeScript types and validation.

**Dependencies:** T1.1

**Architectural Constraints:**
- Must conform to `event-envelope-standard.md`
- Payload max 64KB
- Zod schema validation

**Deliverables:**
- `src/shared/event-bus/domain-event.ts`
- `src/shared/event-bus/event-schema.ts`
- `src/shared/event-bus/event-catalog.ts`

**Acceptance Criteria:**
- [ ] Event envelope validates all required fields
- [ ] Invalid events throw structured error
- [ ] Payload size enforcement works

**Observability:** N/A

**Failure Modes:** N/A

---

## T1.3 — Outbox Pattern Implementation

**Domain:** Shared
**Capability:** Event Durability

**Purpose:** Guarantee atomic DB commit + event emission via transactional outbox.

**Dependencies:** T1.2

**Architectural Constraints:**
- Outbox table in Postgres
- Poll interval 2s–5s
- Retry up to 10 times
- DLQ after exhaustion

**Deliverables:**
- `src/shared/outbox/outbox.ts`
- `src/shared/outbox/relay-worker.ts`
- Outbox migration (`outbox` table)

**Acceptance Criteria:**
- [ ] DB mutation + outbox insert in same transaction
- [ ] Relay polls and publishes events
- [ ] Failed publishes retry with backoff
- [ ] DLQ receives exhausted events

**Observability:**
- `outbox_backlog` gauge
- `outbox_relay_latency_seconds` histogram

**Failure Modes:**
- Relay worker crash → auto-restart
- Event bus down → backlog grows, alert fires

---

## T1.4 — Queue Bootstrap (BullMQ)

**Domain:** Shared
**Capability:** Async Orchestration

**Purpose:** Establish durable queue infrastructure for all domains.

**Dependencies:** T1.1

**Architectural Constraints:**
- BullMQ + Redis
- Domain-scoped queues only
- Default retry: 3x exponential
- DLQ naming: `domain-purpose-dlq`

**Deliverables:**
- `src/shared/queue/queue-factory.ts`
- `src/shared/queue/worker-factory.ts`
- Redis connection management
- Health check endpoint

**Acceptance Criteria:**
- [ ] Job enqueue succeeds
- [ ] Worker processes job
- [ ] Failed job retries 3x
- [ ] Exhausted job moves to DLQ
- [ ] Health check returns queue status

**Observability:**
- `queue_jobs_completed_total`
- `queue_jobs_failed_total`
- `queue_waiting_count`

**Failure Modes:**
- Redis unavailable → jobs deferred to Postgres fallback
- Worker crash loop → DLQ after 3 retries

---

## T1.5 — Supabase Client & Connection Pool

**Domain:** Shared
**Capability:** Persistence Access

**Purpose:** Provide typed, pooled Supabase client for all domains.

**Dependencies:** T1.1

**Architectural Constraints:**
- Connection pool max 20
- Query timeout 5s
- Service role for workers
- RLS for client-facing queries

**Deliverables:**
- `src/shared/supabase/client.ts`
- `src/shared/supabase/pool.ts`
- Environment validation (zod)

**Acceptance Criteria:**
- [ ] Client connects to local Supabase
- [ ] Query timeout fires after 5s
- [ ] Pool respects max connections
- [ ] Missing env vars fail fast at startup

**Observability:**
- `db_connections_active` gauge
- `db_query_latency_seconds` histogram

**Failure Modes:**
- Pool exhausted → circuit breaker (future tier)
- Connection timeout → retry with backoff

---

## T1.6 — Observability Bootstrap

**Domain:** Shared
**Capability:** Operational Visibility

**Purpose:** Emit structured logs, metrics, and traces from day one.

**Dependencies:** T1.1

**Architectural Constraints:**
- JSON structured logs only
- W3C traceparent propagation
- No secrets in logs

**Deliverables:**
- `src/shared/observability/logger.ts`
- `src/shared/observability/metrics.ts`
- `src/shared/observability/tracing.ts`
- Correlation ID middleware

**Acceptance Criteria:**
- [ ] Log entry contains timestamp, level, service, correlationId
- [ ] Traceparent propagates across API → queue → event
- [ ] Metrics endpoint returns Prometheus format
- [ ] Secrets are redacted from logs

**Observability:** Self-referential

**Failure Modes:**
- Metrics backend down → local buffering (best effort)

---

## T1.7 — Error System

**Domain:** Shared
**Capability:** Failure Handling

**Purpose:** Establish canonical error hierarchy for all domains.

**Dependencies:** T1.1

**Architectural Constraints:**
- All domain errors extend base `DomainError`
- Raw errors wrapped before crossing boundaries
- Error codes: `DOMAIN_SPECIFIC_REASON`

**Deliverables:**
- `src/shared/errors/domain-error.ts`
- `src/shared/errors/error-mapper.ts`

**Acceptance Criteria:**
- [ ] DomainError contains code, message, correlationId, isRetryable
- [ ] Raw Error wrapped in DomainError
- [ ] API returns canonical error shape

**Observability:**
- `errors_total` counter by code

**Failure Modes:** N/A

---

## T1.8 — CI Pipeline Setup

**Domain:** Shared
**Capability:** Quality Gate

**Purpose:** Fast feedback loop for all code changes.

**Dependencies:** T1.1, T1.2, T1.4

**Architectural Constraints:**
- Target: lint < 30s, unit < 2min, integration < 5min
- Block merge on failure
- Exact dependency versions

**Deliverables:**
- `.github/workflows/ci.yml`
- Test database setup script
- Redis test container config

**Acceptance Criteria:**
- [ ] CI passes on empty test suite
- [ ] Lint stage < 30s
- [ ] Integration tests connect to test DB + Redis
- [ ] Merge blocked if CI fails

**Observability:** N/A

**Failure Modes:**
- Flaky infrastructure test → mark skip, create ticket
