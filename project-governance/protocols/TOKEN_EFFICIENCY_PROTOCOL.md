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

# Token Efficiency Protocol

> **Authority:** `runtime-governance-kernel.md`  
> **Purpose:** Govern response resource consumption to prevent communication collapse.  
> **Principle:** Operational continuity over verbosity.  
> **Version:** 1.0.0  
> **Status:** Active

---

## 1. Core Principle

A successful execution with no final report is a **governance failure**.

The system must optimize for:
- **Operational continuity** over exhaustive reporting
- **Concise confirmation** over verbose projection
- **Guaranteed response** over maximal visibility

---

## 2. File Output Suppression

| File Size | Policy | Output Format |
|-----------|--------|---------------|
| **Small** (< 50 lines) | Inline display permitted if budget allows | `Wrote {path} ({lines} lines)` |
| **Medium** (50–150 lines) | Summarize structure, key excerpts only | `Wrote {path} ({lines} lines, {bytes} bytes). Sections: {count}. Key: {features}` |
| **Large** (> 150 lines) | **NEVER** inline full content | `Wrote {path} ({lines} lines, {bytes} bytes, sha256:{hash})` |

**Rule:** Full content display requires explicit operator request (`show {path}`).

---

## 3. Mandatory Response Reserve

The agent **MUST** reserve minimum response capacity for:

```yaml
RESPONSE_RESERVE:
  minimum_tokens: 1200
  reserved_for:
    - execution_complete_footer
    - integrity_audit_summary
    - checkpoint_confirmation
    - safe_exit_confirmation
    - operator_summary
    - error_report
```

**Rule:** If projected response exceeds available budget after reserve, suppress verbose content until budget is safe.

---

## 4. Projection Compression Rules

| Command | Lines Max | Content |
|---------|-----------|---------|
| `status` | 20 | Telemetry ping: runtime, lock, confidence, last execution, next action |
| `status --detail` | 80 | Full sections: state, audit, artifacts, risks, lineage |
| `status --full` | 200 | Everything + history + all projections (paginated if needed) |
| `status --json` | unlimited | Raw machine surface only (no human formatting) |

**Rule:** Default is always `status` (concise). Detailed modes are opt-in.

---

## 5. Artifact Summarization Policy

**Correct:**
```
Created meta/conventions/naming.md
  Lines: 231 | Bytes: 4414
  Sections: 14 regex patterns, migration path
  Validation: PASSED
```

**Incorrect:**
```
Created meta/conventions/naming.md
[231 lines of content dumped here]
```

**Rule:** Artifacts are summarized, not exhibited. Content is stored in full. Display is compressed.

---

## 6. Runtime Serialization Limits

```yaml
SERIALIZATION_LIMITS:
  max_inline_file_lines: 50
  max_total_projection_lines: 200
  max_execution_footer_lines: 40
  max_artifact_preview_lines: 20
  max_reasoning_visible_lines: 0
  max_preamble_lines: 2
```

**Rule:** Exceeding any limit triggers automatic suppression of the offending content.

---

## 7. Progressive Disclosure

```
Default:    concise projection (key facts only)
Level 1:    show {path} → excerpts + structure
Level 2:    show --full {path} → full content
Level 3:    cat {path} → raw file (explicit only)
```

**Rule:** No content is revealed beyond the operator's explicit request level.

---

## 8. Response Completion Guard

The agent **MUST NEVER** terminate a response without one of:

- Execution status
- Confirmation footer
- Explicit failure notice
- Concise acknowledgment

```yaml
RESPONSE_COMPLETION_GUARD:
  required_end_state:
    - operator_informed
    - runtime_state_acknowledged
    - next_action_clear_or_absent

  if_budget_low:
    prioritize:
      1. execution result (pass/fail)
      2. safe exit state
      3. checkpoint confirmation
      4. integrity status
    suppress:
      - verbose content
      - previews
      - examples
      - projections
      - reasoning
```

**Rule:** A silent or truncated response is a **CRITICAL** protocol violation.

---

## 9. Silent Failure Detection

If a response is at risk of truncation:

1. **STOP** adding content immediately
2. **EMIT** emergency footer with minimum viable status
3. **LOG** truncation risk in `runtime/execution-logs/truncation-warnings.jsonl`
4. **NEVER** leave the operator without any response

**Emergency footer format:**
```
[TRUNCATION RISK — EMERGENCY FOOTER]
Status: {runtime_status}
Last: {task_id} {status}
Audit: {checks_passed}/{checks_total}
Next: {next_action}
[Full report deferred — use 'status --json' for machine surface]
```

---

## 10. Integration

| Protocol | Integration Point |
|----------|-------------------|
| `EXECUTION_LIFECYCLE_PROTOCOL.md` | Footer generation follows serialization limits |
| `HEARTBEAT_POLICY.md` | Heartbeat display follows artifact summarization |
| `SAFE_EXIT_PROTOCOL.md` | Safe exit confirmation always emitted, never suppressed |
| `GOVERNANCE_GATES.md` | Gate 10: Response Budget Verified |
| `EXECUTION_AUTHORIZATION_PROTOCOL.md` | Authorization display follows progressive disclosure |

---

## 11. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-05-22 | Initial protocol. File suppression, response reserve, serialization limits, completion guard, silent failure detection. |
