# Governance Roadmap Critical Review Report

> **Scope:** M11–M19 (9 milestones, 39 tickets)  
> **Reviewer:** Autonomous audit against repository ground truth  
> **Date:** 2026-05-20  
> **Methodology:** File-level verification, schema analysis, dependency graph path tracing, hour-sum reconciliation, collision detection.

---

## 1. Executive Summary

The governance assimilation roadmap (M11–M19) is **structurally sound at the milestone level** but contains **14 blocking issues** that must be resolved before execution begins. The aggregate hour estimate is understated by 10 hours (86 actual vs. ~76 claimed). There are **3 ID collisions**, **2 file-path collisions**, **1 semantic collision on milestone identity**, and **multiple phantom dependencies** that artificially lengthen the critical path.

**Verdict:** M11–M14 are executable after 4–5 hours of ticket repair. M15–M18 contain speculative runtime features that assume infrastructure (daemon, automated mutation pipeline) that does not exist. M19 is architecturally premature — the repo has no monorepo tooling, no `packages/` directory, and the governance system is not yet battle-tested enough to extract.

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 **Blocking** | 6 | ID collisions, file collisions, unachievable exit criteria, rename scope impossible in 2h |
| 🟠 **High Risk** | 5 | Underestimated archaeology, speculative daemon, phantom infrastructure, semantic CI mismatch |
| 🟡 **Medium Risk** | 8 | Spurious dependencies, tight estimates, missing hidden references, schema-target mismatch |

---

## 2. Verification Methodology

Every claim in this report was verified against the actual repository state:

- **File existence:** `ls`, `find`, `test -f`
- **Field validation:** `node -e JSON.parse(fs.readFileSync(...))` on all cited ticket/milestone files
- **Reference tracing:** `grep -r` across `project-management/data/`, `project-governance/`, `src/`
- **Hour reconciliation:** `reduce` over `governance-tickets.json`
- **Dependency graph audit:** Path-length calculation from ticket-level dependencies

Key ground-truth findings that correct prior assumptions:

| Assumption | Ground Truth | Impact |
|------------|-------------|--------|
| `runtime-state.json` does not exist | ✅ **Exists** at `project-governance/runtime/runtime-state.json` (98 lines, manually maintained) | T15.4 is not "phantom" but the "mutations" it instruments are manual edits, not an automated pipeline |
| M0.5 has no standalone file | ✅ **Exists** at `project-management/data/milestones/M0.5.json` (47 lines) | T14.5's rename scope includes a real file that must be migrated |
| T3.5 lacks `status` / `acceptance_criteria` | ✅ **Has both** plus `traceability`, `observability`, `failure_modes`, `metadata` | T11.3's AC "Existing T3.5 validates" is actually plausible |

---

## 3. Scope Sanity Analysis

### 3.1 Ticket Decomposition Quality

| Milestone | Tickets | Decomposition Grade | Key Issue |
|-----------|---------|---------------------|-----------|
| **M11** | 4 | B+ | T11.1 and T11.4 both claim `meta/README.md`. T11.3 and T14.1 both claim `meta/schemas/checkpoint.schema.json`. |
| **M12** | 4 | B | T12.3 is a "stub" but M12 exit criteria demands a working projection. T12.4 scope (39+ file inventory) underestimated at 2h. |
| **M13** | 5 | C | T13.1–T13.4 are forced sequential; could be parallel. Each is 1h for subsystem archaeology — optimistic. |
| **M14** | 5 | C+ | T14.5 rename scope is catastrophically underestimated. T14.1 file collision with T11.3. |
| **M15** | 4 | B | T15.4 instruments manual mutations as if they were code paths. |
| **M16** | 4 | B | T16.3 "test execution" of heartbeats is vague — against what test suite? |
| **M17** | 4 | B | T17.1, T17.2, T17.3 carry spurious dependencies that bloat the critical path. |
| **M18** | 4 | D+ | T18.2 requires a daemon that does not exist. T18.4 "CI enforces authority levels" is a category error. |
| **M19** | 5 | D | No monorepo infra. "Zero VINTRACK logic" is in tension with governance's entire purpose. |

### 3.2 Deliverable Specificity

**Good examples (concrete, verifiable):**

