# P0 Runtime Stabilization Plan

> **Plan ID:** PLAN-P0-2026-05-24-001
> **Authority:** OPERATOR_APPROVAL_REQUIRED
> **Target Scope:** Runtime integrity stabilization before M29 activation
> **Architecture Reference:** ROA-2026-05-24-001
> **Risk Classification:** HIGH
> **Lock Required:** Yes (for execution phase)
> **Status:** Draft — pending operator approval

---

## 1. Stabilization Milestone Proposal

### 1.1 Milestone Identifier

**M32 — Runtime Operations Stabilization**

- **Phase:** 32
- **Lane:** governance
- **Priority:** infrastructure_critical
- **Blocks Scaling:** Yes
- **Status:** planned

### 1.2 Purpose

Eliminate all critical runtime integrity weaknesses identified during INSPECT mode (2026-05-24T16:45:00Z) before activating event-causality semantics (M29).

### 1.3 Scope

| In Scope | Out of Scope |
|----------|-------------|
| Bootstrap authority repair | Execution journal implementation (P1) |
| Projection synchronization system | Operator console (P2) |
| Repository governance sync | Query interface expansion (P2) |
| Repository hygiene | Reporting engine (P2) |
| CI integration for P0 gates | Mode registry (P3) |
| Stabilization validation | M29 event causality implementation |

### 1.4 Exit Criteria

1. All runtime projections are deterministic derivatives of canonical-state
2. Bootstrap reconstruction is authoritative and replay-safe
3. Repository governance metadata (`head_commit`, `worktree_clean`) is accurate
4. Projection drift is invariant-detectable
5. No test artifacts committed to repository
6. All P0 validation gates pass
7. M29 activation authority is granted

### 1.5 Milestone Dependency Graph

```
M27 (completed) ──▶ M28 (completed) ──▶ M32 (P0 Stabilization) ──▶ M29 (blocked)
                                            │
                                            ▼
                                      T32.1, T32.2, T32.3, T32.4, T32.5
```

**M29 dependency update required:**
- Current: `dependencies: ["M28"]`
- Proposed: `dependencies: ["M32"]`

---

## 2. Ticket Decomposition

### 2.1 Ticket Registry

| Ticket | Title | Scope | Est. Hours | Risk |
|--------|-------|-------|-----------|------|
| T32.1 | Bootstrap Authority Repair | P0.1 | 2 | MEDIUM |
| T32.2 | Projection Synchronization System | P0.2 | 4 | HIGH |
| T32.3 | Repository Governance Synchronization | P0.3 | 2 | LOW |
| T32.4 | Repository Hygiene | P0.4 | 1 | LOW |
| T32.5 | P0 Integration & Validation | Integration | 3 | MEDIUM |

### 2.2 Ticket Specifications

#### T32.1 — Bootstrap Authority Repair

**Purpose:** Replace deprecated `milestones.json` dependency with canonical-state-first bootstrap.

**Deliverables:**
- `scripts/bootstrap.ts` (rewritten)
- `scripts/validate-bootstrap.ts` (new)
- `project-governance/runtime/bootstrap/runtime-bootstrap.json` (deterministically generated)

**Acceptance Criteria:**
- [ ] `bootstrap.ts` reads from `meta/state/canonical-state.json` as primary source
- [ ] `bootstrap.ts` reads `milestones.registry.json` for file discovery
- [ ] `bootstrap.ts` reads `project-management/milestones/governance.json` for milestone metadata
- [ ] `bootstrap.ts` NEVER reads `project-management/data/milestones.json`
- [ ] `bootstrap.ts` emits `runtime-bootstrap.json` with accurate `current_milestone`, `current_ticket`, `latest_checkpoint`
- [ ] `validate-bootstrap.ts` confirms bootstrap output matches canonical-state
- [ ] `npm run bootstrap` exits 0 and produces valid output
- [ ] `npm run bootstrap:validate` exits 0

**Traceability:**
- Files changed: `scripts/bootstrap.ts`, `scripts/validate-bootstrap.ts`
- Schema: `meta/governance/schemas/runtime-bootstrap.schema.json` (update)

---

#### T32.2 — Projection Synchronization System

**Purpose:** Implement authoritative, atomic, idempotent projection synchronization from canonical-state.

**Deliverables:**
- `scripts/sync-projections.ts` (new)
- `scripts/validate-projections.ts` (new)
- `meta/governance/projections/projection-registry.json` (new)
- Invariant: `projection-canonical-consistency` (new)

