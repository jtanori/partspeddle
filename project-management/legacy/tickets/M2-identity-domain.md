# M2 — Identity Domain Tickets

> Root of trust. All other domains depend on Identity.

---

## T2.1 — Identity Database Schema

**Domain:** Identity
**Capability:** Persistence

**Purpose:** Create owned tables with constraints, triggers, and RLS.

**Dependencies:** T1.5, T1.8

**Architectural Constraints:**
- Must conform to `database-governance.md`
- Enum values: `lowercase_snake_case`
- RLS mandatory
- Forward-only migrations

**Deliverables:**
- Migration: `users`, `profiles`, `buyer_profiles`, `seller_profiles`, `onboarding_states`, `user_sessions`
- Triggers: `updated_at`, `handle_new_user`, `handle_onboarding_completion`
- RLS policies per table

**Acceptance Criteria:**
- [ ] All tables created with correct types
- [ ] FK `users.id → auth.users.id` enforced
- [ ] Trigger auto-creates profile on auth user insert
- [ ] RLS prevents cross-user reads
- [ ] Integration tests verify constraints

**Observability:**
- DB migration success/failure logged

**Failure Modes:**
- Auth user exists before trigger → reconciliation job backfills

---

## T2.2 — User Aggregate & Profile Lifecycle

**Domain:** Identity
**Capability:** Domain Model

**Purpose:** Implement User aggregate with invariant enforcement.

**Dependencies:** T2.1

**Architectural Constraints:**
- Aggregate root: `User`
- Lazy creation: `BuyerProfile`
- Auto-creation: `Profile` (via trigger)
- Events emitted on state change

**Deliverables:**
- `src/identity/domain/entities/user.ts`
- `src/identity/domain/entities/profile.ts`
- `src/identity/domain/entities/buyer-profile.ts`
- `src/identity/domain/events/user-events.ts`

**Acceptance Criteria:**
- [ ] User enforces email uniqueness
- [ ] Status transitions validated (no skips)
- [ ] Suspension cascades to session revocation
- [ ] `user.created` event emitted on creation
- [ ] Unit tests: 95%+ meaningful coverage

**Observability:**
- `identity_user_registrations_total` counter
- `identity_user_suspensions_total` counter

**Failure Modes:**
- Duplicate email → validation error
- Orphaned auth user → reconciliation deactivates

---

## T2.3 — SellerProfile & Onboarding State Machine

**Domain:** Identity
**Capability:** Seller Activation

**Purpose:** Implement deterministic seller lifecycle with guard conditions.

**Dependencies:** T2.2

**Architectural Constraints:**
- States: `pending → onboarding → review → active → suspended`
- Activation preconditions: Stripe account + verified identity + active user
- `activated_at` immutable once set
- Events: `seller.activated`, `seller.deactivated`

**Deliverables:**
- `src/identity/domain/entities/seller-profile.ts`
- `src/identity/domain/entities/onboarding-state.ts`
- `src/identity/domain/events/seller-events.ts`
- State machine validation logic

**Acceptance Criteria:**
- [ ] Invalid transitions rejected with domain error
- [ ] All 4 onboarding steps required for review
- [ ] Activation blocked without Stripe account
- [ ] `activated_at` set only on first activation
- [ ] Reactivation preserves `activated_at`

**Observability:**
- `identity_seller_activations_total` counter
- `identity_onboarding_completions_total` counter

**Failure Modes:**
- Concurrent registration → idempotency key prevents duplicate
- Stripe account reused → unique constraint violation

---

## T2.4 — Identity Repositories

**Domain:** Identity
**Capability:** Persistence Boundary

**Purpose:** Implement repository pattern with outbox integration.

**Dependencies:** T2.1, T2.2, T2.3, T1.3

**Architectural Constraints:**
- Aggregate-root only operations
- No cross-domain joins
- Atomic DB write + outbox insert
- Idempotency on create operations

**Deliverables:**
- `src/identity/infrastructure/persistence/user-repository.ts`
- `src/identity/infrastructure/persistence/profile-repository.ts`
- `src/identity/infrastructure/persistence/seller-profile-repository.ts`
- In-memory test adapters

**Acceptance Criteria:**
- [ ] Repository find/save operations work
- [ ] Save writes to outbox in same transaction
- [ ] Idempotency prevents duplicate seller creation
- [ ] Lazy buyer profile creation is atomic

