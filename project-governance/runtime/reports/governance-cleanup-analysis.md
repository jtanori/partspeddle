# Governance Cleanup & Consolidation Analysis

> **Phase 1–3 Synthesis**  
> **Generated:** 2026-05-24T05:50:46Z  
> **Classification:** FULL MILESTONE (justified below)  
> **Scope:** M26 — Governance Kernel Stabilization

---

## Executive Summary

The governance runtime has accumulated significant structural debt during the M20–M25 expansion wave. This analysis identifies **176 files** across **52 directories** with **7 categories of critical redundancy**, **5 unregistered protocols**, **19 empty runtime directories**, **~1,500 lines of duplicate script code**, and **multiple split-authority patterns** between `project-governance/` and `meta/governance/`.

**Classification: FULL MILESTONE.** Blast radius: 50+ files. Governance authority impact: high. Rollback complexity: medium-high. Not suitable for hotfix.

---

## 1. Full Redundancy Report

### 🔴 Critical Redundancy (Data Integrity Risk)

| # | Redundancy | Location A | Location B | Impact |
|---|-----------|------------|------------|--------|
| 1.1 | **Recipes split authority** | `project-governance/recipes/` (7 md) | `meta/governance/recipes/` (7 json) | Human-readable vs machine-readable out of sync |
| 1.2 | **Protocols split authority** | `project-governance/protocols/` (20 md) | `meta/governance/protocols/` (10 json) | Markdown shadows JSON; 3 filename dupes |
| 1.3 | **Schemas split authority** | `project-governance/schemas/` (3 json) | `meta/governance/schemas/` (7 json) | Runtime schemas vs meta-schemas |
| 1.4 | **Checkpoints triple-located** | `project-governance/checkpoints/` | `project-governance/runtime/checkpoints/` | `meta/governance/narratives/checkpoint.md` | Stale + divergent content |
| 1.5 | **Milestone schema duplicates** | `meta/schemas/milestone.schema.json` | `project-management/schemas/milestone.schema.json` | Different constraints, different `$id` |
| 1.6 | **Ticket schema duplicates** | `meta/schemas/ticket.schema.json` | `project-management/schemas/ticket.schema.json` | Different constraints, different `$id` |
| 1.7 | **Checkpoint schema diverged** | `meta/schemas/checkpoint.schema.json` | Inline `checkpoint_payload` in protocol | Rich types vs plain strings |

### 🟡 High Redundancy (Maintenance Burden)

| # | Redundancy | Primary | Duplicate | Lines |
|---|-----------|---------|-----------|-------|
| 2.1 | **Audit scripts** | `audit-runtime.ts` (559) | `audit-runtime-integrity.ts` (550) | ~500 lines overlap |
| 2.2 | **Event emitters** | `emit-governance-event.ts` (152) | `emit-telemetry.ts` (154) | ~120 lines cloned (~80%) |
| 2.3 | **Diagnostics** | `diagnostics-console.ts` (225) | `diagnostics-health.ts` (104) | Strict subset |
| 2.4 | **Stale lock detection** | `detect-stale-locks.ts` (113) | `self-heal.ts` (reimplementation) | ~60 lines duplicated |
| 2.5 | **Protocol filenames** | `CHECKPOINT_PROTOCOL.md` | `checkpoint.protocol.md` | Same content, different conventions |

---

## 2. Governance Entropy Report

### Entropy Sources Ranked

| Source | Severity | Files Affected | Description |
|--------|----------|---------------|-------------|
| **Unregistered protocols** | 🔴 Critical | 5 protocols | Registry only knows 5 of 10 protocols |
| **Stale projections** | 🔴 Critical | 4 files | All projections reference M12/T11.4 |
| **Empty runtime directories** | 🔴 High | 19 dirs | Structural bloat, misleading topology |
| **Dead scripts** | 🟡 High | 6 scripts | No package.json entry, no callers |
| **Incomplete validators** | 🟡 High | 5 files | Generated stubs with identical TODOs |
| **Orphaned scripts** | 🟡 Medium | 4 scripts | No npm script, referenced only in text |
| **Stale bootstrap** | 🟡 Medium | 1 file | Points to M12/T11.4 |
| **Deprecated policy** | 🟢 Low | 1 file | `continuation-policy.md` superseded but present |
| **Unbounded audit growth** | 🟡 Medium | 23 files | No rotation policy for `runtime/audits/` |
| **Missing heartbeat backfill** | 🟡 Medium | 4 gaps | No heartbeats for T20.3–T25.1 |

