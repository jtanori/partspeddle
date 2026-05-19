# VINTRACK — Identity Domain Test Architecture

## Purpose

Defines the testing strategy, test categories, and specific test requirements for the Identity bounded context.

Testing is mandatory infrastructure. Untestable Identity behavior is considered incomplete.

---

## Test Philosophy

* **TDD Discipline**: New behavior starts with a failing test. No implementation without test coverage.
* **Deterministic Tests**: Every test must produce the same result on every run. No external dependencies that introduce non-determinism.
* **Fast Feedback**: Unit tests run in < 100ms. Integration tests run in < 5s.
* **Failure-First**: Tests must cover happy path, edge cases, and failure modes.
* **Event Verification**: Domain event emission must be asserted, not assumed.

---

## Test Pyramid

```
       /\
      /  \   E2E (minimal — 1-2 critical journeys)
     /____\  -----------------
    /      \  Integration (queues, DB, event bus)
   /________\ -----------------
  /          \ Unit (entities, repositories, services)
 /____________\
```

| Layer | Ratio | Runtime Target |
|-------|-------|----------------|
| Unit | ~70% | < 100ms each |
| Integration | ~25% | < 5s each |
| E2E | ~5% | < 30s each |

---

## Unit Tests

### Entity Tests

#### User Entity

```typescript
describe('User Entity', () => {
  it('should create a valid user with default role buyer', () => {
    // Assert role === 'buyer', status === 'active'
  });

  it('should reject invalid email format', () => {
    // Assert validation throws DomainValidationError
  });

  it('should transition status active -> suspended with reason', () => {
    // Assert status change and event emission
  });

  it('should prevent suspended -> deactivated without active intermediate', () => {
    // Assert InvalidStatusTransitionError
  });

  it('should enforce email uniqueness invariant', () => {
    // Assert DuplicateEmailError when email already exists
  });

  it('should emit user.suspended on suspension', () => {
    // Assert domain event in aggregate uncommittedEvents
  });
});
```

#### SellerProfile Entity

```typescript
describe('SellerProfile Entity', () => {
  it('should require stripe_connect_account_id for activation', () => {
    // Guard: cannot transition to active without acct_
  });

  it('should require verified_identity for activation', () => {
    // Guard: cannot transition to active if verified_identity === false
  });

  it('should set activated_at on first activation', () => {
    // Assert activated_at is populated and immutable on reactivation
  });

  it('should prevent negative listing_count', () => {
    // Assert NonNegativeMetricError
  });

  it('should emit seller.activated on review -> active transition', () => {
    // Assert event in uncommittedEvents
  });

  it('should emit seller.deactivated on active -> suspended transition', () => {
    // Assert event in uncommittedEvents
  });

  it('should reject invalid state machine transitions', () => {
    // pending -> active (invalid)
    // onboarding -> suspended (invalid in MVP; must go through review)
  });
});
```

#### OnboardingState Entity

```typescript
describe('OnboardingState Entity', () => {
  it('should mark completed when all steps are true', () => {
    // Assert completed_at is set
  });

  it('should not clear completed_at if steps revert', () => {
    // Assert immutability of completed_at
  });
});
```

### Repository Tests (In-Memory)

```typescript
describe('UserRepository (in-memory)', () => {
  it('should find user by email', () => { });
  it('should enforce idempotency on create', () => { });
  it('should update last_sign_in without emitting events', () => { });
});

describe('SellerProfileRepository (in-memory)', () => {
  it('should increment listing_count atomically', () => { });
  it('should return false for isEligibleToPublish when status !== active', () => { });
});
```

### Service / Use Case Tests

```typescript
describe('RegisterSellerUseCase', () => {
  it('should create SellerProfile and OnboardingState', () => { });
  it('should reject registration for suspended users', () => { });
  it('should be idempotent with same idempotency key', () => { });
});

describe('CompleteOnboardingStepUseCase', () => {
  it('should update step and trigger review transition when all complete', () => { });
  it('should reject step completion for non-existent seller', () => { });
  it('should reject step completion when seller status !== onboarding', () => { });
});
```

---

## Integration Tests

### Database Integration

```typescript
describe('Identity Database Schema', () => {
  it('should enforce FK users.id -> auth.users.id', async () => {
    // Attempt insert without auth.users row -> expect FK violation
  });

  it('should auto-create profile on user insert via trigger', async () => {
    // Insert into auth.users (test schema) → assert profiles row exists
  });

  it('should auto-transition seller status on onboarding completion via trigger', async () => {
    // Update onboarding_states steps → assert seller_profiles.status === 'review'
  });

  it('should enforce RLS: user cannot read another user record', async () => {
    // Set auth.uid() to user A, query user B → expect 0 rows
  });

  it('should enforce temporal consistency on session revocation', async () => {
    // Attempt ended_at < started_at → expect CHECK violation
  });
});
```

### Queue Integration

```typescript
describe('Identity Queue Workers', () => {
  it('should process identity-onboarding job and update state', async () => {
    // Enqueue onboarding step job → wait for completion → assert DB state
  });

  it('should retry failed webhook jobs with exponential backoff', async () => {
    // Enqueue failing webhook job → assert retry count increases
  });

  it('should move exhausted retries to dead-letter', async () => {
    // Enqueue failing job with max retries → assert DLQ entry
  });

  it('should process outbox relay and publish events', async () => {
    // Insert outbox row → run relay worker → assert published_at set
  });
});
```

### Event Bus Integration