**Projection Registry Definition:**

```json
{
  "projections": [
    {
      "id": "runtime-state",
      "output_path": "project-governance/runtime/runtime-state.json",
      "generator": "scripts/sync-projections.ts",
      "refresh_trigger": "canonical_state_change",
      "max_staleness_ms": 60000
    },
    {
      "id": "active-execution",
      "output_path": "project-governance/runtime/state/active-execution.json",
      "generator": "scripts/sync-projections.ts",
      "refresh_trigger": "canonical_state_change",
      "max_staleness_ms": 60000
    },
    {
      "id": "current-milestone",
      "output_path": "project-governance/runtime/state/current-milestone.json",
      "generator": "scripts/sync-projections.ts",
      "refresh_trigger": "canonical_state_change",
      "max_staleness_ms": 60000
    },
    {
      "id": "current-ticket",
      "output_path": "project-governance/runtime/state/current-ticket.json",
      "generator": "scripts/sync-projections.ts",
      "refresh_trigger": "canonical_state_change",
      "max_staleness_ms": 60000
    },
    {
      "id": "execution-lock",
      "output_path": "project-governance/runtime/state/execution-lock.json",
      "generator": "scripts/sync-projections.ts",
      "refresh_trigger": "canonical_state_change",
      "max_staleness_ms": 60000
    },
    {
      "id": "runtime-bootstrap",
      "output_path": "project-governance/runtime/bootstrap/runtime-bootstrap.json",
      "generator": "scripts/bootstrap.ts",
      "refresh_trigger": "canonical_state_change",
      "max_staleness_ms": 300000
    }
  ]
}
```

**Acceptance Criteria:**
- [ ] `sync-projections.ts` reads canonical-state and writes all projections atomically
- [ ] Projection writes use storage adapter (`runtime-storage.ts`)
- [ ] Sync operation is idempotent (running twice produces identical output)
- [ ] `validate-projections.ts` compares each projection against canonical-state and reports drift
- [ ] New invariant `projection-canonical-consistency` passes after sync
- [ ] `npm run projection:sync` exits 0
- [ ] `npm run projection:validate` exits 0
- [ ] Partial projection updates are impossible (all-or-nothing sync)
- [ ] Drift detection emits `drift.detected` governance event if inconsistency found

**Traceability:**
- Files changed: `scripts/sync-projections.ts`, `scripts/validate-projections.ts`, `meta/governance/projections/projection-registry.json`, `meta/governance/invariants/invariants.json`

---

#### T32.3 — Repository Governance Synchronization

**Purpose:** Automatically synchronize repository metadata in canonical-state with git reality.

**Deliverables:**
- `scripts/sync-repository-status.ts` (new)
- `meta/governance/protocols/repository-sync-policy.json` (new)

**Sync Rules:**

| Canonical-State Field | Git Source | Sync Trigger |
|----------------------|-----------|-------------|
| `repository.head_commit` | `git rev-parse HEAD` | post-commit, pre-lock-release |
| `repository.worktree_clean` | `git status --short` | post-commit, pre-lock-release |
| `repository.last_validated_at` | Current timestamp | post-validation, pre-lock-release |

**Acceptance Criteria:**
- [ ] `sync-repository-status.ts` reads git state and updates canonical-state
- [ ] Updates use storage adapter for canonical-state mutation
- [ ] `head_commit` matches `git rev-parse HEAD` after sync
- [ ] `worktree_clean` is true when `git status --short` is empty
- [ ] `last_validated_at` is updated after invariant validation
- [ ] Sync runs automatically before execution lock release
- [ ] `npm run repository:sync` exits 0
- [ ] `npm run repository:validate` exits 0

**Traceability:**
- Files changed: `scripts/sync-repository-status.ts`, `meta/governance/protocols/repository-sync-policy.json`

---

#### T32.4 — Repository Hygiene

**Purpose:** Remove committed test artifacts and prevent future leakage.

**Deliverables:**
- `.gitignore` (updated)
- `scripts/validate-repository-hygiene.ts` (new)
- `project-governance/runtime/reports/hygiene-cleanup.md` (new)

**Acceptance Criteria:**
- [ ] `bench/` added to `.gitignore`
- [ ] All `bench/direct-*.json` files removed from repository
- [ ] `validate-repository-hygiene.ts` scans for test artifacts in repo root
- [ ] CI gate fails if `bench/` or `fixtures/` exist in repo root
- [ ] `npm run hygiene:validate` exits 0
- [ ] Worktree clean after cleanup