- T11.3: `meta/schemas/milestone.schema.json`, `meta/schemas/ticket.schema.json`, `meta/schemas/checkpoint.schema.json`, `meta/schemas/governance-state.schema.json`
- T14.2: `meta/schemas/resume-packet.schema.json` with AC "captures git state (branch, modified files)"
- T17.4: `scripts/validate-schemas.ts`, `.github/workflows/governance-validation.yml` with AC "CI blocks merge on schema violations"

**Poor examples (vague, unverifiable):**

- T11.4 AC: "README explains all 6 foundational principles" — deliverables only list **3** principle documents (`canonical-state.md`, `detachability.md`, README). The other 3 principles are **undefined**.
- T12.3 AC: "Script stub exists with clear interface" — a stub is not a "clear interface" without a typed signature or contract.
- T15.3 AC: "Performance impact quantified (<1ms per event)" — no benchmark harness is ticketed.
- T18.4 AC: "CI enforces thresholds on PRs" — CI operates on code diffs, not AI execution state. Semantically meaningless without redefinition.

---

## 4. Complexity Sanity Analysis

### 4.1 Hour Estimate Audit

| Source | Claimed Hours | Actual Hours | Delta |
|--------|---------------|--------------|-------|
| `blast-radius-analysis.md` | ~76h | **86h** | **−10h** |

Per-milestone breakdown:

| Milestone | Hours | Risk Notes |
|-----------|-------|------------|
| M11 | 8 | T11.3 (3h) for 4 schemas is tight but doable |
| M12 | 8 | T12.4 should be **4h** (reference archaeology across 39+ files) |
| M13 | 6 | T13.1–T13.4 should be **2h each** (real archaeology: auth, DB, deployment, API boundaries) |
| M14 | 7 | T14.5 should be **10h** (rename + reference updates + validation across 5+ files) |
| M15 | 7 | T15.3 should be **2h** (retention + async strategy + performance quantification) |
| M16 | 8 | T16.4 (3h) for drift detection is reasonable if scope is CLI-only |
| M17 | 14 | T17.2 (4h) for projection generator — needs template engine selection, not scoped |
| M18 | 10 | T18.2 (3h) for daemon is **impossible** without first building daemon infra |
| M19 | 18 | T19.2 (5h) for engine decoupling should be **8h** |

**Recommended revised total: ~105h** (vs. 86h current).

### 4.2 File Count vs. Hour Ratio

| Ticket | Files | Hours | Ratio | Assessment |
|--------|-------|-------|-------|------------|
| T11.1 | 7 (dirs + 1 file) | 1 | 7:1 | Fine (dirs are cheap) |
| T11.3 | 4 schemas | 3 | 1.3:1 | Reasonable |
| T13.1–T13.4 | 1 each | 1 each | 1:1 | **Too low** — requires deep code reading |
| T14.5 | 3 deliverables | 2 | 1.5:1 | **Catastrophically low** — renames touch 5+ files |
| T17.4 | 2 files | 3 | 0.7:1 | Reasonable (CI workflow is high-leverage) |
| T19.2 | 2 files | 5 | 0.4:1 | Tight for engine extraction |

---

## 5. Implementation Order Analysis

### 5.1 Critical Path Error

The dependency graph claims:

```
M11 → M12 → M14 → M15 → M18 → M19
```

This is **mathematically incorrect**.

Calculating by ticket hours along all paths to M19:

| Path | Tickets | Sum |
|------|---------|-----|
| M11→M12→M14→M15→M17→M19 | 8+8+7+7+14+18 | **62h** |
| M11→M12→M14→M16→M18→M19 | 8+8+7+8+10+18 | **59h** |
| M11→M13→M17→M19 | 8+6+14+18 | 46h (parallel) |

Since M19 depends on **both** M17 and M18, the critical path is the **longer** of the two converging paths:

```
M11 → M12 → M14 → M15 → M17 → M19   (62h)
```

**M18 is NOT on the critical path.** M18 (10h) is shorter than M17 (14h). M18 can run in parallel with M15→M17 but does not determine M19's earliest finish time.

**Corrected critical path:** `M11 → M12 → M14 → M15 → M17 → M19`

### 5.2 Serialization vs. Parallelism

| Claimed Parallel | Reality |
|------------------|---------|
| M13 | ✅ Can run parallel to M12 (after T11.3). But **internally sequential** — T13.1→T13.2→T13.3→T13.4→T13.5. Should be restructured to 4 parallel archaeology tickets + 1 sequential schema ticket. |
| M16 | ✅ Can run parallel to M15 (after T14.4). But T16.4 blocks T18.1, so M16 is on the **critical path to M18**, even if M18 itself is not on the critical path to M19. |

