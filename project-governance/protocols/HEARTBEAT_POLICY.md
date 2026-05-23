---
authority:
  level: protocol
  layer: 2
  canonical: true
  supersedes: []
  derives_from:
    - runtime-governance-kernel.md
  scope: governance
  status: active
  version: 1.0.0
---

# Heartbeat Policy

> **Authority:** `EXECUTION_LIFECYCLE_PROTOCOL.md` Section 4.1, `runtime-governance-kernel.md` Section 15  
> **Scope:** Operational telemetry to prevent silent drift and hallucinated progress.  
> **Purpose:** Force runtime introspection at regular intervals.  
> **Version:** 1.0.0  
> **Status:** Active

---

## 1. Purpose

The heartbeat is the **pulse of execution**. It forces the agent to:

1. Report actual progress vs. planned progress.
2. Declare blockers before they become failures.
3. Self-assess drift risk.
4. Quantify confidence.
5. Affirm that execution is still occurring and still valid.

**Without heartbeats:** Agents can silently drift for hours, modify files off-scope, or hallucinate completion of work that was never done.  
**With heartbeats:** Every execution unit is continuously observable and self-correcting.

---

## 2. Heartbeat Intervals

A heartbeat **MUST** be emitted when **any** of the following conditions is met:

| Condition | Threshold | Rationale |
|-----------|-----------|-----------|
| **Time elapsed** | 10 minutes | Time-based guardrail against silent stalls. |
| **Files modified** | 5 files | File-count proxy for complexity accumulation. |
| **Architecture mutation** | 1 mutation | Structural changes require immediate verification. |
| **State transition** | Any transition | State changes must be telemetered. |
| **Drift suspicion** | Any suspicion | If the agent suspects drift, it must report immediately. |

**Rule:** The first condition to occur triggers the heartbeat. Whichever comes first.

### 2.1 Throttling

- Minimum interval between heartbeats: **3 minutes**.
- If multiple triggers fire within 3 minutes, emit **one** heartbeat with all triggers noted.
- Exception: `Drift suspicion` always triggers an immediate heartbeat, bypassing the throttle.

---

## 3. Heartbeat Payload

Every heartbeat **MUST** contain the following structure:

```yaml
HEARTBEAT:
  metadata:
    heartbeat_id: "hb_T3.7_20260520_025500"
    protocol_version: "1.0.0"
    task_id: "T3.7"
    milestone: "M3"
    sequence_number: 4
    timestamp: "2026-05-20T02:55:00Z"
    trigger: "time_elapsed"       # time_elapsed | files_modified | architecture_mutation | state_transition | drift_suspicion

  active_task:
    description: "Write search E2E test"
    progress_percent: 65
    files_touched_since_last_heartbeat: 3
    files_touched_total: 8
    current_surface: "frontend"
    current_phase: "implementation"

  blockers:
    active: []
    resolved_since_last_heartbeat:
      - "Algolia env var availability confirmed"

  drift_risk:
    level: "LOW"                  # NONE | LOW | MEDIUM | HIGH | CRITICAL
    indicators: []
    mitigations_active: []

  confidence:
    score: 88                     # 0-100
    trend: "STABLE"               # RISING | STABLE | FALLING
    primary_concern: null

  still_executing: true
  execution_health: "HEALTHY"     # HEALTHY | DEGRADED | AT_RISK | FAILED

  drift_self_assessment:
    still_within_scope: true
    unauthorized_changes: false
    speculative_reasoning_detected: false
    architecture_consistency: "MAINTAINED"
    assumption_count_since_last_heartbeat: 1

  next_expected_heartbeat:
    trigger_condition: "files_modified"
    estimated_time: "2026-05-20T03:05:00Z"
```

### 3.1 Payload Validation Rules

