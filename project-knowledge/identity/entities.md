# VINTRACK — Identity Domain Entities

## Entity Overview

| Entity | Purpose | Aggregate Root |
|--------|---------|---------------|
| `User` | Canonical platform actor | Yes |
| `Profile` | Extended user metadata | No (owned by User) |
| `BuyerProfile` | Buyer-specific attributes | No (owned by User) |
| `SellerProfile` | Seller-specific attributes and lifecycle | No (owned by User) |
| `OnboardingState` | Seller onboarding progression tracker | No (owned by SellerProfile) |
| `UserSession` | Operational session metadata | No (owned by User) |

---

## User

### Purpose

The canonical platform actor. `User` is the aggregate root for the Identity bounded context. All other identity entities are conceptually children of `User`.

### Attributes

| Attribute | Type | Constraints |
|-----------|------|-------------|
| `id` | UUID | Primary key, matches Supabase Auth `auth.users.id` |
| `email` | VARCHAR(255) | Unique, not null, indexed |
| `phone` | VARCHAR(50) | Nullable, unique |
| `role` | ENUM | `buyer`, `seller`, `admin` — default `buyer` |
| `status` | ENUM | `active`, `suspended`, `deactivated` — default `active` |
| `email_verified` | BOOLEAN | Default `false` |
| `phone_verified` | BOOLEAN | Default `false` |
| `created_at` | TIMESTAMPTZ | Not null, immutable |
| `updated_at` | TIMESTAMPTZ | Auto-updated |
| `last_sign_in_at` | TIMESTAMPTZ | Nullable |

### Invariants

1. **Auth Sync Invariant**: `id` MUST match a valid `auth.users` record. No orphaned identity users.
2. **Status Immutability Invariant**: `created_at` is immutable after insertion.
3. **Role Validity Invariant**: `role` MUST be one of the defined enum values.
4. **Email Uniqueness Invariant**: `email` MUST be unique across the platform.
5. **Suspension Cascade Invariant**: When `status` transitions to `suspended`, all active sessions MUST be revoked and downstream domains MUST be notified.

### Lifecycle

```
[created] → [active] → [suspended] → [deactivated]
                ↓           ↓
             [reactivated] [reactivated]
```

| Transition | Trigger | Event Emitted |
|-----------|---------|---------------|
| created → active | Supabase Auth confirms registration | `user.created` |
| active → suspended | Administrative action or fraud signal | `user.suspended` |
| suspended → active | Administrative reinstatement | `user.updated` |
| active → deactivated | User-initiated account closure | `user.updated` |
| deactivated → active | Account recovery (time-bound window) | `user.updated` |

### Relationships

* One-to-One with `Profile` (always exists after creation)
* One-to-One with `BuyerProfile` (lazy-created on first buyer action)
* One-to-One with `SellerProfile` (created during seller onboarding initiation)
* One-to-Many with `UserSession`

---

## Profile

### Purpose

Extended user metadata for display, discovery, and operational context. Separated from `User` to keep auth-sync surface minimal.

### Attributes

| Attribute | Type | Constraints |
|-----------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Foreign key → `users.id`, unique, cascade delete |
| `display_name` | VARCHAR(100) | Nullable, indexed for search |
| `avatar_url` | TEXT | Nullable, validated URL format |
| `bio` | TEXT | Nullable, max 2000 characters |
| `location` | JSONB | Nullable — `{ city, state, country, postal_code }` |
| `timezone` | VARCHAR(50) | Default `UTC` |
| `locale` | VARCHAR(10) | Default `en-US` |
| `notification_preferences` | JSONB | Default `{}` |
| `created_at` | TIMESTAMPTZ | Immutable |
| `updated_at` | TIMESTAMPTZ | Auto-updated |

### Invariants

1. **User Existence Invariant**: `user_id` MUST reference an existing `User`.
2. **Display Name Sanitization Invariant**: `display_name` MUST be sanitized (no control characters, trimmed).
3. **Single Profile Invariant**: Only ONE `Profile` per `User`.

### Lifecycle

Profile is created automatically when `User` is created. It exists for the lifetime of the user.