### Entropy Score Calculation

| Category | Weight | Raw Count | Score |
|----------|--------|-----------|-------|
| Split authority | 0.25 | 7 | 1.75 |
| Dead/orphaned code | 0.20 | 10 | 2.00 |
| Stale artifacts | 0.20 | 12 | 2.40 |
| Registry mismatches | 0.20 | 5 | 1.00 |
| Structural bloat | 0.15 | 19 | 2.85 |
| **TOTAL** | | | **10.0 / 10.0** |

---

## 3. Runtime Topology Analysis

### Current Topology (52 directories)

```
project-governance/ (41 dirs)
├── protocols/          ← 20 md files (human-readable)
├── recipes/            ← 7 md files (human-readable)
├── runtime/
│   ├── audits/         ← 23 json (unbounded growth)
│   ├── checkpoints/    ← 11 json (stale + divergent)
│   ├── deployment/     ← 6 files (active)
│   ├── heartbeats/     ← 4 json (gaps)
│   ├── state/          ← 4 json (active)
│   ├── telemetry/      ← 0 files (empty subdirs)
│   ├── replay/         ← 0 files (empty subdirs)
│   ├── healing/        ← 0 files (snapshots only)
│   ├── locks/          ← 0 files (tests only)
│   ├── diagnostics/    ← 0 files (tests only)
│   ├── enforcement/    ← 0 files (tests only)
│   ├── state-machine/  ← 0 files (tests only)
│   ├── drift-events/   ← 0 files (completely empty)
│   ├── execution-history/ ← 0 files (completely empty)
│   └── ... (5 more empty)
├── intelligence/       ← pattern-reports/ empty, suggestions/ empty
├── schemas/            ← 3 json (overlap with meta/)
└── templates/          ← 7 files

meta/governance/ (11 dirs)
├── protocols/          ← 10 json (canonical)
├── recipes/            ← 7 json (canonical)
├── schemas/            ← 7 json (canonical)
├── registries/         ← 1 json (incomplete)
├── events/             ← 3 files
├── intelligence/       ← 2 json
├── rules/              ← 0 files (empty)
├── templates/          ← 0 files (empty)
└── tests/              ← 3 files
```

### Topology Problems

1. **Two trees for same concern:** `project-governance/` (runtime) and `meta/governance/` (canonical) have parallel structures
2. **19 directories exist but contain no runtime data** — only tests or subdirs
3. **3 checkpoint locations** with divergent content
4. **Audit directory unbounded** — 23 files, no rotation

---

## 4. Duplicate Authority Analysis

### Authority Split Matrix

| Concern | Canonical Authority | Runtime Authority | Status |
|---------|-------------------|------------------|--------|
| Protocols | `meta/governance/protocols/` | `project-governance/protocols/` | **SPLIT** |
| Recipes | `meta/governance/recipes/` | `project-governance/recipes/` | **SPLIT** |
| Schemas | `meta/governance/schemas/` | `project-governance/schemas/` | **SPLIT** |
| State | `runtime-state.json` | `runtime/state/*.json` | **SPLIT + legacy** |
| Checkpoints | `project-governance/checkpoints/` | `runtime/checkpoints/` | **SPLIT** |
| Milestones | `project-management/milestones/` | `meta/schemas/milestone.schema.json` | **SPLIT** |
| Tickets | `project-management/data/tickets/` | `meta/schemas/ticket.schema.json` | **SPLIT** |

### Resolution Principle

Per M20 (T20.1): **JSON is canonical; Markdown is generated reflection.**
- `meta/governance/` owns canonical JSON
- `project-governance/` owns runtime state + generated reflections
- `project-management/` owns milestone/ticket data

**Current violation:** `project-governance/protocols/`, `project-governance/recipes/`, `project-governance/schemas/` contain authoritative Markdown/JSON that should be generated reflections.

---

## 5. Registry Fragmentation Analysis

### `meta/governance/registries/governance-registry.json`

**Current state:** 5 protocols registered, 10 exist → **50% coverage**

