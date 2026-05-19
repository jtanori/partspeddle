# VINTRACK — Identity Domain Repositories

## Purpose

Defines the repository abstraction layer for the Identity bounded context. Repositories enforce domain ownership, encapsulate persistence logic, and guarantee that only the Identity domain mutates its owned aggregates.

All repository implementations are owned by the Identity domain. Cross-domain direct data access is prohibited.

---

## Repository Philosophy

* **Aggregate-Root Only**: Repositories operate exclusively on aggregate roots (`User`). Child entities (`Profile`, `SellerProfile`, etc.) are persisted through the root or through dedicated but domain-scoped repositories that enforce ownership invariants.
* **No Cross-Domain Queries**: Repositories MUST NOT join against tables owned by other bounded contexts (e.g., `listings`, `transactions`).
* **Transaction Boundaries**: Every repository method that mutates state participates in an explicit Unit of Work / transaction boundary.
* **Event Emission**: Mutations that change aggregate state MUST emit domain events durably within the same transaction (transactional outbox pattern).
* **Idempotency**: All write operations accept idempotency keys where duplicate execution would be harmful.

---

## Repository Catalog

### UserRepository

**Aggregate**: `User`

**Responsibilities**

* Canonical CRUD for `User` aggregate root
* Auth-sync-aware lookups (by Supabase Auth `id`)
* Status lifecycle transitions with event emission
* Role assignment and validation

**Interface**

```typescript
interface UserRepository {
  // Retrieval
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByPhone(phone: string): Promise<User | null>;
  findByAuthId(authId: string): Promise<User | null>;

  // Existence checks (optimised, no hydration)
  existsByEmail(email: string): Promise<boolean>;
  existsById(id: string): Promise<boolean>;

  // Mutations
  create(user: User, idempotencyKey?: string): Promise<User>;
  update(user: User): Promise<User>;
  updateStatus(id: string, status: UserStatus, reason?: string): Promise<User>;
  updateRole(id: string, role: UserRole): Promise<User>;
  updateLastSignIn(id: string, timestamp: Date): Promise<void>;
}
```

**Query Patterns**

| Method | Index Used | Complexity |
|--------|-----------|------------|
| `findById` | `users_pkey` | O(1) |
| `findByEmail` | `idx_users_email` | O(log n) |
| `findByPhone` | `users_phone_unique` | O(log n) |
| `existsById` | `users_pkey` | O(1) |

**Transactional Behavior**

* `create` — Inserts into `users`, auto-creates `profiles` via DB trigger. Emits `user.created` via outbox.
* `updateStatus` — Updates `users.status`, revokes active `user_sessions` if suspending. Emits `user.suspended` or `user.updated`.

---

### ProfileRepository

**Entity**: `Profile` (owned by `User` aggregate)

**Responsibilities**

* Read/write for extended user metadata
* Public profile projection for marketplace discovery
* Sanitization enforcement before persistence

**Interface**

```typescript
interface ProfileRepository {
  findById(id: string): Promise<Profile | null>;
  findByUserId(userId: string): Promise<Profile | null>;
  findPublicProfileByUserId(userId: string): Promise<PublicProfile | null>;
  update(profile: Profile): Promise<Profile>;
  updateNotificationPreferences(userId: string, prefs: NotificationPreferences): Promise<void>;
}
```

**Transactional Behavior**

* `update` — Persists changes to `profiles`. Emits `profile.updated` via outbox.
* No direct `create`; `Profile` is created by DB trigger on `users` insert.

---

### BuyerProfileRepository

**Entity**: `BuyerProfile` (lazy-created, owned by `User`)

**Interface**

```typescript
interface BuyerProfileRepository {
  findByUserId(userId: string): Promise<BuyerProfile | null>;
  ensureExists(userId: string): Promise<BuyerProfile>; // lazy-create if missing
  update(profile: BuyerProfile): Promise<BuyerProfile>;
  incrementPurchaseMetrics(userId: string, amountCents: number): Promise<void>;
}
```

**Transactional Behavior**

* `ensureExists` — Uses `INSERT ... ON CONFLICT DO NOTHING` to guarantee idempotent lazy creation.
* `incrementPurchaseMetrics` — Atomic `UPDATE ... SET purchase_count = purchase_count + 1` to avoid read-modify-write races.

---

### SellerProfileRepository

**Entity**: `SellerProfile` (aggregate-adjacent, lifecycle-critical)

**Responsibilities**

* Seller activation state machine enforcement
* Onboarding state coordination
* Stripe Connect account linkage
* Trust metadata queries

**Interface**

