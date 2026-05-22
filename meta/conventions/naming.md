# Naming Conventions

> **Authority:** `runtime-governance-kernel.md`  
> **Scope:** All governance artifacts in `/meta` and runtime state files.  
> **Version:** 1.0.0

---

## Principles

1. **Machine-parseable first.** Every name must be parseable by regex without ambiguity.
2. **No spaces.** Use `kebab-case` for human-readable segments, `snake_case` for machine segments.
3. **Temporal sorting.** Names that include timestamps use `YYYYMMDD_HHMMSS` for lexical sortability.
4. **Version immutability.** Once a schema or protocol reaches `v1.0.0`, its name never changes. New versions get new files.

---

## File Naming Conventions

### Schemas

```
{entity}.schema.json

Examples:
  milestone.schema.json
  ticket.schema.json
  checkpoint.schema.json
  governance-state.schema.json
```

**Regex:** `^[a-z][a-z0-9-]*\.schema\.json$`

### Protocols

```
{NAME}_PROTOCOL.md

Examples:
  EXECUTION_LIFECYCLE_PROTOCOL.md
  CHECKPOINT_PROTOCOL.md
  SAFE_EXIT_PROTOCOL.md
```

**Regex:** `^[A-Z][A-Z0-9_]*_PROTOCOL\.md$`

### Checkpoints

```
{task_id}-checkpoint-seq-{n}.json

Examples:
  T11.1-checkpoint-seq-1.json
  T11.1-checkpoint-seq-2.json
  T3.7-checkpoint-seq-3.json
```

**Regex:** `^T\d+(?:\.\d+)?-checkpoint-seq-\d+\.json$`

### Heartbeats

```
{task_id}-heartbeat-seq-{n}.json

Examples:
  T11.1-heartbeat-seq-1.json
  T11.2-heartbeat-seq-1.json
```

**Regex:** `^T\d+(?:\.\d+)?-heartbeat-seq-\d+\.json$`

### Completion Reports

```
{task_id}-completion.yaml

Examples:
  T11.1-completion.yaml
  T3.7-completion.yaml
```

**Regex:** `^T\d+(?:\.\d+)?-completion\.yaml$`

### Integrity Audits

```
integrity-audit-{ISO8601-sanitized}.json

Examples:
  integrity-audit-2026-05-22T04-11-02-044Z.json
```

**Regex:** `^integrity-audit-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d+Z\.json$`

### Drift Events

```
{task_id}-drift-{YYYYMMDD}_{HHMMSS}.json

Examples:
  T11.1-drift-20260522_035900.json
```

**Regex:** `^T\d+(?:\.\d+)?-drift-\d{8}_\d{6}\.json$`

---

## Directory Naming Conventions

```
/meta/{subsystem}/

Subsystems:
  schemas/      — JSON Schema definitions
  runtime/      — Execution state snapshots
  workflows/    — Lifecycle and workflow definitions
  events/       — Append-only governance event logs
  projections/  — Generated Markdown projections
  conventions/  — Naming and taxonomy specifications (this directory)
```

**Regex:** `^[a-z][a-z0-9-]*/$`

---

## Entity ID Conventions

### Milestones

```
M{phase}

Examples:
  M3   (phase 3)
  M11  (phase 11)
  M4.5 (interstitial phase)
```

**Regex:** `^M\d+(?:\.\d+)?$`

### Tickets

```
T{milestone}.{sequence}
T{milestone}.{sequence}{suffix}

Examples:
  T11.1
  T11.2
  T3.7
  T2.2A   (suffix for sub-tasks)
```

**Regex:** `^T\d+(?:\.\d+)?[A-Z]?$`

### Executions

```
EXEC-{YYYY-MM-DD}-{seq}

Examples:
  EXEC-2026-05-20-001
  EXEC-2026-05-22-002
  EXEC-2026-05-22-003
```

**Regex:** `^EXEC-\d{4}-\d{2}-\d{2}-\d{3}$`

### Checkpoints

```
cp_{task_id}_{YYYYMMDD}_{HHMMSS}_{optional_tag}

Examples:
  cp_T11.1_20260522_035500_init
  cp_T11.1_20260522_035900_complete
```

**Regex:** `^cp_T\d+(?:\.\d+)?_\d{8}_\d{6}(_[a-z]+)?$`

### Heartbeats

```
hb_{task_id}_{YYYYMMDD}_{HHMMSS}

Examples:
  hb_T11.1_20260522_035700
```

**Regex:** `^hb_T\d+(?:\.\d+)?_\d{8}_\d{6}$`

---

## Versioning Conventions

### Semantic Versioning

All schemas and protocols use SemVer:

```
{major}.{minor}.{patch}

major — Breaking change (requires migration)
minor — additive change (backward compatible)
patch — bug fix (no behavioral change)
```

### Version Immutability

- A file at `v1.0.0` is never modified in-place.
- New versions create new files or update a `version` field inside the file.
- Migration paths must be documented when `major` increments.

---

## Migration Path from project-governance/

Existing artifacts in `project-governance/` will be migrated to `/meta` using this naming convention. The migration is phased:

| Phase | Action | Target Convention |
|-------|--------|-------------------|
| 1 | New artifacts use `/meta` conventions | `meta/{subsystem}/` |
| 2 | Active runtime state moves to `meta/runtime/` | `meta/runtime/state/` |
| 3 | Schemas move to `meta/schemas/` | `meta/schemas/{entity}.schema.json` |
| 4 | `project-governance/` deprecated | Archive only |

During migration, dual naming is permitted with a `.migration` suffix:

```
meta/schemas/milestone.schema.json.migration
```
