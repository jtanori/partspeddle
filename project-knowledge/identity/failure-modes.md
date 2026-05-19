# VINTRACK — Identity Domain Failure Modes

## Purpose

Documents systematic failure scenarios, their detection mechanisms, automatic recovery paths, and escalation procedures for the Identity bounded context.

Failure is an expected operational condition. Every critical Identity workflow must define its failure behavior before implementation.

---

## Failure Mode Taxonomy

| ID | Component | Failure | Impact | Detection |
|----|-----------|---------|--------|-----------|
| FM-01 | Supabase Auth | Unavailable | Registration, login blocked | Health check + timeout |
| FM-02 | Postgres | Connection pool exhausted | All DB operations fail | Connection wait time metric |
| FM-03 | Postgres | Primary failover | Brief write unavailability | Replication lag alert |
| FM-04 | Redis | Unavailable | Queue enqueue fails | Redis ping failure |
| FM-05 | Queue Worker | Crash loop | Async jobs stall | Job age metric |
| FM-06 | Webhook | Signature verification fails | Auth events not processed | Webhook error rate |
| FM-07 | Webhook | Delivery timeout | Auth state lag | Webhook latency metric |
| FM-08 | Outbox Relay | Stalled | Events not published | Backlog gauge |
| FM-09 | Outbox Relay | Publish loop failure | Event loss risk | Retry exhaustion rate |
| FM-10 | API | Rate limit breach | Legitimate requests rejected | 429 rate metric |
| FM-11 | API | JWT validation degradation | Auth delays | Latency spike on auth middleware |
| FM-12 | Domain Logic | Invalid state transition | Data corruption prevented | Error rate + invariant alerts |
| FM-13 | External | Stripe Connect API unavailable | Payout step blocked | Stripe webhook absence |
| FM-14 | External | Stripe account invalid | Onboarding cannot complete | Stripe API error code |
| FM-15 | Data | Constraint violation | Request rejected | DB error logs |
| FM-16 | Data | Orphaned auth record | Identity-user mismatch | Reconciliation query |
| FM-17 | Security | Credential stuffing attack | Auth overload | Failed login rate anomaly |
| FM-18 | Security | Suspicious session pattern | Potential account compromise | Geo-velocity anomaly |

---

## Detailed Failure Modes

### FM-01: Supabase Auth Unavailable

**Scenario**: Supabase Auth service returns 503 or times out.

**Impact**:

* New user registration blocked
* Login blocked
* Existing authenticated users unaffected (JWT validation is local)

**Automatic Recovery**:

1. API Gateway returns `503 SERVICE UNAVAILABLE` with `IDENTITY_AUTH_PROVIDER_UNAVAILABLE`.
2. Client retry with exponential backoff (max 30s).
3. Health check marks Identity service degraded (not unhealthy — DB/queues still work).

**Operational Response**:

* Monitor Supabase status page.
* If outage > 15 minutes, enable maintenance mode banner.

**Compensation**:

* Webhook backlog: Supabase retries webhooks automatically.
* No data loss; events replay when Auth recovers.

---

### FM-02: Postgres Connection Pool Exhausted

**Scenario**: All connections in pool are in use; new queries wait > 5s.

**Impact**:

* API latency spikes
* Queue workers stall
* Potential cascading timeouts

**Automatic Recovery**:

1. Query timeout (5s) fires; request returns `500` with `IDENTITY_INTERNAL_ERROR`.
2. Circuit breaker opens after 10 consecutive DB failures.
3. Circuit breaker returns `503` for 30s, then half-open.

**Operational Response**:

* Inspect slow query log.
* Scale connection pool if sustained load.
* Kill long-running queries if necessary.

**Metrics**:

* `identity_db_pool_wait_duration_seconds`
* `identity_db_connections_active`
* `identity_db_connections_idle`

---

### FM-03: Postgres Primary Failover

**Scenario**: Supabase primary database fails over to replica.

**Impact**:

* Brief write unavailability (~5-30s)
* Read queries continue via read replica

**Automatic Recovery**:

1. Connection pool detects broken connections; recycles them.
2. Retry with exponential backoff (3 attempts, max 2s delay).
3. If writes fail after retries, enqueue mutation to `identity-deferred-writes` queue for replay.

**Operational Response**:

* Monitor replication lag.
* Verify deferred-write queue drains after failover.

---

### FM-04: Redis Unavailable

**Scenario**: Redis instance unreachable; BullMQ cannot enqueue.

**Impact**:

* Async workflows cannot start
* Webhook processing stalls
* Session revocation deferred

**Automatic Recovery**:

1. BullMQ throws connection error.
2. API returns `202 ACCEPTED` with `warning: deferred_execution`.
3. In-memory fallback buffer (max 1000 jobs) holds jobs for 60s.
4. If Redis recovers within 60s, buffer flushes.
5. If not, jobs written to `identity_deferred_jobs` Postgres table.
6. Recovery worker polls `identity_deferred_jobs` every 30s and replays to Redis.

