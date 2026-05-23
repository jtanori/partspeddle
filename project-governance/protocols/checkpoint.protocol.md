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
  scope: recovery
  status: active
  version: 1.0.0
---

# Checkpoint Protocol

> **Authority:** `CANONICAL_AUTHORITY_HIERARCHY.md` Layer 2 → `runtime-governance-kernel.md`  
> **Purpose:** When checkpoints are written, what they contain, and how execution resumes from them.  
> **Version:** 1.0.0  
> **Status:** Active

> **Canonical Source:** `meta/governance/protocols/checkpoint.json`  
> **Generated:** 2026-05-23T00:45:39.141Z  

---

## Purpose

This protocol defines when checkpoints are written, what they contain, and how execution resumes from them. It ensures that **no work is lost to context window limits, user interruptions, or system failures**.

**Without this protocol:** Every interruption requires re-reading the entire codebase and re-reasoning from scratch.  
**With this protocol:** Interruption is a pause, not a reset.

## Philosophy

Checkpoints are not optional optimism. They are mandatory pessimism — the assumption that interruption is the default state of long-running execution. The checkpoint is the agent's "save state." Without it: anchorless drift, re-analysis loops, architecture re-invention.

## Historical Context

The 10 mandatory checkpoint triggers were derived from incident analysis. The most common failure mode was agents losing 30+ minutes of reasoning to context compaction because no checkpoint had been written. The 5-minute throttle prevents checkpoint spam while the 10-file / 30-minute hard limits prevent silent drift.

## Future Evolution

M14 may introduce automatic checkpoint emission via heartbeat integration, eliminating the need for manual checkpoint triggers.

---

## Checkpoint Triggers

### Mandatory Checkpoints

| Trigger | Condition | Description |
|---------|-----------|-------------|
| **before_architecture_mutation** | new directories or moved domains | Structural changes are hard to reverse. |
| **before_large_refactor** | refactor touching many files | Rollback without checkpoint is expensive. |
| **after_milestone_completion** | milestone reaches terminal state | Milestones are governance boundaries; state must persist. |
| **every_10_files** | files_modified_since_last_checkpoint >= 10 | File count proxy for complexity and drift risk. |
| **every_30_minutes** | execution_time_since_last_checkpoint >= 30 min | Time-based guardrail against silent drift. |
| **before_dependency_changes** | adding/removing dependencies | Affects entire dependency graph. |
| **before_db_migration** | database migration execution | Migrations are irreversible without down-migration. |
| **before_contract_lock_change** | CONTRACT_LOCK status change | Critical governance boundary. |
| **state_blocked** | transition to BLOCKED | Blocked state must be resumable when blocker clears. |
| **state_interrupted** | transition to INTERRUPTED | Required for resume after external halt. |

### Optional Checkpoints

| Trigger | Condition | Description |
|---------|-----------|-------------|
| **before_high_risk_deletion** | destructive file deletion | Deletions are destructive. |
| **after_complex_reasoning** | >3 reasoning cycles without file modification | Checkpoint reasoning state. |
| **user_request** | human demands checkpoint | Human-in-the-loop may demand at any time. |

## Rules

| ID | Condition | Action | Severity |
|----|-----------|--------|----------|
| throttle_min_interval | time_since_last_checkpoint < 5 minutes | skip non-mandatory checkpoint | MEDIUM |
| throttle_max_files | files_modified_since_last_checkpoint > 10 | MUST pause and write checkpoint | HIGH |
| throttle_max_time | execution_time_since_last_checkpoint > 30 minutes | MUST pause and write checkpoint | HIGH |

## Invariants

### checkpoint_supersedes_memory

**Expression:** `checkpoint_exists → resume_from_checkpoint`

**Severity:** CRITICAL

latest-checkpoint.json is the sole resumability anchor. It supersedes conversational memory.

### interrupted_always_checkpoints

**Expression:** `state = INTERRUPTED → checkpoint_emitted_immediately`

**Severity:** CRITICAL

Interrupted state must always trigger immediate checkpoint.

## Schemas

### checkpoint_payload

```json
{
  "type": "object",
  "required": [
    "CHECKPOINT"
  ],
  "properties": {
    "CHECKPOINT": {
      "type": "object",
      "required": [
        "metadata",
        "execution_state",
        "completed_work",
        "pending_work",
        "modified_files_snapshot",
        "rollback_point",
        "unresolved_risks",
        "next_safe_resume_step",
        "resume_contract"
      ],
      "properties": {
        "metadata": {
          "type": "object",
          "required": [
            "checkpoint_id",
            "protocol_version",
            "task_id",
            "milestone",
            "sequence_number",
            "timestamp",
            "trigger"
          ],
          "properties": {
            "checkpoint_id": {
              "type": "string",
              "pattern": "^cp_[A-Z0-9\\._]+_[0-9]{8}_[0-9]{6}_[a-z]+$"
            },
            "protocol_version": {
              "type": "string",
              "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
            },
            "task_id": {
              "type": "string",
              "pattern": "^T[0-9]+\\.[0-9A-Z]+$"
            },
            "milestone": {
              "type": "string",
              "pattern": "^M[0-9]+$"
            },
            "sequence_number": {
              "type": "integer",
              "minimum": 1
            },
            "timestamp": {
              "type": "string",
              "format": "date-time"
            },
            "trigger": {
              "type": "string",
              "enum": [
                "manual",
                "auto",
                "completion",
                "interruption",
                "drift",
                "heartbeat",
                "migration"
              ]
            }
          }
        },
        "execution_state": {
          "type": "object",
          "required": [
            "lifecycle_state",
            "phase",
            "current_surface"
          ],
          "properties": {
            "lifecycle_state": {
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
            "phase": {
              "type": "string"
            },
            "current_surface": {
              "type": "string",
              "enum": [
                "backend",
                "frontend-rsc",
                "frontend-client",
                "shared",
                "infrastructure",
                "ci-cd",
                "fullstack",
                "governance"
              ]
            },
            "reasoning_cycles_since_last_checkpoint": {
              "type": "integer",
              "minimum": 0
            },
            "files_modified_since_last_checkpoint": {
              "type": "integer",
              "minimum": 0
            }
          }
        },
        "completed_work": {
          "type": "object",
          "required": [
            "files_created",
            "files_modified",
            "files_deleted",
            "validations_passed",
            "validations_failed",
            "validations_skipped"
          ],
          "properties": {
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
            "validations_passed": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "validations_failed": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "validations_skipped": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          }
        },
        "pending_work": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "modified_files_snapshot": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "path": {
                "type": "string"
              },
              "checksum": {
                "type": "string"
              },
              "lines_added": {
                "type": "integer"
              },
              "lines_removed": {
                "type": "integer"
              }
            }
          }
        },
        "rollback_point": {
          "type": "string"
        },
        "unresolved_risks": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "next_safe_resume_step": {
          "type": "string"
        },
        "resume_contract": {
          "type": "string"
        }
      }
    }
  }
}
```

---

> **⚠️ AUTO-GENERATED DOCUMENT**  
> This markdown reflection was generated from `meta/governance/protocols/checkpoint.json`.  
> **DO NOT EDIT MANUALLY.** Edit the canonical JSON definition and run `npm run governance:generate`.  