| Protocol | File Exists | In Registry | Validator Linked |
|----------|------------|-------------|------------------|
| audit-policy | ✅ | ❌ | ❌ |
| checkpoint | ✅ | ✅ | ✅ |
| deployment-readiness | ✅ | ❌ | ❌ |
| drift-recovery | ✅ | ✅ | ❌ |
| enforcement-policy | ✅ | ❌ | ✅ (orphaned) |
| execution-authorization | ✅ | ✅ | ❌ |
| execution-lifecycle | ✅ | ✅ | ✅ |
| execution-state-machine | ✅ | ❌ | ✅ (orphaned) |
| self-healing | ✅ | ❌ | ❌ |
| state-mutation | ✅ | ✅ | ✅ |

**Rules array:** Empty `[]` — no governance rules registered despite `governance-rule.schema.json` existing.

**Reflections array:** 3 entries — only for protocols that have `generate-governance.ts` output.

---

## 6. Runtime Storage Analysis

### Storage Locations by Concern

| Concern | Files | Locations | Growth Policy |
|---------|-------|-----------|---------------|
| Audits | 23 | `runtime/audits/` | ❌ None |
| Heartbeats | 4 | `runtime/heartbeats/` | ❌ None |
| Checkpoints | 11 | `runtime/checkpoints/` + `checkpoints/` | ❌ None |
| Events | ? | `runtime/events/streams/` | ✅ Retention policy exists |
| Telemetry | 0 | `runtime/telemetry/{logs,errors,traces}/` | ✅ Policy exists |
| Healing snapshots | 1 | `runtime/healing/snapshots/` | ❌ Unknown |
| Deployment reports | 6 | `runtime/deployment/` | ❌ None |
| Completion reports | 6 | `runtime/completion-reports/` | ❌ None |

### Storage Backends

**Current:** Direct filesystem mutation (no abstraction layer)
**Risk:** Race conditions, append corruption, no transactionality
**M28 requirement:** All mutations through storage adapters

---

## 7. Obsolete Artifact Inventory

### Files Marked for Archival / Deletion

| File/Directory | Reason | Risk | Action |
|---------------|--------|------|--------|
| `project-governance/protocols/` (20 md) | Superseded by `meta/governance/protocols/` | Low | Archive after verifying generated reflections exist |
| `project-governance/recipes/` (7 md) | Superseded by `meta/governance/recipes/` | Low | Archive |
| `project-governance/schemas/` (3 json) | Overlap with `meta/governance/schemas/` | Medium | Migrate unique schemas, delete rest |
| `project-governance/runtime/checkpoints/` | Divergent from `project-governance/checkpoints/` | Medium | Consolidate to single location |
| `runtime/drift-events/` | Empty, unused | None | Delete |
| `runtime/execution-history/` | Empty, unused | None | Delete |
| `runtime/recipes/` | Empty, unused | None | Delete |
| `meta/governance/rules/` | Empty, unused | None | Delete |
| `meta/governance/templates/` | Empty, unused | None | Delete |
| `audit-runtime-integrity.ts` | Dead, overlap with `audit-runtime.ts` | Low | Migrate 3 unique checks, delete |
| `generate-runtime-projections.ts` | Dead, no caller | Low | Delete |
| `migrate-governance-md-to-json.ts` | One-off, completed | None | Delete |
| `validate-authority.js` | Dead, no caller | Low | Delete |
| `validators/protocol-*.ts` (5 files) | Incomplete stubs | Low | Delete or complete |
| `continuation-policy.md` | Deprecated, superseded | Low | Archive |
| Old per-ticket checkpoints (T3.x, T11.x) | Stale | Low | Archive per retention policy |
| Stale projections (4 files, M12 era) | Reference obsolete state | Medium | Regenerate or delete |
| `runtime/bootstrap/runtime-bootstrap.json` | Points to M12 | Medium | Regenerate |

---

## 8. Proposed Canonical Directory Structure

