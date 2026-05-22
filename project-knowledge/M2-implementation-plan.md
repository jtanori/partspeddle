# M2 — Identity Domain Implementation Plan

> Generated: 2026-05-19  
> Milestone: M2 — Identity Foundation  
> Goal: Establish the Identity bounded context with full DDD architecture.

---

## Ticket Sequence

```
T2.1 ──→ T2.2A ──→ T2.2C ──→ T2.2B ──→ T2.2 ──→ T2.3 ──→ T2.4 ──→ T2.6 ──→ T2.6A ──→ T2.6B ──→ T2.5
                                                                                          ↘
                                                                                           → T2.7
                                                                                            ↓
                                                                                          T2.8
```

| Order | Ticket | Title | Status | Parallelizable |
|-------|--------|-------|--------|---------------|
| 1 | T2.1 | Identity Database Schema | ✅ completed | No — foundation |
| 2 | T2.1A | Auth Decoupling: Identity-Owned User Table | ✅ completed | With T2.1 |
| 3 | T2.2 | User Aggregate & Profile Lifecycle | ✅ completed | After T2.1 |
| 4 | T2.2A | Auth Provider Interface Abstraction | planned | After T2.2 |
| 5 | T2.2C | Authentication Context Contract | planned | After T2.2A |
| 6 | T2.2B | Auth Middleware + Lazy User Provisioning | planned | After T2.2A+T2.2C |
| 7 | T2.3 | SellerProfile & Onboarding State Machine | planned | After T2.2 |
| 8 | T2.4 | Identity Repositories | planned | After T2.1+T2.2+T2.3 |
| 9 | T2.6 | Supabase Auth Webhook Handler | planned | After T2.1+T2.4 |
| 10 | T2.6A | Hosted Auth Webhook Synchronization | planned | After T2.6 |
| 11 | T2.6B | Webhook Reconciliation Governance | planned | After T2.6A |
| 12 | T2.5 | Identity API Routes | planned | After T2.4+T2.6B |
| 13 | T2.7 | Identity Queue Workers | planned | After T2.4+T2.6 |
| 14 | T2.8 | Identity Integration Tests | planned | After all above |

---

## T2.1 — Identity Database Schema

**Purpose:** Create owned tables with constraints, triggers, and RLS.

**Dependencies:** T1.5 (Supabase client), T1.8 (CI pipeline)

**Deliverables:**
- `supabase/migrations/YYYYMMDDHHMMSS_identity_schema.sql`
- `supabase/migrations/YYYYMMDDHHMMSS_identity_triggers.sql`
- `supabase/migrations/YYYYMMDDHHMMSS_identity_rls.sql`

**Schema Design:**

```
auth.users (Supabase managed)
  ↓ FK
identity.profiles
  - id UUID PK
  - user_id UUID FK → auth.users.id
  - display_name TEXT
  - avatar_url TEXT
  - created_at TIMESTAMPTZ
  - updated_at TIMESTAMPTZ

identity.seller_profiles
  - id UUID PK
  - user_id UUID FK → auth.users.id
  - status ENUM: draft | pending_review | active | suspended
  - stripe_connect_account_id TEXT
  - activated_at TIMESTAMPTZ
  - created_at TIMESTAMPTZ
  - updated_at TIMESTAMPTZ

identity.buyer_profiles
  - id UUID PK
  - user_id UUID FK → auth.users.id
  - created_at TIMESTAMPTZ

identity.onboarding_steps
  - seller_profile_id UUID FK
  - step ENUM: identity | banking | tax | terms
  - completed_at TIMESTAMPTZ
  - UNIQUE(seller_profile_id, step)
```

**Triggers:**
- `auto_create_profile` — INSERT on `auth.users` → create `identity.profiles`
- `auto_create_buyer_profile` — INSERT on `auth.users` → lazy create `identity.buyer_profiles`

