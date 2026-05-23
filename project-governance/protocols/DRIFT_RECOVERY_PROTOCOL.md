---
authority:
  level: protocol
  layer: 2
  canonical: true
  supersedes: []
  derives_from:
    - ../CANONICAL_AUTHORITY_HIERARCHY.md
    - ../runtime/runtime-governance-kernel.md
  scope: recovery
  status: active
  version: 1.0.0
---

# Drift Recovery Protocol

> **Authority:** `HEARTBEAT_POLICY.md` Section 4.2, `EXECUTION_LIFECYCLE_PROTOCOL.md` Section 6.1  
> **Scope:** Detection, classification, and recovery from all forms of agent drift.  
> **Purpose:** This is the hardest and most important layer. Most AI systems fail here.  
> **Version:** 1.0.0  
> **Status:** Active

---

## 1. Purpose

This protocol defines how drift is detected, classified, and recovered. Drift is any deviation from planned execution that threatens correctness, scope, or architecture. Without a recovery protocol, drift accumulates until the system is ungovernable.

**Drift is not a bug. Drift is the default state of ungoverned AI execution.** This protocol makes recovery deterministic.

---

## 2. Drift Types

All drift events **MUST** be classified into exactly one of the following types:

### 2.1 Scope Drift

**Definition:** The agent is solving problems outside the current ticket's scope.

| Indicator | Example |
|-----------|---------|
| Files modified in unrelated domains | Ticket is "Frontend search" but agent modifies `src/backend/auth/` |
| Acceptance criteria ignored | Agent implements feature X when ticket requires feature Y |
| Scope creep without governance approval | Agent "while I'm here, I'll also refactor Z" |

**Severity:** Typically HIGH. Can escalate to CRITICAL if product runtime is affected.

### 2.2 Architecture Drift

**Definition:** The agent violates planned system design or architectural constraints.

| Indicator | Example |
|-----------|---------|
| Cross-domain imports | `marketplace/` imports from `transactions/domain/entities` |
| Surface violation | Backend code imported into frontend bundle |
| Contract violation | Shared contract modified without CONTRACT_LOCK escalation |
| Layer bypass | Domain logic leaked into UI layer |

**Severity:** HIGH or CRITICAL. Architecture drift compounds and becomes exponentially expensive to fix.

### 2.3 Dependency Drift

**Definition:** The agent adds, removes, or changes dependencies without planning or validation.

| Indicator | Example |
|-----------|---------|
| New npm package without ticket scope | Agent installs `lodash` when ticket is about CSS |
| New database dependency without migration plan | Agent adds Redis usage without migration or RLS review |
| Hidden dependency chain | Agent imports A, which imports B, which imports C (unplanned) |

**Severity:** MEDIUM to HIGH. Dependency drift creates invisible coupling.

### 2.4 Semantic Drift

**Definition:** The agent changes the meaning of contracts, APIs, or data structures without updating all consumers.

| Indicator | Example |
|-----------|---------|
| Schema change without consumer update | Zod schema modified but frontend validator not updated |
| API route behavior change | Route now returns 404 instead of 400 for same input |
| Type rename without migration | Type `ListingHit` renamed to `SearchHit` but index files still reference old name |

**Severity:** HIGH. Semantic drift causes runtime failures that tests may not catch.

### 2.5 Context Drift

**Definition:** The agent loses awareness of the current milestone, ticket, or execution surface.

| Indicator | Example |
|-----------|---------|
| Wrong surface | Agent writes backend code while in `frontend` surface mode |
| Wrong milestone references | Agent cites M2 architecture in M3 work |
| Reasoning from stale context | Agent references files that were deleted 3 checkpoints ago |
| Blueprint overload | Agent loads full 3000-line blueprint instead of 400-line REFERENCE.md |

**Severity:** MEDIUM to HIGH. Context drift is the precursor to all other drift types.

---

## 3. Drift Event Structure

Every drift event **MUST** be recorded with the following structure:

```yaml
DRIFT_EVENT:
  metadata:
    drift_id: "drift_T3.7_20260520_030100"
    protocol_version: "1.0.0"
    task_id: "T3.7"
    milestone: "M3"
    timestamp: "2026-05-20T03:01:00Z"
    detected_by: "heartbeat_self_assessment"   # heartbeat | checkpoint_gate | validation_failure | human_review | automation

  classification:
    type: "SCOPE_DRIFT"                        # SCOPE_DRIFT | ARCHITECTURE_DRIFT | DEPENDENCY_DRIFT | SEMANTIC_DRIFT | CONTEXT_DRIFT
    severity: "HIGH"                            # LOW | MEDIUM | HIGH | CRITICAL
    confidence: 85                              # 0-100, how certain the detector is

  detection:
    trigger: "files_modified_in_wrong_domain"
    evidence:
      - "Modified: src/backend/auth/middleware.ts (not in frontend scope)"
      - "Expected scope: tests/e2e/frontend/, playwright.config.ts"
    first_heartbeat_with_indicator: "hb_T3.7_20260520_025500"

  impact:
    affected_components:
      - "src/backend/auth/middleware.ts"
    blast_radius: "1 file, 0 runtime consumers"
    rollback_complexity: "SIMPLE"               # SIMPLE | MODERATE | COMPLEX | CATASTROPHIC

  recovery:
    rollback_required: true
    rollback_point: "git commit abc1234"
    recovery_sequence:
      - step: 1
        action: "git checkout abc1234 -- src/backend/auth/middleware.ts"
        verification: "git status shows clean working tree for auth/"
      - step: 2
        action: "Re-read frontend REFERENCE.md"
        verification: "Scope re-acknowledged"
      - step: 3
        action: "Resume from next_safe_resume_step in latest checkpoint"
        verification: "File modifications resume in correct domain"
    escalation_path: null                       # null if recoverable; otherwise human contact

  resolution:
    status: "RESOLVED"                          # OPEN | IN_RECOVERY | RESOLVED | ESCALATED
    resolved_at: "2026-05-20T03:05:00Z"
    resolution_method: "ROLLBACK_AND_RESUME"
    follow_up_required: false
```