```
project-governance/
├── runtime/
│   ├── state/              ← Active runtime state (4 files)
│   ├── events/             ← Append-only event streams
│   ├── audits/             ← Audit reports (with rotation)
│   ├── checkpoints/        ← Canonical checkpoints only
│   ├── heartbeats/         ← Heartbeat logs (with rotation)
│   ├── deployment/         ← Readiness reports
│   ├── healing/            ← Healing logs + snapshots
│   ├── locks/              ← Lock event logs
│   ├── telemetry/          ← Telemetry streams
│   ├── replay/             ← Replay manifests + timelines
│   └── projections/        ← Generated markdown reflections
├── protocols/              ← GENERATED from meta/governance/protocols/
├── recipes/                ← GENERATED from meta/governance/recipes/
├── intelligence/           ← Generated reports
├── schemas/                ← DEPRECATED — migrate to meta/
├── checkpoints/            ← DEPRECATED — merge into runtime/checkpoints/
├── templates/              ← Keep if used
└── roadmap/                ← Keep

meta/governance/
├── protocols/              ← CANONICAL protocol definitions
├── recipes/                ← CANONICAL recipe definitions
├── schemas/                ← CANONICAL schemas
├── registries/             ← Canonical registries
├── events/                 ← Event schemas + catalog
├── intelligence/           ← Intelligence schemas + rules
├── narratives/             ← Human-readable rationale (not operational)
└── tests/                  ← Cross-cutting tests

project-management/
├── data/
│   ├── tickets/            ← CANONICAL ticket data
│   └── milestones/         ← CANONICAL milestone data
└── schemas/                ← CANONICAL PM schemas

scripts/
├── validators/             ← Active validators only
├── lib/                    ← Shared utilities (stream-emitter, etc.)
└── [active scripts]        ← Governance scripts with package.json entries
```

---

## 9. Consolidation Dependency Graph

```
T26.1: Registry Normalization
  ├─ depends on: T20.2 (machine-readable definitions exist)
  └─ blocks: T26.2, T26.3, T26.4

T26.2: Protocol Authority Consolidation
  ├─ depends on: T26.1
  └─ blocks: T26.5

T26.3: Schema Deduplication
  ├─ depends on: T26.1
  └─ blocks: T26.5

T26.4: Script Redundancy Elimination
  ├─ depends on: T26.1
  └─ blocks: T26.5

T26.5: Runtime Directory Normalization
  ├─ depends on: T26.2, T26.3, T26.4
  └─ blocks: T26.6

T26.6: Stale Artifact Cleanup
  ├─ depends on: T26.5
  └─ blocks: T26.7

T26.7: Reflection Regeneration
  ├─ depends on: T26.6
  └─ completes M26
```

---

## 10. Cleanup Sequencing Plan

### Phase A: Analysis & Snapshot (Non-destructive)
1. Snapshot entire governance tree
2. Generate inventory manifest
3. Emit governance event: `cleanup.initiated`

### Phase B: Registry Layer (Non-destructive)
4. Normalize `governance-registry.json`
5. Register all 10 protocols
6. Link orphaned validators
7. Validate registry against schema

### Phase C: Authority Consolidation (Destructive to duplicates)
8. Archive `project-governance/protocols/` (md shadows)
9. Archive `project-governance/recipes/` (md shadows)
10. Migrate unique schemas from `project-governance/schemas/`
11. Consolidate checkpoint locations

### Phase D: Script Consolidation (Destructive to dead code)
12. Migrate 3 unique checks from `audit-runtime-integrity.ts` → `audit-runtime.ts`
13. Extract shared emitter logic
14. Merge `diagnostics-health.ts` into `diagnostics-console.ts`
15. Fix `bootstrap.ts` path
16. Delete dead scripts

### Phase E: Structural Cleanup (Destructive to empty dirs)
17. Delete 19 empty directories
18. Implement rotation policy for audits/heartbeats
19. Archive old per-ticket checkpoints

### Phase F: Reflection Regeneration (Non-destructive)
20. Regenerate projections from current state
21. Regenerate protocol reflections
22. Validate all reflections match canonical JSON

### Phase G: Validation (Non-destructive)
23. Run `npm run pm:validate`
24. Run `npm run governance:validate`
25. Run `audit-runtime.ts`
26. Emit governance event: `cleanup.completed`

---

## 11. Rollback Strategy

| Phase | Rollback Method | Time to Rollback |
|-------|----------------|------------------|
| A | Snapshot restore | < 1 min |
| B | Restore registry from snapshot | < 1 min |
| C | Restore archived directories | < 2 min |
| D | Restore deleted scripts from snapshot | < 2 min |
| E | Recreate deleted directories | < 1 min |
| F | Regenerate old reflections | < 2 min |
| G | No rollback needed (read-only) | — |

**Master rollback:** Full snapshot restore → < 5 minutes.

---