### 5.3 Hidden Dependencies Not in Graph

| Hidden Reference | Location | Impacted Ticket |
|------------------|----------|-----------------|
| T3.7 → T0.5.1 | `project-management/data/tickets/T3.7.json` dependencies array | T14.5 must update T3.7 if renaming T0.5.1 |
| T0.5.1 in `runtime-state.json` completed_tickets | `project-governance/runtime/runtime-state.json` | T14.5 must update runtime-state |
| T0.5.1 in `milestones.json` tickets array | `project-management/data/milestones.json` | T14.5 must update milestones array |
| M0.5 in `milestones.json` | `project-management/data/milestones.json` | T14.5 must update milestone array and standalone file |
| `meta/` does not exist | `ls meta/` → MISSING | T11.1 is safe to create, but all downstream tickets assume it exists |

---

## 6. Drift Risk Assessment

### 6.1 Highest Drift Risk Tickets

#### 🔴 Rank 1: T14.5 — Fix existing schema violations
- **Risk:** Catastrophic scope underestimate + ID collision + semantic collision
- **Why:**
  1. **ID collision:** T10.1 already exists (`project-management/data/tickets/T10.1.json` — "Observability Dashboards").
  2. **Semantic collision:** M10 already exists in `project-management/data/milestones.json` (line 530) as "Platform Hardening."
  3. **Reference surface:** M0.5 appears in `milestones.json`, `milestones/M0.5.json`, `runtime-state.json`, `governance-milestones.json`, `governance-tickets.json`. T0.5.1 appears in `tickets/T0.5.1.json`, `tickets/T3.7.json`, `milestones.json`, `milestones/M0.5.json`, `runtime-state.json`, `governance-tickets.json`.
  4. **Estimate:** 2h is 5–6× too low for this reference surface.
- **Drift scenario:** Developer starts rename, discovers T10.1 collision, must pause to choose new ID, re-audit all references, update blast-radius analysis. **Actual cost: 10–12h.**

#### 🔴 Rank 2: T19.1–T19.5 — SYNTH Extraction
- **Risk:** Architectural impossibility without prerequisite infrastructure
- **Why:**
  1. No `packages/` directory exists.
  2. No workspace configuration in `package.json`.
  3. No build tooling for packages (tsup, tsc project references, etc.).
  4. "Zero VINTRACK business logic" is in direct tension with governance's purpose — governance schemas reference VINTRACK domains (Identity, Marketplace, Transactions) in their examples and constraints.
- **Drift scenario:** 50% of M19 tickets will be abandoned or rewritten when the monorepo reality is encountered.

#### 🔴 Rank 3: T18.2 — Add drift monitoring
- **Risk:** Requires a persistent execution daemon that does not exist
- **Why:** AC demands "Monitor runs every 60 seconds during execution." Agent sessions are ephemeral CLI invocations. There is no long-running process.
- **Drift scenario:** Ticket will either (a) be abandoned, (b) scope-creep into building a daemon, or (c) be redefined as a CLI check. Any of these invalidates downstream T18.3 and T18.4.

#### 🟠 Rank 4: T15.4 — Add event logging to existing governance mutations
- **Risk:** Instruments manual edits as if they were code paths
- **Why:** `runtime-state.json` exists but is manually edited. There is no "checkpoint write" function — checkpoints are files written by agents during conversational execution. T15.4's deliverable `scripts/log-governance-event.ts` will have nothing to hook into.
- **Drift scenario:** Will produce a logging utility that is never called, or will require retroactive instrumentation of ad-hoc agent behavior.

#### 🟠 Rank 5: T13.1–T13.4 — Subsystem registries
- **Risk:** 1h each for full subsystem archaeology is fiction
- **Why:** The repo has migrations in `supabase/migrations/`, workflows in `.github/workflows/`, routes scattered across `src/backend/`, `src/shared/`, `src/frontend/`, and `supabase/functions/`. Discovering all API routes, all RLS policies, all deployment targets requires reading 20+ files per subsystem.
- **Drift scenario:** Each ticket will take 2–3h, causing M13 to slip from 6h to ~14h.

---

## 6.2 Drift Risk by Milestone

