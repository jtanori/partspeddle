# M2 Auth Decoupling — Working Plan Report

> Generated: 2026-05-19
> Status: Review Pending
> Scope: T2.1–T2.4 + Architectural Revisions (T2.0A–T2.6A)

---

## Executive Summary

M1 — Runtime Foundations is **APPROVED COMPLETE**. M2 — Identity Foundation was in progress when an architectural review revealed that VINTRACK's dependency on the full local Supabase stack is unnecessary and operationally expensive.

**Core insight:** VINTRACK needs PostgreSQL + JWT auth. Not "full Supabase."

**Current state:** The architecture is already well-decoupled (repositories abstract persistence, events are internal, queues are independent). The fix is surgical, not structural.

**Decision:** Adopt hosted Supabase Auth + local PostgreSQL + local Redis. Abstract auth behind an `IdentityProvider` port.

---

## What Changes (And What Does Not)

| Layer | Current | Revised | Impact |
|-------|---------|---------|--------|
| Local Docker | postgres + redis (already) | postgres + redis only | None — already correct |
| Auth system | Assumed local `auth.users` | Hosted Supabase Auth + `identity.users` | T2.1A migration |
| User aggregate | FK to `auth.users(id)` | FK to `identity.users(id)` | T2.1A migration |
| Auth verification | Direct Supabase SDK usage | `IdentityProvider` port + JWKS | T2.2A new code |
| Webhook sync | Local trigger on `auth.users` | Hosted webhook → queue → `identity.users` | T2.6A redesign |
| CI pipeline | No change needed | No change needed | None |
| Event system | No change | No change | None |
| Outbox pattern | No change | No change | None |
| Queue infrastructure | No change | No change | None |

**What does NOT change:**
- Domain event envelope standard
- Outbox pattern implementation
- BullMQ queue infrastructure
- Repository pattern
- Error system
- Observability stack
- CI pipeline

The decoupling is exactly surgical because M1 built the right abstractions.

---

## Interstitial Tickets Created

### T2.0A — ADR: Auth Provider Decoupling Strategy
**Purpose:** Document the architectural decision.
**Deliverables:** ADR in `project-knowledge/adr/002-auth-provider-decoupling.md`, Identity domain README update.
**Estimated:** 1 hour
**Dependencies:** None

### T2.1A — Auth Decoupling: Identity-Owned User Table
**Purpose:** Remove `auth.users` dependency. Create `identity.users` as the system-of-record.
**Schema change:**
```sql
CREATE TABLE identity.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_provider_id TEXT UNIQUE,  -- Supabase Auth user UUID
  email TEXT NOT NULL,
  status identity.user_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
**Migration sequence:**
1. Create `identity.users`
2. Migrate all FKs (`profiles`, `buyer_profiles`, `seller_profiles`) to `identity.users(id)`
3. Remove `handle_new_user` trigger (auth.users no longer exists locally)
4. Remove `auth.users` stub from migrations
**Estimated:** 2 hours
**Dependencies:** T2.1
**Blocking:** T2.2, T2.3, T2.4 (all depend on user table)

### T2.2A — Auth Provider Interface Abstraction
**Purpose:** Create `IdentityProvider` port so Supabase Auth is replaceable.
**Interface:**
```typescript
export interface IdentityProvider {
  verifyToken(token: string): Promise<AuthUser>;
  getUser(userId: string): Promise<AuthUser | null>;
  revokeSessions(userId: string): Promise<void>;
}
```
**Implementation:** `SupabaseAuthProvider` in `infrastructure/auth/`
**Constraint:** No `@supabase/supabase-js` import outside `infrastructure/auth/`
**Estimated:** 3 hours
**Dependencies:** T2.2, T2.1A

### T1.5A — Infrastructure Simplification
**Purpose:** Update docker-compose, env vars, and docs to reflect the simplified model.
**Changes:**
- `docker-compose.dev.yml` — already only postgres + redis, verify no Supabase services
- `.env.example` — `SUPABASE_URL` points to hosted instance; `DATABASE_URL` points to local Postgres
- `local-development.md` — document hosted-auth + local-infra workflow
**Estimated:** 2 hours
**Dependencies:** T1.5, T1.8

### T2.6A — Hosted Auth Webhook Synchronization
**Purpose:** Replace local auth trigger with hosted webhook → queue → identity.users sync.
**Flow:**
```
Supabase Auth (hosted)
  ↓ webhook POST /v1/webhooks/supabase-auth
Webhook Handler
  ↓ verify signature
  ↓ enqueue auth-sync job
Auth Sync Worker
  ↓ create/update/delete identity.users
  ↓ write to outbox (atomic transaction)
