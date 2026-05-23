---
authority:
  level: protocol
  layer: 2
  canonical: false
  supersedes: []
  derives_from:
    - runtime-governance-kernel
    - CANONICAL_AUTHORITY_HIERARCHY
    - execution-lifecycle
  scope: state
  status: active
  version: 1.0.0
---

# State Mutation Protocol

> **Authority:** `CANONICAL_AUTHORITY_HIERARCHY.md` Layer 2 → `runtime-governance-kernel.md`  
> **Purpose:** Who and what may mutate active-execution.json. Prevent concurrent mutation chaos.  
> **Version:** 1.0.0  
> **Status:** Active

> **Canonical Source:** `meta/governance/protocols/state-mutation.json`  
> **Generated:** 2026-05-23T00:45:39.207Z  

---

## Purpose

Prevent concurrent mutation chaos, conflicting ticket ownership, and checkpoint corruption.

## Philosophy

`active-execution.json` is the kernel of the governance runtime. If it becomes inconsistent, every downstream projection (status reports, heartbeats, drift detection) becomes a lie. The Golden Rule exists because there is no recovery from corrupted runtime state — only reconstruction from checkpoints, which is expensive and lossy.

## Historical Context

The 5-event restriction was derived from analyzing corruption incidents. Every unauthorized write to runtime state produced cascading failures: stale lock files, orphaned executions, duplicate ticket assignments, and false completion reports. The lock architecture prevents concurrent mutation; the event enumeration prevents unauthorized mutation.

## Future Evolution

M17 may introduce distributed lock coordination if multi-agent execution is supported. Until then, single-lock semantics are sufficient.

---

## Rules

| ID | Condition | Action | Severity |
|----|-----------|--------|----------|
| lock_acquisition_stale | locked === false OR expires_at < now | allow_lock_acquisition | HIGH |
| lock_acquisition_active | execution_active === false OR current_execution_is_lock_holder | allow_lock_acquisition | HIGH |
| lock_acquisition_ticket_exists | ticket_exists_in_system | allow_lock_acquisition | CRITICAL |
| lock_acquisition_dependencies | all_dependencies_in_COMPLETE_status | allow_lock_acquisition | CRITICAL |
| lock_release_terminal | status ∈ {COMPLETE, FAILED, ROLLED_BACK} | release_lock_automatically | HIGH |
| lock_release_ttl | TTL_expired AND no_heartbeat_15min | release_lock_automatically | MEDIUM |
| lock_release_override | human_operator_explicit_release | release_lock_with_logging | HIGH |

## Invariants

### golden_rule

**Expression:** `mutation_event ∈ permitted_events → lock_held ∧ execution_active`

**Severity:** CRITICAL

active-execution.json is the single source of truth. Only 5 events may mutate it. All other writes are protocol violations.

### lock_before_mutate

**Expression:** `mutation(active-execution.json) → lock_held_by_mutator`

**Severity:** CRITICAL

Before any mutation of active-execution.json, the mutator must hold the lock.

## Schemas

### execution_lock

```json
{
  "type": "object",
  "required": [
    "locked",
    "execution_id",
    "locked_at",
    "locked_by",
    "expires_at"
  ],
  "properties": {
    "locked": {
      "type": "boolean"
    },
    "execution_id": {
      "type": "string",
      "pattern": "^EXEC-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{3}$"
    },
    "locked_at": {
      "type": "string",
      "format": "date-time"
    },
    "locked_by": {
      "type": "string"
    },
    "expires_at": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

---

> **⚠️ AUTO-GENERATED DOCUMENT**  
> This markdown reflection was generated from `meta/governance/protocols/state-mutation.json`.  
> **DO NOT EDIT MANUALLY.** Edit the canonical JSON definition and run `npm run governance:generate`.  