| Milestone | Drift Risk | Primary Driver |
|-----------|-----------|----------------|
| M11 | Low | File collisions are easy to fix before execution |
| M12 | Medium | T12.4 scope creep; M12 exit criteria unachievable without M17 |
| M13 | High | Underestimated archaeology; internal serialization |
| M14 | **Extreme** | T14.5 is the single highest-risk ticket in the roadmap |
| M15 | Medium-High | T15.4 phantom instrumentation |
| M16 | Medium | T16.4 "intent simulation mode" does not exist |
| M17 | Medium | Spurious dependencies could cause artificial blocking |
| M18 | **Extreme** | T18.2 daemon requirement; T18.4 CI category error |
| M19 | **Extreme** | No monorepo infra; "zero VINTRACK logic" constraint |

---

## 7. Detailed Issue Register

### 🔴 Blocking Issues (Must Fix Before Execution)

#### B1: T14.5 ID Collision — T10.1 Already Exists
**Evidence:** `project-management/data/tickets/T10.1.json` exists (59 lines, "Observability Dashboards").  
**Impact:** Renaming T0.5.1 → T10.1 would overwrite an existing ticket.  
**Fix:** Choose a non-colliding ID. Suggestions: `T00.5.1`, `T0.5.1A`, or renumber within a new milestone (e.g., `M10.5`).

#### B2: T14.5 Semantic Collision — M10 Already Exists
**Evidence:** `project-management/data/milestones.json` line 530 has `{"id": "M10", ...}`.  
**Impact:** M0.5 is "Toolchain Stabilization"; M10 is "Platform Hardening." Renaming M0.5 → M10 merges two unrelated milestones.  
**Fix:** Use `M0.5A`, `M00.5`, or create a dedicated migration milestone `M10.5`.

#### B3: File Collision — T11.1 and T11.4 Both Claim `meta/README.md`
**Evidence:** T11.1 deliverable: `meta/README.md` ("Governance root documentation"). T11.4 deliverable: `meta/README.md` ("Governance system overview").  
**Impact:** Two tickets own the same file. Race condition or overwritten work.  
**Fix:** T11.1 should create the directory scaffold. T11.4 should write the content. Clarify ownership: T11.1 = structure; T11.4 = content.

#### B4: File Collision — T11.3 and T14.1 Both Claim `meta/schemas/checkpoint.schema.json`
**Evidence:** T11.3 deliverable: `meta/schemas/checkpoint.schema.json` ("Checkpoint JSON schema"). T14.1 deliverable: same path ("Checkpoint JSON schema").  
**Impact:** T11.3 creates a base schema; T14.1 is supposed to "formalize" it. Unclear delta.  
**Fix:** T11.3 should deliver a **draft** or **base** schema. T14.1 should deliver the **finalized** version with resume-packet embedding. Or: remove checkpoint from T11.3 and let T14.1 own it entirely.

#### B5: M12 Exit Criteria Unachievable Within M12
**Evidence:** M12 exit criterion #3: "At least one projection generated from JSON." T12.3 deliverable is a "script stub."  
**Impact:** M12 cannot be marked complete without a working projection, but no working generator is ticketed until M17 (T17.2).  
**Fix:** Either (a) upgrade T12.3 from "stub" to working generator, or (b) move "at least one projection" exit criterion to M17.

#### B6: T11.4 AC References 6 Undefined Principles
**Evidence:** T11.4 AC #1: "README explains all 6 foundational principles." Deliverables list only 3 documents: `meta/README.md`, `meta/principles/canonical-state.md`, `meta/principles/detachability.md`.  
**Impact:** Unverifiable acceptance criterion.  
**Fix:** Either define all 6 principles or reduce AC to match deliverables (3 principles).

### 🟠 High-Risk Issues

#### H1: T13.1–T13.4 Underestimated (1h → 2–3h each)
**Evidence:** Auth subsystem spans `src/backend/`, `src/shared/`, `supabase/functions/`, `supabase/migrations/`. Database subsystem requires RLS policy enumeration across all migration files.  
**Fix:** Increase estimates to 2h each, or parallelize all four and keep 1h estimate but accept lower fidelity.

#### H2: T18.2 Requires Non-Existent Daemon
**Evidence:** AC: "Monitor runs every 60 seconds during execution." No daemon process exists in the repo.  
**Fix:** Redefine as a CLI script (`scripts/drift-monitor.ts` invoked on demand) or defer until a persistent execution runtime is built.

#### H3: T18.4 "CI Enforces Authority Levels" Is Semantically Invalid
**Evidence:** CI operates on code diffs, not AI execution state. "Authority level" is a runtime governance concept, not a CI gate concept.  
**Fix:** Move to a local validation script (`npm run check-authority`) that produces a report. CI can run the script, but the script enforces nothing — it reports.

