# VINTRACK — Execution Sequence

> Deterministic implementation order adjusted for AI-assisted development and automated workflow.

---

## AI-Assisted Development Protocol

### Agent Autonomy Boundaries

AI agents may autonomously implement:
- Domain entity logic (state machines, invariants)
- Repository implementations (following template)
- API route scaffolding
- Unit tests (following test strategy)
- Database migrations (following schema conventions)

AI agents must NOT autonomously:
- Change event contracts
- Modify state machine transitions
- Add new dependencies
- Skip acceptance criteria
- Merge to `main`

### Human Review Gates

| Gate | Trigger | Reviewer |
|------|---------|----------|
| **Architecture Gate** | Event contract change | Architect |
| **Schema Gate** | New table or column | DBA / Architect |
| **API Gate** | New endpoint or DTO change | Tech Lead |
| **Trust Gate** | Payment/escrow code | Senior Engineer |
| **Merge Gate** | PR ready | CI + Human |

### Batch Processing

AI agents work in **batches**, not tickets:

| Batch | Scope | Agent Count | Review Gate |
|-------|-------|-------------|-------------|
| Batch A | M1 + M2 schema + entities | 2 agents parallel | Architecture Gate |
| Batch B | M2 repositories + API + M3 schema | 2 agents parallel | Schema Gate + API Gate |
| Batch C | M3 implementation + M4/M5 parallel | 3 agents parallel | API Gate |
| Batch D | M6 core (cart → checkout → escrow) | 2 agents sequential | Trust Gate |
| Batch E | M6 settlement + M7/M8/M9 parallel | 3 agents parallel | Trust Gate |
| Batch F | M10 + integration hardening | 1 agent | Architecture Gate |

**Rule:** Agents within a batch work on independent files. Merge conflicts resolved at batch end.

---

## Automated Workflow Integration

### Continuous Validation Loop

```
Agent writes code → Auto-lint → Auto-test → Auto-typecheck → PR draft → Human review → Merge
```

Every agent session:
1. Writes code in feature branch
2. Runs `npm run lint:fix` automatically
3. Runs `npm run test:unit -- <domain>`
4. Runs `npx tsc --noEmit`
5. Opens PR with auto-generated description from ticket
6. CI runs full suite
7. Human reviews architectural adherence
8. Squash-merge on approval

### Automated PR Descriptions

PRs auto-populate from ticket metadata:

```markdown
## Ticket
T2.3 — Implement Seller Activation State Machine

## Domain
Identity

## Changes
- `src/identity/domain/entities/seller-profile.ts`
- `src/identity/domain/entities/onboarding-state.ts`
- `src/identity/domain/events/seller-events.ts`

## Acceptance Criteria
- [x] Invalid transitions rejected
- [x] Activation blocked without Stripe account
- [x] `activated_at` immutable

## Tests
- Unit: `seller-profile.test.ts` (12 cases)
- Integration: `onboarding-trigger.test.ts` (4 cases)

## Architecture Review
No event contracts modified. No new dependencies.
```

### CI Automation

| Stage | Trigger | Auto-fix | Block Merge |
|-------|---------|----------|-------------|
| Lint + Format | Every commit | Yes (Prettier) | Yes |
| Type Check | Every commit | No | Yes |
| Unit Tests | Every commit | No | Yes |
| Integration Tests | PR open | No | Yes |
| Schema Diff | Migration file changed | No | Yes (Schema Gate) |

---

## Accelerated Sequence

### Sprint 1: Foundations + Identity Core (Days 1–3)

**Batch A — Parallel Agents:**

Agent 1: M1 Foundations
- T1.1 Repository init
- T1.2 Event envelope
- T1.5 Supabase client
- T1.7 Error system

Agent 2: M2 Identity Schema + Entities
- T2.1 Database schema
- T2.2 User aggregate
- T2.3 SellerProfile + onboarding

**Checkpoint (Day 3):**
- [ ] `npm run test:ci` passes
- [ ] Schema migration runs clean
- [ ] Architecture Gate review

---

### Sprint 2: Identity Complete + Marketplace Core (Days 4–6)

**Batch B — Parallel Agents:**

Agent 1: M2 Repositories + API + Webhooks
- T2.4 Repositories
- T2.5 API routes
- T2.6 Supabase webhook handler

Agent 2: M3 Marketplace Schema + Entities
- T3.1 Database schema
- T3.2 Listing aggregate
- T3.5 Catalog organization

**Checkpoint (Day 6):**
- [ ] Identity E2E: registration → onboarding → activation
- [ ] Marketplace schema validated
- [ ] Schema Gate + API Gate review

---

### Sprint 3: Marketplace Complete + Discovery (Days 7–9)

**Batch C — Parallel Agents:**

Agent 1: M3 Media + API + Tests
- T3.3 Media pipeline
- T3.4 Repositories + API
- T3.6 Integration tests

Agent 2: M4 AI Intelligence
- T4.1 AI processing queue
- T4.2 Image identification
- T4.3 Enrichment workflows

Agent 3: M5 Search Infrastructure
- T5.1 Algolia sync
- T5.2 Searchable projections
- T5.3 Search API