**Traceability:**
- Files changed: `.gitignore`, `scripts/validate-repository-hygiene.ts`

---

#### T32.5 — P0 Integration & Validation

**Purpose:** Integrate all P0 components and validate the stabilized runtime.

**Deliverables:**
- `project-governance/runtime/tests/run-p0-stabilization-tests.ts` (new)
- `.github/workflows/p0-stabilization-check.yml` (new)
- `project-management/data/tickets/T32.1.json` through `T32.4.json` (updates)
- `project-management/milestones/governance.json` (update: M32 status)
- `meta/state/canonical-state.json` (update: M32 closure)

**Integration Test Suite:**

```typescript
// P0 Stabilization Integration Tests

async function runP0Tests(): Promise<void> {
  await test("Projection sync produces consistent output");
  await test("Bootstrap output matches canonical-state");
  await test("Repository fields match git state");
  await test("No test artifacts in repo root");
  await test("All invariants pass after sync");
  await test("Drift detection finds no inconsistencies");
  await test("Sync is idempotent");
  await test("Rollback checkpoint is valid");
}
```

**Acceptance Criteria:**
- [ ] All P0 integration tests pass
- [ ] `invariant:validate` passes (22/22)
- [ ] `storage:test` passes (34/34)
- [ ] `projection:validate` passes (0 drift)
- [ ] `bootstrap:validate` passes
- [ ] `repository:validate` passes
- [ ] `hygiene:validate` passes
- [ ] `typecheck` passes for all new scripts
- [ ] CI workflow `p0-stabilization-check.yml` passes
- [ ] Worktree clean after commit
- [ ] M32 marked complete in canonical-state
- [ ] M29 dependency updated to M32

**Traceability:**
- Files changed: `project-governance/runtime/tests/run-p0-stabilization-tests.ts`, `.github/workflows/p0-stabilization-check.yml`

---

## 3. Dependency Graph

### 3.1 Ticket Dependencies

```
T32.4 (Repository Hygiene)
    │
    │ (independent)
    ▼
T32.3 (Repository Governance Sync)
    │
    │ (independent)
    ▼
T32.2 (Projection Sync System) ──▶ T32.1 (Bootstrap Repair)
    │                                    │
    │ (provides sync engine)             │ (uses projection patterns)
    │                                    │
    └────────────────────────────────────┘
                    │
                    ▼
            T32.5 (Integration & Validation)
                    │
                    ▼
            M32 Closure + M29 Unblocking
```

### 3.2 Parallel Execution Waves

| Wave | Tickets | Parallel? | Duration |
|------|---------|-----------|----------|
| Wave 1 | T32.4, T32.3 | ✅ Yes | ~2h |
| Wave 2 | T32.2 | ❌ No | ~4h |
| Wave 3 | T32.1 | ❌ No | ~2h |
| Wave 4 | T32.5 | ❌ No | ~3h |

**Total estimated duration:** ~11h (sequential waves, ~4h wall-clock with parallel Wave 1)

---

## 4. Execution Sequencing

### 4.1 Phase-by-Phase Execution Plan

#### Phase 0: Lock Acquisition & Checkpoint

```
ACTION: Acquire execution lock
  → execution_id: EXEC-P0-{timestamp}
  → ticket: T32.5 (meta-ticket for stabilization wave)
  → milestone: M32

ACTION: Emit rollback checkpoint
  → cp_T32_pre_stabilization_{timestamp}_active
  → Includes full canonical-state snapshot
  → Includes pre-sync projection hashes

VALIDATION: Confirm lock acquired, checkpoint emitted
```

#### Phase 1: Wave 1 Execution (T32.4 + T32.3)

```
PARALLEL_BRANCH_A: T32.4 — Repository Hygiene
  1. Add bench/ to .gitignore
  2. git rm --cached bench/direct-*.json
  3. Implement validate-repository-hygiene.ts
  4. Run npm run hygiene:validate
  5. Commit: "chore(governance): remove test artifacts, add hygiene gate (T32.4)"

PARALLEL_BRANCH_B: T32.3 — Repository Governance Sync
  1. Implement sync-repository-status.ts
  2. Define repository-sync-policy.json
  3. Add npm run repository:sync
  4. Add npm run repository:validate
  5. Run sync manually to update canonical-state
  6. Commit: "feat(governance): repository status synchronization (T32.3)"

MERGE: Both branches committed
```

