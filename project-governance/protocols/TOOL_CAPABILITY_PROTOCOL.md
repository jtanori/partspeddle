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

# Tool Capability Protocol

> **Authority:** `runtime-governance-kernel.md`  
> **Purpose:** Governed deterministic tool delegation — LLM composes pre-approved capabilities, NEVER arbitrary shell.  
> **Principle:** LLM is control plane. Tools are capability-scoped syscalls. Enforcement is mandatory.  
> **Version:** 1.0.0  
> **Status:** Active

---

## 1. Architecture

Three layers:

```
┌─────────────────────────────────────────┐
│  Layer 1 — LLM (Control Plane)          │
│  Decides intent. Plans execution.       │
│  Validates constraints. Interprets.     │
│  NEVER directly performs dangerous ops. │
├─────────────────────────────────────────┤
│  Layer 2 — Deterministic Tooling        │
│  Single-purpose, bounded, audited       │
│  scripts with structured JSON output.   │
├─────────────────────────────────────────┤
│  Layer 3 — Enforcement Layer            │
│  Read/write scope, timeout, network,    │
│  output limits, dry-run support.        │
└─────────────────────────────────────────┘
```

---

## 2. Capability Registry

The canonical registry lives at `meta/tools/capability-registry.yaml`.

Each capability declares:

| Field | Purpose |
|-------|---------|
| `command` | Executable path (relative to repo root) |
| `access.read` | Allowed read paths |
| `access.write` | Allowed write paths |
| `timeout` | Maximum execution time |
| `network` | Whether network access is permitted |
| `output_schema` | Schema validating tool output |
| `dry_run` | Whether `--dry-run` is supported |

**Rule:** Capabilities not in the registry are forbidden.

---

## 3. Tool Output Format

Every tool **must** emit JSON conforming to `meta/tools/output-schema.json`:

```json
{
  "capability": "runtime.status",
  "status": "PASS",
  "timestamp": "2026-05-22T05:53:32Z",
  "summary": "Runtime QUIESCENT, lock FREE, confidence 0.99",
  "data": { ... },
  "warnings": [],
  "errors": [],
  "metrics": {},
  "next_actions": []
}
```

**Field constraints:**
- `summary` ≤ 200 characters
- `status` ∈ {PASS, FAIL, WARN, SKIP, TIMEOUT}
- `timestamp` ISO 8601 UTC

---

## 4. Security Rules

### 4.1 No Arbitrary Shell

**Forbidden:**
```bash
bash -c "$GENERATED_TEXT"
```

**Allowed:**
```bash
./tools/runtime/status.sh
```

### 4.2 No Network by Default

Only capabilities explicitly declaring `network: true` may access the network.

### 4.3 Read/Write Scope Enforcement

Tools may only read from and write to paths declared in their capability entry.

### 4.4 Timeouts

Every capability has a timeout. Exceeding it produces `status: TIMEOUT`.

### 4.5 Output Limits

Tool output is capped at 32KB. Exceeding it triggers truncation and `status: WARN`.

### 4.6 Dry-Run Support

Mutation-capable tools must support `--dry-run` for safe preview.

---

## 5. Available Capabilities

| Capability | Command | Purpose |
|------------|---------|---------|
| `runtime.status` | `tools/runtime/status.sh` | Runtime telemetry |
| `runtime.lock` | `tools/runtime/lock-status.sh` | Lock state |
| `runtime.checkpoint.list` | `tools/runtime/checkpoint-list.sh` | List checkpoints |
| `runtime.audit` | `tools/runtime/integrity-audit.sh` | Integrity audit |
| `governance.continuation` | `tools/governance/continuation-resolve.sh` | Next ticket resolution |
| `governance.milestone.progress` | `tools/governance/milestone-progress.sh` | Milestone progress |
| `projection.status` | `tools/projections/status.sh` | Projection freshness |
| `projection.generate` | `tools/projections/generate.sh` | Regenerate projections |

---

## 6. Integration

| Protocol | Integration Point |
|----------|-------------------|
| `WORK_CONTINUATION_PROTOCOL.md` | `governance.continuation` is the operational implementation of continuation resolution |
| `SAFE_EXIT_PROTOCOL.md` | `runtime.status` and `runtime.audit` run during safe exit validation |
| `EXECUTION_LIFECYCLE_PROTOCOL.md` | Tools replace ad-hoc shell in execution validation phases |
| `TOKEN_EFFICIENCY_PROTOCOL.md` | Tool output ≤ 32KB, summary ≤ 200 chars, structured data minimizes tokens |

---

## 7. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-05-22 | Initial protocol. Capability registry, structured output schema, security rules, 8 initial capabilities. |
