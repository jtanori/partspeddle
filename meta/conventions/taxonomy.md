# Folder Taxonomy

> **Authority:** `runtime-governance-kernel.md`  
> **Scope:** `/meta` directory structure and all governance subsystems.  
> **Version:** 1.0.0

---

## Canonical Structure

```
meta/
├── README.md              # Governance root documentation
├── conventions/           # Specifications: naming, taxonomy, versioning
│   ├── naming.md
│   └── taxonomy.md
├── schemas/               # Canonical JSON Schema definitions
├── runtime/               # Execution state, checkpoints, logs
├── workflows/             # Execution lifecycle definitions
├── events/                # Append-only governance event logs
└── projections/           # Generated Markdown projections
```

---

## Subsystem Definitions

### `conventions/`

**Purpose:** Human-readable specifications that govern all other artifacts.  
**Contents:** Naming conventions, folder taxonomy, versioning rules, migration plans.  
**Authority:** `runtime-governance-kernel.md`  
**Mutability:** Low. Changes require ratification, not execution.

### `schemas/`

**Purpose:** Machine-validated JSON Schema definitions for all governance entities.  
**Contents:** `*.schema.json` files for milestones, tickets, checkpoints, heartbeats, etc.  
**Authority:** Schema validator (`ajv` or equivalent)  
**Mutability:** Low. Versions are immutable; new versions create new files.

### `runtime/`

**Purpose:** Volatile execution state that persists across agent sessions.  
**Contents:**
```
runtime/
├── state/                 # Canonical runtime state files
│   ├── active-execution.json
│   ├── execution-lock.json
│   ├── current-ticket.json
│   └── current-milestone.json
├── checkpoints/           # Execution resumability anchors
├── heartbeats/            # Operational telemetry
├── execution-logs/        # State transition audit trail
├── drift-events/          # Drift detection records
├── completion-reports/    # Terminal execution reports
├── execution-history/     # Archived completed executions
├── audits/                # Integrity audit reports
├── projections/           # Human-readable state projections
└── bootstrap/             # Minimum viable restart context
```

**Authority:** `STATE_MUTATION_RULES.md`  
**Mutability:** High. Updated continuously during execution.

### `workflows/`

**Purpose:** Declarative definitions of execution lifecycles, approval flows, and recovery sequences.  
**Contents:** JSON workflow definitions, Markdown procedure documentation.  
**Authority:** `EXECUTION_LIFECYCLE_PROTOCOL.md`  
**Mutability:** Medium. New workflows added; existing workflows versioned.

### `events/`

**Purpose:** Append-only log of all governance mutations.  
**Contents:** `*.jsonl` files with governance events.  
**Authority:** `STATE_MUTATION_RULES.md`  
**Mutability:** Append-only. Never modified or deleted.

### `projections/`

**Purpose:** Human-readable Markdown generated from canonical JSON state.  
**Contents:** `latest-status.md`, `current-context.md`, `resume-instruction.md`, etc.  
**Authority:** `scripts/generate-runtime-projections.ts`  
**Mutability:** High. Regenerated after every state transition.

---

## Coverage Matrix

| Governance Concern | Primary Location | Secondary Location | Status |
|--------------------|------------------|--------------------|--------|
| Execution lifecycle | `protocols/EXECUTION_LIFECYCLE_PROTOCOL.md` | `meta/workflows/` | Migrated |
| Checkpoint protocol | `protocols/CHECKPOINT_PROTOCOL.md` | `meta/runtime/checkpoints/` | Migrated |
| Heartbeat policy | `protocols/HEARTBEAT_POLICY.md` | `meta/runtime/heartbeats/` | Migrated |
| Safe exit protocol | `protocols/SAFE_EXIT_PROTOCOL.md` | `meta/runtime/bootstrap/` | Migrated |
| Drift recovery | `protocols/DRIFT_RECOVERY_PROTOCOL.md` | `meta/runtime/drift-events/` | Migrated |
| Governance gates | `enforcement/GOVERNANCE_GATES.md` | `meta/workflows/` | Pending |
| State mutation rules | `protocols/STATE_MUTATION_RULES.md` | `meta/conventions/` | Pending |
| Completion reports | `runtime/completion-reports/` | `meta/runtime/completion-reports/` | Pending |
| Schemas | `project-governance/schemas/` | `meta/schemas/` | Pending |

---

## Migration Path from project-governance/

The existing `project-governance/` directory contains historical artifacts that predate `/meta`. Migration follows this phased approach:

### Phase 1: Structure (COMPLETE)
- `/meta` root created with all subsystems (`T11.1`)
- Naming conventions ratified (`T11.2`)

### Phase 2: Protocols (M11-M14)
- Governance protocols migrate to `meta/workflows/`
- Enforcement rules migrate to `meta/conventions/`
- Schema definitions migrate to `meta/schemas/`

### Phase 3: Runtime State (M15-M17)
- Active runtime state moves from `project-governance/runtime/` to `meta/runtime/`
- Checkpoints, heartbeats, and logs preserve their naming but relocate

### Phase 4: Deprecation (M18-M19)
- `project-governance/` becomes read-only archive
- All new artifacts originate in `/meta`
- SYNTH extraction prepares `meta/` as standalone package

---

## Validation Rules

1. **No orphaned subdirectories:** Every directory in `meta/` must have a documented purpose in this taxonomy.
2. **No naming violations:** All files must validate against `meta/conventions/naming.md` regex patterns.
3. **No cross-subsystem imports:** `schemas/` may not import from `runtime/`. `workflows/` may not import from `events/`.
4. **Projection completeness:** Every JSON entity in `runtime/state/` must have a corresponding projection in `runtime/projections/`.
