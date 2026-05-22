# Governance Gates

> **Authority:** `EXECUTION_LIFECYCLE_PROTOCOL.md` Section 6, `runtime-governance-kernel.md` Section 3  
> **Scope:** Mandatory validation gates that turn governance from suggestions into runtime law.  
> **Purpose:** No task closes unless all gates pass.  
> **Version:** 1.0.0  
> **Status:** Active

---

## 1. Purpose

Governance gates are the **enforcement layer**. They are not advisory. They are mandatory. If any gate fails, the task **cannot** be marked `COMPLETE`.

**Without gates:** Agents self-declare completion. Drift goes undetected. Quality is inconsistent.  
**With gates:** Completion is a binary, verifiable, reproducible state.

---

## 2. Gate Definitions

The following 10 gates **MUST** be validated before any task can transition to `COMPLETE`.

### Gate 0: Execution Authorized

| Attribute | Value |
|-----------|-------|
| **ID** | `GATE_AUTHORIZATION` |
| **Question** | Was execution explicitly authorized by the human operator? |
| **Validation** | Authorization token exists in execution log. Input matches authorized trigger list in EXECUTION_AUTHORIZATION_PROTOCOL.md. |
| **Failure Action** | Abort execution. Release lock if acquired. Revert state. Emit ambiguity warning. |
| **Rationale** | Unauthorized execution is the highest-risk failure mode in autonomous systems. |

### Gate 1: Repository Validated

| Attribute | Value |
|-----------|-------|
| **ID** | `GATE_REPOSITORY` |
| **Question** | Is the repository in a valid execution state? |
| **Validation** | Worktree clean (`git status --porcelain` empty). Branch matches ticket. At least one semantic commit exists. |
| **Failure Action** | Block execution. Require `git commit` or branch correction before proceeding. |
| **Rationale** | Uncommitted work destroys auditability and rollback clarity. |

### Gate 2: Checkpoint Written

| Attribute | Value |
|-----------|-------|
| **ID** | `GATE_CHECKPOINT` |
| **Question** | Was a checkpoint written after the last meaningful work? |
| **Validation** | `checkpoint_written: true` in completion report. `checkpoint_path` exists and validates against schema. |
| **Failure Action** | Write checkpoint now. Block completion until validated. |
| **Rationale** | Without a checkpoint, the work is not resumable. |

### Gate 3: Heartbeat Emitted

| Attribute | Value |
|-----------|-------|
| **ID** | `GATE_HEARTBEAT` |
| **Question** | Was at least one heartbeat emitted during this execution? |
| **Validation** | Heartbeat file exists in `runtime/heartbeats/`. Sequence number ≥ 1. |
| **Failure Action** | Emit heartbeat now. Block completion. |
| **Rationale** | Heartbeats are the evidence that execution was observed. |

### Gate 4: Validations Executed

| Attribute | Value |
|-----------|-------|
| **ID** | `GATE_VALIDATIONS` |
| **Question** | Were all validations defined in the ticket run? |
| **Validation** | `validations_run` in completion report matches ticket acceptance criteria. No `BLOCKING` failures unaddressed. |
| **Failure Action** | Run missing validations. Fix failures. Re-run. |
| **Rationale** | Acceptance criteria are meaningless without validation evidence. |

### Gate 5: Rollback Available

| Attribute | Value |
|-----------|-------|
| **ID** | `GATE_ROLLBACK` |
| **Question** | Can the work be reverted to a known good state? |
| **Validation** | `rollback_available: true` in completion report. `rollback_point` is a valid git commit. `git status` shows no uncommitted changes that would prevent revert. |
| **Failure Action** | Commit current work to a feature branch. Tag commit. Update `rollback_point`. |
| **Rationale** | Every execution must be reversible. |

### Gate 6: Artifact Inventory Complete

| Attribute | Value |
|-----------|-------|
| **ID** | `GATE_ARTIFACTS` |
| **Question** | Does the artifact inventory match actual file system state? |
| **Validation** | `artifact_inventory.created` + `modified` + `deleted` matches `git diff --name-status`. All `created` files exist. All `deleted` files do not exist. |
| **Failure Action** | Reconcile inventory with git state. Explain discrepancies in `unresolved_items`. |
| **Rationale** | Agents hallucinate file creation. Inventory proves what actually happened. |

### Gate 7: Resumable State Verified

| Attribute | Value |
|-----------|-------|
| **ID** | `GATE_RESUMABLE` |
| **Question** | If execution were interrupted now, could it resume correctly? |
| **Validation** | Latest checkpoint has `resume_contract.can_resume_from_this_checkpoint: true`. `next_safe_resume_step` is concrete and bounded. |
| **Failure Action** | Write or repair checkpoint. Ensure `next_safe_resume_step` is valid. |
| **Rationale** | The final state must be as resumable as any intermediate state. |

### Gate 8: Drift Analysis Completed

| Attribute | Value |
|-----------|-------|
| **ID** | `GATE_DRIFT` |
| **Question** | Was drift self-assessment performed and passed? |
| **Validation** | `drift_detected: false` in completion report, OR `drift_events` array with all events in `RESOLVED` status. |
| **Failure Action** | If drift detected: classify, recover, write drift event, verify resolution. |
| **Rationale** | Undetected drift is the primary failure mode of AI systems. |

### Gate 9: Completion Report Generated

| Attribute | Value |
|-----------|-------|
| **ID** | `GATE_COMPLETION_REPORT` |
| **Question** | Does the completion report exist, validate against schema, and cover all required sections? |
| **Validation** | File exists at `runtime/completion-reports/{task_id}-completion.yaml`. Validates against `COMPLETION_REPORT_SCHEMA.md`. All required sections present. `governance_attestation.gates_passed == gates_total`. |
| **Failure Action** | Generate or repair completion report. |
| **Rationale** | The completion report is the contract of done. Without it, completion is unprovable. |

