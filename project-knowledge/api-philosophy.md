VINTRACK — API Philosophy
Purpose

Defines the canonical API design philosophy for the VINTRACK MVP.

This document governs:

API structure
endpoint semantics
validation behavior
error handling
idempotency
auth propagation
orchestration boundaries

The API layer exists to expose deterministic operational workflows.

It must NOT become:

business logic storage
orchestration infrastructure
transactional authority
workflow mutation chaos
Core Philosophy

VINTRACK APIs are:

thin
deterministic
validation-oriented
orchestration-safe
domain-aligned

Business workflows belong in:

services
queues
state machines

NOT controllers.

API Style

Primary API style:

REST
JSON
resource-oriented
explicit workflow actions

GraphQL is intentionally excluded from MVP scope.

API Layer Responsibilities

The API layer may:

validate requests
authorize access
initiate workflows
query domain state
return projections
propagate correlation IDs

The API layer may NOT:

contain business orchestration
perform long-running workflows
bypass queues
mutate cross-domain state
Endpoint Philosophy

Endpoints should represent:

domain intent
workflow actions
bounded context ownership

Avoid generic CRUD semantics where workflow semantics matter.

Prefer:

POST /transactions/:id/checkout
POST /vault/:id/release
POST /listings/:id/publish

instead of:

POST /updateTransaction
POST /modifyVault
POST /editListing
Validation Philosophy

Validation occurs at:

API boundaries
domain boundaries
state transitions

Validation must be:

explicit
typed
deterministic

TypeScript strict mode is mandatory.

Error Philosophy

Errors must be:

structured
observable
domain-aware
traceable

Canonical error structure:

{
  "error": {
    "code": "PAYMENT_AUTH_FAILED",
    "message": "Payment authorization failed.",
    "correlationId": "uuid",
    "details": {}
  }
}
Idempotency Philosophy

Critical operations must support idempotency.

Mandatory for:

payments
checkout
escrow transitions
settlement
webhook handling

Idempotency keys must propagate across:

queues
APIs
webhooks
Correlation Propagation

All requests must propagate:

correlation IDs
transaction IDs
actor context

across:

services
queues
events
webhooks

Distributed tracing is mandatory.

Authentication Philosophy

Authentication handled through:

Supabase Auth
JWT validation
role-aware authorization

Authorization must remain:

domain-aware
explicit
policy-driven
API Versioning

Versioning strategy:

 /v1/

Breaking changes require:

version review
migration strategy
compatibility planning
Pagination Philosophy

Large collections must support:

cursor pagination
deterministic ordering
bounded payloads

Offset pagination should be minimized for scalability-sensitive queries.

Async Workflow Handling

Long-running workflows must return:

accepted states
workflow references
correlation IDs

NOT blocking synchronous execution.

Example:

{
  "status": "accepted",
  "correlationId": "uuid",
  "workflowId": "uuid"
}
Webhook Philosophy

Webhook handlers must remain:

thin
verifiable
idempotent
queue-oriented

Heavy logic belongs in orchestration workers.

API Ownership Rules

Each domain owns:

its routes
its validation
its DTOs
its contracts

Cross-domain API mutation is prohibited.

Final Principle

VINTRACK APIs are controlled operational interfaces for distributed transactional workflows.

They exist to:

expose domain intent
initiate orchestration
enforce validation
preserve deterministic behavior

—not to contain uncontrolled business logic