**Observability:**
- `identity_db_query_latency_seconds` histogram

**Failure Modes:**
- DB constraint violation → mapped to domain error
- Outbox insert failure → transaction rolls back

---

## T2.5 — Identity API Routes

**Domain:** Identity
**Capability:** HTTP Boundary

**Purpose:** Expose Identity domain via REST endpoints.

**Dependencies:** T2.4

**Architectural Constraints:**
- Thin controllers: validation + use case invocation only
- JWT validation at gateway
- Correlation ID propagation
- Rate limiting on sensitive endpoints

**Deliverables:**
- `src/identity/api/routes/user-routes.ts`
- `src/identity/api/routes/profile-routes.ts`
- `src/identity/api/routes/seller-routes.ts`
- `src/identity/api/routes/session-routes.ts`
- Zod validation schemas

**Acceptance Criteria:**
- [ ] `GET /v1/identity/users/me` returns authenticated user
- [ ] `PATCH /v1/identity/profiles/me` updates profile + emits event
- [ ] `POST /v1/identity/sellers/register` creates seller profile
- [ ] `POST /v1/identity/sellers/me/onboarding/:step` completes step
- [ ] Rate limit returns 429 with Retry-After

**Observability:**
- `identity_api_requests_total` counter
- `identity_api_latency_seconds` histogram

**Failure Modes:**
- Invalid JWT → 401
- Duplicate registration → 409
- Invalid status transition → 422

---

## T2.6 — Supabase Auth Webhook Handler

**Domain:** Identity
**Capability:** Auth Sync

**Purpose:** Synchronize Supabase Auth lifecycle into Identity domain.

**Dependencies:** T2.1, T2.4

**Architectural Constraints:**
- Webhook signature verification mandatory
- Idempotency check (24h window)
- Thin handler: validate → enqueue to queue
- Reconciliation job for gaps

**Deliverables:**
- `src/identity/infrastructure/webhooks/supabase-auth-webhook.ts`
- `src/identity/queue/identity-webhook-worker.ts`
- Reconciliation job

**Acceptance Criteria:**
- [ ] Valid webhook enqueues job (202 response)
- [ ] Invalid signature returns 401
- [ ] Duplicate webhook detected and ignored
- [ ] Reconciliation backfills orphaned auth users
- [ ] Out-of-order webhooks handled with delayed retry

**Observability:**
- `identity_webhook_received_total` counter
- `identity_webhook_processing_seconds` histogram

**Failure Modes:**
- Supabase down → client retry, reconciliation covers gaps
- Webhook timeout → Supabase retries automatically

---

## T2.7 — Identity Queue Workers

**Domain:** Identity
**Capability:** Async Orchestration

**Purpose:** Process onboarding, webhook, and session async workflows.

**Dependencies:** T2.4, T1.4

**Architectural Constraints:**
- `identity-onboarding` queue: 3x retry
- `identity-webhooks` queue: 3x retry
- `identity-sessions` queue: 3x retry
- Idempotent handlers

**Deliverables:**
- `src/identity/queue/onboarding-worker.ts`
- `src/identity/queue/webhook-worker.ts`
- `src/identity/queue/session-worker.ts`

**Acceptance Criteria:**
- [ ] Onboarding step completion updates DB
- [ ] Webhook job processes auth event
- [ ] Session revocation invalidates all active sessions
- [ ] Retry exhausted → DLQ

**Observability:**
- `identity_queue_jobs_total` counter
- `identity_queue_job_duration_seconds` histogram

**Failure Modes:**
- Worker crash → BullMQ retry
- DB unavailable → retry with backoff

---

## T2.8 — Identity Integration Tests

**Domain:** Identity
**Capability:** Quality Assurance

**Purpose:** Verify Identity domain end-to-end.

**Dependencies:** T2.1–T2.7

**Architectural Constraints:**
- Test DB per run
- Transaction rollback per test
- RLS tested with authenticated role
- Service role for setup

**Deliverables:**
- `src/identity/domain/entities/*.test.ts`
- `src/identity/application/services/*.test.ts`
- Integration tests for DB triggers, RLS, webhooks

**Acceptance Criteria:**
- [ ] Auth sync trigger creates user + profile
- [ ] Onboarding completion transitions seller status
- [ ] RLS prevents unauthorized access
- [ ] Webhook deduplication works
- [ ] Event emission verified

**Observability:** N/A

**Failure Modes:** N/A
