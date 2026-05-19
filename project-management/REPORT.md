# VINTRACK — Project Management Report

> Comprehensive synthesis of milestones, tickets, execution order, dependencies, and risks.
> Generated: 2026-05-18

---

## 1. Executive Summary

| Metric | Value |
|--------|-------|
| Milestones | 10 |
| Total Tickets | 53 |
| Estimated Duration | 20 days (AI-accelerated) |
| Critical Path | M1 → M2 → M3 → M6 → M10 |
| Parallelizable Domains | M4+M5, M7+M8+M9 |
| Risks Identified | 15 |
| P1 (Critical) Risks | 4 |

**Foundation Status:** M1 foundational files (package.json, tsconfig, eslint, prettier, docker-compose, app.ts, logger, domain-error) have been generated. The repository is now bootstrapped and ready for agent implementation.

---

## 2. Milestones

| Phase | Milestone | Purpose | Trust Level |
|-------|-----------|---------|-------------|
| 1 | M1 — Runtime Foundations | Runtime layer, shared infra, CI | Foundation |
| 2 | M2 — Identity Domain | Auth, profiles, onboarding | Root of trust |
| 3 | M3 — Marketplace Core | Listings, inventory, catalog | Inventory trust |
| 4 | M4 — AI Intelligence | Image analysis, enrichment | Discovery trust |
| 5 | M5 — Search Infrastructure | Algolia sync, retrieval | Discovery trust |
| 6 | M6 — Transaction Orchestration | Cart, checkout, escrow, settlement | Platform trust |
| 7 | M7 — Messaging | Conversation, realtime | Communication trust |
| 8 | M8 — Vault Infrastructure | Escrow hold, release | Settlement trust |
| 9 | M9 — Notification Infrastructure | Email, alerts | Operational trust |
| 10 | M10 — Platform Hardening | Observability, load testing | Operational resilience |

---

## 3. Tickets per Milestone

| Milestone | Tickets | Est. Effort (agent-days) | Exit Criteria |
|-----------|---------|-------------------------|---------------|
| M1 | 8 | 3 | `npm run test:ci` passes |
| M2 | 8 | 4 | E2E: registration → activation |
| M3 | 6 | 3 | E2E: listing creation → publish |
| M4 | 4 | 2 | AI smoke test passes |
| M5 | 4 | 2 | Search < 100ms |
| M6 | 7 | 6 | E2E: checkout → settlement |
| M7 | 3 | 2 | Realtime messaging works |
| M8 | 4 | 2 | Escrow auto-release works |
| M9 | 4 | 2 | Email sent on settlement |
| M10 | 5 | 2 | 100 concurrent checkouts pass |
| **Total** | **53** | **28** | — |

---

## 4. Ticket Synthesis & Time Estimates

### M1 — Runtime Foundations (3 agent-days)

| Ticket | Description | Est. Hours | Agent |
|--------|-------------|------------|-------|
| T1.1 | Repository init (package.json, tsconfig, tooling) | 2 | Agent 1 |
| T1.2 | Shared event envelope library | 3 | Agent 1 |
| T1.3 | Outbox pattern implementation | 4 | Agent 1 |
| T1.4 | Queue bootstrap (BullMQ + Redis) | 3 | Agent 2 |
| T1.5 | Supabase client & connection pool | 2 | Agent 2 |
| T1.6 | Observability bootstrap (logger, metrics, tracing) | 3 | Agent 2 |
| T1.7 | Error system (DomainError hierarchy) | 2 | Agent 1 |
| T1.8 | CI pipeline setup | 3 | Agent 2 |

**Synthesis:** M1 establishes the runtime contract. Every subsequent ticket depends on these primitives. The event envelope and outbox are particularly critical — they ensure all domain events are durable and traceable.

### M2 — Identity Domain (4 agent-days)

| Ticket | Description | Est. Hours | Agent |
|--------|-------------|------------|-------|
| T2.1 | Identity database schema | 3 | Agent 1 |
| T2.2 | User aggregate & profile lifecycle | 4 | Agent 1 |
| T2.3 | SellerProfile & onboarding state machine | 5 | Agent 1 |
| T2.4 | Identity repositories | 4 | Agent 2 |
| T2.5 | Identity API routes | 4 | Agent 2 |
| T2.6 | Supabase Auth webhook handler | 3 | Agent 2 |
| T2.7 | Identity queue workers | 3 | Agent 2 |
| T2.8 | Identity integration tests | 4 | Both |

