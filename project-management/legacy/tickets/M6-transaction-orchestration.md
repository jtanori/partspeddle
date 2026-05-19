# M6 — Transaction Orchestration Tickets

> The operational core. All trust guarantees depend on this phase.

---

## T6.1 — Transaction Database Schema

**Domain:** Transactions
**Capability:** Persistence

**Purpose:** Create cart, order, transaction, escrow, and payment tables.

**Dependencies:** T2.1 (RLS patterns), T1.5 (Supabase client)

**Architectural Constraints:**
- Tables: `carts`, `orders`, `transactions`, `escrow_sessions`, `payment_intents`
- FK to `users.id` (buyer), `listings.id` (item), `seller_profiles.id` (seller)
- Transaction status enum: `initiated`, `cart_active`, `checkout_started`, `payment_pending`, `payment_authorized`, `escrow_locked`, `seller_confirmed`, `shipment_pending`, `shipment_in_transit`, `delivery_pending`, `delivered`, `inspection_window`, `settlement_pending`, `settled`, `completed`
- Failure states: `payment_failed`, `abandoned`, `cancelled`, `delayed`, `lost`, `disputed`
- RLS: buyer sees own transactions, seller sees own sales

**Deliverables:**
- Migration for all transaction tables
- CHECK constraints on state transitions (where possible)
- Indexes: `buyer_id`, `seller_id`, `status`, `created_at`
- RLS policies

**Acceptance Criteria:**
- [ ] Tables created with correct constraints
- [ ] FK to users and listings enforced
- [ ] RLS prevents cross-party reads
- [ ] Audit table logs all state changes

**Observability:**
- `transaction_total` gauge by status

**Failure Modes:**
- Invalid FK → reject at DB level
- Orphaned transaction → reconciliation job

---

## T6.2 — Cart Orchestration

**Domain:** Transactions
**Capability:** Staging

**Purpose:** Implement temporary cart with expiration.

**Dependencies:** T6.1

**Architectural Constraints:**
- Cart expires after 24h (queue job)
- Cart holds listing references (not full objects)
- Max items: 10
- Events: `cart.updated`
- Idempotent updates (full replacement)

**Deliverables:**
- `src/transactions/domain/entities/cart.ts`
- `src/transactions/application/services/cart-service.ts`
- Cart expiration queue worker

**Acceptance Criteria:**
- [ ] Cart creates, adds items, removes items
- [ ] Cart expires after 24h
- [ ] Expired cart emits `cart.updated` with empty contents
- [ ] Max 10 items enforced

**Observability:**
- `transaction_cart_creations_total` counter
- `transaction_cart_expirations_total` counter

**Failure Modes:**
- Cart not found → 404
- Listing unavailable → 422

---

## T6.3 — Checkout State Machine

**Domain:** Transactions
**Capability:** Payment Initiation

**Purpose:** Orchestrate checkout from cart to payment authorization.

**Dependencies:** T6.2, T2.3 (active seller verification)

**Architectural Constraints:**
- States: `checkout_started → payment_pending → payment_authorized`
- Stripe PaymentIntent created on checkout start
- Idempotency key on checkout initiation
- Events: `checkout.started`, `payment.pending`, `payment.authorized`, `payment.failed`

**Deliverables:**
- `src/transactions/domain/entities/transaction.ts`
- `src/transactions/application/services/checkout-service.ts`
- Stripe PaymentIntent adapter

**Acceptance Criteria:**
- [ ] Checkout creates PaymentIntent
- [ ] Idempotency prevents duplicate PaymentIntents
- [ ] Payment authorization transitions state
- [ ] Payment failure transitions to `payment_failed`

**Observability:**
- `transaction_checkouts_started_total` counter
- `transaction_payments_authorized_total` counter
- `transaction_payments_failed_total` counter

**Failure Modes:**
- Stripe API down → retry queue, checkout stalled
- Duplicate checkout → idempotency returns existing

---

## T6.4 — Escrow Lifecycle

