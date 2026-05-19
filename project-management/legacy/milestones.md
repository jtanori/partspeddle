# VINTRACK — Milestones

> Derived from architecture documents. Each milestone represents a deterministic phase of implementation.
> No UI features. No agile theater. Architectural work units only.

---

## Overview

| Phase | Milestone | Domain | Trust Level |
|-------|-----------|--------|-------------|
| 1 | M1 — Runtime Foundations | Shared | Foundation |
| 2 | M2 — Identity Domain | Identity | Root of trust |
| 3 | M3 — Marketplace Core | Marketplace | Inventory trust |
| 4 | M4 — AI Intelligence | AI Intelligence | Discovery trust |
| 5 | M5 — Search Infrastructure | Search | Discovery trust |
| 6 | M6 — Transaction Orchestration | Transactions | Platform trust |
| 7 | M7 — Messaging | Messaging | Communication trust |
| 8 | M8 — Vault Infrastructure | Vault | Settlement trust |
| 9 | M9 — Notification Infrastructure | Notifications | Operational trust |
| 10 | M10 — Platform Hardening | Shared | Operational resilience |

**Golden Rule:** M6 (Transactions) may not begin until M2 (Identity) and M3 (Marketplace) are complete. No exceptions.

---

## M1 — Runtime Foundations

**Purpose:** Establish the runtime layer upon which all domains depend.

**Trust Principle:** If the foundation is wrong, every domain built on it is wrong.

**Includes:**
- Repository initialization (Node.js, TypeScript, tooling)
- Shared infrastructure (event bus, outbox, queue, observability)
- Database governance (migrations, RLS patterns, connection pooling)
- CI pipeline (lint, test, build)
- Local development environment

**Completion Criteria:**
- [ ] `npm run dev` starts API server
- [ ] `npm run test:ci` passes with empty test suite
- [ ] `npm run infra:up` starts Postgres + Redis
- [ ] `supabase db reset` applies migrations cleanly
- [ ] Shared event envelope library compiles
- [ ] Queue bootstrap connects to Redis

**Downstream Impact:** Blocks ALL subsequent milestones.

---

## M2 — Identity Domain

**Purpose:** Establish the root of trust for all platform actors.

**Trust Principle:** No transactional, marketplace, or messaging operation can occur without an established identity principal.

**Includes:**
- Auth synchronization (Supabase Auth → Identity domain)
- Profile lifecycle (User, Profile, BuyerProfile, SellerProfile)
- Seller onboarding state machine
- Stripe Connect integration
- Identity events (user.created, seller.activated, etc.)
- Onboarding queues

**Completion Criteria:**
- [ ] User registration creates identity record + profile atomically
- [ ] Seller onboarding transitions: pending → onboarding → review → active
- [ ] Events emitted on all state transitions
- [ ] RLS policies enforce data isolation
- [ ] Integration tests verify trigger behavior

**Downstream Impact:** Blocks M3 (Marketplace needs sellers), M6 (Transactions needs buyers/sellers), M7 (Messaging needs participants).

---

## M3 — Marketplace Core

**Purpose:** Establish inventory ownership and listing lifecycle.

**Trust Principle:** Buyers must trust that listings represent real, owned inventory.

**Includes:**
- Listing aggregates (Listing, InventoryItem)
- Catalog organization (Collection, Garage, Yard)
- Media pipelines (Supabase Storage integration)
- Publishing workflows (draft → published → archived)
- Listing state machine
- Search indexing events

**Completion Criteria:**
- [ ] Seller can create listing
- [ ] Listing transitions through valid states
- [ ] Media upload links to listing
- [ ] Events emitted on publish/unpublish
- [ ] RLS prevents cross-seller inventory access

**Downstream Impact:** Blocks M4 (AI needs listings to enrich), M5 (Search needs listings to index), M6 (Transactions needs listings to purchase).

---

## M4 — AI Intelligence

**Purpose:** Augment inventory discovery and listing quality.

**Trust Principle:** AI assists operational intelligence but never overrides transactional truth.

**Includes:**
- Image ingestion pipeline
- Part/VIN identification (Gemini API)
- Enrichment workflows (metadata extraction)
- AI confidence scoring
- Listing enrichment events

**Completion Criteria:**
- [ ] Image upload triggers AI analysis queue job
- [ ] Identification results include confidence score
- [ ] Enrichment events emitted for marketplace consumption
- [ ] Failed analysis retried with exponential backoff
- [ ] AI output is advisory, never authoritative