### Gate 10: Human Notification

| Attribute | Value |
|-----------|-------|
| **ID** | `GATE_HUMAN_NOTIFICATION` |
| **Question** | Was the operator explicitly informed of execution results? |
| **Validation** | Terminal response contains `EXECUTION_COMPLETE` footer. Audit results visible. Next safe action stated. |
| **Failure Action** | Re-emit completion footer with all required sections. |
| **Rationale** | Silent execution without operator visibility is a governance failure. |

---

## 3. Gate Execution Order

Gates are evaluated in a specific order. Early gates are cheap to validate; later gates are expensive. If an early gate fails, later gates are skipped.

```
0.  GATE_AUTHORIZATION       (cheap: token check)
1.  GATE_REPOSITORY          (cheap: git status)
2.  GATE_CHECKPOINT          (cheap: file existence)
3.  GATE_HEARTBEAT           (cheap: file existence)
4.  GATE_COMPLETION_REPORT   (medium: schema validation)
5.  GATE_ARTIFACTS           (medium: git diff reconciliation)
6.  GATE_VALIDATIONS         (expensive: command execution)
7.  GATE_ROLLBACK            (cheap: git validation)
8.  GATE_RESUMABLE           (medium: checkpoint contract validation)
9.  GATE_DRIFT               (expensive: drift event analysis)
10. GATE_HUMAN_NOTIFICATION  (cheap: footer check)
```

### 3.1 Short-Circuit Behavior

If Gate 1 fails, Gates 2–10 are **not evaluated**. The agent must fix Gate 1 and restart the gate sequence.

If any gate fails, the task **cannot** be `COMPLETE`. Status must be `FAILED` or `INTERRUPTED`.

---

## 4. Gate Results

### 4.1 Result Structure

```yaml
GATE_RESULT:
  task_id: "T3.7"
  timestamp: "2026-05-20T02:45:00Z"
  overall_result: "PASSED"          # PASSED | FAILED | PARTIAL
  gates:
    - id: "GATE_REPOSITORY"
      name: "Repository Validated"
      result: "PASSED"
      evidence: "worktree clean, branch feature/T3.7-frontend-tests, 3 semantic commits"
    - id: "GATE_CHECKPOINT"
      name: "Checkpoint Written"
      result: "PASSED"
      evidence: "checkpoints/T3.7-checkpoint-seq-3.json exists and validates"
    - id: "GATE_HEARTBEAT"
      name: "Heartbeat Emitted"
      result: "PASSED"
      evidence: "heartbeats/T3.7-heartbeat-seq-4.json exists"
    - id: "GATE_VALIDATIONS"
      name: "Validations Executed"
      result: "PASSED"
      evidence: "typecheck passed, test:unit passed, lint skipped (non-blocking)"
    - id: "GATE_ROLLBACK"
      name: "Rollback Available"
      result: "PASSED"
      evidence: "rollback_point: abc1234, working tree clean"
    - id: "GATE_ARTIFACTS"
      name: "Artifact Inventory Complete"
      result: "PASSED"
      evidence: "3 created, 1 modified, 0 deleted — matches git diff"
    - id: "GATE_RESUMABLE"
      name: "Resumable State Verified"
      result: "PASSED"
      evidence: "resume_contract valid, next_safe_resume_step defined"
    - id: "GATE_DRIFT"
      name: "Drift Analysis Completed"
      result: "PASSED"
      evidence: "drift_detected: false"
    - id: "GATE_COMPLETION_REPORT"
      name: "Completion Report Generated"
      result: "PASSED"
      evidence: "completion-reports/T3.7-completion.yaml validates against schema"
    - id: "GATE_HUMAN_NOTIFICATION"
      name: "Human Notification"
      result: "PASSED"
      evidence: "EXECUTION_COMPLETE footer emitted with audit results"
```

### 4.2 Failure Handling

| Overall Result | Allowed Task Status | Next Action |
|----------------|---------------------|-------------|
| **PASSED** | `COMPLETE` | Commit work. Mark ticket complete. Update runtime-state. |
| **PARTIAL** | `INTERRUPTED` or `BLOCKED` | Some gates passed but not all. Fix failures and re-evaluate. |
| **FAILED** | `FAILED` or `ROLLED_BACK` | One or more gates failed. Rollback may be required. Do NOT mark complete. |

---

## 5. Automation Roadmap

These gates are designed to be machine-validated. Future automation will:

1. Parse `EXECUTION_COMPLETE` footer.
2. Load `completion-reports/{task_id}-completion.yaml`.
3. Read `runtime/state/active-execution.json` for execution state.
4. Validate each gate programmatically:
   - Gate 1: `fs.existsSync(checkpoint_path)`
   - Gate 2: `fs.existsSync(heartbeat_path)`
   - Gate 3: Spawn `npm run typecheck`, `npm run test:unit`, etc.
   - Gate 4: `git rev-parse --verify rollback_point`
   - Gate 5: `git diff --name-status` vs. artifact inventory
   - Gate 6: Validate checkpoint schema + resume contract
   - Gate 7: Check `drift-events/` for unresolved events
   - Gate 8: YAML schema validation

Until automation exists, the agent **MUST** self-attest gate passage in the completion report. Human review validates.

**Canonical state for validation:** `project-governance/runtime/state/active-execution.json`

---

## 6. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-05-20 | Initial gates. 8 mandatory gates, execution order, short-circuit behavior, result structure. |