**Domain:** Transactions
**Capability:** Trust Holding

**Purpose:** Lock funds and manage release conditions.

**Dependencies:** T6.3

**Architectural Constraints:**
- Escrow created on `payment_authorized`
- Release conditions: delivery + inspection OR timeout
- Events: `escrow.created`, `escrow.locked`, `escrow.released`
- Integration with Vault domain (M8)

**Deliverables:**
- `src/transactions/domain/entities/escrow-session.ts`
- `src/transactions/application/services/escrow-service.ts`
- Escrow timeout worker

**Acceptance Criteria:**
- [ ] Escrow locks on payment authorization
- [ ] Release requires buyer confirmation or 72h timeout
- [ ] Dispute freezes escrow
- [ ] Compensation reverses escrow on cancellation

**Observability:**
- `transaction_escrow_locks_total` counter
- `transaction_escrow_releases_total` counter

**Failure Modes:**
- Release without authorization → state machine rejects
- Timeout race condition → idempotency protects

---

## T6.5 — Settlement Orchestration

**Domain:** Transactions
**Capability:** Fund Transfer

**Purpose:** Release funds to seller after successful delivery/inspection.

**Dependencies:** T6.4

**Architectural Constraints:**
- Settlement only from `settlement_pending` state
- Stripe Transfer to seller Connect account
- Events: `settlement.started`, `settlement.completed`
- Reconciliation job validates transfers

**Deliverables:**
- `src/transactions/application/services/settlement-service.ts`
- Stripe Transfer adapter
- Reconciliation worker

**Acceptance Criteria:**
- [ ] Settlement creates Stripe Transfer
- [ ] Transfer failure triggers retry
- [ ] Success transitions to `settled`
- [ ] Reconciliation validates pending transfers

**Observability:**
- `transaction_settlements_completed_total` counter
- `transaction_settlement_failures_total` counter

**Failure Modes:**
- Stripe Connect account invalid → seller payout blocked
- Transfer duplicate → idempotency prevents

---

## T6.6 — Compensation & Cancellation Flows

**Domain:** Transactions
**Capability:** Recovery

**Purpose:** Handle transaction cancellation and reversal.

**Dependencies:** T6.3, T6.4

**Architectural Constraints:**
- Cancellation possible before settlement
- Payment reversal via Stripe refund
- Listing restored to published
- Events: `transaction.cancelled`

**Deliverables:**
- `src/transactions/application/services/cancellation-service.ts`
- Refund adapter
- Compensation event emitter

**Acceptance Criteria:**
- [ ] Cancel before payment → no Stripe action
- [ ] Cancel after payment → Stripe refund initiated
- [ ] Cancel after escrow → escrow cancelled
- [ ] Listing restored on cancellation

**Observability:**
- `transaction_cancellations_total` counter

**Failure Modes:**
- Refund failure → manual intervention required
- Already settled → cancellation rejected

---

## T6.7 — Transaction API & Integration Tests

**Domain:** Transactions
**Capability:** HTTP Boundary + QA

**Purpose:** Expose transaction endpoints and verify end-to-end trust flow.

**Dependencies:** T6.1–T6.6

**Architectural Constraints:**
- Thin controllers
- DTOs with zod validation
- Rate limit: 10 checkout req/min per user
- E2E test: buyer checkout → seller settlement

**Deliverables:**
- `src/transactions/api/routes/transaction-routes.ts`
- `src/transactions/api/controllers/transaction-controller.ts`
- E2E test: full transaction journey

**Acceptance Criteria:**
- [ ] `POST /v1/transactions/checkout` initiates checkout
- [ ] `POST /v1/transactions/:id/confirm-delivery` releases escrow
- [ ] Rate limit enforced
- [ ] E2E: full lifecycle completes in < 5 min

**Observability:**
- `transaction_api_latency_seconds` histogram

**Failure Modes:**
- Invalid state transition → 422
- Rate limit exceeded → 429