### 3.1 Validation Rules

| Field | Required | Validation |
|-------|----------|------------|
| `drift_id` | Yes | Unique. Format: `drift_{task_id}_{YYYYMMDD}_{HHMMSS}`. |
| `classification.type` | Yes | Must be one of the 5 canonical types. |
| `classification.severity` | Yes | One of: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`. |
| `detection.evidence` | Yes | Non-empty array. Each item must be verifiable. |
| `recovery.rollback_required` | Yes | Boolean. If `true`, `rollback_point` must be set. |
| `recovery.recovery_sequence` | Yes | Non-empty array of concrete steps with verification. |
| `resolution.status` | Yes | One of: `OPEN`, `IN_RECOVERY`, `RESOLVED`, `ESCALATED`. |

---

## 4. Recovery Actions

### 4.1 Recovery by Severity

| Severity | Detection Response | Recovery Action | Escalation |
|----------|-------------------|-----------------|------------|
| **LOW** | Log in heartbeat. Continue with caution. | Self-correct on next action. No rollback. | None. |
| **MEDIUM** | Pause execution. Write checkpoint. | Re-evaluate scope. If drift persists > 5 min, rollback to last checkpoint. | None unless recovery fails. |
| **HIGH** | Halt execution. Write drift event. | Mandatory rollback to last checkpoint. Rehydrate context. Resume from `next_safe_resume_step`. | Log in `drift-events/`. |
| **CRITICAL** | Immediate halt. Preserve state. | Rollback to last known good state. Do NOT resume without human review. | Escalate to human. Block ticket. |

### 4.2 Recovery Sequence Template

Every recovery sequence must follow this pattern:

```
1. ISOLATE: Stop all file modifications.
2. PRESERVE: Write checkpoint immediately (even if invalid).
3. CLASSIFY: Determine drift type and severity using Section 2.
4. EVIDENCE: Collect git diff, heartbeat history, and reasoning log.
5. DECIDE:
   a. If SIMPLE rollback: execute git revert/checkout.
   b. If COMPLEX rollback: consult human before proceeding.
6. VERIFY: Confirm rollback succeeded (git status, diff review).
7. REHYDRATE: Load checkpoint, REFERENCE.md, runtime-state.
8. RESUME: From `next_safe_resume_step` in checkpoint.
9. ATTEST: Record drift event with resolution in `drift-events/`.
```

### 4.3 Rollback Policies

| Drift Type | Rollback Policy |
|------------|-----------------|
| Scope Drift | Git checkout affected files from `rollback_point`. Re-scope. |
| Architecture Drift | Revert all commits since last checkpoint. Re-plan architecture mutation. |
| Dependency Drift | Revert `package.json`, `package-lock.json`. Remove unplanned files. Re-install. |
| Semantic Drift | Revert all schema/API changes. Update consumers in same ticket or create follow-up. |
| Context Drift | Discard conversational memory. Load checkpoint + REFERENCE.md. Restart reasoning. |

---

## 5. Drift Event Storage

### 5.1 Directory Layout

```
project-governance/runtime/drift-events/
├── T3.7-drift-20260520_030100.json
├── T3.7-drift-20260520_031500.json
└── archive/
```

### 5.2 Retention Policy

- **Active drift events:** Retain for 90 days.
- **Archive:** Move to `archive/` after 90 days.
- **Permanent record:** CRITICAL drift events are never deleted. They are part of the governance audit trail.

---

## 6. Prevention

Drift recovery is expensive. Prevention is cheaper. The following measures are mandatory:

1. **EXECUTION_START header** forces scope acknowledgment before any work.
2. **Heartbeats** force self-assessment every 10 min / 5 files.
3. **Checkpoints** bound the blast radius of any drift event.
4. **Governance Gates** block completion if drift is undetected.
5. **Surface Switch Protocol** (from AGENTS.md) prevents cross-surface drift.
6. **Domain Switch Protocol** prevents cross-domain imports.

---

## 7. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-05-20 | Initial protocol. 5 drift types, severity-based recovery, mandatory rollback policies, prevention measures. |