```typescript
describe('Identity Event Emission', () => {
  it('should emit user.created after successful registration', async () => {
    // Create user → assert event bus receives user.created with correct payload
  });

  it('should emit seller.activated with correlationId preserved', async () => {
    // Activate seller → assert event contains same correlationId as request
  });

  it('should not emit events on transaction rollback', async () => {
    // Start transaction, mutate user, throw error → assert no events published
  });
});
```

### API Integration

```typescript
describe('Identity API Endpoints', () => {
  it('GET /v1/identity/users/me returns authenticated user', async () => { });
  it('PATCH /v1/identity/profiles/me updates profile and emits event', async () => { });
  it('POST /v1/identity/sellers/register rejects duplicate with 409', async () => { });
  it('POST /v1/identity/sellers/me/onboarding/identity completes step', async () => { });
  it('POST /v1/identity/webhooks/supabase-auth validates signature', async () => {
    // Invalid signature → 401
  });
  it('POST /v1/identity/webhooks/supabase-auth deduplicates within 24h', async () => { });
});
```

---

## Contract Tests

### Event Contract Tests

```typescript
describe('user.created Event Contract', () => {
  it('should conform to canonical event schema', () => {
    // Assert payload contains: eventId, eventType, eventVersion, occurredAt,
    // correlationId, causationId, actorId, domain, aggregateId, payload, metadata
  });

  it('should have eventVersion 1', () => {
    // Assert version stability
  });

  it('should be idempotent for same aggregateId within deduplication window', () => {
    // Consumers must handle duplicate user.created safely
  });
});

describe('seller.activated Event Contract', () => {
  it('should include sellerProfileId and userId in payload', () => { });
  it('should include activatedAt timestamp', () => { });
});
```

### API Contract Tests

```typescript
describe('Identity API Contracts', () => {
  it('PATCH /profiles/me rejects oversized display_name', async () => {
    // 101 chars → 422
  });

  it('error response conforms to canonical error structure', async () => {
    // Assert: { error: { code, message, correlationId, details } }
  });

  it('all endpoints require Authorization header', async () => {
    // Missing header → 401 with IDENTITY_UNAUTHORIZED
  });
});
```

---

## E2E Tests

### Critical Journey: Buyer Registration → Seller Activation

```typescript
describe('E2E: Buyer to Seller Journey', () => {
  it('completes full registration and onboarding flow', async () => {
    // 1. Simulate Supabase Auth user creation webhook
    // 2. Assert user + profile exist
    // 3. Authenticate as user
    // 4. POST /sellers/register
    // 5. Complete all onboarding steps
    // 6. Simulate operational approval (admin status transition)
    // 7. Assert seller.activated event emitted
    // 8. Assert downstream consumer (Marketplace) receives event
  });
});
```

### Critical Journey: Session Lifecycle

```typescript
describe('E2E: Session Lifecycle', () => {
  it('creates, lists, and revokes sessions across all devices', async () => {
    // 1. Sign in from web → assert session.created
    // 2. Sign in from mobile → assert second session.created
    // 3. GET /sessions/me → assert 2 active sessions
    // 4. DELETE /sessions/me → assert both revoked
    // 5. Assert Supabase Auth tokens invalidated
  });
});
```

---

## Test Data Strategy

### Factories

```typescript
// factories/user.factory.ts
export function buildUser(overrides?: Partial<User>): User {
  return new User({
    id: randomUUID(),
    email: `test-${randomUUID()}@example.com`,
    role: 'buyer',
    status: 'active',
    email_verified: true,
    ...overrides,
  });
}

// factories/seller-profile.factory.ts
export function buildSellerProfile(overrides?: Partial<SellerProfile>): SellerProfile {
  return new SellerProfile({
    id: randomUUID(),
    user_id: randomUUID(),
    status: 'pending',
    payout_enabled: false,
    listing_count: 0,
    total_sales_cents: 0,
    verified_identity: false,
    ...overrides,
  });
}
```

### Test Database

* Dedicated `vitest` / `jest` test database per run
* Migrations run before test suite
* Each test wrapped in transaction, rolled back after
* Service-role connection used to bypass RLS for setup assertions

---

## Test Execution

```bash
# Unit tests only
npm run test:unit -- --domain=identity

# Integration tests (requires test DB + Redis)
npm run test:integration -- --domain=identity

# All Identity tests
npm run test -- identity/

# CI pipeline
npm run test:ci -- --coverage --domain=identity
```

### Coverage Requirements

| Layer | Line Coverage | Branch Coverage |
|-------|--------------|-----------------|
| Entities | 100% | 100% |
| Repositories | 95% | 90% |
| Services / Use Cases | 95% | 90% |
| API Handlers | 90% | 85% |
| Queue Workers | 90% | 85% |

---

## Failure-Path Test Checklist

* [ ] DB connection failure during user creation → graceful error, no partial state
* [ ] Duplicate Supabase Auth webhook → idempotent, no duplicate users
* [ ] Onboarding step update with invalid Stripe account ID → validation error
* [ ] Seller activation with missing verification → state machine rejection
* [ ] Profile update with control characters in display_name → sanitization / rejection
* [ ] Session revocation during concurrent sign-in → no orphaned active sessions
* [ ] Outbox relay failure → retry, then DLQ, then alert
* [ ] RLS policy violation attempt → 403, logged, no data leakage

---

## Final Principle

Identity tests must prove that trust primitives work correctly under all conditions. If a test cannot be written for a behavior, that behavior is too complex, too implicit, or insufficiently specified.
