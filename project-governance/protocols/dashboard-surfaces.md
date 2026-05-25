# Dashboard Surface Contracts

> **Operational cognition document** — T31.1 deliverable  
> **Purpose:** Human-readable reference for every dashboard surface's authority, mutability, freshness, and risk classification.

## Overview

The VINTRACK governance dashboard is not a UI. It is an **operational surface contract** that defines how operators interact with the runtime. Every surface declares:

- **Authority:** Where its data comes from
- **Mutability:** Whether it can trigger actions
- **Freshness:** How stale the data may be
- **Replay visibility:** Whether actions emit replay-addressable events
- **Approval gating:** Whether human approval is required
- **Risk level:** Operational severity of misuse

## Surface Contract Summary

| Surface | Authority | Mutability | Freshness | Approval | Risk |
|---------|-----------|------------|-----------|----------|------|
| Execution Status | projected | read-only | realtime (5s) | — | low |
| Event Streams | canonical | read-only | near-realtime (10s) | — | low |
| Lock Status | projected | read-only | realtime (5s) | — | medium |
| Replay Integrity | derived | read-only | delayed (5m) | — | high |
| Audit Trail | derived | read-only | delayed (5m) | — | medium |
| Healing Actions | projected | actionable | near-realtime (30s) | 🔒 required | high |
| Enforcement Status | canonical | actionable | near-realtime (60s) | — | medium |
| Invariant Violations | derived | read-only | delayed (5m) | — | high |

## Authority Hierarchy

```
canonical     → direct from meta/governance/ or meta/state/
projected     → derived from canonical via sync scripts
derived       → computed on-demand from multiple sources
topology      → from governance topology scanner
```

**Rule:** Dashboard surfaces must NEVER mutate canonical state directly. Actionable surfaces emit intents that the orchestration layer resolves.

## Surface Details

### 1. Execution Status

| Property | Value |
|----------|-------|
| **ID** | `execution_status` |
| **Authority** | projected |
| **Sources** | `active-execution.json`, `canonical-state.json` |
| **Freshness** | realtime (< 5s) |
| **Mutability** | read-only |
| **Risk** | low |

**What it shows:** Current milestone, ticket, execution mode, lock state, and runtime confidence score.

**Query pattern:** Read `active-execution.json` projection; fallback to `canonical-state.json` if projection is stale.

**CLI rendering:** Color-code execution mode — `IDLE` green, `PLANNING` blue, `IN_PROGRESS` yellow, `BLOCKED` red, `FROZEN` magenta.

---

### 2. Event Streams

| Property | Value |
|----------|-------|
| **ID** | `event_streams` |
| **Authority** | canonical |
| **Sources** | `project-governance/runtime/events/streams/*.ndjson` |
| **Freshness** | near-realtime (< 10s) |
| **Mutability** | read-only |
| **Risk** | low |

**What it shows:** Tail of all 4 event streams with severity/category filtering.

**Query pattern:** Stream tail read with `grep` filtering on severity and category.

**CLI rendering:** Severity color coding — `debug` gray, `info` white, `warn` yellow, `error` red, `critical` magenta background.

---

### 3. Lock Status

| Property | Value |
|----------|-------|
| **ID** | `lock_status` |
| **Authority** | projected |
| **Sources** | `execution-lock.json`, `canonical-state.json` |
| **Freshness** | realtime (< 5s) |
| **Mutability** | read-only |
| **Risk** | medium |

**What it shows:** Lock owner, acquisition time, expiration, release reason.

**Why medium risk:** Misreading lock status can lead to coordination failures or stale-lock scenarios.

---

### 4. Replay Integrity

| Property | Value |
|----------|-------|
| **ID** | `replay_integrity` |
| **Authority** | derived |
| **Sources** | event streams, `sequence-store.json` |
| **Freshness** | delayed (5 min cache) |
| **Mutability** | read-only |
| **Risk** | high |

**What it shows:** Replay validation status, sequence gaps, causality health, checkpoint anchoring.

**Why high risk:** Replay corruption is a catastrophic integrity failure. This surface must be accurate even if delayed.

**Query pattern:** Run `npm run replay:validate`; cache result for 5 minutes.

---

### 5. Audit Trail