#### Phase 2: Wave 2 Execution (T32.2)

```
ACTION: T32.2 — Projection Synchronization System
  1. Define projection-registry.json
  2. Implement sync-projections.ts
  3. Implement validate-projections.ts
  4. Add npm run projection:sync
  5. Add npm run projection:validate
  6. Add invariant projection-canonical-consistency
  7. Run initial sync (all projections updated from canonical-state)
  8. Run validate-projections (confirm zero drift)
  9. Run invariant:validate (confirm 23/23 pass)
  10. Commit: "feat(governance): projection synchronization system (T32.2)"
```

#### Phase 3: Wave 3 Execution (T32.1)

```
ACTION: T32.1 — Bootstrap Authority Repair
  1. Rewrite bootstrap.ts
     - Remove milestones.json dependency
     - Add canonical-state-first logic
     - Add milestones.registry.json discovery
     - Add governance.json metadata loading
  2. Implement validate-bootstrap.ts
  3. Add npm run bootstrap:validate
  4. Run bootstrap and validate output
  5. Confirm runtime-bootstrap.json matches canonical-state
  6. Commit: "feat(governance): bootstrap authority repair (T32.1)"
```

#### Phase 4: Wave 4 Execution (T32.5)

```
ACTION: T32.5 — Integration & Validation
  1. Implement run-p0-stabilization-tests.ts
  2. Implement p0-stabilization-check.yml
  3. Run full validation sweep:
     - npm run invariant:validate
     - npm run storage:test
     - npm run projection:validate
     - npm run bootstrap:validate
     - npm run repository:validate
     - npm run hygiene:validate
     - npm run typecheck
  4. Create/update ticket files T32.1–T32.4
  5. Update M32 status in governance.json
  6. Update canonical-state: M32 complete
  7. Update M29 dependency to M32
  8. Emit completion checkpoint
  9. Commit: "feat(governance): P0 stabilization complete (T32.5)"
```

#### Phase 5: Lock Release & M29 Evaluation

```
ACTION: Release execution lock
  → release_reason: "T32.5 complete, M32 closed"

ACTION: Evaluate M29 readiness
  → Confirm all P0 exit criteria met
  → Update M29 dependency: ["M32"]
  → Emit M29-readiness report

GO/NO-GO: Operator decision on M29 activation
```

---

## 5. Mutation Boundaries

### 5.1 Mutable Authority Boundary

```
┌─────────────────────────────────────────────────────────────────┐
│                    MUTABLE AUTHORITY ZONE                        │
│                                                                  │
│  meta/state/canonical-state.json                                 │
│    ├── execution.*                                               │
│    ├── milestone.*                                               │
│    ├── ticket.*                                                  │
│    ├── lock.*                                                    │
│    ├── repository.*                                              │
│    ├── governance.*                                              │
│    └── confidence.*                                              │
│                                                                  │
│  ONLY these fields may be mutated by P0 scripts.                 │
│  ALL mutations MUST use storage adapter.                         │
│  ALL mutations MUST emit governance event.                       │
│  ALL mutations MUST create rollback checkpoint.                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Derived Projection Boundary

```
┌─────────────────────────────────────────────────────────────────┐
│                    DERIVED PROJECTION ZONE                       │
│                                                                  │
│  project-governance/runtime/runtime-state.json                   │
│  project-governance/runtime/state/active-execution.json          │
│  project-governance/runtime/state/current-milestone.json         │
│  project-governance/runtime/state/current-ticket.json            │
│  project-governance/runtime/state/execution-lock.json            │
│  project-governance/runtime/bootstrap/runtime-bootstrap.json     │
│                                                                  │
│  These files are NEVER mutated directly.                         │
│  They are ONLY generated by sync-projections.ts or bootstrap.ts. │
│  They are validated by validate-projections.ts.                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Mutation Ordering Rules

1. **Canonical-state first** — Mutate canonical-state before any projection
2. **Event emission second** — Emit governance event after canonical-state mutation
3. **Projection sync third** — Run sync-projections.ts after event emission
4. **Validation fourth** — Run validators after projection sync
5. **Commit fifth** — Git commit only after all validations pass

---

## 6. Rollback Semantics

### 6.1 Rollback Checkpoints