#### H4: T19.1 Assumes Monorepo Infrastructure That Does Not Exist
**Evidence:** Deliverable: `packages/governance-schemas/`. No `packages/` directory exists. `package.json` has no `workspaces` field.  
**Fix:** Add a pre-M19 milestone (M20) for monorepo scaffolding, or defer M19 entirely.

#### H5: T14.5 Hidden Reference in T3.7 Not Captured
**Evidence:** `project-management/data/tickets/T3.7.json` dependencies array includes `"T0.5.1"`. This is not listed in T14.5's AC or deliverables.  
**Fix:** Add T3.7 to the rename reference audit list in T14.5.

### 🟡 Medium-Risk Issues

#### M1: T17.1 Spurious Dependency on T15.4
**Evidence:** T17.1 depends on `["T14.5", "T15.4"]`. Metadata generation has no causal need for event logging (T15.4).  
**Impact:** Adds 7h (T15.1→T15.2→T15.3→T15.4) to the critical path unnecessarily.  
**Fix:** Remove T15.4 dependency. T17.1 should depend only on T14.5.

#### M2: T17.2 Spurious Dependency on T12.4
**Evidence:** T17.2 depends on `["T12.4", "T17.1"]`. Projection generation needs T12.2 (format) + T12.3 (conventions), not the migration inventory (T12.4).  
**Fix:** Change dependency to `["T12.3", "T17.1"]`.

#### M3: T17.3 Spurious Dependency on T17.2
**Evidence:** T17.3 depends on `["T13.5", "T17.2"]`. An audit script validates schemas and checks integrity — it does not need projection generation.  
**Fix:** Change dependency to `["T13.5", "T17.1"]`.

#### M4: T16.4 Depends on T16.3 Unnecessarily
**Evidence:** T16.4 (drift detection) depends on T16.3 (heartbeat). Drift detection compares expected vs. actual state; it does not need heartbeats.  
**Fix:** Remove dependency. T16.4 can run after T16.1 (schemas) and T16.2 (storage model).

#### M5: T18.2–T18.4 Over-Serialized
**Evidence:** T18.2 → T18.3 → T18.4 are strictly sequential. Rollback procedures (T18.3) and threshold definitions (T18.4) do not need a running drift monitor (T18.2).  
**Fix:** Make T18.3 and T18.4 parallel (both depend on T18.1).

#### M6: T11.3 Validation Target M3 Does Not Exist As Standalone File
**Evidence:** T11.3 AC: "Existing M3 milestone validates against milestone schema." `project-management/data/milestones/M3.json` does **not** exist. M3 lives only inside `project-management/data/milestones.json`.  
**Fix:** Change AC to "Existing M0.5 milestone validates" (M0.5.json exists) or create M3.json first.