**Synthesis:** M2 is the root of trust. The onboarding state machine (T2.3) is the most complex ticket — it enforces guard conditions, emits events, and integrates with Stripe Connect. All downstream domains assume Identity is authoritative.

### M3 — Marketplace Core (3 agent-days)

| Ticket | Description | Est. Hours | Agent |
|--------|-------------|------------|-------|
| T3.1 | Marketplace database schema | 2 | Agent 1 |
| T3.2 | Listing aggregate & state machine | 4 | Agent 1 |
| T3.3 | Media pipeline | 3 | Agent 2 |
| T3.4 | Marketplace repositories & API | 4 | Agent 2 |
| T3.5 | Catalog organization | 2 | Agent 1 |
| T3.6 | Marketplace integration tests | 3 | Both |

**Synthesis:** M3 establishes inventory ownership. The listing state machine ensures only active sellers publish. Media pipeline handles Supabase Storage integration. This domain feeds M6 (Transactions needs listings) and M5 (Search needs indexed listings).

### M4 — AI Intelligence (2 agent-days)

| Ticket | Description | Est. Hours | Agent |
|--------|-------------|------------|-------|
| T4.1 | AI processing queue & job infrastructure | 2 | Agent 1 |
| T4.2 | Image ingestion & identification | 4 | Agent 1 |
| T4.3 | Enrichment workflows | 3 | Agent 1 |
| T4.4 | AI integration tests | 2 | Agent 1 |

**Synthesis:** M4 is assistive only. AI never mutates listings without seller approval. Confidence scoring ensures low-quality enrichments are flagged. This domain enhances M3 but does not block core commerce.

### M5 — Search Infrastructure (2 agent-days)

| Ticket | Description | Est. Hours | Agent |
|--------|-------------|------------|-------|
| T5.1 | Algolia sync pipeline | 3 | Agent 1 |
| T5.2 | Searchable projections | 3 | Agent 1 |
| T5.3 | Search API | 2 | Agent 1 |
| T5.4 | Search integration tests | 2 | Agent 1 |

**Synthesis:** M5 consumes marketplace events and projects searchable documents to Algolia. Event-driven sync ensures the index stays fresh without polling. This domain enhances discovery but does not block transactions.

### M6 — Transaction Orchestration (6 agent-days)

| Ticket | Description | Est. Hours | Agent |
|--------|-------------|------------|-------|
| T6.1 | Transaction database schema | 3 | Agent 1 |
| T6.2 | Cart orchestration | 3 | Agent 1 |
| T6.3 | Checkout state machine | 5 | Agent 1 |
| T6.4 | Escrow lifecycle | 5 | Agent 2 |
| T6.5 | Settlement orchestration | 4 | Agent 2 |
| T6.6 | Compensation & cancellation flows | 4 | Agent 2 |
| T6.7 | Transaction API & E2E tests | 5 | Both |

**Synthesis:** M6 is the operational core. The checkout → escrow → settlement chain is the platform's trust guarantee. T6.3 and T6.4 are the highest-risk tickets — payment authorization and escrow locking must be deterministic and idempotent. M6 blocks on M2 (buyer/seller identity) and M3 (listings to purchase).

### M7 — Messaging (2 agent-days)

| Ticket | Description | Est. Hours | Agent |
|--------|-------------|------------|-------|
| T7.1 | Conversation aggregate | 3 | Agent 1 |
| T7.2 | Realtime delivery | 3 | Agent 1 |
| T7.3 | Messaging API | 2 | Agent 1 |

**Synthesis:** M7 enables transaction-scoped communication. Supabase Realtime provides low-latency delivery. This domain enhances M6 but does not block core commerce.

### M8 — Vault Infrastructure (2 agent-days)

| Ticket | Description | Est. Hours | Agent |
|--------|-------------|------------|-------|
| T8.1 | Vault database schema | 2 | Agent 1 |
| T8.2 | Escrow hold workflows | 3 | Agent 1 |
| T8.3 | Inspection period & release | 3 | Agent 1 |
| T8.4 | Vault API | 2 | Agent 1 |

