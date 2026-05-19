VINTRACK — MVP Transaction State Machine
Purpose

This document defines the canonical transactional lifecycle for the VINTRACK MVP.

The transaction state machine governs:

checkout orchestration
escrow handling
payment coordination
custody transitions
settlement logic
dispute handling

The transactional state machine is the operational core of the platform.

All transaction workflows must conform to this document.

Transaction Philosophy

Transactions are treated as deterministic operational workflows.

Every transition must be:

explicit
observable
auditable
replayable
recoverable

No implicit transactional mutation is allowed.

All critical transitions must emit domain events.

Canonical Transaction Lifecycle
initiated
→ cart_active
→ checkout_started
→ payment_pending
→ payment_authorized
→ escrow_locked
→ seller_confirmed
→ shipment_pending
→ shipment_in_transit
→ delivery_pending
→ delivered
→ inspection_window
→ settlement_pending
→ settled
→ completed
State Definitions
1. initiated
Meaning

Transaction object created.

Allowed Transitions
cart_active
cancelled
Triggering Events
transaction.created
2. cart_active
Meaning

Items actively held in user cart.

Allowed Transitions
checkout_started
abandoned
cancelled
3. checkout_started
Meaning

Buyer entered transactional checkout flow.

Allowed Transitions
payment_pending
cancelled
4. payment_pending
Meaning

Awaiting Stripe authorization or payment confirmation.

Allowed Transitions
payment_authorized
payment_failed
cancelled
5. payment_authorized
Meaning

Funds authorized successfully.

Allowed Transitions
escrow_locked
payment_failed
6. escrow_locked
Meaning

Funds logically locked into escrow workflow.

Allowed Transitions
seller_confirmed
cancelled
disputed
7. seller_confirmed
Meaning

Seller acknowledged fulfillment obligation.

Allowed Transitions
shipment_pending
cancelled
8. shipment_pending
Meaning

Shipment preparation in progress.

Allowed Transitions
shipment_in_transit
delayed
cancelled
9. shipment_in_transit
Meaning

Item actively moving through logistics flow.

Allowed Transitions
delivery_pending
lost
disputed
10. delivery_pending
Meaning

Carrier indicates pending delivery confirmation.

Allowed Transitions
delivered
disputed
11. delivered
Meaning

Buyer delivery confirmation received.

Allowed Transitions
inspection_window
disputed
12. inspection_window
Meaning

Buyer may inspect and validate item condition.

Allowed Transitions
settlement_pending
disputed
13. settlement_pending
Meaning

Escrow release being finalized.

Allowed Transitions
settled
14. settled
Meaning

Funds released to seller successfully.

Allowed Transitions
completed
15. completed
Meaning

Transaction fully finalized.

Terminal state.

Failure States
payment_failed
Meaning

Payment authorization failed.

abandoned
Meaning

Buyer abandoned checkout process.

cancelled
Meaning

Transaction cancelled before settlement.

delayed
Meaning

Shipment delay detected.

lost
Meaning

Shipment considered lost.

disputed
Meaning

Transaction entered dispute workflow.

Requires manual operational handling.

Operational Requirements

Every state transition must:

emit an event
create audit logs
include timestamps
include actor attribution
support replayability
Timeout Requirements

The system must define timeout handling for:

inactive carts
unpaid checkout sessions
seller inactivity
shipment delays
inspection expiration

Timeouts should execute through queues.

Compensation Requirements

Critical failure states require compensating workflows.

Examples:

payment reversal
escrow release rollback
transaction cancellation
dispute escalation

Compensating actions must remain deterministic.

Observability Requirements

Critical workflows must support:

transaction tracing
event timelines
state replay
queue diagnostics
webhook visibility
Final Principle

Transactions are not UI flows.

Transactions are authoritative distributed operational state machines.

All VINTRACK trust guarantees depend on deterministic transactional orchestration.