**Checkpoint (Day 9):**
- [ ] Marketplace E2E: create listing → publish
- [ ] AI smoke test: image → identification
- [ ] Search smoke test: published listing discoverable
- [ ] API Gate review

---

### Sprint 4: Transaction Core (Days 10–14)

**Batch D — Sequential Agents (Trust-Critical):**

Agent 1: M6 Schema + Cart + Checkout
- T6.1 Database schema
- T6.2 Cart orchestration
- T6.3 Checkout state machine

Agent 2: M6 Escrow + Settlement
- T6.4 Escrow lifecycle
- T6.5 Settlement orchestration
- T6.6 Compensation flows

**Why sequential:** Payment flow correctness is non-negotiable. Second agent reviews first agent's work before proceeding.

**Checkpoint (Day 14):**
- [ ] Checkout creates Stripe PaymentIntent
- [ ] Escrow locks on authorization
- [ ] Settlement completes end-to-end
- [ ] Trust Gate review (mandatory)

---

### Sprint 5: Supporting Domains + Transaction API (Days 15–17)

**Batch E — Parallel Agents:**

Agent 1: M6 Transaction API + E2E
- T6.7 API routes + E2E tests

Agent 2: M7 Messaging + M8 Vault
- T7.1–T7.3 Conversation + realtime + API
- T8.1–T8.4 Vault schema + hold + release + API

Agent 3: M9 Notifications
- T9.1–T9.4 Schema + consumers + email + API

**Checkpoint (Day 17):**
- [ ] Full E2E: buyer checkout → delivery → settlement
- [ ] Vault releases after inspection timeout
- [ ] Notification email sent on settlement
- [ ] Trust Gate review

---

### Sprint 6: Hardening (Days 18–20)

**Batch F — Single Agent:**

Agent 1: M10 Platform Hardening
- T10.1 Observability dashboards
- T10.2 DLQ tooling
- T10.3 Rate limiting
- T10.4 Reconciliation
- T10.5 Load testing

**Checkpoint (Day 20):**
- [ ] 100 concurrent checkouts pass
- [ ] P1 alerts functional
- [ ] Reconciliation zero discrepancies
- [ ] Architecture Gate review

---

## Automated Checkpoint Format

Every checkpoint runs automatically:

```bash
npm run test:ci
npm run test:e2e
npm run lint
npm run db:validate
npm run security:scan
```

**Auto-generated checkpoint report:**

```markdown
## Checkpoint: Day 6

### Batch B Completion
- Agent 1: 3 tickets, 12 files, 847 lines
- Agent 2: 3 tickets, 8 files, 623 lines

### Test Results
- Unit: 142 passed, 0 failed
- Integration: 38 passed, 0 failed
- Coverage: 87% lines, 82% branch

### Schema Changes
- 6 tables created
- 4 indexes added
- 0 RLS gaps detected

### Architectural Drift Check
- 0 cross-domain imports detected
- 0 event contract violations
- 1 warning: `marketplace/api/controller.ts` line 45 uses `any` (fixed)

### Gate Status
- [x] Schema Gate: PASS
- [x] API Gate: PASS
- [ ] Trust Gate: N/A (M6 not started)
```

---

## Parallelization Rules (AI-Optimized)

| Parallel | Sequential | Reason |
|----------|------------|--------|
| M1 + M2 schema | M2 API after M2 entities | Schema can be drafted while entities refined |
| M3 + M4 + M5 | M6 after M3 complete | Discovery domains independent |
| M7 + M8 + M9 | M6 escrow before M8 vault | Vault consumes escrow events |
| T6.2 + T6.3 | T6.4 after T6.3 | Escrow requires payment auth |
| Multiple agents per batch | Agents on same file | File-level merge conflicts |

---

## Agent Handoff Protocol

When one agent completes a batch:

1. **Auto-generate handoff doc:**
   - Files modified
   - Tests added
   - Known issues
   - Next batch dependencies

2. **Tag next agent:**
   - `@agent-2: Batch B ready. Review `src/identity/domain/` before starting repositories.`

3. **Verify state:**
   - `git diff --stat` matches handoff doc
   - Tests pass on branch
   - No uncommitted changes

---

## Velocity Metrics

Track per sprint:

| Metric | Target |
|--------|--------|
| Tickets completed / agent / day | 2–3 |
| Lines of code / agent / day | 300–500 |
| Test cases added / ticket | 4–6 |
| Review rounds / PR | < 2 |
| Merge time from PR open | < 4 hours |
| Checkpoint failure rate | < 10% |

---

## Descope Triggers

If checkpoint fails 2+ times:

| Failure | Action |
|---------|--------|
| M4 AI failing | Skip enrichment, manual tagging |
| M5 Search lagging | Basic Algolia sync only, no ranking |
| M7 Messaging broken | Disable realtime, use polling |
| M9 Notifications failing | Basic email only, no preferences |
| M10 load test failing | Reduce target to 50 concurrent |

**Critical path never descoped:** M1, M2, M3, M6.

---

## Final Principle

AI acceleration without governance is not velocity. It is entropy. The automated workflow exists to amplify deterministic architecture, not replace it.
