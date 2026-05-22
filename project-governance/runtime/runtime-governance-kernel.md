# VINTRACK Runtime Governance Kernel

> **The Constitution**  
> Location: `project-governance/runtime/runtime-governance-kernel.md`  
> Purpose: immutable governance rules, startup sequence, operational invariants, orchestration doctrine.

---

## 1. System Identity

VINTRACK is a governed fullstack commerce platform operating under:

- milestone-driven orchestration
- bounded context architecture
- traceability enforcement
- contract-first governance
- CI validation
- TDD all the time
- shared semantic ownership

**Execution continuity is mandatory.**

---

## 2. Core Invariants

The following are non-negotiable:

1. **All work must map to milestones and tickets.**
2. **All architectural changes require governance alignment.**
3. **Shared contracts are canonical.**
4. **Frontend may not redefine backend contracts.**
5. **Runtime boundaries must remain isolated.**
6. **CI validation is mandatory before merge.**
7. **Traceability must be preserved across all changes.**
8. **Acceptance criteria must be met**
9. **All tickets require at least one commit before moving to review**
10. **All tickets require a valid test plan**
---

## 3. Mandatory Startup Procedure

Before executing any task:

1. Load `runtime-state.json`
2. Identify active milestone
3. Identify active ticket
4. Load `runtime/state/current-milestone.json`
5. Load `runtime/state/current-ticket.json`
6. Load `runtime/state/active-execution.json` — canonical runtime execution state
7. Load `runtime/state/execution-lock.json` — verify lock is free or held by current session
8. Load `dependency-graph.json`
9. **Validate milestone graph is acyclic (Section 3A)**
10. Validate surface constraints via `surface-map.json`
11. Validate contracts via `contract-registry.json`
12. **Load `checkpoints/latest-checkpoint.json`**
13. **Validate execution scope lock against checkpoint state**
14. Establish acceptance criteria
15. **THEN** execute work

**If governance context is incomplete: STOP and request required artifacts.**

**On resume after interruption:** NEVER resume from conversational memory. Load `runtime/state/active-execution.json`, `checkpoints/latest-checkpoint.json`, and `checkpoints/active-execution.md` as the sole source of execution truth. See `protocols/CHECKPOINT_PROTOCOL.md`.

---

## 3A. Dependency Graph Validation (Cycle Detection)

### Purpose
Prevent milestone-level deadlocks before execution begins. A cyclic milestone dependency is an architectural failure, not a runtime error.

### Validation Rules

**Milestone Graph Check:**
```
For each milestone M:
  DFS from M
  If M revisited → CYCLE DETECTED
```

**Ticket-to-Milestone Check:**
```
For each ticket T with dependencies D:
  For each d in D:
    If milestone(d) > milestone(T) AND dependency_type != "contract":
      FLAG: Implementation dependency on future milestone
```

### Classification of Dependencies

Every dependency MUST declare its type:

| Type | Meaning | Example |
|------|---------|---------|
| `hard` | Full implementation required | Backend API endpoint |
| `soft` | Graceful degradation possible | AI enrichment, analytics |
| `contract` | Interface/schema only; mockable | Search index schema, event types |
| `runtime` | Shared infrastructure | Database, Redis, event bus |

**Rule:** Only `hard` dependencies create milestone sequencing constraints. `contract` dependencies should be extracted into a Shared Contracts milestone (M4.5 pattern).

### Cycle Resolution Protocol

If a cycle is detected:

1. **STOP execution immediately**
2. Identify the coarse-grained dependency causing the cycle
3. Determine if the dependency is actually a `contract` masquerading as `hard`
4. Extract the contract into a new Shared Contracts milestone (M4.5 pattern)
5. Rewire ticket dependencies to point at the contract ticket
6. Update milestone graph, dependency-graph.json, runtime-state.json
7. Re-run cycle detection
8. Only proceed when graph is acyclic

### Historical Cycles (Resolved)

| Cycle | Resolution | Date |
|-------|-----------|------|
| M3 → T3.5 → T5.1 → M5 → M3 | Extracted Algolia contract to M4.5 (T4.5.1) | 2026-05-20 |

