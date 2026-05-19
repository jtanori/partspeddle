# M8 — Vault Infrastructure Tickets

> Escrow hold and release workflows.

---

## T8.1 — Vault Database Schema

**Domain:** Vault
**Capability:** Persistence

**Purpose:** Create escrow hold and custody tracking tables.

**Dependencies:** T6.1 (transaction schema), T2.1 (RLS patterns)

**Architectural Constraints:**
- Tables: `vault_sessions`, `custody_records`, `release_requests`
- FK to `transactions.id`
- Status: `holding`, `released`, `disputed`, `frozen`
- RLS: admin + transaction participants

**Deliverables:**
- Migration for vault tables
- Triggers for audit logging

**Acceptance Criteria:**
- [ ] Tables created with correct constraints
- [ ] FK to transactions enforced
- [ ] RLS prevents unauthorized access

**Observability:**
- `vault_sessions_total` gauge by status

**Failure Modes:**
- Orphaned vault session → reconciliation

---

## T8.2 — Escrow Hold Workflows

**Domain:** Vault
**Capability:** Custody

**Purpose:** Manage fund holding lifecycle.

**Dependencies:** T8.1, T6.4 (escrow events)

**Architectural Constraints:**
- Vault session created on `escrow.created` event
- Hold amount locked until release conditions met
- Events: `vault.locked`, `vault.released`, `vault.disputed`

**Deliverables:**
- `src/vault/domain/entities/vault-session.ts`
- `src/vault/application/services/hold-service.ts`
- Event consumers

**Acceptance Criteria:**
- [ ] Vault session created on escrow event
- [ ] Hold amount recorded
- [ ] Release only on authorized transition
- [ ] Dispute freezes session

**Observability:**
- `vault_holds_created_total` counter
- `vault_releases_total` counter

**Failure Modes:**
- Duplicate hold → idempotency prevents
- Release without hold → rejected

---

## T8.3 — Inspection Period & Release

**Domain:** Vault
**Capability:** Settlement Coordination

**Purpose:** Enforce inspection window before release.

**Dependencies:** T8.2

**Architectural Constraints:**
- Inspection window: 72h from delivery
- Buyer confirmation releases immediately
- Timeout auto-releases after 72h
- Dispute extends hold indefinitely

**Deliverables:**
- `src/vault/application/services/inspection-service.ts`
- Inspection timeout queue worker
- Release orchestrator

**Acceptance Criteria:**
- [ ] Inspection timer starts on delivery
- [ ] Buyer confirmation triggers release
- [ ] Timeout auto-releases
- [ ] Dispute pauses timer

**Observability:**
- `vault_inspection_timeouts_total` counter
- `vault_auto_releases_total` counter

**Failure Modes:**
- Timer drift → queue scheduled job compensates
- Dispute resolution timeout → manual override

---

## T8.4 — Vault API

**Domain:** Vault
**Capability:** HTTP Boundary

**Purpose:** Expose escrow status and dispute endpoints.

**Dependencies:** T8.3

**Architectural Constraints:**
- Read-only for buyers/sellers
- Admin can freeze/release
- Audit log on all mutations

**Deliverables:**
- `src/vault/api/routes/vault-routes.ts`
- `src/vault/api/controllers/vault-controller.ts`

**Acceptance Criteria:**
- [ ] `GET /v1/vault/sessions/:id` returns escrow status
- [ ] `POST /v1/vault/sessions/:id/dispute` initiates dispute
- [ ] Admin freeze endpoint

**Observability:**
- `vault_api_requests_total` counter

**Failure Modes:**
- Unauthorized release → 403