## 12. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Archive shadow protocols that are still referenced | Medium | High | Search all references before archival |
| Delete script that has hidden caller | Medium | High | Grep all imports before deletion |
| Break `npm run pm:validate` during schema migration | Medium | High | Run validator after each schema change |
| Lose audit history during rotation | Low | Critical | Archive, don't delete |
| Break `generate-governance.ts` by deleting stubs it references | Medium | Medium | Check generator imports before deletion |
| Consolidate checkpoints incorrectly | Low | High | Verify content before deleting duplicates |
| Dead script resurrection needed | Low | Medium | 90-day archive before permanent deletion |

---

## 13. Validation Strategy

| Checkpoint | Validation |
|------------|------------|
| After Phase B | `governance-registry.json` validates; all 10 protocols registered |
| After Phase C | `pm:validate` passes; no duplicate schemas |
| After Phase D | All package.json scripts execute without error |
| After Phase E | Directory tree matches proposed structure |
| After Phase F | All generated reflections match canonical JSON hashes |
| After Phase G | `audit-runtime.ts` passes with 0 critical findings |
| Final | `npm run lint` + `npm run typecheck` + `npm run pm:validate` all pass |

---

## 14. Post-Cleanup Invariants

```
INVARIANT: REGISTRY_COVERAGE_100
  All protocols in meta/governance/protocols/ are registered in governance-registry.json

INVARIANT: SINGLE_SOURCE_OF_TRUTH
  No operational concept exists in two canonical locations

INVARIANT: NO_EMPTY_RUNTIME_DIRS
  Every directory under project-governance/runtime/ contains >= 1 non-test file
  OR is explicitly declared as a staging directory in registry

INVARIANT: REFLECTION_FRESHNESS
  All generated markdown reflections are <= 24 hours old or pinned

INVARIANT: SCRIPT_REGISTRATION
  Every script in scripts/ is either registered in package.json or declared dead in registry

INVARIANT: AUDIT_ROTATION
  runtime/audits/ contains <= 30 days of reports

INVARIANT: SCHEMA_UNIQUENESS
  No two schemas define the same concept with different constraints
```

---

## 15. Long-Term Maintenance Recommendations

1. **Registry-driven architecture:** All new protocols/schemas must be registered before deployment
2. **Generated-only reflections:** `project-governance/protocols/` and `recipes/` should be `.gitignore`-d generated artifacts
3. **Storage abstraction (M28):** Migrate all runtime mutations through adapter layer
4. **Invariant engine (M27):** Automate post-cleanup invariant validation
5. **Retention policies:** Enforce rotation on all append-only streams
6. **Dead code detection:** Monthly automated scan for unreferenced scripts
7. **Schema versioning:** All schema changes require version bump + compatibility check
8. **Authority linting:** CI gate blocks PRs with unregistered protocols or missing frontmatter

---

## Appendix A: Classification Justification

### Why FULL MILESTONE, not HOTFIX

| Criterion | Value | Threshold |
|-----------|-------|-----------|
| Blast radius | 50+ files | Hotfix: < 10 |
| Files affected | 176 governance files | Hotfix: < 20 |
| Governance authority impact | High (splits authority) | Hotfix: Low |
| Replay integrity impact | Medium (checkpoint consolidation) | Hotfix: None |
| Dependency graph impact | High (registry normalization) | Hotfix: None |
| Runtime mutation risk | High (script deletion) | Hotfix: Low |
| Rollback complexity | Medium-high (7 phases) | Hotfix: Simple revert |

**Verdict:** Exceeds all hotfix thresholds. Requires structured milestone with tickets, checkpoints, and phased execution.

---

## Appendix B: Milestone Proposal — M26

```json
{
  "id": "M26",
  "phase": 26,
  "title": "Governance Kernel Stabilization",
  "purpose": "Reduce semantic fragmentation and normalize governance infrastructure before further expansion.",
  "trust_principle": "A governance system with contradictory authorities cannot be trusted. A governance system with split sources of truth cannot be maintained.",
  "status": "planned",
  "dependencies": ["M20", "M25"],
  "tickets": ["T26.1", "T26.2", "T26.3", "T26.4", "T26.5", "T26.6", "T26.7"],
  "exit_criteria": [
    "All governance registries normalized with 100% protocol coverage",
    "No dual-loading inconsistencies",
    "Reflection drift impossible via deterministic generation",
    "Registry loading deterministic",
    "pm-summary.js class of failures eliminated",
    "All post-cleanup invariants enforced"
  ]
}
```
