# VINTRACK — Identity Domain Reference Card

> Compressed synthesis of the 9 Identity blueprint files for agent context efficiency.
> Full details in: `overview.md`, `entities.md`, `database-schema.md`, `api-contracts.md`, `repositories.md`, `observability.md`, `tests.md`, `edge-cases.md`, `failure-modes.md`.

---

## Purpose

Identity is the root-of-trust bounded context. It owns authentication, authorization, user lifecycle, buyer/seller roles, onboarding, and trust metadata. All other domains depend on Identity events.

---

## Ownership Boundaries

### Data Owned

| Table | Aggregate | Notes |
|-------|-----------|-------|
| `users` | User | Synced from Supabase Auth; FK to `auth.users(id)` |
| `profiles` | User | Auto-created via trigger; public read |
| `buyer_profiles` | User | Lazy-created on first buyer action |
| `seller_profiles` | SellerProfile | Governs listing/payment eligibility |
| `onboarding_states` | SellerProfile | Tracks 4-step onboarding |
| `user_sessions` | User | Operational audit; 90-day retention |
| `identity_outbox` | — | Transactional outbox for event relay |
| `identity_audit_logs` | — | Immutable audit; 7-year retention |

### Events Owned (Authoritative)

```
user.created, user.updated, user.suspended
seller.activated, seller.deactivated
profile.updated
session.created, session.revoked
```

Canonical structure: `{ eventId, eventType, eventVersion, occurredAt, correlationId, causationId, actorId, domain, aggregateId, payload, metadata }`

---

## Core Entities & Invariants

### User (Aggregate Root)

| Attribute | Type | Default |
|-----------|------|---------|
| `id` | UUID | = `auth.users.id` |
| `email` | VARCHAR(255) | — |
| `role` | ENUM | `buyer` |
| `status` | ENUM | `active` |

**Invariants**

1. `id` MUST match valid `auth.users` record (FK + reconciliation backfill)
2. `email` unique, RFC 5322, NFC-normalized
3. `status` transitions: `active ↔ suspended ↔ deactivated` (no skip)
4. Suspension cascades: revoke all sessions, emit `user.suspended`

### Profile (1:1 with User, required)

| Attribute | Constraints |
|-----------|-------------|
| `display_name` | 1–100 chars, sanitized (no control chars) |
| `avatar_url` | HTTPS, max 2048 chars |
| `location` | JSONB: `{ city, state, country, postal_code }` |

**Invariant**: Single profile per user. Auto-created by trigger.

### BuyerProfile (1:1, lazy)

| Attribute | Constraint |
|-----------|------------|
| `purchase_count` | ≥ 0 |
| `total_spend_cents` | ≥ 0 |

Created on first buyer action via `INSERT ... ON CONFLICT DO NOTHING`.

### SellerProfile (1:1, optional)

| Status | Meaning |
|--------|---------|
| `pending` | Intent declared, no onboarding started |
| `onboarding` | Steps in progress |
| `review` | Steps complete, awaiting approval |
| `active` | Can publish listings and receive payouts |
| `suspended` | Privileges revoked |

**Activation Preconditions** (all must be true):

- `stripe_connect_account_id` populated (begins with `acct_`)
- `verified_identity` = `true`
- `User.status` = `active`

**Invariant**: `activated_at` immutable once set.

### OnboardingState (1:1 with SellerProfile)

Steps: `step_identity`, `step_payout`, `step_terms`, `step_profile`

Completion trigger (DB trigger): all 4 `true` → `seller_profiles.status` → `review`.

### UserSession (1:N with User)

| Field | Constraint |
|-------|------------|
| `started_at` | Server-generated |
| `ended_at` | ≥ `started_at` (CHECK) |
| `revoked` | If `true`, `ended_at` and `revoked_reason` required |

---

## State Machines

### User Lifecycle

```
created → active → suspended → deactivated
            ↑         ↓
         reactivated  reactivated
```

### SellerProfile Lifecycle