### Forbidden Behaviors
**NEVER:**
- Ignore detected cycles and proceed
- "Temporarily" break a dependency without governance alignment
- Reclassify a `hard` dependency as `soft` to bypass sequencing

---

## 3B. Contract Lock Governance

### Purpose
Once downstream milestones depend on shared contracts, those contracts become **immutable without escalation**. This prevents later milestone drift from destabilizing already-completed orchestration phases.

### CONTRACT_LOCK States

| State | Meaning |
|-------|---------|
| `inactive` | No downstream dependents yet; contracts may evolve freely |
| `active` | Downstream milestones are consuming contracts; mutations restricted |
| `frozen` | All downstream milestones completed; contracts immutable |

### Lock Activation
CONTRACT_LOCK activates automatically when:
- A contract ticket (M4.5.x) completes
- `contracts-manifest.json` is emitted
- At least one downstream milestone imports the contract

### Mutation Rules Under Active Lock

**Allowed without escalation:**
- Additive fields
- New exports
- Documentation updates
- Non-breaking type widenings

**Requires escalation (milestone review):**
- Field renames
- Field removals
- Type narrowings
- Schema constraint tightening
- Default value changes

**Prohibited:**
- Breaking changes without migration path
- Deletion of downstream-consumed types
- Semantic changes to filter operators
- Index schema attribute removals

### Contract Manifest

Every completed contract ticket MUST emit:

```json
{
  "version": "1.0.0",
  "contracts": [],
  "owners": {},
  "downstream_dependents": {},
  "breaking_change_policy": {},
  "contract_lock": { "status": "active" }
}
```

Location: `project-governance/runtime/contracts-manifest.json`

### Traceability Requirement

All contract mutations MUST update:
1. `contracts-manifest.json` version
2. Downstream impact analysis
3. Migration notes (if breaking)
4. Ticket traceability in consuming milestones

### First Contract Lock (Active)

| Contract | Locked | Downstream |
|----------|--------|------------|
| `src/shared/contracts/search/*` | 2026-05-20 | T3.5 (frontend), T5.1 (backend) |

---

## 4. Architectural Constraints

- Bounded contexts own their data and events.
- Cross-domain communication is event-driven only.
- No direct imports across domain boundaries.
- Database schemas are owned by backend domains.
- Frontend consumes contracts but does not redefine them.

---

## 5. Surface Governance

Execution surfaces:

| Surface | Runtime | Description |
|---------|---------|-------------|
| `backend` | node | API server, domain logic, repositories |
| `frontend-rsc` | nextjs-server | React Server Components, Server Actions |
| `frontend-client` | browser | Client Components, hooks, browser APIs |
| `shared` | universal | Contracts, types, Zod schemas, utilities |
| `infrastructure` | mixed | Docker, CI/CD, database, Redis |
| `ci-cd` | actions | GitHub Actions, validation gates |

**Cross-surface imports must obey `surface-map.json`.**

---

## 6. Contract Ownership

Backend domains own:

- API schemas
- DTOs
- Event payloads
- Transport semantics

Frontend surfaces consume contracts but may not redefine them.

---

## 7. Traceability Rules

Every code change must update the ticket's traceability:

```json
{
  "traceability": [
    {
      "commit_hash": "abc1234",
      "files_changed": ["src/identity/domain/entities/user.ts"],
      "description": "Implemented User aggregate with email validation",
      "timestamp": "2026-05-18T12:00:00Z"
    }
  ]
}
```

Atomic commits: one ticket = one atomic commit at least.
Commit format: `{type}({domain}): {description} (T{milestone}.{sequence})`

---

## 8. CI Governance

Every commit must pass:

```bash
npm run lint
npm run typecheck
npm run test:unit -- `${test_plan.join(' ')}`
```
Where test_plan is the ticket's test_plan array.

Future improvements: https://vitest.dev/guide/filtering
                     https://vitest.dev/guide/test-tags.html

Every merge from feature/fix/hotfix/trivial branches to develop must pass:

```
npm run lint
npm run typecheck
npm run test:unit
```

Frontend-specific gates (when affected):

```bash
npm run build:frontend
npm run test:e2e
```

CI blocks merge on any failure.

---

## 9. Forbidden Behaviors

**NEVER:**

- bypass milestone sequencing
- invent undocumented architecture
- duplicate contracts
- violate runtime boundaries
- create implicit dependencies
- bypass CI validation
- introduce ungoverned packages

---

## 10. Execution Expectations

Every execution must produce:

- governance validation
- dependency awareness
- traceability references
- acceptance validation
- risk identification
- test plan

**Execution is deterministic, not exploratory.**

---

## 11. Escalation Rules

If a task cannot be completed within its ticket scope:

1. Document the blocker in the ticket
2. Update `runtime-state.json` blocked tickets list
3. Do not expand scope without milestone review
4. Request governance alignment before architectural changes

---

## 12. Execution Transition Rules

### Principle
Successful governance validation **authorizes execution automatically**.

The runtime MUST transition from validation into execution without conversational confirmation, hesitation, or re-planning.

### Automatic Transition Condition
If ALL governance validation checks pass (Section 3 + Section 7), the runtime MUST immediately begin implementing the active ticket.

### Transition Sequence
```
BOOTSTRAP (load artifacts)
  ↓ automatic
VALIDATION (confirm constraints)
  ↓ automatic on success
EXECUTION (implement ticket)
  ↓ automatic on completion
VERIFICATION (run CI gates)
  ↓ automatic on pass
CHECKPOINT (persist state)
  ↓ automatic
NEXT TASK (load next ticket)
```

### Execution Authority
Successful governance validation grants execution authority. No additional approval is required unless:
- Blockers exist in `runtime-state.json`
- Dependencies are unresolved
- Governance conflicts are detected
- The ticket explicitly declares an approval gate

### Forbidden Post-Validation Behaviors
**NEVER:**
- Idle after successful validation
- Wait for conversational confirmation
- Restart planning loops
- Re-open architectural reasoning
- Request permission to continue unless a blocker exists
- Generate analysis instead of action

### Idle State Is Invalid
An idle runtime after successful validation is a **governance violation**.

The runtime MUST be in one of these active states:
- `BOOTSTRAP` — loading governance
- `VALIDATION` — checking constraints
- `EXECUTION` — implementing ticket work
- `VERIFICATION` — running validation gates
- `CHECKPOINT` — persisting state
- `BLOCKED` — awaiting dependency or approval (logged)

`IDLE` is not a valid runtime state.

---

## 12. Checkpoint Resumption Protocol

### Purpose
Prevent orchestration drift after timeout, interruption, or context compaction. Replace probabilistic reconstruction with deterministic state reload.

### Checkpoint Authority
`project-governance/runtime/checkpoints/latest-checkpoint.json` is the **sole resumability anchor**. It supersedes conversational memory.

### Checkpoint Structure
- `latest-checkpoint.json` — active execution snapshot
- `active-execution.md` — human-readable decision journal and interruption narrative
- `checkpoint-schema.json` — validation schema for checkpoint integrity
- `{ticket}-checkpoint.json` — archived checkpoint on ticket completion

### Mandatory Checkpoint Emission
At the end of every major response (segment boundary), emit:

```
CHECKPOINT UPDATE:
- completed: [list]
- remaining: [list]
- blockers: [list]
- next step: [single action]
```

Then persist into `latest-checkpoint.json`.

### Atomic Execution Segments
Split long-running tickets into resumable segments (e.g., `T3.1A`, `T3.1B`). Checkpoint after each segment. Interruptions become harmless reloads.

### Execution Scope Lock
Every checkpoint carries an `execution_scope_lock`:

```json
{
  "execution_scope_lock": {
    "allowed_domains": ["Shared"],
    "forbidden_actions": [
      "Redesign architecture",
      "Revisit governance",
      "Expand milestone scope"
    ],
    "scope_note": "T3.1 only. No domain logic changes."
  }
}
```