#### M7: Critical Path Miscalculation in Dependency Graph
**Evidence:** `governance-dependency-graph.json` critical path: `M11 → M12 → M14 → M15 → M18 → M19`.  
**Fix:** Correct to `M11 → M12 → M14 → M15 → M17 → M19` (M17 is 14h, longer than M18's 10h).

#### M8: T12.4 Scope Understated
**Evidence:** T12.4 must inventory all `project-knowledge/` files (39+ per AGENTS.md), classify each, and verify no broken references. 2h is optimistic.  
**Fix:** Increase to 4h or split into two tickets: inventory (2h) + reference audit (2h).

---

## 8. Recommendations

### 8.1 Immediate Fixes (Before Any Execution)

1. **Re-ID T14.5 rename targets.** Choose IDs that do not collide with existing M10/T10.1. Update all referenced files: `milestones.json`, `milestones/M0.5.json`, `tickets/T0.5.1.json`, `tickets/T3.7.json`, `runtime-state.json`, `governance-tickets.json`, `governance-milestones.json`, `dependency-graph.json`.

2. **Resolve file collisions.** Clarify ownership:
   - `meta/README.md`: T11.1 creates scaffold; T11.4 writes content.
   - `meta/schemas/checkpoint.schema.json`: T11.3 delivers draft; T14.1 delivers finalized version. Or remove from T11.3.

3. **Fix M12 exit criteria.** Either upgrade T12.3 to a working generator or move "at least one projection" to M17.

4. **Recalculate critical path.** Update `governance-dependency-graph.json` critical path to `M11 → M12 → M14 → M15 → M17 → M19`.

### 8.2 Structural Adjustments

5. **Restructure M13 for internal parallelism.** T13.1–T13.4 should have no inter-dependencies. Only T13.5 (metadata schemas) needs to wait for all four.

6. **Remove spurious dependencies.** T17.1 should not depend on T15.4. T17.2 should not depend on T12.4. T17.3 should not depend on T17.2. T16.4 should not depend on T16.3. This shortens the critical path by ~10h.

7. **Redefine T18.2.** Replace "runs every 60 seconds" with "CLI script invoked on demand" or defer to post-MVP.

8. **Redefine T18.4.** Replace "CI enforces" with "local script reports thresholds; CI runs script for visibility."

9. **Defer M19.** Move to a post-MVP phase. Add prerequisite: monorepo scaffolding milestone.

### 8.3 Estimation Corrections

| Ticket | Current | Recommended | Rationale |
|--------|---------|-------------|-----------|
| T12.4 | 2h | **4h** | Reference archaeology across 39+ files |
| T13.1–T13.4 | 1h each | **2h each** | Deep subsystem archaeology |
| T14.5 | 2h | **10h** | Rename + reference updates + validation |
| T15.3 | 1h | **2h** | Retention + async + performance quantification |
| T18.2 | 3h | **8h** or **defer** | Requires daemon infra that doesn't exist |
| T19.2 | 5h | **8h** | Engine decoupling is hardest extraction task |

### 8.4 Governance-Only Safeguards

10. **Zero product runtime impact verification.** Every ticket already includes `product_runtime_impact: none`. Add an automated check in T17.4 (schema validation) that no ticket in M11–M19 touches `src/backend/`, `src/frontend/`, `src/shared/` (except `src/shared/contracts/` if explicitly scoped).

11. **Rollback plan for T14.5.** Before executing T14.5, snapshot all files that reference M0.5/T0.5.1. The blast-radius analysis claims "Highest rollback complexity: M12" — this is wrong. T14.5 is the highest rollback complexity ticket in the entire roadmap.

---

## 9. Verified Ground-Truth Appendix

### A.1 Files Referencing M0.5 / T0.5.1

```
project-management/data/milestones.json          (M0.5 entry, T0.5.1 in tickets)
project-management/data/milestones/M0.5.json     (standalone milestone file)
project-management/data/tickets/T0.5.1.json      (standalone ticket file)
project-management/data/tickets/T3.7.json        (dependency: T0.5.1)
project-governance/runtime/runtime-state.json    (completed_tickets includes T0.5.1)
project-management/data/governance-tickets.json  (T14.5 deliverables reference rename)
project-management/data/governance-milestones.json (exit criteria reference fix)
```

**Total files to update for rename: 7+**

### A.2 Existing M10 / T10.1

```
project-management/data/milestones.json          (M10 entry at line 530)
project-management/data/tickets/T10.1.json       ("Observability Dashboards")
```

### A.3 Hour Sum Reconciliation

```javascript
// Node verification
const tickets = JSON.parse(fs.readFileSync('project-management/data/governance-tickets.json'));
const total = tickets.reduce((s, t) => s + t.estimated_hours, 0);
// total === 86
```

### A.4 Missing /meta Directory

```bash
$ ls meta/
meta/ DOES NOT EXIST
```

### A.5 T3.5 Field Completeness

```javascript
const t35 = JSON.parse(fs.readFileSync('project-management/data/tickets/T3.5.json'));
Object.keys(t35);
// ['id', 'milestone_id', 'title', 'domain', 'capability', 'purpose',
//  'dependencies', 'architectural_constraints', 'deliverables',
//  'acceptance_criteria', 'traceability', 'observability', 'failure_modes',
//  'estimated_hours', 'status', 'assignee', 'metadata']
```

T3.5 is **fully populated** and likely validates against any reasonable ticket schema.

---

## 10. Next Questions

**[Decision]** Should T14.5 use `M0.5A` / `T0.5.1A` as the new IDs, or should we create a new milestone `M10.5` to preserve M10's existing meaning?

**[Decision]** Should M12's exit criterion "At least one projection generated" be downgraded to "Projection generation pipeline documented" or upgraded by making T12.3 a working script?

**[Scope]** Should M18–M19 be split into a separate post-MVP roadmap, given that both assume infrastructure (daemon, monorepo) that does not exist and is not ticketed?