| Checkpoint | Trigger | Contents |
|-----------|---------|----------|
| `cp_T32_pre_stabilization_{ts}_active` | Lock acquisition | Full canonical-state snapshot + projection hashes |
| `cp_T32_post_wave1_{ts}_active` | Wave 1 completion | Canonical-state + updated projections |
| `cp_T32_post_wave2_{ts}_active` | Wave 2 completion | Canonical-state + synced projections |
| `cp_T32_post_wave3_{ts}_active` | Wave 3 completion | Canonical-state + repaired bootstrap |
| `cp_T32_complete_{ts}_complete` | Wave 5 completion | Final stabilized state |

### 6.2 Rollback Procedures

**Scenario A: Wave failure (e.g., T32.2 fails)**

```
1. STOP execution
2. Preserve working tree
3. Read pre-wave checkpoint (cp_T32_pre_stabilization_*)
4. Restore canonical-state from checkpoint snapshot
5. Run sync-projections.ts to regenerate projections
6. Run invariant:validate
7. If PASS → resume from Wave 1
8. If FAIL → escalate to operator
```

**Scenario B: Validation gate failure**

```
1. STOP execution
2. Identify failing gate
3. Determine if failure is in new code or pre-existing
4. If new code → fix and re-run wave
5. If pre-existing → document, emit incident, operator decision
```

**Scenario C: Git commit failure**

```
1. STOP execution
2. Check git status
3. If merge conflict → resolve manually, operator decision
4. If pre-commit hook failure → fix issue, re-stage, re-commit
```

### 6.3 Rollback Command Surface

```bash
# Emergency rollback to checkpoint
npm run recovery:rollback -- --checkpoint cp_T32_pre_stabilization_...

# Verify rollback integrity
npm run recovery:verify

# Replay from checkpoint to current
npm run recovery:replay -- --from cp_T32_pre_stabilization_...
```

---

## 7. Validation Gates

### 7.1 Per-Wave Gates

| Gate | Wave | Command | Exit Code |
|------|------|---------|-----------|
| Lock acquired | 0 | `scripts/validate-lock.ts` | 0 |
| Checkpoint emitted | 0 | `scripts/validate-checkpoint.ts` | 0 |
| Hygiene clean | 1 | `npm run hygiene:validate` | 0 |
| Repository synced | 1 | `npm run repository:validate` | 0 |
| Projections synced | 2 | `npm run projection:validate` | 0 |
| Bootstrap valid | 3 | `npm run bootstrap:validate` | 0 |
| All invariants pass | 4 | `npm run invariant:validate` | 0 |
| Storage tests pass | 4 | `npm run storage:test` | 0 |
| TypeScript clean | 4 | `npm run typecheck` (new scripts) | 0 |
| Worktree clean | 4 | `git status --short` | empty |

### 7.2 Final Integration Gates

```bash
# Complete validation sweep (run in sequence)
npm run projection:sync          # Sync all projections
npm run repository:sync          # Sync repository fields
npm run bootstrap                # Regenerate bootstrap
npm run invariant:validate       # 23/23 invariants (22 existing + 1 new)
npm run storage:test             # 34/34 tests
npm run projection:validate      # Zero drift
npm run bootstrap:validate       # Output matches canonical-state
npm run repository:validate      # Fields match git
npm run hygiene:validate         # No artifacts
npm run typecheck                # TypeScript clean
npm run lint                     # ESLint clean
```

---

## 8. Projection Authority Rules

### 8.1 Canonical-State Supremacy Doctrine

> **Rule 1:** `meta/state/canonical-state.json` is the sole mutable runtime authority.

> **Rule 2:** All projection files are derived. No projection file may be mutated directly.

> **Rule 3:** Projection sync MUST be atomic. All projections are updated together or not at all.

> **Rule 4:** Projection sync MUST be idempotent. Running sync N times produces the same output.

> **Rule 5:** Projection drift MUST be invariant-detectable. The `projection-canonical-consistency` invariant validates all projections against canonical-state.

### 8.2 Projection Sync Protocol

```
OPERATOR/AGENT triggers sync
        │
        ▼
┌───────────────────┐
│ sync-projections  │
│ .ts reads         │
│ canonical-state   │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ For each          │
│ projection in     │
│ registry:         │
│ generate output   │
│ to temp file      │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Atomic swap:      │
│ rename all temps  │
│ to final paths    │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Emit event:       │
│ state.projections │
│ _synced           │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Run invariant:    │
│ projection-       │
│ canonical-        │
│ consistency       │
└─────────┬─────────┘
          │
     PASS │ FAIL
          │
    ┌─────┴─────┐
    ▼           ▼
┌───────┐   ┌───────────┐
│ Done  │   │ Emit drift│
│       │   │ event,    │
│       │   │ halt      │
└───────┘   └───────────┘
```

