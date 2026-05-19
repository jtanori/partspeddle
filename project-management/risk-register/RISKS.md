# VINTRACK — Risk Register

> Operational risks derived from architecture. Not generic project management risks.

---

## Risk Taxonomy

| ID | Category | Risk | Likelihood | Impact | Mitigation | Owner |
|----|----------|------|------------|--------|------------|-------|
| R1 | Architecture | Cross-domain coupling introduced during implementation | High | Critical | ESLint `no-restricted-imports`, code review checklist | Architecture |
| R2 | Architecture | Event schema drift breaks consumers | Medium | Critical | Event catalog enforcement, contract tests | Architecture |
| R3 | Data | RLS policy gaps expose user data | Medium | Critical | RLS integration tests, security audit | Security |
| R4 | Data | Stripe webhook replay creates duplicate payments | Medium | Critical | Idempotency keys, webhook deduplication | Transactions |
| R5 | Operations | Queue worker crash loop stalls workflows | Medium | High | DLQ, alerting, auto-restart | Operations |
| R6 | Operations | Outbox relay stall breaks eventual consistency | Low | High | Health check 503, backlog alert | Operations |
| R7 | Performance | DB connection pool exhaustion under load | Medium | High | Pool limit 20, query timeout 5s, circuit breaker (future) | Operations |
| R8 | Performance | Algolia indexing lag > 5 min | Medium | Medium | Backlog monitoring, retry logic | Search |
| R9 | External | Stripe API rate limit during flash sale | Medium | High | Queue rate limiting, exponential backoff | Transactions |
| R10 | External | Gemini API quota exceeded | High | Low | Skip enrichment, queue backoff | AI |
| R11 | Security | Credential stuffing on auth endpoints | Medium | High | Rate limiting, CAPTCHA after 5 failures | Security |
| R12 | Security | Secrets committed to repository | Medium | Critical | Pre-commit hooks, secret scanning | Security |
| R13 | Implementation | TDD discipline erodes under velocity pressure | High | High | CI coverage gates, review checklist | Engineering |
| R14 | Implementation | State machine transitions bypass validation | Low | Critical | Unit tests 95%+, integration tests, DB constraints | Engineering |
| R15 | Timeline | M6 (Transactions) underestimation delays launch | High | High | Fixed 2-week allocation, descope plan ready | Product |

---

## Critical Risks (P1)

### R1 — Cross-Domain Coupling

**Scenario:** Developer imports `transactions/domain/entities` from `marketplace/`.

**Impact:** Architecture degradation, hidden dependencies, test fragility.

**Mitigation:**
- ESLint `no-restricted-imports` rule
- Code review checklist enforces boundary check
- Weekly architecture review

**Trigger:** Any PR touching > 1 domain.

---

### R3 — RLS Policy Gaps

**Scenario:** New table added without RLS, or policy allows overly broad access.

**Impact:** Data breach, compliance failure.

**Mitigation:**
- RLS mandatory checklist item
- Integration tests verify unauthorized access blocked
- Security audit before production

**Trigger:** Any schema migration.

---

### R4 — Duplicate Payments

**Scenario:** Stripe webhook replayed after timeout, payment processed twice.

**Impact:** Financial loss, customer trust destroyed.

**Mitigation:**
- Idempotency keys on all payment operations
- Webhook deduplication (24h window)
- Reconciliation job validates Stripe vs local state

**Trigger:** Any payment webhook handler change.

---

### R12 — Secrets in Repository

**Scenario:** `.env` file or API key committed to git.

**Impact:** Credential compromise, platform breach.

**Mitigation:**
- `.env` in `.gitignore`
- Pre-commit hook scanning for secrets
- GitHub secret scanning enabled
- Quarterly key rotation

**Trigger:** Any commit containing configuration.

---

## High Risks (P2)

### R5 — Worker Crash Loop

**Scenario:** Bug in queue worker causes infinite restart loop.

**Impact:** Async workflows stall, backlog grows.

**Mitigation:**
- DLQ after 3 retries
- Alert on DLQ growth
- Manual replay after fix

**Trigger:** Alert `queue_jobs_failed_total > 5/min`.

---

### R7 — DB Pool Exhaustion

**Scenario:** Load spike consumes all 20 connections.

**Impact:** All DB operations fail, platform halt.

**Mitigation:**
- Query timeout 5s
- Connection pool monitoring
- Slow query log review
- Scale pool if sustained (post-MVP)

**Trigger:** Alert `db_pool_wait_duration_seconds > 1s`.

---

### R13 — TDD Erosion

**Scenario:** Velocity pressure leads to skipped tests.

**Impact:** Regression bugs, deployment fear, velocity death spiral.

**Mitigation:**
- CI blocks merge on test failure
- Coverage gates (80% line, 70% branch)
- Review checklist enforces test presence

**Trigger:** PR without tests.

---

## Medium Risks (P3)

### R8 — Search Index Lag

**Scenario:** Algolia indexing falls behind listing updates.

**Impact:** Stale search results, buyer confusion.

**Mitigation:**
- Indexing backlog monitoring
- Retry logic with backoff
- Manual reindex capability

**Trigger:** Alert `search_index_lag_seconds > 300`.

---

### R10 — Gemini API Quota

**Scenario:** Image upload volume exceeds Gemini quota.

**Impact:** AI enrichment stalls.

**Mitigation:**
- Skip enrichment on quota exceeded
- Queue backoff
- Retry next day

**Trigger:** Alert `ai_jobs_failed_total` with quota error code.

---

## Risk Response Matrix

| Risk | Avoid | Mitigate | Transfer | Accept |
|------|-------|----------|----------|--------|
| R1 | — | ESLint + review | — | — |
| R3 | — | Tests + audit | — | — |
| R4 | — | Idempotency | — | — |
| R5 | — | DLQ + alert | — | — |
| R7 | — | Monitoring | — | Scale later |
| R9 | — | Rate limit | — | — |
| R10 | — | Backoff | — | Skip enrichment |
| R12 | Pre-commit hooks | Scanning | — | — |
| R13 | — | CI gates | — | — |
| R15 | — | Buffer time | — | Descope plan |

---

## Final Principle

Risks are not project management theater. They are architectural failure modes with operational consequences. Every risk must have a trigger, a mitigation, and an owner.