```
**Events handled:** `user.created`, `user.updated`, `user.deleted`
**Security:** Webhook signature verification, 202 immediate response, idempotency 24h
**Estimated:** 4 hours
**Dependencies:** T2.6, T2.1A, T2.2A

---

## Revised M2 Dependency Graph

```
T2.0A (ADR)
   ↓
T2.1  ──→ T2.1A ──→ T2.2 ──→ T2.2A
                          ↓
                     T2.3 ──→ T2.4
                          ↘
                           T2.6A (webhook sync)
```

**Critical path:** T2.1 → T2.1A → T2.2 → T2.3 → T2.4

T2.1A is a **hard blocker** for T2.2, T2.3, T2.4 because all user-related aggregates and repositories depend on the `identity.users` table.

---

## Recommended Implementation Sequence

### Phase 1: Foundation Fix (Do First)
1. **T2.0A** — Write ADR (1h)
2. **T1.5A** — Update docker-compose, env, docs (2h)
3. **T2.1A** — Auth decoupling migration (2h)
   - Create `identity.users`
   - Migrate FKs
   - Update integration test setup
   - Remove auth.users stub

### Phase 2: Domain Implementation (After T2.1A)
4. **T2.2** — User Aggregate & Profile Lifecycle (revised for identity.users)
5. **T2.2A** — Auth Provider Interface (3h)
6. **T2.3** — SellerProfile & Onboarding State Machine
7. **T2.4** — Identity Repositories

### Phase 3: Sync Infrastructure (After T2.4)
8. **T2.6A** — Hosted Auth Webhook Synchronization (4h)
9. **T2.5** — Identity API Routes (uses IdentityProvider port)
10. **T2.7** — Identity Queue Workers
11. **T2.8** — Identity Integration Tests

---

## Test Impact Assessment

| Test Suite | Impact | Action |
|------------|--------|--------|
| T2.1 integration tests | High | Replace auth.users inserts with identity.users inserts |
| T2.2 unit tests | Low | No change (aggregate is auth-agnostic) |
| T2.4 integration tests | Medium | Update repository tests to use identity.users |
| T2.6 integration tests | High | New: webhook signature verification, idempotency |
| T2.8 integration tests | Medium | Update auth sync scenario |
| Existing M1 tests | None | Outbox, queues, events unaffected |

---

## Operational Impact

| Concern | Before | After |
|---------|--------|-------|
| Local startup time | ~30–60s (if full Supabase) | ~5–10s (postgres + redis) |
| RAM usage | ~2–4GB | ~200–400MB |
| CI complexity | Same | Same (already postgres + redis) |
| Contributor onboarding | Complex | Simple |
| Auth availability | Requires internet (hosted) | Requires internet (hosted) |
| Offline development | Not possible (hosted auth) | Same constraint |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| T2.1A migration breaks existing tests | Medium | High | Run full test suite after migration; keep rollback migration ready |
| Hosted Supabase Auth latency in tests | Low | Medium | Mock IdentityProvider in unit tests; integration tests use test JWTs |
| Developer confusion (where is auth?) | Medium | Low | Clear env var naming, ADR, README |
| T2.1A scope creep | Medium | Medium | Strictly limited to FK migration; no business logic changes |

---

## Decision Required

**Question:** Should I proceed with Phase 1 (T2.0A + T1.5A + T2.1A) before continuing T2.2–T2.4?

**Recommendation:** Yes. T2.1A is a hard blocker. Implementing T2.2–T2.4 against `auth.users` would create throwaway work.

**Alternative:** Continue T2.2–T2.4 with a temporary `identity.users` shim that mirrors auth.users structure, then run T2.1A as a migration. This adds complexity and risk.

---

## Files Already Modified (Pre-Review)

The following files were created during initial T2.1–T2.2 implementation and will need revision after T2.1A:

- `supabase/migrations/20260519170001_identity_schema.sql` — contains `auth.users` stub and FKs
- `supabase/migrations/20260519170002_identity_triggers.sql` — `handle_new_user` references `auth.users`
- `supabase/migrations/20260519170003_identity_rls.sql` — uses `auth.uid()`
- `tests/integration/identity/schema.test.ts` — inserts into `auth.users`
- `tests/setup-integration.ts` — references `identity.*` tables (no change needed)
- `src/identity/domain/entities/user.ts` — no change (aggregate is auth-agnostic)
- `src/identity/domain/entities/profile.ts` — no change
- `src/identity/domain/entities/buyer-profile.ts` — no change
- `src/identity/domain/events/user-events.ts` — no change

---

## Next Action

Awaiting approval to proceed with **Phase 1: Foundation Fix** (T2.0A + T1.5A + T2.1A).