**RLS Policies:**
- `profiles`: users can read/write only their own row
- `seller_profiles`: users can read/write only their own row; admins can read all
- `onboarding_steps`: scoped to owning seller profile

**Acceptance Criteria:**
- All tables created with correct types
- FK `users.id → auth.users.id` enforced
- Trigger auto-creates profile on auth user insert
- RLS prevents cross-user reads
- Integration tests verify constraints

---

## T2.2 — User Aggregate & Profile Lifecycle

**Purpose:** Implement User aggregate with invariant enforcement.

**Dependencies:** T2.1

**Deliverables:**
- `src/identity/domain/entities/user.ts`
- `src/identity/domain/entities/profile.ts`
- `src/identity/domain/entities/buyer-profile.ts`
- `src/identity/domain/events/user-events.ts`

**Aggregate Design:**

```typescript
class User {
  readonly id: string;
  readonly email: string;
  readonly status: 'active' | 'suspended' | 'deactivated';
  readonly profile: Profile;
  readonly buyerProfile: BuyerProfile;
  
  suspend(reason: string): SuspendedUserEvent
  reactivate(): ReactivatedUserEvent
}
```

**Invariants:**
- Email uniqueness enforced at repository level (DB unique constraint)
- Status transitions: `active ↔ suspended`, `active → deactivated` (no skip)
- Suspension cascades to session revocation event

**Events:**
- `identity.user.created` — emitted on creation
- `identity.user.suspended` — emitted on suspension
- `identity.user.reactivated` — emitted on reactivation

**Acceptance Criteria:**
- User enforces email uniqueness
- Status transitions validated (no skips)
- Suspension cascades to session revocation
- `user.created` event emitted on creation
- Unit tests: 95%+ meaningful coverage

---

## T2.3 — SellerProfile & Onboarding State Machine

**Purpose:** Implement deterministic seller lifecycle with guard conditions.

**Dependencies:** T2.2

**Deliverables:**
- `src/identity/domain/entities/seller-profile.ts`
- `src/identity/domain/entities/onboarding-state.ts`
- `src/identity/domain/events/seller-events.ts`
- `src/identity/domain/services/state-machine.ts`

**State Machine:**

```
draft → pending_review → active ↔ suspended
  ↑                       ↓
  └─── reactivation ──────┘
```

**Guard Conditions:**
- `pending_review → active`: all 4 onboarding steps completed + Stripe account linked
- `active → suspended`: admin action or fraud detection
- `suspended → active`: admin reactivation only
- `any → draft`: not allowed (irreversible)

**Onboarding Steps:**
1. Identity verification
2. Banking details
3. Tax information
4. Terms acceptance

**Events:**
- `identity.seller.onboarding_step_completed`
- `identity.seller.activated` — `activated_at` set only on first activation
- `identity.seller.suspended`
- `identity.seller.reactivated` — preserves original `activated_at`

**Acceptance Criteria:**
- Invalid transitions rejected with domain error
- All 4 onboarding steps required for review
- Activation blocked without Stripe account
- `activated_at` set only on first activation
- Reactivation preserves `activated_at`

---

## T2.4 — Identity Repositories

**Purpose:** Implement repository pattern with outbox integration.

**Dependencies:** T2.1, T2.2, T2.3, T2.2B, T1.3 (outbox)

**Deliverables:**
- `src/identity/infrastructure/persistence/user-repository.ts`
- `src/identity/infrastructure/persistence/profile-repository.ts`
- `src/identity/infrastructure/persistence/seller-profile-repository.ts`
- `src/identity/infrastructure/persistence/user-repository.memory.ts`
- `src/identity/infrastructure/persistence/seller-profile-repository.memory.ts`

**Repository Contract:**

```typescript
interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>; // includes outbox transaction
}
```

**Outbox Integration:**
- Every `save()` opens a transaction
- Domain mutation + outbox insert in same transaction
- Events serialized from aggregate's `uncommittedEvents`
- Clear uncommitted events after successful save