| Property | Value |
|----------|-------|
| **ID** | `audit_trail` |
| **Authority** | derived |
| **Sources** | `validation.ndjson`, audit projections |
| **Freshness** | delayed (5 min cache) |
| **Mutability** | read-only |
| **Risk** | medium |

**What it shows:** Gate results, invariant counts, drift findings, benchmark classification.

**Query pattern:** Read validation event stream tail; aggregate by gate.

---

### 6. Healing Actions

| Property | Value |
|----------|-------|
| **ID** | `healing_actions` |
| **Authority** | projected |
| **Sources** | recipe registry, runtime state |
| **Freshness** | near-realtime (< 30s) |
| **Mutability** | actionable |
| **Approval** | 🔒 **required** |
| **Risk** | high |

**What it shows:** Available healing recipes, drift status, last healing result, rollback availability.

**Associated recipes:** `healing_sync_projections`, `healing_self_heal_run`

**Action semantics:**
1. Operator selects recipe
2. Dashboard emits `control.action.requested`
3. Approval layer checks `requiresApproval`
4. If approved, orchestration layer executes recipe
5. Recipe emits `control.recipe.invoked` + result events
6. Dashboard updates from new events

**Why approval required:** Healing mutates filesystem and event streams. Unintended healing can corrupt runtime state.

---

### 7. Enforcement Status

| Property | Value |
|----------|-------|
| **ID** | `enforcement_status` |
| **Authority** | canonical |
| **Sources** | `invariants.json`, enforcement recipe registry |
| **Freshness** | near-realtime (< 60s) |
| **Mutability** | actionable |
| **Approval** | — (auto-approved) |
| **Risk** | medium |

**What it shows:** Invariant registry, gate pass/fail counts, last validation timestamp.

**Associated recipes:** `enforcement_validate_all`

**Action semantics:** Operator can trigger enforcement run. This is auto-approved because enforcement is read-only validation (no mutation).

---

### 8. Invariant Violations

| Property | Value |
|----------|-------|
| **ID** | `invariant_violations` |
| **Authority** | derived |
| **Sources** | validation event stream |
| **Freshness** | delayed (5 min cache) |
| **Mutability** | read-only |
| **Risk** | high |

**What it shows:** Live violation feed by severity: critical, high, medium, low.

**Why high risk:** Violation visibility gaps can lead to undetected drift.

**Query pattern:** Filter `validation.ndjson` for `invariant.validation_complete` events; extract findings.

---

## Intent vs Execution Separation

All actionable surfaces follow this flow:

```
Operator Intent
      ↓
Dashboard emits control.action.requested
      ↓
Guard layer validates against invariants
      ↓
Approval layer checks policy
      ↓
Orchestration layer executes recipe
      ↓
Recipe emits events
      ↓
Dashboard updates from projections
```

**Critical rule:** The dashboard NEVER directly invokes recipes, scripts, or engines. It emits intents. The orchestration layer resolves them.

## Freshness Policy

| Freshness Class | Max Staleness | Surfaces |
|-----------------|---------------|----------|
| realtime | 5s | execution_status, lock_status |
| near-realtime | 10–60s | event_streams, healing_actions, enforcement_status |
| delayed | 5m | replay_integrity, audit_trail, invariant_violations |

Stale data warnings must be displayed when freshness thresholds are exceeded.

## Replay Addressability

Every actionable surface emits replay-addressable events. Read-only surfaces do not need to emit events (they are pure projections).

| Surface | Emits Events |
|---------|-------------|
| execution_status | no (read-only) |
| event_streams | no (read-only) |
| lock_status | no (read-only) |
| replay_integrity | yes (on refresh) |
| audit_trail | no (read-only) |
| healing_actions | yes (on action) |
| enforcement_status | yes (on action) |
| invariant_violations | no (read-only) |

## Operational Quick Reference

| If you see... | Check... | Action... |
|---------------|----------|-----------|
| Lock held > 1h | lock_status | Run diagnostics, detect stale locks |
| Replay gap | replay_integrity | Audit sequence store, investigate gap |
| Invariant failure | invariant_violations | Run enforcement, identify root cause |
| Projection drift | audit_trail | Run healing_sync_projections recipe |
| Execution blocked | execution_status | Check causality, validate bootstrap |
