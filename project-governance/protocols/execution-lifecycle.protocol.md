---
authority:
  level: protocol
  layer: 2
  canonical: false
  supersedes: []
  derives_from:
    - runtime-governance-kernel
    - CANONICAL_AUTHORITY_HIERARCHY
  scope: execution
  status: active
  version: 1.0.0
---

# Execution Lifecycle Protocol

> **Authority:** `CANONICAL_AUTHORITY_HIERARCHY.md` Layer 2 → `runtime-governance-kernel.md`  
> **Purpose:** Canonical state machine, mandatory headers, and mandatory footers for every execution unit.  
> **Version:** 1.0.0  
> **Status:** Active

> **Canonical Source:** `meta/governance/protocols/execution-lifecycle.json`  
> **Generated:** 2026-05-23T00:45:39.194Z  

---

## Purpose

This protocol defines the canonical state machine, mandatory headers, and mandatory footers for every execution unit. It eliminates ambiguity in state semantics, forces contextual grounding at start-of-work, and enforces accountability at end-of-work.

**Without this protocol:** Agents drift, lose scope, hallucinate progress, and produce unresumable state.  
**With this protocol:** Every execution is bounded, traceable, checkpointed, and recoverable.

## Philosophy

The execution lifecycle is not a suggestion. It is a contract. Every state transition is auditable. Every header and footer is a declaration of intent and a record of completion. The state machine is canonical and immutable — no additional states may be introduced without a governance amendment.

## Historical Context

The nine-state model was derived from observing failure patterns in ungoverned AI execution: agents would start work without defining scope (missing READY), skip checkpoints (missing CHECKPOINT_PENDING), declare completion without validation (missing VERIFICATION), or resume from conversational memory instead of canonical state (missing INTERRUPTED handling).

## Future Evolution

M17 may introduce automated state transition validation through runtime hooks. Until then, state transitions are enforced through protocol adherence and completion report validation.

---

## Execution States

The following states are **canonical and immutable**. No additional states may be introduced without a governance amendment.

| State | Semantics | Entry Trigger | Exit Trigger |
|-------|-----------|---------------|--------------|
| **PLANNED** | Task exists in ticket system but has not been prepared for execution. | Ticket created and validated against schema. | Execution header written and dependencies satisfied. |
| **READY** | Task is prepared, dependencies are resolved, and execution may begin. | Dependencies complete; scope lock acquired; rollback point identified. | EXECUTION_START header emitted. |
| **EXECUTING** | Active work is in progress. File modifications, reasoning, and validation occur here. | EXECUTION_START acknowledged. | Work paused for checkpoint, blocked, failed, interrupted, or complete. |
| **CHECKPOINT_PENDING** | Work is paused to persist state before continuing. | Checkpoint trigger fired. | Checkpoint written and validated. |
| **BLOCKED** | Execution cannot continue due to an external dependency or unsatisfied precondition. | Blocker detected during execution. | Blocker resolved and scope re-validated. |
| **FAILED** | Execution terminated without achieving acceptance criteria. | Validation gate failed; unrecoverable error; drift detected. | Rollback executed or failure escalated. |
| **INTERRUPTED** | Execution halted by external event (context window, user stop, system failure). | Context compaction; user interruption; process termination. | Resume packet loaded; state reconstructed. |
| **COMPLETE** | Execution terminated successfully with all acceptance criteria met. | All validations passed; completion report generated. | None — terminal state. |
| **ROLLED_BACK** | Execution was reverted to a prior safe state. | Rollback triggered by FAILURE, DRIFT, or user escalation. | State restored; ticket returned to PLANNED or READY. |

### State Transition Rules

```
PLANNED → READY          (dependencies_resolved)
READY → EXECUTING          (EXECUTION_START_emitted)
EXECUTING → CHECKPOINT_PENDING          (checkpoint_trigger_fired)
CHECKPOINT_PENDING → EXECUTING          (checkpoint_validated)
EXECUTING → BLOCKED          (blocker_detected)
BLOCKED → EXECUTING          (blocker_cleared)
EXECUTING → FAILED          (unrecoverable_failure)
EXECUTING → INTERRUPTED          (external_halt)
EXECUTING → COMPLETE          (all_criteria_met)
FAILED → ROLLED_BACK          (rollback_executed)
INTERRUPTED → EXECUTING          (resume_successful)
INTERRUPTED → READY          (resume_failed)
ROLLED_BACK → PLANNED          (requeued)
```

**Forbidden transitions:**
- PLANNED → EXECUTING (Must pass through READY.)
- COMPLETE → * (Terminal state. No exit.)
- FAILED → COMPLETE (Must roll back first.)
- BLOCKED → COMPLETE (Must resume executing first.)

## Rules