**Idempotency:**
- Seller creation: deduplicate by `user_id` (DB unique constraint)
- Buyer profile: lazy creation, idempotent by `user_id`

**Acceptance Criteria:**
- Repository find/save operations work
- Save writes to outbox in same transaction
- Idempotency prevents duplicate seller creation
- Lazy buyer profile creation is atomic

---

## T2.5 — Identity API Routes

**Purpose:** Expose Identity domain via REST endpoints.

**Dependencies:** T2.4, T2.6B

**Deliverables:**
- `src/identity/api/routes/user-routes.ts`
- `src/identity/api/routes/profile-routes.ts`
- `src/identity/api/routes/seller-routes.ts`
- `src/identity/api/routes/session-routes.ts`
- `src/identity/api/dto/*.ts`

**Route Design:**

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /v1/identity/users/me | JWT | Returns authenticated user |
| PATCH | /v1/identity/profiles/me | JWT | Updates profile + emits event |
| POST | /v1/identity/sellers/register | JWT | Creates seller profile |
| POST | /v1/identity/sellers/me/onboarding/:step | JWT | Completes onboarding step |
| POST | /v1/identity/sessions/revoke | JWT | Revokes all sessions |

**DTOs:**
- Use Zod for runtime validation
- Separate request/response DTOs
- Never expose internal IDs or secrets

**Middleware:**
- JWT validation via Supabase auth
- Rate limiting (100 req/min per user)
- Correlation ID propagation
- Error handler from T1.7

**Acceptance Criteria:**
- GET /v1/identity/users/me returns authenticated user
- PATCH /v1/identity/profiles/me updates profile + emits event
- POST /v1/identity/sellers/register creates seller profile
- POST /v1/identity/sellers/me/onboarding/:step completes step
- Rate limit returns 429 with Retry-After

---

## T2.6 — Supabase Auth Webhook Handler

**Purpose:** Synchronize Supabase Auth lifecycle into Identity domain.

**Dependencies:** T2.1, T2.4, T2.2A

**Deliverables:**
- `src/identity/infrastructure/webhooks/supabase-auth-webhook.ts`
- `src/identity/queue/identity-webhook-worker.ts`
- `src/identity/queue/reconciliation-job.ts`

**Webhook Events:**
- `user.created` → enqueue profile creation
- `user.updated` → enqueue profile update
- `user.deleted` → enqueue cleanup

**Security:**
- Verify webhook signature (Supabase secret)
- Return 202 immediately (async processing)
- Return 401 on invalid signature

**Idempotency:**
- Deduplicate by webhook event ID + timestamp
- Store processed webhook IDs for 24h

**Reconciliation:**
- Daily job scans `auth.users` for orphans (no profile)
- Backfills missing profiles
- Logs discrepancies

**Out-of-Order Handling:**
- Delayed retry with exponential backoff
- Sequence number validation (if available)

**Acceptance Criteria:**
- Valid webhook enqueues job (202 response)
- Invalid signature returns 401
- Duplicate webhook detected and ignored
- Reconciliation backfills orphaned auth users
- Out-of-order webhooks handled with delayed retry

---

## T2.7 — Identity Queue Workers

**Purpose:** Process onboarding, webhook, and session async workflows.

**Dependencies:** T2.4, T1.4 (queue bootstrap)

**Deliverables:**
- `src/identity/queue/onboarding-worker.ts`
- `src/identity/queue/webhook-worker.ts`
- `src/identity/queue/session-worker.ts`

**Workers:**

| Worker | Queue | Purpose | Retry |
|--------|-------|---------|-------|
| Onboarding | `identity-onboarding` | Process step completion, update DB, emit event | 3x |
| Webhook | `identity-webhooks` | Process Supabase auth events | 5x |
| Session | `identity-sessions` | Revoke sessions, cleanup tokens | 1x |