| Event | Trigger |
|-------|---------|
| `profile.updated` | Any attribute mutation |

---

## BuyerProfile

### Purpose

Buyer-specific operational metadata and preferences. Lazy-created to avoid unnecessary data for users who never buy.

### Attributes

| Attribute | Type | Constraints |
|-----------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Foreign key → `users.id`, unique, cascade delete |
| `default_shipping_address` | JSONB | Nullable — structured address object |
| `purchase_count` | INTEGER | Default 0, non-negative |
| `total_spend_cents` | INTEGER | Default 0, non-negative |
| `preferred_payment_method` | VARCHAR(50) | Nullable |
| `created_at` | TIMESTAMPTZ | Immutable |
| `updated_at` | TIMESTAMPTZ | Auto-updated |

### Invariants

1. **Non-Negative Metrics Invariant**: `purchase_count` and `total_spend_cents` MUST be ≥ 0.
2. **User Existence Invariant**: `user_id` MUST reference an existing `User`.

### Lifecycle

Created on first buyer action (cart creation, transaction initiation, or explicit buyer preference save).

---

## SellerProfile

### Purpose

Seller-specific attributes, activation state, and trust metadata. This entity governs whether a user may publish listings and receive payments.

### Attributes

| Attribute | Type | Constraints |
|-----------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Foreign key → `users.id`, unique, cascade delete |
| `status` | ENUM | `pending`, `onboarding`, `review`, `active`, `suspended` |
| `stripe_connect_account_id` | VARCHAR(255) | Nullable, unique |
| `payout_enabled` | BOOLEAN | Default `false` |
| `listing_count` | INTEGER | Default 0, non-negative |
| `total_sales_cents` | INTEGER | Default 0, non-negative |
| `rating_average` | DECIMAL(2,1) | Nullable, range 0.0–5.0 |
| `verified_identity` | BOOLEAN | Default `false` |
| `created_at` | TIMESTAMPTZ | Immutable |
| `updated_at` | TIMESTAMPTZ | Auto-updated |
| `activated_at` | TIMESTAMPTZ | Nullable |

### State Machine

```
[pending] --(onboarding started)--> [onboarding]
[onboarding] --(steps completed)--> [review]
[review] --(approved)--> [active]
[review] --(rejected)--> [onboarding]
[active] --(suspended)--> [suspended]
[suspended] --(reinstated)--> [active]
```

| State | Meaning |
|-------|---------|
| `pending` | User expressed intent to sell, no onboarding initiated |
| `onboarding` | Onboarding in progress, incomplete |
| `review` | Onboarding complete, awaiting operational review |
| `active` | Approved to publish listings and receive payments |
| `suspended` | Selling privileges revoked |

### State Transitions

| From | To | Trigger | Guard | Event Emitted |
|------|----|---------|-------|---------------|
| `pending` | `onboarding` | User initiates seller registration | User status is `active` | — |
| `onboarding` | `review` | All onboarding steps completed | Stripe Connect account linked | — |
| `review` | `active` | Operational approval granted | Identity verified | `seller.activated` |
| `review` | `onboarding` | Operational rejection | Rejection reason logged | — |
| `active` | `suspended` | Fraud signal or policy violation | — | `seller.deactivated` |
| `suspended` | `active` | Administrative reinstatement | Review completed | `seller.activated` |

### Invariants

1. **Activation Preconditions Invariant**: `status` may only become `active` when:
   * `stripe_connect_account_id` is populated
   * `verified_identity` is `true`
   * `User.status` is `active`
2. **Non-Negative Metrics Invariant**: `listing_count` and `total_sales_cents` ≥ 0.
3. **Single SellerProfile Invariant**: Only ONE `SellerProfile` per `User`.
4. **ActivatedAt Consistency Invariant**: `activated_at` MUST be set when transitioning to `active` and MUST NOT be cleared.

### Relationships

* One-to-One with `OnboardingState`

---

## OnboardingState

### Purpose

Tracks seller onboarding step completion. Separated from `SellerProfile` to avoid bloating the primary entity with transient workflow state.

### Attributes