**Downstream Impact:** Enhances M3 (listings) and M5 (search). Does not block M6.

---

## M5 — Search Infrastructure

**Purpose:** Enable inventory discovery.

**Trust Principle:** Buyers must find relevant inventory quickly and accurately.

**Includes:**
- Algolia sync pipeline
- Indexing queues (async, failure-tolerant)
- Searchable projections (from marketplace events)
- Ranking strategy (MVP: simple recency + relevance)
- Autocomplete preparation

**Completion Criteria:**
- [ ] Listing publish triggers Algolia index update
- [ ] Search returns results < 100ms
- [ ] Indexing failures retry and alert
- [ ] Events consumed from marketplace domain only

**Downstream Impact:** Enhances M3 and M6. Does not block core transactions.

---

## M6 — Transaction Orchestration

**Purpose:** Enable trusted commerce.

**Trust Principle:** This is the operational core. All trust guarantees depend on deterministic transactional orchestration.

**Includes:**
- Cart orchestration (staging, expiration)
- Checkout state machine
- Payment coordination (Stripe)
- Escrow lifecycle
- Settlement orchestration
- Compensation flows
- Reconciliation jobs
- Idempotency enforcement

**Completion Criteria:**
- [ ] Cart creates, updates, expires correctly
- [ ] Checkout initiates payment intent
- [ ] Payment authorization triggers escrow lock
- [ ] Escrow release only after inspection/dispute resolution
- [ ] Idempotency prevents duplicate charges
- [ ] Compensation events reverse failed transactions
- [ ] End-to-end test: buyer checkout → seller settlement

**Downstream Impact:** Blocks M7 (Messaging needs transaction context), M8 (Vault needs escrow state), M9 (Notifications need transaction events).

---

## M7 — Messaging

**Purpose:** Enable transaction-aware communication.

**Trust Principle:** Communication must remain durable, observable, and scoped to transactions.

**Includes:**
- Conversation aggregates
- Realtime delivery (Supabase Realtime)
- Notification triggers
- Moderation hooks (MVP minimal)

**Completion Criteria:**
- [ ] Buyer and seller can create conversation
- [ ] Messages deliver in real time
- [ ] Conversation scoped to transaction context
- [ ] RLS prevents unauthorized access

**Downstream Impact:** Enhances M6. Does not block M8 or M9.

---

## M8 — Vault Infrastructure

**Purpose:** Manage escrow hold and release workflows.

**Trust Principle:** Funds must only move through explicit, auditable, deterministic workflows.

**Includes:**
- Escrow hold workflows
- Inspection period management
- Release orchestration
- Dispute initiation
- Transaction freeze logic

**Completion Criteria:**
- [ ] Escrow lock created on payment authorization
- [ ] Inspection window enforces timeout
- [ ] Release only after buyer confirmation or timeout expiry
- [ ] Dispute freezes settlement
- [ ] Compensation events handle reversal

**Downstream Impact:** Completes the trust loop with M6. Enables M9 notification events.

---

## M9 — Notification Infrastructure

**Purpose:** Deliver operational alerts to users.

**Trust Principle:** Users must be informed of critical state changes without being overwhelmed.

**Includes:**
- Email delivery (transactional)
- Push notification preparation (MVP: email only)
- Transactional templates
- Retry orchestration

**Completion Criteria:**
- [ ] Event consumption triggers notification queue
- [ ] Email sent on seller activation, payment receipt, escrow release
- [ ] Failed deliveries retry with backoff
- [ ] Notification preferences respected

**Downstream Impact:** Enhances all domains. Does not block any core functionality.

---

## M10 — Platform Hardening

**Purpose:** Prepare platform for production load and operational scrutiny.

**Trust Principle:** Infrastructure quality directly impacts user trust.

**Includes:**
- Observability completion (dashboards, alerting)
- Metrics aggregation
- DLQ tooling and replay
- Rate limiting enforcement
- Abuse prevention (basic)
- Reconciliation validation
- Load testing (smoke tests)

**Completion Criteria:**
- [ ] Grafana dashboards operational
- [ ] P1 alerts page within 2 minutes
- [ ] DLQ replay procedure documented and tested
- [ ] Rate limits enforced at API Gateway
- [ ] Load test: 100 concurrent checkouts pass

**Downstream Impact:** No functional blockers. Operational readiness gate.
