# VINTRACK — Identity Domain Edge Cases

## Purpose

Documents boundary conditions, race conditions, data anomalies, and non-obvious operational scenarios for the Identity bounded context.

Edge cases are first-class requirements. Each must have a defined behavior, test coverage, and operational response.

---

## Edge Case Taxonomy

| ID | Category | Description | Severity |
|----|----------|-------------|----------|
| EC-01 | Auth Sync | Supabase Auth user exists before Identity sync trigger fires | Medium |
| EC-02 | Auth Sync | Duplicate auth.users insert (rare but possible with retries) | Medium |
| EC-03 | Concurrency | Simultaneous profile updates from two sessions | Medium |
| EC-04 | Concurrency | Concurrent seller registrations by same user | High |
| EC-05 | Concurrency | Onboarding step completion races | High |
| EC-06 | Data Integrity | Orphaned users row (no auth.users FK match) | Critical |
| EC-07 | Data Integrity | Profile exists without users row | Critical |
| EC-08 | State Machine | Onboarding step submitted after status already active | Low |
| EC-09 | State Machine | Seller deactivated while onboarding in progress | Medium |
| EC-10 | External | Stripe Connect account ID reused across sellers | High |
| EC-11 | External | Supabase Auth webhook delivered out of order | Medium |
| EC-12 | External | Supabase Auth webhook replay after 24h+ | Low |
| EC-13 | Input | Email with Unicode normalization differences | Medium |
| EC-14 | Input | Display name containing zero-width characters | Low |
| EC-15 | Input | Phone number with multiple valid E.164 representations | Low |
| EC-16 | Time | Onboarding completion timestamp vs. server clock skew | Low |
| EC-17 | Time | Session started_at in future (client clock skew) | Low |
| EC-18 | Lifecycle | User deleted in Supabase Auth (hard delete) | Medium |
| EC-19 | Lifecycle | Reactivation of long-deactivated account (> 1 year) | Medium |
| EC-20 | Scale | Bulk user import with existing email collisions | Medium |

---

## Detailed Edge Cases

### EC-01: Supabase Auth User Exists Before Identity Sync

**Scenario**: Network delay or trigger failure causes `auth.users` row to exist without corresponding `users` row.

**Detection**: Health check queries for orphaned `auth.users` records.

**Behavior**:

1. Reconciliation job runs every 5 minutes.
2. Identifies `auth.users` without `users` match.
3. Backfills `users` and `profiles` via idempotent `INSERT ... ON CONFLICT DO NOTHING`.
4. Emits `user.created` event with `metadata.source: 'reconciliation'`.

**Test**:

```typescript
it('should backfill missing user on reconciliation', async () => {
  // Insert auth.users directly, bypass trigger
  // Run reconciliation job
  // Assert users + profiles created
  // Assert user.created emitted
});
```

---

### EC-02: Duplicate auth.users Insert

**Scenario**: Supabase Auth retries user creation due to client timeout, resulting in duplicate webhook events.

**Behavior**:

* `users.id` is PK with FK to `auth.users(id)`.
* `handle_new_user` trigger uses `ON CONFLICT (id) DO NOTHING`.
* No error; no duplicate `users` row.
* Webhook handler deduplicates via `eventId` 24h window.

---

### EC-03: Simultaneous Profile Updates

**Scenario**: User updates profile from mobile and web simultaneously.

**Behavior**:

* Last-write-wins at field level.
* No optimistic locking required for MVP (profile updates are non-critical).
* `updated_at` reflects latest write.
* Both requests succeed; `profile.updated` emitted once per successful write.

**Operational Note**: If field-level conflict resolution becomes necessary post-MVP, introduce ETags.

---

### EC-04: Concurrent Seller Registrations

**Scenario**: Double-click or retry causes two `POST /sellers/register` requests.

**Behavior**:

* Idempotency key prevents duplicate `SellerProfile` creation.
* Without idempotency key: second request returns `409 CONFLICT` if `SellerProfile` already exists.
* Database unique constraint on `seller_profiles.user_id` guarantees no duplicates.

**Test**:

```typescript
it('should reject concurrent seller registration without idempotency key', async () => {
  // Promise.all([register(), register()])
  // Assert one 201, one 409
});
```

---

### EC-05: Onboarding Step Completion Races

**Scenario**: Two requests complete different onboarding steps simultaneously.

**Behavior**:

* Each step update is independent (updates single boolean column).
* Postgres row-level locking prevents lost updates.
* Trigger evaluates completion atomically on each UPDATE.
* Only the transaction that sets the final step to `true` transitions status to `review`.

**Test**:

```typescript
it('should handle concurrent step completions without corruption', async () => {
  // Parallel completion of step_identity and step_payout
  // Assert both true, status becomes review only when all four complete
});
```

---

### EC-06: Orphaned users Row

**Scenario**: `auth.users` hard-deleted (admin action or GDPR) but `users` row remains.

**Detection**: Daily reconciliation query.

**Behavior**:

```sql
SELECT u.id FROM users u
LEFT JOIN auth.users au ON u.id = au.id
WHERE au.id IS NULL;
```

* If found: auto-transition `users.status` to `deactivated`.
* Emit `user.updated` with `metadata.reason: 'auth_orphan_detected'`.
* Do NOT cascade delete — preserve audit trail.

---

### EC-07: Profile Without users Row

**Scenario**: Data corruption or manual DB manipulation creates `profiles` row without matching `users`.

**Detection**: Foreign key constraint prevents this in normal operation. If constraint disabled:

**Behavior**:

* Reconciliation query identifies orphans.
* Log critical alert.
* Manual intervention required — do not auto-delete due to unknown provenance.

---

### EC-08: Onboarding Step After Active Status

