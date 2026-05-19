# VINTRACK — Identity Domain Blueprint

## Purpose

The Identity bounded context is the authoritative source for all user identity, authentication, authorization, and trust-metadata concerns within the VINTRACK MVP.

Identity is the foundational domain upon which all other bounded contexts depend. No transactional, marketplace, or messaging operation can occur without an established identity principal.

---

## Scope

### In Scope (MVP)

* User registration and lifecycle
* Authentication via Supabase Auth
* Buyer and Seller role management
* Profile management (personal, buyer, seller)
* Seller onboarding and activation workflow
* Account status enforcement (active, suspended, deactivated)
* Session lifecycle tracking
* Permission and capability metadata
* Trust signals (verification status, onboarding completion)

### Out of Scope (MVP)

* Advanced reputation scoring
* Multi-factor authentication orchestration beyond Supabase defaults
* Social login provider management (handled by Supabase Auth)
* Institutional identity verification (KYC/KYB)
* Role-based access control (RBAC) beyond buyer/seller/admin
* OAuth application management

---

## Domain Ownership

### Data Ownership

The Identity domain exclusively owns:

* `users` — core identity records (synced from Supabase Auth)
* `profiles` — extended user metadata
* `buyer_profiles` — buyer-specific attributes and preferences
* `seller_profiles` — seller-specific attributes, onboarding state, activation status
* `user_sessions` — operational session tracking
* `onboarding_states` — seller onboarding progression

### Event Ownership

The Identity domain is the sole authoritative producer of:

| Event | Description |
|-------|-------------|
| `user.created` | New user registered |
| `user.updated` | User metadata changed |
| `user.suspended` | User account suspended |
| `seller.activated` | Seller profile activated for publishing |
| `seller.deactivated` | Seller profile deactivated |
| `profile.updated` | Profile metadata updated |
| `session.created` | Operational session established |
| `session.revoked` | Operational session terminated |

### API Ownership

The Identity domain owns:

* `/v1/identity/users/*`
* `/v1/identity/profiles/*`
* `/v1/identity/sellers/*`
* `/v1/identity/sessions/*`

---

## Architectural Constraints

### Trust-First

Identity operations are on the critical path for all trust guarantees. Every identity mutation must be observable, auditable, and recoverable.

### Supabase Auth Integration

Supabase Auth is the canonical identity provider. The Identity domain does NOT implement custom credential storage, password hashing, or authentication protocol handling. It augments Supabase Auth with domain-specific metadata and operational workflows.

Synchronization from Supabase Auth (`auth.users`) into the Identity domain (`users` table) is unidirectional and event-driven.

### Stateless Execution

Identity services remain stateless. Session state belongs to:

* Supabase Auth (JWT/session tokens)
* Postgres (profile and onboarding state)
* Redis (transient session metadata only)

### Queue-First for Onboarding

Seller onboarding is a multi-step, failure-prone workflow. It MUST execute through the `identity-onboarding` queue rather than synchronous request chains.

---

## Interaction Model

### Upstream Dependencies

The Identity domain depends on:

| Dependency | Purpose | Integration Pattern |
|-----------|---------|---------------------|
| Supabase Auth | Canonical identity provider | Webhook + DB trigger |
| Notifications | User alerts for onboarding, status changes | Event emission |

### Downstream Consumers

Domains that consume Identity events:

| Consumer | Events Consumed | Purpose |
|----------|-----------------|---------|
| Marketplace | `user.created`, `seller.activated` | Inventory ownership, listing eligibility |
| Transactions | `user.created`, `user.suspended` | Transaction eligibility, fraud signals |
| Messaging | `user.created` | Conversation participant resolution |
| Notifications | `user.created`, `seller.activated`, `profile.updated` | Welcome emails, onboarding prompts |
| Search | `seller.activated` | Seller visibility in discovery |

### Communication Patterns

| Pattern | Use Case | Mechanism |
|---------|----------|-----------|
| Sync | Auth validation, profile retrieval | Direct API / DB read |
| Async | Seller onboarding, status propagation | BullMQ queue + domain events |
| Webhook | Supabase Auth lifecycle sync | Supabase webhook → queue |

---

## Queue Topology

| Queue | Purpose | Owned By |
|-------|---------|----------|
| `identity-onboarding` | Seller onboarding step orchestration | Identity |
| `identity-webhooks` | Supabase Auth webhook processing | Identity |
| `identity-notifications` | Async notification triggers for identity events | Identity |

---

## Event Contract Summary

All Identity events conform to the canonical event structure:

```json
{
  "eventId": "uuid",
  "eventType": "user.created",
  "eventVersion": 1,
  "occurredAt": "2026-01-01T00:00:00.000Z",
  "correlationId": "uuid",
  "causationId": "uuid",
  "actorId": "system",
  "domain": "identity",
  "aggregateId": "user-uuid",
  "payload": {},
  "metadata": {}
}
```

Events are immutable, idempotent, and durably persisted before downstream emission.

---

## Transaction Semantics

### Local Transactions

Identity mutations that affect only owned tables use standard Postgres transactions with ACID guarantees.

### Distributed Transactions

Cross-domain identity state changes (e.g., seller activation affecting marketplace eligibility) are eventually consistent:

1. Identity commits local state change within a transaction
2. Identity emits authoritative domain event
3. Downstream domains consume event and update local projections
4. No two-phase commit. Compensation via explicit reversal events.

### Compensation

| Action | Compensation Event |
|--------|-------------------|
| `seller.activated` | `seller.deactivated` |
| `user.created` | `user.suspended` (soft-delete pattern) |

---

## Observability Requirements

Identity operations require:

* Structured logging for every auth lifecycle event
* Distributed tracing across Supabase Auth → Identity → downstream domains
* Metrics for onboarding funnel conversion
* Alerting on webhook processing failures
* Session anomaly detection

---

## Security Posture

* Row-Level Security (RLS) on all identity tables
* JWT validation at API gateway; no token inspection in business logic
* Profile reads scoped to authenticated principal or admin capability
* Seller activation requires explicit operational verification
* No credential material logged or stored outside Supabase Auth

---

## Implementation Sequence

1. Database schema and RLS policies
2. Supabase Auth webhook handlers
3. User sync trigger/function
4. Profile management APIs
5. Seller onboarding state machine
6. Event emission infrastructure
7. Queue workers
8. Observability instrumentation

---

## Final Principle

Identity is the root of trust. Every implementation decision must reinforce observability, auditability, and deterministic lifecycle management over implementation convenience.
