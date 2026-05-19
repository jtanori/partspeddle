# VINTRACK — Transactions Domain Blueprint

## Purpose

The Transactions bounded context is the operational heart of the VINTRACK MVP. It orchestrates the entire commerce lifecycle: cart management, checkout, payment coordination, escrow state transitions, and settlement.

No transaction workflow operates outside this domain's authority.

---

## Scope

### In Scope (MVP)

* Cart lifecycle (create, update, abandon, expire)
* Checkout orchestration
* Payment coordination via Stripe
* Escrow state machine management
* Transaction state tracking
* Settlement lifecycle
* Order orchestration

### Out of Scope (MVP)

* Multi-currency support
* Subscription/recurring payments
* Complex tax calculation engines
* Advanced fraud detection (basic Stripe radar only)
* Partial refunds and split payments
* Cryptocurrency settlement

---

## Domain Ownership

### Data Owned

| Table | Aggregate | Notes |
|-------|-----------|-------|
| `carts` | Cart | Temporary staging; auto-expire |
| `orders` | Order | Immutable once placed |
| `transactions` | Transaction | Authoritative state machine record |
| `escrow_sessions` | EscrowSession | Links to Vault domain |
| `payment_intents` | PaymentIntent | Stripe reference tracking |
| `transaction_outbox` | — | Transactional event outbox |

### Events Owned (Authoritative)

| Event | Description |
|-------|-------------|
| `transaction.created` | New transaction initiated |
| `cart.updated` | Cart contents changed |
| `checkout.started` | Buyer entered checkout |
| `checkout.abandoned` | Checkout timed out or buyer exited |
| `payment.pending` | Awaiting Stripe authorization |
| `payment.authorized` | Funds authorized |
| `payment.failed` | Authorization failed |
| `escrow.created` | Escrow session initialized |
| `escrow.locked` | Funds logically held |
| `transaction.cancelled` | Transaction terminated before settlement |
| `transaction.completed` | Full lifecycle finalized |
| `settlement.started` | Release process initiated |
| `settlement.completed` | Funds transferred to seller |

### API Ownership

* `/v1/transactions/carts/*`
* `/v1/transactions/checkout/*`
* `/v1/transactions/orders/*`
* `/v1/transactions/payments/*`
* `/v1/transactions/escrow/*`

---

## Architectural Constraints

### Deterministic State Machine

All transaction workflows are modeled as explicit state machines. No implicit transitions. Every state change emits an event and creates an audit record.

### Stripe Integration

Stripe is the canonical payment provider. The Transactions domain owns the Stripe integration but does NOT store raw card data. Only Stripe references (`payment_intent_id`, `charge_id`) are persisted.

### Queue-First Orchestration

All payment webhooks, escrow transitions, and settlement flows execute through queues. Synchronous paths are limited to: cart reads, checkout initiation, and status queries.

### Timeout-Driven

Carts, checkout sessions, and inspection windows have explicit timeouts executed via scheduled queue jobs.

---

## Interaction Model

### Upstream Dependencies

| Dependency | Purpose | Pattern |
|-----------|---------|---------|
| Identity | Buyer/seller eligibility, auth | Event consumption (`user.created`, `seller.activated`) |
| Marketplace | Listing validation, pricing | Sync query for listing state |
| AI Intelligence | Fraud signal enrichment | Async queue (MVP minimal) |

### Downstream Consumers

| Consumer | Events | Purpose |
|----------|--------|---------|
| Vault | `escrow.created`, `escrow.locked` | Custody state management |
| Notifications | All transaction events | Buyer/seller alerts |
| Messaging | `transaction.created` | Transaction-scoped chat |
| Search | `transaction.completed` | Analytics, ranking signals |

---

## State Machine Summary

```
initiated → cart_active → checkout_started → payment_pending → payment_authorized
                                                                              ↓
escrow_locked → seller_confirmed → shipment_pending → shipment_in_transit → delivery_pending
                                                                                        ↓
delivered → inspection_window → settlement_pending → settled → completed
```

Failure states: `payment_failed`, `abandoned`, `cancelled`, `delayed`, `lost`, `disputed`

See `transaction-state-machine.md` for full state definitions.

---

## Queue Topology

| Queue | Purpose | Retry |
|-------|---------|-------|
| `transaction-orchestration` | Checkout, escrow, settlement flows | 3x exponential backoff |
| `payment-webhooks` | Stripe webhook processing | 5x, then DLQ |
| `cart-expiration` | Abandoned cart cleanup | 1x |
| `inspection-timeouts` | Inspection window expiration | 1x |
| `settlement-reconciliation` | End-of-day settlement sync | 3x |

---

## Transaction Semantics

### Local Transactions

Cart/order mutations use Postgres ACID. Cart updates are idempotent by design (full replacement, not delta).

### Distributed Transactions

Payment → escrow → settlement is eventually consistent:

1. Transactions commits local state change
2. Emits authoritative event via outbox
3. Vault/Notifications consume and update local projections
4. Compensation via explicit reversal events (e.g., `transaction.cancelled`)

### Idempotency

Mandatory for: `checkout.started`, `payment.authorization`, `escrow.lock`, `settlement.start`.

---

## Observability Requirements

* Structured logs for every state transition
* Metrics: `transaction_orchestration_latency`, `payment_success_rate`, `escrow_lock_duration`
* Alerts: payment failure rate > 5%, webhook stall > 2 min, settlement lag > 1 hour
* Audit: every financial state change recorded in `transaction_audit_logs`

---

## Security Posture

* No card data stored; only Stripe references
* RLS on `carts` (user-scoped), `orders` (buyer + seller + admin)
* Webhook signature verification mandatory
* Idempotency keys prevent duplicate charges
* Rate limiting on checkout endpoints (10/min per user)

---

## Implementation Sequence

1. State machine model + state transition validation
2. Database schema (carts, orders, transactions, escrow_sessions, payment_intents)
3. Cart management APIs
4. Checkout orchestration + queue workers
5. Stripe webhook handlers + payment lifecycle
6. Escrow coordination (Vault integration)
7. Settlement pipeline
8. Event outbox + downstream emission
9. Timeout workers (cart expiry, inspection window)
10. Observability + audit logging

---

## Final Principle

Transactions are not UI flows. They are authoritative distributed operational state machines. Every transition must be observable, auditable, and recoverable.