**Synthesis:** M8 manages fund custody. The 72-hour inspection window with auto-release is the buyer protection mechanism. Dispute initiation freezes settlement. This domain completes the trust loop with M6.

### M9 — Notification Infrastructure (2 agent-days)

| Ticket | Description | Est. Hours | Agent |
|--------|-------------|------------|-------|
| T9.1 | Notification database schema | 1 | Agent 1 |
| T9.2 | Notification event consumers | 3 | Agent 1 |
| T9.3 | Email delivery | 3 | Agent 1 |
| T9.4 | Notification API | 2 | Agent 1 |

**Synthesis:** M9 is event-driven. It consumes domain events from all contexts and delivers transactional emails. User preferences filter channels. This domain is operational — it enhances UX but does not block commerce.

### M10 — Platform Hardening (2 agent-days)

| Ticket | Description | Est. Hours | Agent |
|--------|-------------|------------|-------|
| T10.1 | Observability completion | 4 | Agent 1 |
| T10.2 | DLQ tooling & replay | 3 | Agent 1 |
| T10.3 | Rate limiting & abuse prevention | 3 | Agent 1 |
| T10.4 | Reconciliation validation | 3 | Agent 1 |
| T10.5 | Load testing | 3 | Agent 1 |

**Synthesis:** M10 validates operational readiness. Reconciliation ensures financial consistency across Stripe, Postgres, and Vault. Load testing proves the platform handles expected MVP volume.

---

## 5. Execution Order (AI-Assisted)

### Sprint 1: Foundations + Identity Core (Days 1–3)

**Batch A — Parallel Agents:**
- Agent 1: M1 foundations (T1.1, T1.2, T1.5, T1.7)
- Agent 2: M2 schema + entities (T2.1, T2.2, T2.3)

**Checkpoint (Day 3):**
- `npm run test:ci` passes
- Schema migration runs clean
- Architecture Gate review

### Sprint 2: Identity Complete + Marketplace Core (Days 4–6)

**Batch B — Parallel Agents:**
- Agent 1: M2 repositories + API + webhooks (T2.4, T2.5, T2.6, T2.7)
- Agent 2: M3 schema + entities (T3.1, T3.2, T3.5)

**Checkpoint (Day 6):**
- Identity E2E: registration → onboarding → activation
- Marketplace schema validated
- Schema Gate + API Gate review

### Sprint 3: Marketplace Complete + Discovery (Days 7–9)

**Batch C — Parallel Agents:**
- Agent 1: M3 media + API + tests (T3.3, T3.4, T3.6)
- Agent 2: M4 AI Intelligence (T4.1–T4.4)
- Agent 3: M5 Search (T5.1–T5.4)

**Checkpoint (Day 9):**
- Marketplace E2E: create listing → publish
- AI smoke test passes
- Search smoke test passes

### Sprint 4: Transaction Core (Days 10–14)

**Batch D — Sequential (Trust-Critical):**
- Agent 1: M6 schema + cart + checkout (T6.1, T6.2, T6.3)
- Agent 2: M6 escrow + settlement (T6.4, T6.5, T6.6)

**Why sequential:** Payment flow correctness is non-negotiable. Second agent reviews first agent's work.

**Checkpoint (Day 14):**
- Checkout creates Stripe PaymentIntent
- Escrow locks on authorization
- Settlement completes end-to-end
- **Trust Gate review (mandatory)**

### Sprint 5: Supporting Domains + Transaction API (Days 15–17)

**Batch E — Parallel Agents:**
- Agent 1: M6 API + E2E (T6.7)
- Agent 2: M7 Messaging + M8 Vault (T7.1–T7.3, T8.1–T8.4)
- Agent 3: M9 Notifications (T9.1–T9.4)

**Checkpoint (Day 17):**
- Full E2E: checkout → delivery → settlement
- Vault releases after inspection timeout
- Notification email sent on settlement

### Sprint 6: Hardening (Days 18–20)

**Batch F — Single Agent:**
- Agent 1: M10 (T10.1–T10.5)