**Queue Naming:**
- `identity-onboarding`
- `identity-webhooks`
- `identity-sessions`
- DLQs: `identity-onboarding-dlq`, `identity-webhooks-dlq`, `identity-sessions-dlq`

**Acceptance Criteria:**
- Onboarding step completion updates DB
- Webhook job processes auth event
- Session revocation invalidates all active sessions
- Retry exhausted → DLQ

---

## T2.8 — Identity Integration Tests

**Purpose:** Verify Identity domain end-to-end.

**Dependencies:** T2.1, T2.2, T2.3, T2.4, T2.5, T2.6, T2.6A, T2.6B, T2.7

**Deliverables:**
- `src/identity/domain/entities/*.test.ts` (unit)
- `src/identity/application/services/*.test.ts` (unit)
- `tests/integration/identity/*.test.ts` (integration)

**Test Scenarios:**

1. **Auth sync trigger** — Supabase auth user created → profile auto-created
2. **Onboarding completion** — all 4 steps → seller activated → event emitted
3. **RLS enforcement** — user A cannot read user B's profile
4. **Webhook deduplication** — same webhook sent twice → processed once
5. **Event emission** — domain mutation → outbox entry → event envelope valid

**Test Isolation:**
- `TRUNCATE ... RESTART IDENTITY CASCADE` between tests
- Redis `FLUSHDB` between test suites
- Serial execution (`maxThreads: 1`) until namespace isolation exists

**Acceptance Criteria:**
- Auth sync trigger creates user + profile
- Onboarding completion transitions seller status
- RLS prevents unauthorized access
- Webhook deduplication works
- Event emission verified

---

## Cross-Cutting Concerns

### Error Codes

Format: `IDENTITY_<RESOURCE>_<FAILURE>`

Examples:
- `IDENTITY_USER_NOT_FOUND`
- `IDENTITY_SELLER_ALREADY_EXISTS`
- `IDENTITY_ONBOARDING_INVALID_TRANSITION`
- `IDENTITY_WEBHOOK_INVALID_SIGNATURE`

### Events Catalog

| Event | Emitted By | Consumers |
|-------|-----------|-----------|
| `identity.user.created` | UserRepository | Search indexing, notifications |
| `identity.user.suspended` | UserRepository | Session revocation, search |
| `identity.seller.activated` | SellerProfile | Marketplace, search, notifications |
| `identity.seller.onboarding_step_completed` | SellerProfile | Progress tracking |

### Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `identity_users_created_total` | Counter | `source: webhook \| api` |
| `identity_seller_activations_total` | Counter | `status: success \| failure` |
| `identity_onboarding_completions_total` | Counter | `step: identity \| banking \| tax \| terms` |
| `identity_webhook_processing_seconds` | Histogram | `event_type` |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| RLS misconfiguration exposes data | Medium | Critical | Integration tests verify every table |
| Webhook deduplication fails | Low | High | Idempotency key + 24h dedup window |
| State machine allows invalid transition | Low | Critical | Property-based tests for transitions |
| Outbox transaction incomplete | Low | Critical | Integration test: mutation + outbox atomicity |
| Migration ordering conflict | Medium | Medium | Lexicographic naming + CI validation |


---

## Post-M2 Reminders

> These items are blocked until M2 is fully completed.

1. **Configure GitHub Branch Protection Rules** (see `project-knowledge/git-workflow.md` §7)
   - `develop`: require PR, status checks, up-to-date, linear history
   - `main`: require PR, 2 approvals, signed commits, include administrators

2. **Review `ci.yml` push trigger on `main`**
   - Governance doc currently only allows `push` triggers on `develop`
   - Decide whether to keep or remove the `main` push trigger
   - If kept, document the exception in `git-workflow.md`

3. **Add `migration-validation` CI job**
   - Migration filenames monotonic check
   - No duplicate timestamps check
   - Migrations immutable after merge check
   - Schema applies cleanly from zero check
   - Schema applies incrementally check
   - See `project-knowledge/architecture-boundaries.md` for migration governance context