```
pending --(register)--> onboarding --(steps complete)--> review --(approve)--> active
                                      ↑                                      ↓
                                   (reject)                                (suspend)
                                                                            ↓
                                                                         suspended --(reinstate)--> active
```

---

## API Surface

Base: `/v1/identity/`

| Method | Route | Auth | Event |
|--------|-------|------|-------|
| GET | `/users/me` | JWT | — |
| GET | `/profiles/me` | JWT | — |
| PATCH | `/profiles/me` | JWT | `profile.updated` |
| POST | `/sellers/register` | JWT + idempotency key | — |
| GET | `/sellers/me` | JWT | — |
| POST | `/sellers/me/onboarding/:step` | JWT | — (trigger handles review) |
| POST | `/sellers/me/deactivate` | JWT | `seller.deactivated` |
| GET | `/sessions/me` | JWT | — |
| DELETE | `/sessions/me` | JWT | `session.revoked` (async) |
| POST | `/webhooks/supabase-auth` | Signature + idempotency | Various |

### Canonical Error Shape

```json
{ "error": { "code": "IDENTITY_XXX", "message": "...", "correlationId": "uuid", "details": {} } }
```

---

## Database Schema Essentials

### Types

```sql
CREATE TYPE user_role AS ENUM ('buyer', 'seller', 'admin');
CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deactivated');
CREATE TYPE seller_status AS ENUM ('pending', 'onboarding', 'review', 'active', 'suspended');
CREATE TYPE session_type AS ENUM ('web', 'mobile', 'api');
CREATE TYPE revoke_reason AS ENUM ('logout', 'expiry', 'admin_action', 'suspension', 'security');
```

### Key Triggers

1. `on_auth_user_created` → creates `users` + `profiles` rows
2. `handle_onboarding_completion` → all steps `true` → `seller_profiles.status = 'review'`
3. `set_timestamp_*` → auto-updates `updated_at`

### Key Indexes

- `users`: `email`, `status` (partial, `!= 'active'`), `role`, `created_at`
- `profiles`: `display_name`, `user_id`
- `seller_profiles`: `status`, `stripe_connect_account_id`
- `user_sessions`: `user_id`, `started_at`, active partial `(ended_at IS NULL)`

### RLS Policies (Summary)

| Table | Self | Public | Admin |
|-------|------|--------|-------|
| `users` | SELECT | — | SELECT |
| `profiles` | SELECT, UPDATE | SELECT | — |
| `buyer_profiles` | ALL | — | — |
| `seller_profiles` | SELECT | SELECT (active only) | ALL |
| `onboarding_states` | ALL (via seller FK) | — | — |
| `user_sessions` | SELECT | — | — |

Service role bypasses RLS for queue workers and outbox relay.

---

## Queue Topology

| Queue | Purpose | Retry |
|-------|---------|-------|
| `identity-onboarding` | Seller step orchestration | 3x exponential backoff |
| `identity-webhooks` | Supabase Auth webhook processing | 3x, then DLQ |
| `identity-sessions` | Async session revocation | 3x |
| `identity-outbox-relay` | Event outbox polling | Continuous |
| `identity-deferred-writes` | Failover write replay | 3x |

---

## Transaction Semantics

| Type | Pattern | Guarantee |
|------|---------|-----------|
| Local | Postgres transaction | ACID on owned tables |
| Distributed | Outbox + event emission | At-least-once delivery; consumers idempotent |
| Compensation | Explicit reversal events | `seller.deactivated` reverses `seller.activated` |

No two-phase commit. Eventual consistency across domains.

---

## Repository Pattern

Repositories operate on aggregate roots only. Cross-domain joins prohibited.

| Repository | Aggregate | Key Ops |
|------------|-----------|---------|
| `UserRepository` | User | CRUD, status/role transitions, last sign-in |
| `ProfileRepository` | Profile | Read, update, public projection |
| `BuyerProfileRepository` | BuyerProfile | Lazy ensure, metric increments (atomic) |
| `SellerProfileRepository` | SellerProfile | CRUD, status transitions, eligibility query |
| `OnboardingStateRepository` | OnboardingState | Step updates, completion |
| `UserSessionRepository` | UserSession | CRUD, revoke, purge |