### Resume Prompt Template
```
Resume execution from latest-checkpoint.json.

Load:
- runtime-governance-kernel.md
- runtime-state.json
- dependency-graph.json
- surface-map.json
- checkpoints/latest-checkpoint.json
- checkpoints/active-execution.md
- project-management/data/tickets/{ticket}.json

Validate:
- active milestone
- active ticket
- completed steps
- remaining steps
- constraints
- acceptance criteria
- execution scope lock

Then continue execution deterministically.
```

### Forbidden Resume Behaviors
**NEVER:**
- Resume from "continue" or conversational memory
- Reconstruct progress heuristically
- Re-plan completed work
- Revisit solved architectural decisions
- Expand scope beyond checkpoint boundaries
- Idle after successful checkpoint load

---

## 13. Runtime Phase Semantics

### Purpose
The runtime operates in deterministic phases with automatic transitions. Phase boundaries remove execution ambiguity.

### Phase Definitions

| Phase | Activity | Entry Trigger | Exit Trigger |
|-------|----------|---------------|--------------|
| `BOOTSTRAP` | Load governance artifacts, runtime state, dependency graph, surface map, contract registry | Session start | All artifacts loaded |
| `VALIDATION` | Confirm milestone, ticket, constraints, surface, mode | BOOTSTRAP complete | All checks pass |
| `EXECUTION` | Implement ticket tasks, modify files, satisfy acceptance criteria | VALIDATION success | Deliverables complete |
| `VERIFICATION` | Run CI gates: lint, typecheck, tests, build | EXECUTION complete | All gates pass |
| `CHECKPOINT` | Persist execution state, update traceability, emit checkpoint | VERIFICATION success | State persisted |
| `TRANSITION` | Load next ticket, update runtime state, reset phase | CHECKPOINT complete | Next ticket ready |

### Automatic Transition Rule
**If a phase completes successfully, transition to the next phase automatically.**

No conversational confirmation required between phases.

### Blocking Conditions
Automatic transitions are HALTED only when:
- Governance artifacts are missing
- Validation checks fail
- Dependencies are unresolved
- CI gates fail
- Explicit approval gates are declared
- Scope lock violation detected

When blocked, the runtime MUST:
1. Log the blocker in `runtime-state.json`
2. Update the ticket status to `blocked`
3. Emit a checkpoint with the blocker documented
4. Request explicit human intervention

### Phase Invariants
- The runtime MUST know its current phase at all times
- The runtime MUST not remain in a completed phase
- Phase transitions are deterministic, not conversational
- Only blockers can pause the transition chain

---

## 14. Infrastructure Precheck Mode (INFRA_PRECHECK)

### Purpose
Validate external dependencies before executing integration tests, E2E, queue workers, contract validation, or background jobs. Prevent false "hang" states caused by missing infrastructure.

### Execution Sequence
```
INFRA_PRECHECK
  ↓
Validate: docker compose ps
Validate: redis ping
Validate: postgres healthcheck
Validate: required secrets present
  ↓
ALL PASS → proceed to EXECUTION
ANY FAIL → fast-fail with explicit error
```

### Dependency Classification

Every test suite MUST declare:

```json
{
  "requires": ["redis", "postgres", "algolia"],
  "mode": "integration"
}
```

### Fast-Fail Policy

| Dependency | Timeout | Action on Failure |
|------------|---------|-------------------|
| Redis (test env) | 250ms–1000ms | Skip Redis-dependent tests |
| Postgres (test env) | 1000ms–2000ms | Skip integration tests |
| Docker daemon | 500ms | Fail with explicit message |

### Forbidden Behaviors
**NEVER:**
- Run integration tests without infrastructure validation
- Use 10s+ timeouts for test environment connections
- Allow unit tests to require external infrastructure
- Report "framework hang" when infrastructure is offline

### Historical Incidents

| Date | Assumed Cause | Actual Cause | Resolution |
|------|--------------|--------------|------------|
| 2026-05-20 | Vitest deadlock | Docker offline | INFRA_PRECHECK mode added |

---

## 15. Agent Execution Telemetry (Anti-Drift)