```typescript
interface SellerProfileRepository {
  findById(id: string): Promise<SellerProfile | null>;
  findByUserId(userId: string): Promise<SellerProfile | null>;
  findByStripeAccountId(stripeAccountId: string): Promise<SellerProfile | null>;
  create(profile: SellerProfile): Promise<SellerProfile>;
  update(profile: SellerProfile): Promise<SellerProfile>;
  updateStatus(id: string, status: SellerStatus, metadata?: Record<string, unknown>): Promise<SellerProfile>;
  incrementListingCount(userId: string): Promise<void>;
  incrementSalesMetrics(userId: string, amountCents: number): Promise<void>;

  // Trust queries (read-only projections)
  isEligibleToPublish(userId: string): Promise<boolean>;
  findActiveSellers(limit: number, cursor?: string): Promise<PaginatedResult<SellerProfile>>;
}
```

**Transactional Behavior**

* `create` — Inserts `seller_profiles` and `onboarding_states`. Emits no event (status is `pending`).
* `updateStatus` — Guarded transition. Validates preconditions before updating. Emits `seller.activated` or `seller.deactivated`.
* `incrementListingCount` — Atomic increment. Guards against negative values via CHECK constraint.

**State Machine Enforcement**

The repository delegates valid-transition checks to the domain layer (`SellerProfile` entity method `canTransitionTo`). The repository itself does NOT encode business rules; it only executes what the aggregate permits.

---

### OnboardingStateRepository

**Entity**: `OnboardingState`

**Interface**

```typescript
interface OnboardingStateRepository {
  findBySellerProfileId(sellerProfileId: string): Promise<OnboardingState | null>;
  updateSteps(id: string, steps: Partial<OnboardingSteps>): Promise<OnboardingState>;
  markCompleted(id: string): Promise<OnboardingState>;
}
```

**Transactional Behavior**

* `updateSteps` — Updates step flags. DB trigger `handle_onboarding_completion` auto-transitions `seller_profiles.status` to `review` when all steps are `true`.
* No direct event emission; trigger-induced status change is picked up by change-data-capture (CDC) or polling outbox.

---

### UserSessionRepository

**Entity**: `UserSession`

**Interface**

```typescript
interface UserSessionRepository {
  findById(id: string): Promise<UserSession | null>;
  findActiveByUserId(userId: string): Promise<UserSession[]>;
  create(session: UserSession): Promise<UserSession>;
  revoke(id: string, reason: RevokeReason, endedAt: Date): Promise<void>;
  revokeAllForUser(userId: string, reason: RevokeReason): Promise<number>; // returns count
  purgeExpired(before: Date): Promise<number>;
}
```

**Transactional Behavior**

* `create` — Emits `session.created`.
* `revoke` — Emits `session.revoked`.
* `revokeAllForUser` — Batch revocation, emits one `session.revoked` per session (or a single bulk event depending on outbox capacity).

---

## Transactional Outbox Pattern

All state-mutating repositories write to an `outbox` table within the same Postgres transaction as the business table mutation.

### Outbox Table (Identity Domain)

```sql
CREATE TABLE identity_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(100) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    correlation_id UUID NOT NULL,
    causation_id UUID,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    retry_count INTEGER NOT NULL DEFAULT 0,
    error TEXT,

    CONSTRAINT identity_outbox_retry_nonnegative CHECK (retry_count >= 0)
);

CREATE INDEX idx_identity_outbox_unpublished ON identity_outbox(published_at, occurred_at)
    WHERE published_at IS NULL;
```

### Relay Worker

A dedicated BullMQ worker (`identity-outbox-relay`) polls `identity_outbox` every 500ms:

1. SELECT unpublished rows ordered by `occurred_at` (batch size 100).
2. Publish each to the event bus / downstream consumers.
3. UPDATE `published_at = NOW()` on success.
4. On failure, increment `retry_count`; if `retry_count > 10`, move to dead-letter table.

---

## Query Isolation Rules

| Rule | Enforcement |
|------|-------------|
| No cross-domain joins | Repository queries restricted to Identity-owned tables |
| No raw mutations outside repositories | Business logic uses repository interfaces exclusively |
| RLS respected for client-facing paths | Service-role bypass only for queue workers and outbox relay |
| Read replicas allowed | Read-only queries (`findBy*`, `isEligibleToPublish`) may target read replicas |

---

## Repository Implementation Constraints

* **TypeScript strict mode**: All repositories return typed promises.
* **No ORM leakage**: Business logic does not import ORM-specific types.
* **Connection pooling**: Repository implementations use a shared Supabase/postgres pool with bounded connections.
* **Query timeouts**: All queries have a 5-second timeout; slow-query alerts fire at 1 second.
* **Batch operations**: `revokeAllForUser` and `purgeExpired` use bounded batches (max 1000 rows per query) to prevent long-running transactions.

---

## Final Principle

Repositories are the persistence boundary of the Identity domain. They enforce data ownership, guarantee transactional event emission, and prevent cross-domain coupling at the storage layer.
