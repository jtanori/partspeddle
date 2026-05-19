# VINTRACK — Testing Strategy

## Purpose

Defines testing standards, pyramid ratios, and execution rules. Untestable code is incomplete code.

---

## Test Pyramid (MVP)

```
       /\
      /  \   E2E (2-3 critical journeys)
     /____\  -----------------
    /      \  Integration (queues, DB, webhooks)
   /________\ -----------------
  /          \ Unit (entities, services, repositories)
 /____________\
```

| Layer | Ratio | Runtime Target |
|-------|-------|----------------|
| Unit | ~70% | < 100ms each |
| Integration | ~25% | < 5s each |
| E2E | ~5% | < 30s each |

---

## Unit Tests

### What to Test

- Domain entities and invariants
- State machine transitions
- Service/use case logic
- Repository interfaces (in-memory adapter)
- Event emission

### What NOT to Test

- Database drivers
- Framework routing
- External API clients (mock these)
- Configuration parsing

### Rules

- One test file per source file: `user.ts` → `user.test.ts`
- Tests live alongside source in `src/<domain>/`
- In-memory repository adapter for unit tests
- Every test must be deterministic (no `Date.now()`, no randomness)
- Freeze time with `vi.useFakeTimers()` when testing timeouts

### Example

```typescript
describe('SellerProfile', () => {
  it('should reject activation without stripe account', () => {
    const seller = new SellerProfile({ status: 'review', stripeConnectAccountId: null });
    expect(() => seller.activate()).toThrow(InvalidStatusTransitionError);
  });

  it('should emit seller.activated on valid transition', () => {
    const seller = new SellerProfile({ status: 'review', stripeConnectAccountId: 'acct_123', verifiedIdentity: true });
    seller.activate();
    expect(seller.uncommittedEvents).toContainEqual(expect.objectContaining({ eventType: 'seller.activated' }));
  });
});
```

---

## Integration Tests

### What to Test

- Database schema constraints (FK, CHECK, RLS)
- Trigger behavior
- Queue worker execution
- Webhook handlers
- Outbox relay
- Event bus delivery

### Rules

- Dedicated test database per run
- Migrations applied before suite
- Each test wrapped in transaction, rolled back after
- Service-role connection for setup; RLS tested with authenticated role
- BullMQ test queue with `prefix: 'test:'`

### Example

```typescript
describe('Identity DB Schema', () => {
  it('should enforce FK users.id -> auth.users.id', async () => {
    await expect(db.insert('users', { id: uuid(), email: 'x@y.com' }))
      .rejects.toThrow(/foreign key violation/);
  });

  it('should auto-create profile on auth user insert', async () => {
    const user = await createAuthUser();
    const profile = await db.find('profiles', { user_id: user.id });
    expect(profile).toBeDefined();
  });
});
```

---

## E2E Tests

### What to Test

- Buyer registration → checkout → payment → escrow → settlement
- Seller onboarding → listing creation → transaction completion
- Critical failure recovery (payment failure, webhook timeout)

### Rules

- Run against full local stack (Postgres + Redis + API)
- Use test Stripe keys
- Clean state between tests (truncate non-auth tables)
- Max 3 E2E tests for MVP

---

## Contract Tests

### Event Contracts

Every domain event must have a contract test:

```typescript
describe('seller.activated contract', () => {
  it('conforms to canonical event schema', () => {
    const event = buildEvent('seller.activated', { sellerProfileId: uuid(), userId: uuid() });
    expect(() => EventSchema.parse(event)).not.toThrow();
  });

  it('is idempotent for same aggregateId', () => {
    // Consumers must handle duplicate safely
  });
});
```

### API Contracts

Every endpoint must validate error shape:

```typescript
describe('POST /sellers/register', () => {
  it('returns canonical error on duplicate', async () => {
    const res = await request(app).post('/v1/identity/sellers/register').send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('correlationId');
  });
});
```

---

## Test Data

### Factories

```typescript
// tests/fixtures/factories/user.factory.ts
export function buildUser(overrides?: Partial<User>): User {
  return new User({
    id: randomUUID(),
    email: `test-${randomUUID()}@example.com`,
    role: 'buyer',
    status: 'active',
    ...overrides,
  });
}
```

### Rules

- Factories in `tests/fixtures/factories/`
- Builders for complex objects
- Never use production data in tests
- UUIDs generated with `crypto.randomUUID()`

---

## Coverage Requirements

| Layer | Line | Branch |
|-------|------|--------|
| Domain entities | 95%+ | 95%+ |
| Application services | 95% | 90% |
| API controllers | 90% | 85% |
| Queue workers | 90% | 85% |
| Infrastructure | 80% | 75% |

---

## Execution

```bash
# Unit only
npm run test:unit

# Integration (needs test DB + Redis)
npm run test:integration

# E2E (needs full stack)
npm run test:e2e

# All with coverage
npm run test:ci
```

---

## Final Principle

Tests are architecture documentation. If a behavior is hard to test, the architecture is wrong. Fix the design, not the test.