### Purpose
Prevent context compaction, planning loops, silent execution drift, and hallucinated progress. Agents degrade over long execution horizons without observable checkpoints.

### 15.1 Silent Execution Prohibition

The agent MUST NOT remain silent while executing a task expected to exceed 60 seconds of reasoning or file operations.

For any task estimated to exceed 60 seconds, the agent MUST emit progress updates:

```
[STATUS YYYY-MM-DD HH:MM]
Current Phase: {phase}
Files Modified: {count} ({list})
Completed Steps: {n}/{total}
Remaining Steps: {list}
Blocking Issues: {none | description}
Confidence Level: {high | medium | low}
```

**Mandatory emission triggers:**
- Every 3 minutes of active execution
- After completing a major subsystem operation
- After modifying more than 10 files
- Before and after any governance state transition

**Failure to emit progress updates is execution drift.**

### 15.2 Micro-Commit Architecture

**Forbidden:**
- "Implement the whole migration" in one execution window
- Tickets with >40 minute estimated execution time
- Single execution sessions touching >20 files

**Required:**
- Segments: T3.1A, T3.1B, T3.1C (not T3.1 monolith)
- Bounded scope per segment: ≤10 files, ≤30 minutes
- Explicit segment boundaries in checkpoint

### 15.3 Mandatory Ticket Completion Summary

**NEVER accept:** "done", "completed", "migration successful"

**ALWAYS require:**

```
## TICKET COMPLETION SUMMARY

**Ticket:** {id}
**Objective:** {one sentence}

### Files Created
- `path/to/file.ts` — purpose

### Files Modified
- `path/to/file.ts` — what changed

### Files Deleted
- `path/to/file.ts` — why

### Architectural Changes
- bullet points

### Dependency Changes
- Added: `package@version`
- Removed: `package`

### Breaking Changes
- {none | list}

### Validation Performed
- [ ] tests executed
- [ ] lint checks
- [ ] build checks
- [ ] typecheck
- [ ] runtime verification

### Remaining Risks
- {list}

### Deferred Work
- {list}

### Recommended Next Ticket
- {id} — {reason}

### Confidence Score
{0-100}%
```

### 15.4 Heartbeat Checkpoints

Long operations MUST emit heartbeat markers:

```
[HEARTBEAT HH:MM]
Still executing.
Current operation: {description}
Files updated: {count}
Blockers: {none | description}
ETA: {duration}
```

### 15.5 Planning Loop Prevention

The agent MUST NOT remain in planning or analysis mode for more than:
- 3 consecutive reasoning cycles without file modification
- 5 minutes without file modifications

**If no implementation progress:**
1. Emit blocker report
2. Request human clarification
3. OR reduce scope and continue incrementally

**Repeated architectural reconsideration without implementation is execution drift.**

### 15.6 Diff-First Reporting

Before massive edits (>5 files), require:

```
## EXECUTION PLAN

1. {step 1}
2. {step 2}
...

Estimated files: {n} modified, {n} created
Estimated runtime: {duration}
Risk level: {low | medium | high}
```

### 15.7 Parallel Execution Truth

**LLM agents are NOT true multithreaded workers.**

"Parallel execution" means:
- "I intend to process multiple areas during this run"
- NOT "I spawned actual workers"

Actual execution is serialized. Claims of parallelism are planning rhetoric.

### 15.8 Resume Packet

On ANY interruption, produce:

```
## RESUME PACKET

**Current Ticket:** {id}
**Completed:** {list}
**In Progress:** {description}
**Pending:** {list}
**Modified Files:** {list with last change description}
**Last Successful Validation:** {command + result}
**Known Issues:** {list}
**Recommended Resume Prompt:** {one sentence}
```

This is the agent's "save state." Without it: anchorless drift, re-analysis loops, architecture re-invention.

### 15.9 Context Compaction Protocol

When context compaction occurs:
1. STOP all implementation
2. Emit resume packet immediately
3. Load latest-checkpoint.json as sole truth
4. Discard all conversational memory
5. Re-validate from governance artifacts only
6. Continue from checkpoint, not from memory
