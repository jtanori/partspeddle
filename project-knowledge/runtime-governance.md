# VINTRACK — Runtime Governance

## Purpose

Formalizes the infrastructure assumptions that are currently implicit. Prevents architectural debt from accumulating as the system grows.

---

## 1. Connection Ownership

| Resource | Owner | Lifecycle |
|----------|-------|-----------|
| PostgreSQL pool | Shared singleton | Process lifetime |
| Redis connection | Shared singleton | Process lifetime |
| Supabase service client | Singleton per role | Process lifetime |
| Supabase anon client | Singleton per role | Process lifetime |

**Rule:** Only runtime bootstrap may terminate connections. Domains, repositories, and workers MUST NOT call `.end()`, `.close()`, or `.quit()` on shared resources.

---

## 2. Lifecycle Management

Correct shutdown order:

1. Stop accepting HTTP requests
2. Stop queue polling (BullMQ workers)
3. Drain active workers to completion
4. Flush telemetry / logs
5. Close PostgreSQL pool (`closePool()`)
6. Close Redis connection (`closeRedisConnection()`)
7. Exit process

---

## 3. Trace Propagation Rules

Every operation that crosses an async boundary MUST propagate:

- `correlationId` — request lineage
- `traceparent` — W3C distributed trace context
- `causationId` — event ancestry (where applicable)

**Boundaries:**
- HTTP request → queue job
- Queue job → event emission
- Event emission → webhook
- API → database mutation

**Outbox rows MUST contain:** `correlation_id`, `traceparent`

---

## 4. Retry Boundaries

| Layer | May Retry? | Examples |
|-------|-----------|----------|
| Outbox relay | Yes | Network timeout, broker unavailable |
| Queue worker | Yes | Transient failures, rate limits |
| Postgres pool | **No** | Deadlock, timeout, connection error |
| Transaction helper | **No** | Rollback and propagate only |

**Rule:** Infrastructure primitives (pool, transaction helper) do NOT retry. Retries belong in orchestration layers.

---

## 5. Timeout Ownership

| Timeout | Owner | Mechanism |
|---------|-------|-----------|
| Query timeout | Postgres pool | `statement_timeout` |
| Connect timeout | Postgres pool | `connect_timeout` |
| Application timeout | Caller | `withTimeout()` wrapper |
| HTTP request timeout | API Gateway | Express timeout |
| Queue job timeout | BullMQ | Job-level timeout |

**Rule:** Different workloads may require different query timeouts. Document per-domain requirements before M6.

---

## 6. Idempotency Guarantees

- `eventId` is the canonical deduplication key
- Relay workers MUST preserve `eventId` exactly
- Consumers MUST deduplicate by `eventId` (24h minimum window)
- Queue jobs SHOULD include idempotency keys for financial operations

---

## 7. Metrics Governance

**Process-local only.** Cluster-wide visibility requires external aggregation.

**Forbidden labels (high cardinality):**
- `userId`, `email`, `listingId`, `transactionId`, `vin`
- `correlationId`, `traceId`, `sessionId`

**Allowed labels (low cardinality):**
- `domain`, `queue`, `status`, `operation`, `error_code`

---

## 8. Error Code Governance

Format: `<DOMAIN>_<RESOURCE>_<FAILURE>`

Examples:
- `IDENTITY_SELLER_NOT_FOUND`
- `MARKETPLACE_LISTING_CONFLICT`
- `SHARED_DB_QUERY_TIMEOUT`

**Forbidden:**
- Arbitrary prose
- Dynamic codes
- Nested dot notation

---

## 9. Queue Naming Governance

Format: `domain-purpose`

DLQ format: `domain-purpose-dlq`

**Rule:** Every queue is owned by exactly one domain. No shared generic queues.

---

## 10. Infrastructure Trust Levels

| Level | Meaning | Allowed Contexts |
|-------|---------|-----------------|
| `public` | User-facing / RLS-bound | Client APIs, anon client |
| `trusted_backend` | API backend with partial elevation | Internal API routes |
| `infrastructure` | Queues / outbox / workers | Workers, relay, scheduled jobs |
| `root_system` | Migrations / admin / break-glass | Migrations, admin CLI, manual ops |

**Rule:** Service role bypasses RLS. It is root access. Never use in request-scoped or frontend-exposed contexts.
