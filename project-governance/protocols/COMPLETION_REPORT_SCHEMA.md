---
authority:
  level: protocol
  layer: 2
  canonical: true
  supersedes:
    -
  derives_from:
    - runtime-governance-kernel.md
  scope: governance
  status: active
  version: "1.0.0"
---

# Completion Report Schema

> **Authority:** `EXECUTION_LIFECYCLE_PROTOCOL.md` Section 4  
> **Scope:** Explicit completion semantics for every execution unit.  
> **Purpose:** Eliminate the "Kimi drift problem" — agents declaring completion without proving it.  
> **Version:** 1.0.0  
> **Status:** Active

---

## 1. Purpose

The completion report is the **contract of done**. It forces the agent to:

1. Inventory every artifact touched.
2. Disclose every validation result.
3. Separate verified facts from inferred assumptions.
4. Quantify confidence.
5. Identify the next safe action.

**Without this schema:** Completion is a subjective declaration.  
**With this schema:** Completion is an auditable, reproducible claim backed by evidence.

---

## 2. Minimum Report Structure

Every completion report **MUST** contain the following top-level sections. Omitting any section is a schema violation.

```yaml
completion_report:
  metadata:
    protocol_version: "1.0.0"
    task_id: "T3.7"
    milestone: "M3"
    generated_at: "2026-05-20T02:45:00Z"
    execution_duration_minutes: 55
    agent_session_id: "session_abc123"

  summary:
    status: "COMPLETE"
    one_line: "Implemented Playwright E2E tests and MSW mock infrastructure."
    confidence_score: 95          # 0-100
    risk_level: "LOW"             # LOW | MEDIUM | HIGH | CRITICAL

  artifact_inventory:
    created:
      - path: "tests/e2e/frontend/homepage.spec.ts"
        description: "Homepage load and listing display E2E test"
        type: "test"
        validated: true
      - path: "tests/mocks/handlers.ts"
        description: "MSW API mock handlers"
        type: "test"
        validated: true
    modified:
      - path: "playwright.config.ts"
        description: "Playwright configuration"
        type: "config"
        validated: true
    deleted: []

  validation_report:
    passed:
      - name: "typecheck"
        command: "npm run typecheck"
        evidence: "tsc --noEmit exited 0"
      - name: "test:unit"
        command: "npm run test:unit"
        evidence: "47 tests passed, 0 failed"
    failed: []
    skipped:
      - name: "lint"
        reason: "Environmental timeout per Incidental Failure Policy"
        ticket_reference: "T0.5.1"

  assumption_disclosure:
    verified:
      - "Playwright browsers are installed (verified: Chromium present)"
      - "Algolia env vars are available in CI (verified: .env.example matches)"
    inferred:
      - "MSW handlers cover all API surfaces used by frontend (inferred: coverage not exhaustive)"
    unverified:
      - "E2E tests will pass in CI with identical timing to local (unverified: CI runner may be slower)"

  unresolved_items:
    blockers: []
    technical_debt:
      - "Firefox/WebKit browsers not installed (deferred per ticket scope)"
    follow_up_tickets:
      - "T3.8 — Cross-browser E2E coverage"

  drift_assessment:
    drift_detected: false
    drift_events: []
    scope_adherence: "STRICT"
    architecture_consistency: "MAINTAINED"

  resumability:
    resumable: false
    resume_path: null
    reason: "Terminal state — no pending work."

  next_safe_action:
    action: "CLOSE_TICKET_AND_COMMIT"
    description: "All acceptance criteria met. Commit atomic changes and mark ticket complete."
    estimated_effort_minutes: 5

  governance_attestation:
    checkpoint_written: true
    checkpoint_path: "project-governance/runtime/checkpoints/T3.7-checkpoint.json"
    heartbeat_emitted: true
    artifact_inventory_complete: true
    validations_executed: true
    rollback_available: true
    resumable_state_verified: true
    drift_analysis_completed: true
    gates_passed: 8
    gates_total: 8
```

---

## 3. Required Sections

### 3.1 Artifact Inventory

Every file created, modified, or deleted must be listed with:

```yaml
artifact_inventory:
  created:
    - path: "relative/path/from/repo/root"
      description: "Human-readable purpose"
      type: "test"                # code | test | config | doc | schema | script
      validated: true             # boolean: was this file verified to exist and function?
  modified:
    - path: "..."
      description: "..."
      type: "config"
      validated: true
  deleted:
    - path: "..."
      description: "..."
      reason: "Why this file was removed"
```

**Rule:** The sum of `created` + `modified` + `deleted` must match `git diff --name-status` for the execution scope. Discrepancies must be explained in `unresolved_items`.

### 3.2 Validation Report

Every validation gate attempted must be recorded:

```yaml
validation_report:
  passed:
    - name: "typecheck"
      command: "npm run typecheck"
      evidence: "Exact output or exit code"
  failed:
    - name: "test:integration"
      command: "npm run test:integration"
      evidence: "Redis unavailable — infra preflight skipped tests gracefully"
      severity: "NON_BLOCKING"      # BLOCKING | NON_BLOCKING
      mitigation: "Deferred per Incidental Failure Policy"
  skipped:
    - name: "e2e"
      reason: "Backend not running in current session"
```

**Rule:** If any `BLOCKING` validation failed, `summary.status` must be `FAILED`, not `COMPLETE`.

### 3.3 Assumption Disclosure

This section is **critical** for preventing drift. AI agents constantly blur assumptions and facts. This forces explicit separation.

```yaml
assumption_disclosure:
  verified:
    - "Statement of fact with evidence of verification"
  inferred:
    - "Statement derived from pattern matching without direct evidence"
  unverified:
    - "Statement accepted as true without verification"
```

**Rule:** The presence of `unverified` assumptions does not block completion, but it **must** trigger a `follow_up_ticket` if the assumption affects correctness.

---

## 4. Confidence Scoring

The `confidence_score` (0–100) is not optional. It must be derived from:

| Factor | Weight | Calculation |
|--------|--------|-------------|
| Validation pass rate | 40% | `passed / (passed + failed + skipped)` |
| Assumption verification rate | 30% | `verified / (verified + inferred + unverified)` |
| Scope adherence | 20% | `100` if strict, `75` if minor scope creep, `50` if major creep |
| Drift absence | 10% | `100` if no drift, `0` if drift detected |

**Minimum confidence for COMPLETE status:** 70.  
**If confidence < 70:** Status must be `FAILED` or `INTERRUPTED` with a replanning requirement.

---

## 5. Unresolved Items

Honesty about incomplete work is mandatory. This section captures:

- **Blockers:** External dependencies that prevented full completion.
- **Technical debt:** Known shortcuts or deferred work.
- **Follow-up tickets:** New tickets that must be created to address gaps.

**Rule:** If `blockers` is non-empty, `summary.status` cannot be `COMPLETE`.

---

## 6. Governance Attestation

The final section is a checklist that maps directly to GOVERNANCE_GATES.md. It is the agent's sworn statement that all gates were considered.

```yaml
governance_attestation:
  checkpoint_written: true
  checkpoint_path: "..."
  heartbeat_emitted: true
  artifact_inventory_complete: true
  validations_executed: true
  rollback_available: true
  resumable_state_verified: true
  drift_analysis_completed: true
  gates_passed: 8
  gates_total: 8
  gate_results:
    - id: "GATE_CHECKPOINT"
      result: "PASSED"
    - id: "GATE_HEARTBEAT"
      result: "PASSED"
    - id: "GATE_VALIDATIONS"
      result: "PASSED"
    - id: "GATE_ROLLBACK"
      result: "PASSED"
    - id: "GATE_ARTIFACTS"
      result: "PASSED"
    - id: "GATE_RESUMABLE"
      result: "PASSED"
    - id: "GATE_DRIFT"
      result: "PASSED"
    - id: "GATE_COMPLETION_REPORT"
      result: "PASSED"
```

**Rule:** `gates_passed` must equal `gates_total` for `COMPLETE` status. If any gate failed, status is `FAILED` and rollback may be required.

---

## 7. File Location

Completion reports must be written to:

```
project-governance/runtime/completion-reports/{task_id}-completion.yaml
```

If the task is interrupted, the partial completion report may be used as a resume packet (see CHECKPOINT_PROTOCOL.md).

---

## 8. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-05-20 | Initial schema. Artifact inventory, validation report, assumption disclosure, confidence scoring. |