**Operational Response**:

* If Redis outage > 5 minutes, scale recovery worker.
* Alert if `identity_deferred_jobs` > 1000 rows.

---

### FM-05: Queue Worker Crash Loop

**Scenario**: Worker process crashes on specific job; Kubernetes restarts repeatedly.

**Impact**:

* Job never completes
* Queue grows
* Other jobs delayed

**Automatic Recovery**:

1. BullMQ tracks attempt count.
2. After 3 retries with exponential backoff, job moved to dead-letter queue (`identity-dead-letter`).
3. Worker continues processing other jobs.
4. Alert fires when DLQ length > 10.

**Operational Response**:

* Inspect DLQ job payload and error stack.
* Fix code or data issue.
* Replay DLQ jobs manually after fix.

---

### FM-06: Webhook Signature Verification Fails

**Scenario**: Supabase Auth webhook received with invalid signature.

**Impact**:

* Potential spoofing attack
* Auth events ignored

**Automatic Recovery**:

1. Return `401 UNAUTHORIZED` immediately.
2. Log full payload (sanitized) at `warn` level with source IP.
3. Increment `identity_webhook_invalid_signature_total` counter.
4. Alert if rate > 10/min (potential attack).

**Operational Response**:

* Verify `WEBHOOK_SECRET` rotation did not break legitimate signatures.
* If attack: rate-limit source IP at edge.

---

### FM-07: Webhook Delivery Timeout

**Scenario**: Supabase Auth webhook delivery times out (> 30s).

**Impact**:

* Auth state lag in Identity domain
* User may exist in Auth but not in Identity

**Automatic Recovery**:

1. Supabase retries webhook with exponential backoff (up to 24h).
2. Identity webhook handler is idempotent; duplicate processing safe.
3. Reconciliation job (every 5 min) backfills any gaps.

**Operational Response**:

* If persistent timeouts: scale webhook handler replicas.
* Check for slow DB queries in webhook path.

---

### FM-08: Outbox Relay Stalled

**Scenario**: Outbox relay worker stops processing unpublished events.

**Impact**:

* Downstream domains do not receive Identity events
* Eventual consistency window extends indefinitely

**Automatic Recovery**:

1. `identity_outbox_backlog` gauge triggers alert at > 1000 rows.
2. Health endpoint returns `503` on `/ready/identity` if backlog > 50,000.
3. Auto-restart relay worker if no progress for > 2 min.

**Operational Response**:

* Inspect relay worker logs.
* Check downstream event bus availability.
* If event bus down: events accumulate; replay when recovered.

---

### FM-09: Outbox Publish Loop Failure

**Scenario**: Relay worker can read outbox but publish to event bus fails permanently.

**Impact**:

* Events never reach consumers
* Retry count increments to max

**Automatic Recovery**:

1. After 10 retries, move row to `identity_outbox_dead_letter`.
2. Alert on DLQ insertion.
3. Main outbox row marked `published_at = NULL` with `error` column populated.

**Operational Response**:

* Inspect DLQ rows.
* Fix event bus or payload issue.
* Replay DLQ rows manually.

---

### FM-10: API Rate Limit Breach

**Scenario**: Client exceeds rate limit (legitimate burst or attack).

**Impact**:

* Legitimate requests rejected with `429`

**Automatic Recovery**:

1. API Gateway returns `429` with `Retry-After` header.
2. Client-side retry with exponential backoff.
3. Burst bucket refills per sliding window.

**Operational Response**:

* If global rate: scale API Gateway.
* If targeted attack: enable IP-based stricter rate limit.

---

### FM-11: JWT Validation Degradation

**Scenario**: JWT validation at API Gateway slows down (Supabase JWKS fetch latency).

**Impact**:

* All API requests slow
* User experience degrades

**Automatic Recovery**:

1. Cache JWKS with 1h TTL.
2. If JWKS fetch fails, use cached copy (stale-while-revalidate).
3. If cache expired and fetch fails, return `503` with `IDENTITY_AUTH_PROVIDER_UNAVAILABLE`.

**Operational Response**:

* Monitor JWKS fetch latency.
* If persistent: consider local JWKS mirror.

---

### FM-12: Invalid State Transition Attempt

**Scenario**: Code bug or API misuse attempts illegal state machine transition.

**Impact**:

* Data corruption risk

**Automatic Recovery**:

1. Domain entity rejects transition; throws `InvalidStatusTransitionError`.
2. Repository does not execute UPDATE.
3. API returns `422` with `IDENTITY_INVALID_STATUS_TRANSITION`.
4. Log at `warn` with full context.

**Operational Response**:

* If repeated: investigate client or service making invalid requests.
* If internal service: fix bug, deploy.

---

### FM-13: Stripe Connect API Unavailable

**Scenario**: Seller onboarding step `payout` cannot validate Stripe account due to Stripe outage.

**Impact**:

* Onboarding cannot complete
* Seller activation blocked

**Automatic Recovery**:

1. Stripe SDK returns connection error.
2. Enqueue `identity-onboarding` job with 5-minute delay.
3. Retry up to 10 times over 24 hours.
4. If exhausted: leave step incomplete; notify user.

**Operational Response**:

* Monitor Stripe status page.
* Manual override possible for trusted sellers (admin API).

---

### FM-14: Invalid Stripe Account ID

**Scenario**: User provides malformed or non-existent Stripe Connect account ID.

**Impact**:

* Onboarding step fails
* Seller cannot activate

**Automatic Recovery**:

1. Stripe API returns `invalid_request_error`.
2. API returns `422` with `IDENTITY_INVALID_STRIPE_ACCOUNT`.
3. Log at `info`.

**Operational Response**:

* None required; user must provide valid account.

---

### FM-15: Constraint Violation

**Scenario**: DB constraint prevents insert/update (e.g., duplicate email, negative metric).

**Impact**:

* Request rejected

**Automatic Recovery**:

1. Postgres returns error code.
2. Repository maps to domain error.
3. API returns appropriate 4xx status.
4. Log at `debug`.

**No operational response required** for standard constraint violations.

---

### FM-16: Orphaned Auth Record

**Scenario**: `auth.users` deleted but `users` row remains (see EC-18).

**Impact**:

* Stale identity data
* Potential security risk

**Automatic Recovery**:

* Reconciliation job detects orphan.
* Auto-deactivates `users` row.
* Preserves history.

**Operational Response**:

* If frequent: investigate Supabase Auth deletion patterns.

---

### FM-17: Credential Stuffing Attack

**Scenario**: High volume of failed login attempts against existing emails.

**Impact**:

* Auth provider rate limit
* Legitimate login blocked

**Automatic Recovery**:

1. Supabase Auth handles brute-force protection.
2. Identity service observes failed webhook patterns.
3. If Supabase Auth not blocking: API Gateway enables IP-based rate limit (10 req/min per IP).
4. CAPTCHA challenge after 5 failures from same IP.

**Operational Response**:

* Monitor `identity_auth_failed_attempts_total` by IP.
* Block IPs at edge if attack volume high.

---

### FM-18: Suspicious Session Pattern

**Scenario**: User session created from geographically distant location within impossible time window.

**Impact**:

* Potential account compromise

**Automatic Recovery**:

1. Session creation enqueued to `identity-risk-signals` queue (MVP: passive logging only).
2. Log `warn` with geo-velocity data.
3. Do NOT auto-revoke (MVP decision — avoid false positives).

**Operational Response**:

* Review flagged sessions in admin dashboard.
* Manual revocation if confirmed suspicious.
* Post-MVP: automated step-up authentication.

---

## Failure Recovery Matrix

| ID | Auto-Retry | Compensation | Human Escalation | Max Recovery Time |
|----|-----------|--------------|------------------|-------------------|
| FM-01 | Client retry | Event replay | > 15 min | N/A (external) |
| FM-02 | 3x DB retry | Circuit breaker | > 5 min | 30s |
| FM-03 | 3x with backoff | Deferred writes | > 2 min | 60s |
| FM-04 | In-memory buffer | Postgres fallback | > 5 min | 60s |
| FM-05 | BullMQ retry | DLQ | Immediate (DLQ alert) | 24h (retry window) |
| FM-06 | None (reject) | None | If attack pattern | Immediate |
| FM-07 | Supabase retry | Reconciliation | > 10 min | 5 min |
| FM-08 | Auto-restart worker | Event backlog | > 2 min | 2 min |
| FM-09 | 10x retry | DLQ | Immediate | 24h |
| FM-10 | Client retry | None | If global | Immediate |
| FM-11 | Cached JWKS | Degraded mode | > 10 min | 1h (cache TTL) |
| FM-12 | None (reject) | None | If repeated | Immediate |
| FM-13 | 10x over 24h | Step remains incomplete | If persistent | 24h |
| FM-14 | None | None | None | Immediate |
| FM-15 | None | None | None | Immediate |
| FM-16 | Reconciliation | Auto-deactivate | If frequent | 5 min |
| FM-17 | Rate limit | IP block | If large scale | Immediate |
| FM-18 | Passive logging | None | Review queue | N/A |

---

## Runbook References

| Failure Mode | Runbook |
|-------------|---------|
| FM-01 | `runbooks/identity-auth-provider-outage.md` |
| FM-02 | `runbooks/identity-db-pool-exhaustion.md` |
| FM-03 | `runbooks/identity-db-failover.md` |
| FM-04 | `runbooks/identity-redis-outage.md` |
| FM-05 | `runbooks/identity-worker-crash-loop.md` |
| FM-06 | `runbooks/identity-webhook-security.md` |
| FM-08 | `runbooks/identity-outbox-stall.md` |
| FM-17 | `runbooks/identity-credential-stuffing.md` |

---

## Final Principle

Failure modes are not bugs to be found later. They are operational requirements that must be designed, instrumented, and tested. The Identity domain must remain trustworthy even when its dependencies fail.