| Field | Required | Validation |
|-------|----------|------------|
| `heartbeat_id` | Yes | Unique. Format: `hb_{task_id}_{YYYYMMDD}_{HHMMSS}`. |
| `sequence_number` | Yes | Integer ≥ 1. Monotonically increasing per task. |
| `trigger` | Yes | Must be one of the defined triggers in Section 2. |
| `progress_percent` | Yes | Integer 0–100. Must not decrease between heartbeats. |
| `drift_risk.level` | Yes | One of: `NONE`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`. |
| `confidence.score` | Yes | Integer 0–100. |
| `still_executing` | Yes | Boolean. `false` only if the agent is yielding control. |
| `drift_self_assessment` | Yes | All sub-fields required. |

---

## 4. Mandatory Drift Self-Assessment

The heartbeat is not merely progress reporting. It is **runtime introspection**. The agent MUST answer:

### 4.1 Self-Assessment Questions

| Question | Field | Truth Standard |
|----------|-------|----------------|
| Are we still within scope? | `still_within_scope` | If `false`, execution halts and DRIFT_RECOVERY_PROTOCOL.md is invoked. |
| Have we made unauthorized changes? | `unauthorized_changes` | If `true`, list them in `drift_events/` and halt. |
| Has speculative reasoning replaced concrete action? | `speculative_reasoning_detected` | If `true`, the agent has been planning without modifying files for >5 min. |
| Is architecture consistency maintained? | `architecture_consistency` | `VIOLATED` triggers architecture drift recovery. |

### 4.2 Drift Risk Escalation

| Drift Risk Level | Trigger Condition | Required Action |
|------------------|-------------------|-----------------|
| **NONE** | No indicators. | Continue execution. |
| **LOW** | Minor assumption introduced. | Log assumption in heartbeat. Continue with caution. |
| **MEDIUM** | Scope creep suspected; 1+ unauthorized file touched. | Pause. Write checkpoint. Re-evaluate scope. |
| **HIGH** | Major scope violation; speculative reasoning > 10 min; architecture violated. | Halt execution. Invoke DRIFT_RECOVERY_PROTOCOL.md. |
| **CRITICAL** | Irreversible mutation off-scope; data loss risk; security violation. | Immediate halt. Rollback to last checkpoint. Escalate to human. |

---

## 5. Heartbeat Storage

### 5.1 Directory Layout

```
project-governance/runtime/heartbeats/
├── T3.7-heartbeat-seq-1.json
├── T3.7-heartbeat-seq-2.json
├── T3.7-heartbeat-seq-3.json
├── T3.7-heartbeat-seq-4.json
└── archive/
```

### 5.2 Retention Policy

- **Active heartbeats:** Retain for 14 days after task completion.
- **Archive:** Move to `archive/` after 14 days.
- **Deletion:** Permitted 30 days after milestone completion.

### 5.3 Naming Convention

```
{task_id}-heartbeat-seq-{sequence_number}.json
```

---

## 6. Heartbeat Enforcement

### 6.1 Missing Heartbeat Detection

If more than **15 minutes** elapse without a heartbeat, the execution is considered **DEGRADED**.

If more than **30 minutes** elapse without a heartbeat, the execution is considered **AT_RISK** and a checkpoint must be written immediately on resume.

### 6.2 Stale Heartbeat Detection

If a heartbeat claims `still_executing: true` but no file modifications have occurred in the last 10 minutes, the agent is **speculating**. This triggers:

1. `speculative_reasoning_detected: true` in the next heartbeat.
2. Mandatory checkpoint before continuing.
3. If speculation persists > 15 minutes, execution is INTERRUPTED and a replan is required.

---

## 7. Integration with Other Protocols

| Protocol | Integration Point |
|----------|-------------------|
| `EXECUTION_LIFECYCLE_PROTOCOL.md` | Heartbeat emitted during `EXECUTING` state. State transitions trigger heartbeats. |
| `CHECKPOINT_PROTOCOL.md` | High drift risk triggers checkpoint. Missing heartbeats trigger checkpoint on resume. |
| `DRIFT_RECOVERY_PROTOCOL.md` | `drift_risk: HIGH` or `CRITICAL` invokes drift recovery. |
| `COMPLETION_REPORT_SCHEMA.md` | Heartbeat sequence is evidence in `validation_report`. |
| `STATE_MUTATION_RULES.md` | Heartbeat is Event 1 — one of 5 permitted mutations of `runtime/state/active-execution.json`. |
| `SAFE_EXIT_PROTOCOL.md` | Final heartbeat is emitted during safe exit flush step. |

---

## 8. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-05-20 | Initial policy. 5 trigger conditions, drift self-assessment, escalation matrix. |