**Checkpoint (Day 20):**
- 100 concurrent checkouts pass
- P1 alerts functional
- Reconciliation zero discrepancies

---

## 6. Dependency Graph

### Milestone Dependencies

```
M1 ──► M2 ──► M3 ──► M6 ──► M10
       │       │       ▲
       │       └──► M4, M5
       │               (enhance M3)
       └──► M7, M8, M9 (enhance M6)
```

### Hard Dependencies

| Domain | Requires | Because |
|--------|----------|---------|
| M2 (Identity) | M1 (Foundations) | Needs DB, queue, event envelope |
| M3 (Marketplace) | M2 (Identity) | Needs active sellers |
| M6 (Transactions) | M2 + M3 | Needs buyers, sellers, listings |
| M7 (Messaging) | M6 | Needs transaction context |
| M8 (Vault) | M6 | Needs escrow events |
| M9 (Notifications) | M6 | Needs transaction events |
| M10 (Hardening) | All | Needs complete system |

### Event Flow Dependencies

```
Identity ──► Marketplace ──► Transactions ──► Vault
   │              │              │              │
   │              ▼              ▼              ▼
   │           Search        Messaging    Notifications
   │              ▲              ▲              ▲
   └──────────────┴──────────────┴──────────────┘
```

### Database Dependencies

| Table | Owned By | Referenced By |
|-------|----------|---------------|
| `users` | Identity | All domains (FK) |
| `seller_profiles` | Identity | Marketplace (listing eligibility) |
| `listings` | Marketplace | Transactions |
| `transactions` | Transactions | Vault, Messaging |

---

## 7. Risk Register

### P1 — Critical Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R1 | Cross-domain coupling | High | Critical | ESLint rules, code review checklist |
| R3 | RLS policy gaps | Medium | Critical | Integration tests, security audit |
| R4 | Duplicate payments | Medium | Critical | Idempotency keys, webhook dedup |
| R12 | Secrets in repo | Medium | Critical | Pre-commit hooks, secret scanning |

### P2 — High Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R5 | Worker crash loop | Medium | High | DLQ, alerting, auto-restart |
| R7 | DB pool exhaustion | Medium | High | Query timeout, monitoring |
| R13 | TDD erosion | High | High | CI gates, coverage thresholds |
| R14 | Invalid state transitions | Low | Critical | Unit tests 95%+, DB constraints |

### P3 — Medium Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R8 | Search index lag | Medium | Medium | Backlog monitoring |
| R10 | Gemini API quota | High | Low | Skip enrichment, backoff |
| R15 | M6 underestimation | High | High | 2-week buffer, descope plan |

---

## 8. Foundation Gap — Closed

**Observation:** M1 originally planned tickets without generating the actual foundational files.

**Resolution:** The following files have been generated and are now in the repository:

| File | Purpose |
|------|---------|
| `package.json` | Dependencies, scripts, engine requirements |
| `tsconfig.json` | TypeScript 5.x strict mode, ESM |
| `eslint.config.js` | Lint rules, no-explicit-any, no-floating-promises |
| `.prettierrc` | Formatting rules |
| `.gitignore` | Ignore patterns |
| `.env.example` | Environment variable template |
| `docker-compose.dev.yml` | Postgres + Redis for local dev |
| `vitest.config.ts` | Test configuration |
| `vitest.unit.config.ts` | Unit test config |
| `vitest.integration.config.ts` | Integration test config |
| `src/app.ts` | Express app bootstrap |
| `src/shared/observability/logger.ts` | Structured JSON logger |
| `src/shared/errors/domain-error.ts` | Base domain error class |
| `src/*/...` | Full directory scaffold per `module-template.md` |

**M1 is now actionable.** Agents can clone, install, and begin implementation immediately.

---

## 9. Next Actions

1. **Install dependencies:** `npm install`
2. **Start infrastructure:** `npm run infra:up`
3. **Verify:** `npm run typecheck` should pass
4. **Begin Batch A:** Agent 1 on T1.3 (outbox), Agent 2 on T2.1 (identity schema)

---

*Report generated from canonical architecture documents. All metrics derived mechanically from blueprints, governance docs, and ticket specifications.*