---

## 9. Bootstrap Authority Rules

### 9.1 Bootstrap Reconstruction Doctrine

> **Rule 1:** Bootstrap SHALL read canonical-state as its primary source.

> **Rule 2:** Bootstrap SHALL read `milestones.registry.json` for file discovery ONLY.

> **Rule 3:** Bootstrap SHALL NEVER read deprecated `project-management/data/milestones.json`.

> **Rule 4:** Bootstrap output SHALL be deterministic: same canonical-state → same bootstrap output.

> **Rule 5:** Bootstrap validation SHALL compare output against canonical-state and fail on any mismatch.

### 9.2 Bootstrap Input Sources

| Source | Purpose | Authority |
|--------|---------|-----------|
| `meta/state/canonical-state.json` | Primary state (milestone, ticket, execution, lock) | ✅ Authoritative |
| `project-management/milestones.registry.json` | File discovery for milestone collections | ✅ Valid |
| `project-management/milestones/governance.json` | Milestone metadata (title, purpose, exit criteria) | ✅ Valid |
| `project-management/milestones/core.json` | Milestone metadata (title, purpose, exit criteria) | ✅ Valid |
| `project-governance/runtime/checkpoints/latest-checkpoint.json` | Latest checkpoint reference | ✅ Valid |
| `project-management/data/milestones.json` | Deprecated monolithic milestone file | ❌ FORBIDDEN |

---

## 10. CI Integration Plan

### 10.1 New CI Workflow: `p0-stabilization-check.yml`

```yaml
name: P0 Stabilization Validation Gate

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  p0-validation:
    name: P0 Runtime Stabilization
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'

      - run: npm ci

      - name: Projection Sync
        run: npm run projection:sync

      - name: Repository Sync
        run: npm run repository:sync

      - name: Bootstrap
        run: npm run bootstrap

      - name: Invariant Validation
        run: npm run invariant:validate

      - name: Storage Tests
        run: npm run storage:test

      - name: Projection Drift Check
        run: npm run projection:validate

      - name: Bootstrap Validation
        run: npm run bootstrap:validate

      - name: Repository Validation
        run: npm run repository:validate

      - name: Hygiene Validation
        run: npm run hygiene:validate

      - name: TypeScript Check
        run: npm run typecheck
```

### 10.2 Updated CI Workflow: `invariant-check.yml`

Add step:
```yaml
      - name: Projection Consistency
        run: npm run projection:validate
```

### 10.3 New npm Scripts

```json
{
  "projection:sync": "./node_modules/.bin/tsx scripts/sync-projections.ts",
  "projection:validate": "./node_modules/.bin/tsx scripts/validate-projections.ts",
  "bootstrap:validate": "./node_modules/.bin/tsx scripts/validate-bootstrap.ts",
  "repository:sync": "./node_modules/.bin/tsx scripts/sync-repository-status.ts",
  "repository:validate": "./node_modules/.bin/tsx scripts/validate-repository-status.ts --validate",
  "hygiene:validate": "./node_modules/.bin/tsx scripts/validate-repository-hygiene.ts",
  "p0:validate": "npm run projection:sync && npm run repository:sync && npm run bootstrap && npm run invariant:validate && npm run storage:test && npm run projection:validate && npm run bootstrap:validate && npm run repository:validate && npm run hygiene:validate"
}
```

---

## 11. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| T32.2 projection sync is complex and may introduce bugs | MEDIUM | HIGH | Rollback checkpoints at every wave; idempotent design |
| Bootstrap rewrite breaks existing workflows | LOW | MEDIUM | validate-bootstrap.ts confirms parity; fallback to old bootstrap available in git history |
| Repository hygiene cleanup accidentally removes needed files | LOW | HIGH | Specific glob pattern (`bench/direct-*.json`); git rm --cached only |
| Invariant addition breaks CI | LOW | HIGH | New invariant tested locally before commit; CI gate prevents merge |
| TypeScript errors in new scripts | MEDIUM | MEDIUM | tsx --check on each new script; typecheck gate |
| Lock expiry during long execution | LOW | MEDIUM | Estimated 4h wall-clock; lock TTL set to 8h for P0 |
| Git merge conflicts during atomic commit | LOW | MEDIUM | Single-agent execution; no concurrent pushes expected |