All mutations write to `identity_outbox` in the same transaction.

---

## Security Posture

- Supabase Auth is canonical provider; no custom credential storage
- JWT validation at API Gateway only
- RLS on all tables
- `seller.activation` requires explicit operational verification
- No credential material logged
- Webhook signatures verified; idempotency window 24h

---

## Observability Quick Reference

### SLOs

| Metric | Target |
|--------|--------|
| API read p99 | < 100ms |
| API write p99 | < 300ms |
| DB query p99 | < 50ms |
| Outbox relay lag | < 30s |
| Queue success rate | > 99.9% |

### Critical Alerts

- DB errors > 10/min → P1
- Outbox backlog > 10,000 for > 5 min → P1
- Webhook stall > 2 min → P1
- Queue failures > 5% for > 10 min → P2

---

## Testing Requirements

| Layer | Coverage Target | Focus |
|-------|----------------|-------|
| Unit | 100% lines/branches (entities) | Invariants, state machines, event emission |
| Integration | 95% lines | DB triggers, RLS, queue workers, outbox relay |
| Contract | — | Event schema, API error shape, idempotency |
| E2E | — | Buyer→Seller journey, session lifecycle |

### Mandatory Failure-Path Tests

- Duplicate auth webhook → idempotent
- Concurrent seller registration → one succeeds, one 409
- Invalid status transition → rejected, no mutation
- Outbox relay failure → retry, then DLQ
- RLS violation → 403, no data leak

---

## Edge Cases (High-Impact Summary)

| ID | Scenario | Behavior |
|----|----------|----------|
| EC-01 | Auth user exists before Identity sync | Reconciliation job backfills every 5 min |
| EC-04 | Concurrent seller registration | Idempotency key or unique constraint → 409 |
| EC-06 | Orphaned users row (no auth.users) | Auto-deactivate; preserve audit history |
| EC-10 | Reused Stripe Connect account ID | Unique constraint → 409; security log |
| EC-11 | Out-of-order webhooks | Delayed enqueue + retry; reconciliation backfill |
| EC-18 | Hard-deleted Supabase Auth user | FK cascade disabled; auto-deactivate Identity user |

---

## Failure Modes (High-Impact Summary)

| ID | Failure | Auto Recovery |
|----|---------|---------------|
| FM-01 | Supabase Auth down | Client retry; JWT validation local (cached JWKS) |
| FM-02 | DB pool exhausted | Query timeout; circuit breaker opens 30s |
| FM-04 | Redis down | In-memory buffer 60s; fallback to `identity_deferred_jobs` table |
| FM-05 | Worker crash loop | BullMQ DLQ after 3 retries |
| FM-08 | Outbox relay stall | Auto-restart worker; health endpoint 503 if > 50k backlog |
| FM-17 | Credential stuffing | Rate limit + CAPTCHA after 5 failures/IP |

---

## Implementation Sequence

1. DB schema + RLS policies + triggers
2. Supabase Auth webhook handlers
3. User sync trigger/function
4. Profile management APIs
5. Seller onboarding state machine + queue workers
6. Event emission infrastructure (outbox + relay)
7. Observability instrumentation
8. Test suite (TDD discipline enforced)

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Supabase Auth as canonical provider | No custom credential storage; security isolation |
| Lazy buyer profile | Avoid data for non-buyers |
| Separate onboarding_states table | Avoid bloating SellerProfile with transient state |
| DB trigger for profile auto-creation | Guaranteed consistency on auth insert |
| Outbox pattern instead of immediate event emission | Atomicity: DB commit + event durability |
| No cascade delete on auth.users hard-delete | Preserve audit trail; auto-deactivate instead |
| No optimistic locking on profile updates | MVP: last-write-wins acceptable for non-critical data |
| Server-generated session timestamps | Prevent client clock skew attacks |
