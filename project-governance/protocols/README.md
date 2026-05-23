---
authority:
  level: guide
  layer: 2
  canonical: true
  supersedes: []
  derives_from: []
  scope: governance
  status: active
  version: 1.0.0
---

# Runtime Governance Protocols

> **Purpose:** The operational control-plane for autonomous AI execution.  
> **Read order:** 1 → 2 → 3 → 4 → 5 → 6  
> **Authority:** `runtime-governance-kernel.md`

---

## Protocol Index

| # | Protocol | File | Purpose |
|---|----------|------|---------|
| 1 | **Execution Lifecycle** | `EXECUTION_LIFECYCLE_PROTOCOL.md` | Canonical state machine, mandatory header/footer for all work. |
| 2 | **Completion Report** | `COMPLETION_REPORT_SCHEMA.md` | Explicit completion semantics — artifact inventory, validation evidence, assumption disclosure. |
| 3 | **Checkpoint / Resume** | `CHECKPOINT_PROTOCOL.md` | State persistence and interruption recovery. |
| 4 | **Heartbeat** | `HEARTBEAT_POLICY.md` | Operational telemetry — progress, blockers, drift self-assessment. |
| 5 | **Drift Recovery** | `DRIFT_RECOVERY_PROTOCOL.md` | Detection, classification, and recovery from all drift types. |
| 6 | **Governance Gates** | `../enforcement/GOVERNANCE_GATES.md` | Mandatory validation gates that block task closure until passed. |
| 7 | **State Mutation Rules** | `STATE_MUTATION_RULES.md` | Who and what may mutate `active-execution.json`. Lock architecture. |
| 8 | **Safe Exit** | `SAFE_EXIT_PROTOCOL.md` | Transactional exit into resumable quiescent state. Bootstrap file. Resume instruction. |

## Templates

Located in `../templates/`:

- `checkpoint-template.yaml`
- `heartbeat-template.yaml`
- `completion-template.yaml`
- `drift-event-template.yaml`

## Runtime State Directories

- `../runtime/heartbeats/` — Heartbeat event logs
- `../runtime/execution-logs/` — State transition logs
- `../runtime/drift-events/` — Drift event records
- `../runtime/completion-reports/` — Completion reports
- `../runtime/checkpoints/` — Execution checkpoints (pre-existing)

## Version

All protocols: **v1.0.0**  
Established: 2026-05-20