**Scenario**: Client submits onboarding step after seller already activated (stale form, cached state).

**Behavior**:

* API returns `422 UNPROCESSABLE ENTITY` with `IDENTITY_INVALID_STATUS_TRANSITION`.
* No state mutation.
* Log at `debug` level.

---

### EC-09: Seller Deactivated During Onboarding

**Scenario**: Admin suspends user while onboarding is in progress.

**Behavior**:

* `users.status` → `suspended` triggers `seller.deactivated` event.
* `seller_profiles.status` → `suspended` (regardless of previous status).
* Onboarding steps remain recorded but completion trigger is suppressed while suspended.
* On user reinstatement, onboarding resumes from last saved state.

---

### EC-10: Reused Stripe Connect Account ID

**Scenario**: User attempts to link Stripe account already linked to another seller.

**Behavior**:

* Unique constraint `seller_profiles_stripe_account_unique` prevents insert/update.
* Return `409 CONFLICT` with `IDENTITY_STRIPE_ACCOUNT_IN_USE`.
* Log security event.

---

### EC-11: Out-of-Order Webhooks

**Scenario**: Supabase Auth sends `USER_UPDATED` before `USER_CREATED` due to network reordering.

**Behavior**:

* `USER_CREATED` handler creates user (idempotent).
* `USER_UPDATED` handler requires user existence; if missing, enqueues with 30s delay.
* Delayed job retries once; if still missing, raises alert.

---

### EC-12: Webhook Replay After 24h

**Scenario**: Supabase retries webhook beyond idempotency window.

**Behavior**:

* Idempotency key lookup misses (24h expired).
* Event processing is idempotent by design (`ON CONFLICT DO NOTHING`).
* No duplicate state, but duplicate event may emit.
* Downstream consumers must handle duplicate `user.created` safely.

---

### EC-13: Unicode Email Normalization

**Scenario**: User registers with `José@example.com` vs `Jose\u0301@example.com`.

**Behavior**:

* Email normalized to NFC before storage and lookup.
* Unique constraint operates on normalized form.
* Validation rejects non-ASCII domains if IDN not supported in MVP.

---

### EC-14: Zero-Width Characters in Display Name

**Scenario**: Display name contains `\u200B` (zero-width space) or `\u200D` (zero-width joiner).

**Behavior**:

* Sanitization strips zero-width characters during validation.
* If stripping results in empty string, reject with `422`.

---

### EC-15: Phone Number Ambiguity

**Scenario**: `+1-555-555-5555` vs `+15555555555`.

**Behavior**:

* E.164 normalization removes non-digits except leading `+`.
* Storage and lookup use normalized form.

---

### EC-16: Clock Skew in Onboarding Timestamps

**Scenario**: `accepted_at` from client is 5 minutes in the future.

**Behavior**:

* Reject future-dated timestamps with `422`.
* Allow 30-second tolerance for minor clock skew.

---

### EC-17: Future Session Start

**Scenario**: Client clock is wrong; `started_at` appears in future.

**Behavior**:

* `started_at` is server-generated (`NOW()`), not client-provided.
* Not applicable to API-driven sessions.

---

### EC-18: Hard-Deleted Supabase Auth User

**Scenario**: GDPR deletion or admin hard-delete removes `auth.users` row.

**Behavior**:

* FK `ON DELETE CASCADE` would remove `users` row — **this is undesirable** for audit.
* **MVP Decision**: Do not cascade delete. Instead:
  * Detect orphan via reconciliation.
  * Transition `users.status` to `deactivated`.
  * Preserve all identity history.
* Post-MVP: implement soft-delete bridge table.

---

### EC-19: Long-Deactivated Account Reactivation

**Scenario**: User attempts to reactivate account deactivated > 1 year ago.

**Behavior**:

* Allow reactivation if email still verified and no fraud history.
* Require fresh email verification if > 90 days since last sign-in.
* Emit `user.updated` with `metadata.reactivation_after_days`.

---

### EC-20: Bulk Import Email Collisions

**Scenario**: Bulk import CSV contains email already in system.

**Behavior**:

* Skip duplicate email with warning log.
* Continue processing remaining rows.
* Return summary: `{ imported: N, skipped: M, errors: [...] }`.

---

## Edge Case Response Matrix

| ID | Automatic Handling | Requires Human Review | Alert Severity |
|----|-------------------|----------------------|----------------|
| EC-01 | Yes (reconciliation) | No | Info |
| EC-02 | Yes (idempotency) | No | None |
| EC-03 | Yes (last-write-wins) | No | None |
| EC-04 | Yes (constraint / idempotency) | No | None |
| EC-05 | Yes (row lock + trigger) | No | None |
| EC-06 | Yes (auto-deactivate) | No | Warn |
| EC-07 | No | Yes | Critical |
| EC-08 | Yes (422 rejection) | No | None |
| EC-09 | Yes (cascade suspension) | No | Info |
| EC-10 | Yes (409 rejection) | No | Warn |
| EC-11 | Yes (delayed enqueue) | If persistent | Warn |
| EC-12 | Yes (idempotent by design) | No | None |
| EC-13 | Yes (NFC normalization) | No | None |
| EC-14 | Yes (sanitization) | No | None |
| EC-15 | Yes (E.164 normalization) | No | None |
| EC-16 | Yes (future-date rejection) | No | None |
| EC-17 | N/A (server timestamp) | No | None |
| EC-18 | Yes (deactivate, preserve) | No | Warn |
| EC-19 | Yes (with re-verification) | No | None |
| EC-20 | Yes (skip + log) | No | Info |

---

## Final Principle

Edge cases are not afterthoughts. They are operational requirements that define system resilience. Every edge case without defined behavior is a latent production incident.