| Attribute | Type | Constraints |
|-----------|------|-------------|
| `id` | UUID | Primary key |
| `seller_profile_id` | UUID | Foreign key → `seller_profiles.id`, unique, cascade delete |
| `step_identity` | BOOLEAN | Default `false` |
| `step_payout` | BOOLEAN | Default `false` |
| `step_terms` | BOOLEAN | Default `false` |
| `step_profile` | BOOLEAN | Default `false` |
| `completed_at` | TIMESTAMPTZ | Nullable |
| `created_at` | TIMESTAMPTZ | Immutable |
| `updated_at` | TIMESTAMPTZ | Auto-updated |

### Invariants

1. **Completion Consistency Invariant**: `completed_at` is set ONLY when all steps are `true`.
2. **SellerProfile Existence Invariant**: `seller_profile_id` MUST reference an existing `SellerProfile`.

### Completion Logic

```
all_steps_complete = step_identity AND step_payout AND step_terms AND step_profile

IF all_steps_complete AND completed_at IS NULL:
    SET completed_at = NOW()
    TRIGGER seller profile status → review
```

---

## UserSession

### Purpose

Operational session tracking for observability and security audit. This is NOT the auth session (managed by Supabase Auth) but rather an operational record of sign-in events.

### Attributes

| Attribute | Type | Constraints |
|-----------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Foreign key → `users.id`, cascade delete |
| `session_type` | ENUM | `web`, `mobile`, `api` |
| `ip_address` | INET | Nullable |
| `user_agent` | TEXT | Nullable |
| `started_at` | TIMESTAMPTZ | Not null |
| `ended_at` | TIMESTAMPTZ | Nullable |
| `revoked` | BOOLEAN | Default `false` |
| `revoked_reason` | VARCHAR(50) | Nullable |

### Invariants

1. **Temporal Consistency Invariant**: If `ended_at` is set, it MUST be ≥ `started_at`.
2. **Revocation Consistency Invariant**: If `revoked` is `true`, `ended_at` MUST be set and `revoked_reason` MUST be populated.

### Lifecycle

| Transition | Trigger | Event Emitted |
|-----------|---------|---------------|
| Created | User signs in | `session.created` |
| Revoked | User signs out, token expiry, admin action | `session.revoked` |
| Expired | Supabase Auth session timeout | `session.revoked` (via reconciliation job) |

---

## Entity Relationship Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│      User       │────▶│     Profile     │     │  BuyerProfile   │
│  (Aggregate)    │     │   (1:1, req)    │     │   (1:1, lazy)   │
└────────┬────────┘     └─────────────────┘     └─────────────────┘
         │
         │              ┌─────────────────┐     ┌─────────────────┐
         └─────────────▶│  SellerProfile  │────▶│ OnboardingState │
                        │  (1:1, opt)     │     │   (1:1, opt)    │
                        └────────┬────────┘     └─────────────────┘
                                 │
                        ┌────────┴────────┐
                        │   UserSession   │
                        │   (1:many)      │
                        └─────────────────┘
```

---

## Validation Rules

### User

* `email`: Valid RFC 5322 format, max 255 chars
* `phone`: E.164 format if provided
* `role`: Enum validation
* `status`: Enum validation

### Profile

* `display_name`: 1–100 chars, no control characters, trimmed
* `avatar_url`: Valid HTTPS URL, max 2048 chars
* `bio`: Max 2000 chars
* `location`: Must conform to location schema if present

### SellerProfile

* `stripe_connect_account_id`: Must begin with `acct_` if present
* `rating_average`: 0.0–5.0 if present

---

## Persistence Requirements

| Entity | Storage | Retention | Notes |
|--------|---------|-----------|-------|
| User | Postgres | Indefinite | Soft-delete via `status` |
| Profile | Postgres | Indefinite | Cascade with User |
| BuyerProfile | Postgres | Indefinite | Cascade with User |
| SellerProfile | Postgres | Indefinite | Cascade with User |
| OnboardingState | Postgres | Indefinite | Cascade with SellerProfile |
| UserSession | Postgres | 90 days | Automated purge after retention |