| ID | Condition | Action | Severity |
|----|-----------|--------|----------|
| continuation_resolution_required | state = PLANNED | run scripts/resolve-continuation.ts before execution | CRITICAL |
| no_conversational_memory_start | state = PLANNED | reject execution from conversational memory or improvised selection | HIGH |

## Invariants

### no_idle_after_validation

**Expression:** `validation_passed → state ≠ IDLE`

**Severity:** CRITICAL

An idle runtime after successful validation is a governance violation.

### terminal_state_immutable

**Expression:** `state ∈ {COMPLETE, FAILED, ROLLED_BACK} → historical_state_immutable`

**Severity:** HIGH

Once a ticket reaches a terminal state, its execution history is immutable.

### header_required

**Expression:** `state = EXECUTING → execution_header_present`

**Severity:** CRITICAL

Every execution must begin with an EXECUTION_START header.

### footer_required

**Expression:** `state ∈ terminal → execution_footer_present`

**Severity:** CRITICAL

Every execution must end with an EXECUTION_COMPLETE footer.

## Schemas

### execution_header

```json
{
  "type": "object",
  "required": [
    "protocol_version",
    "timestamp",
    "task_id",
    "milestone",
    "surface",
    "scope",
    "dependencies",
    "estimated_risk",
    "rollback_available",
    "checkpoint_strategy",
    "acceptance_criteria",
    "resume_packet_loaded"
  ],
  "properties": {
    "protocol_version": {
      "type": "string",
      "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time"
    },
    "task_id": {
      "type": "string",
      "pattern": "^T[0-9]+\\.[0-9A-Z]+$"
    },
    "milestone": {
      "type": "string",
      "pattern": "^M[0-9]+$"
    },
    "domain": {
      "type": "string"
    },
    "surface": {
      "type": "string",
      "enum": [
        "frontend",
        "backend",
        "shared",
        "fullstack",
        "infrastructure",
        "governance",
        "ci-cd"
      ]
    },
    "scope": {
      "type": "object",
      "properties": {
        "in": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "minItems": 1
        },
        "out": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "dependencies": {
      "type": "object",
      "properties": {
        "resolved": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "external": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "estimated_risk": {
      "type": "string",
      "enum": [
        "LOW",
        "MEDIUM",
        "HIGH",
        "CRITICAL"
      ]
    },
    "rollback_available": {
      "type": "boolean"
    },
    "rollback_point": {
      "type": "string"
    },
    "checkpoint_strategy": {
      "type": "string"
    },
    "acceptance_criteria": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "minItems": 1
    },
    "contract_locks": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "resume_packet_loaded": {
      "type": "boolean"
    },
    "previous_checkpoint": {
      "type": "string"
    }
  }
}
```

### execution_footer

```json
{
  "type": "object",
  "required": [
    "protocol_version",
    "timestamp",
    "task_id",
    "status",
    "execution_duration_minutes",
    "files_created",
    "files_modified",
    "files_deleted",
    "validations_run",
    "blockers_encountered",
    "drift_detected",
    "resumable",
    "next_safe_action",
    "checkpoint_written",
    "governance_compliant",
    "completion_report_path"
  ],
  "properties": {
    "protocol_version": {
      "type": "string",
      "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time"
    },
    "task_id": {
      "type": "string",
      "pattern": "^T[0-9]+\\.[0-9A-Z]+$"
    },
    "status": {
      "type": "string",
      "enum": [
        "PLANNED",
        "READY",
        "EXECUTING",
        "CHECKPOINT_PENDING",
        "BLOCKED",
        "FAILED",
        "INTERRUPTED",
        "COMPLETE",
        "ROLLED_BACK"
      ]
    },
    "execution_duration_minutes": {
      "type": "integer",
      "minimum": 0
    },
    "files_created": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "files_modified": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "files_deleted": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "validations_run": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          },
          "result": {
            "type": "string",
            "enum": [
              "PASSED",
              "FAILED",
              "SKIPPED"
            ]
          },
          "reason": {
            "type": "string"
          }
        }
      }
    },
    "blockers_encountered": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "drift_detected": {
      "type": "boolean"
    },
    "drift_events": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "resumable": {
      "type": "boolean"
    },
    "next_safe_action": {
      "type": "string"
    },
    "checkpoint_written": {
      "type": "boolean"
    },
    "checkpoint_path": {
      "type": "string"
    },
    "governance_compliant": {
      "type": "boolean"
    },
    "completion_report_path": {
      "type": "string"
    }
  }
}
```

---

> **⚠️ AUTO-GENERATED DOCUMENT**  
> This markdown reflection was generated from `meta/governance/protocols/execution-lifecycle.json`.  
> **DO NOT EDIT MANUALLY.** Edit the canonical JSON definition and run `npm run governance:generate`.  