---

## 12. Migration Sequencing

### 12.1 From Current State to Stabilized State

| Step | Action | Before | After |
|------|--------|--------|-------|
| 1 | Add projection registry | No registry | `meta/governance/projections/projection-registry.json` |
| 2 | Implement sync engine | Projections stale | Auto-synced projections |
| 3 | Rewrite bootstrap | Reads deprecated JSON | Reads canonical-state |
| 4 | Add repository sync | `head_commit: null` | `head_commit: actual hash` |
| 5 | Clean artifacts | `bench/` committed | `bench/` in `.gitignore`, removed |
| 6 | Add CI gate | No P0 validation | Full P0 validation in CI |
| 7 | Add invariant | 22 invariants | 23 invariants (projection consistency) |

### 12.2 Backward Compatibility

- All existing npm scripts remain functional
- New scripts are additive
- Canonical-state schema is unchanged (only values mutated)
- Existing checkpoints remain valid
- Git history is preserved

---

## 13. Recommended Execution Order

### 13.1 Immediate (After Plan Approval)

1. Acquire execution lock for M32
2. Emit pre-stabilization checkpoint
3. Execute Wave 1: T32.4 + T32.3 (parallel)
4. Execute Wave 2: T32.2
5. Execute Wave 3: T32.1
6. Execute Wave 4: T32.5
7. Release lock
8. Evaluate M29 readiness

### 13.2 Timeline Estimate

| Phase | Duration | Cumulative |
|-------|----------|------------|
| Planning & approval | 0h (now) | 0h |
| Lock + checkpoint | 15 min | 15 min |
| Wave 1 (parallel) | 2h | 2h 15m |
| Wave 2 | 4h | 6h 15m |
| Wave 3 | 2h | 8h 15m |
| Wave 4 | 3h | 11h 15m |
| Lock release + evaluation | 30 min | 11h 45m |

**Wall-clock estimate:** ~12 hours (single-session or multi-session)

---

## 14. GO / NO-GO Recommendation for M29

### 14.1 GO Criteria (ALL must be true)

| Criterion | Required Value |
|-----------|---------------|
| Projection sync operational | `npm run projection:sync` exits 0 |
| Zero projection drift | `npm run projection:validate` exits 0 |
| Bootstrap authoritative | `npm run bootstrap:validate` exits 0 |
| Repository accurate | `npm run repository:validate` exits 0 |
| Hygiene clean | `npm run hygiene:validate` exits 0 |
| Invariants passing | 23/23 PASS |
| Storage tests passing | 34/34 PASS |
| Worktree clean | `git status --short` empty |
| CI passing | `p0-stabilization-check.yml` green |

### 14.2 NO-GO Triggers (ANY is true)

| Trigger | Action |
|---------|--------|
| Projection drift detected | Fix T32.2, re-validate |
| Bootstrap output mismatch | Fix T32.1, re-validate |
| Invariant violation | Investigate, fix, re-validate |
| TypeScript error | Fix, re-validate |
| Test artifact leakage | Fix T32.4, re-validate |
| CI failure | Fix, re-run CI |

### 14.3 Current Recommendation

**M29 Status:** 🔴 **NO-GO** (P0 stabilization not yet executed)

**M29 will become GO when:**
- All GO criteria in Section 14.1 are satisfied
- Operator explicitly approves M29 activation
- M32 is marked complete in canonical-state

---

## 15. Document Control

| Field | Value |
|-------|-------|
| **Plan ID** | PLAN-P0-2026-05-24-001 |
| **Version** | 1.0.0 |
| **Status** | Draft — pending operator approval |
| **Author** | agent |
| **Review Required** | operator |
| **Architecture Reference** | ROA-2026-05-24-001 |
| **Inspection Reference** | INSPECT-2026-05-24-001 |
| **Milestone** | M32 (proposed) |
| **Tickets** | T32.1, T32.2, T32.3, T32.4, T32.5 |

---

```
PLAN_COMPLETE
P0_SCOPE_DEFINED
TICKETS_DECOMPOSED
DEPENDENCIES_MAPPED
SEQUENCE_DEFINED
GATES_SPECIFIED
ROLLBACK_DEFINED
CI_PLANNED
GO_NOGO_RENDERED
AWAITING_APPROVAL
```
