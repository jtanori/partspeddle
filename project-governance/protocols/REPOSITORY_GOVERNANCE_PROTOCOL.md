# Repository Governance Protocol

> **Authority:** `runtime-governance-kernel.md`  
> **Purpose:** Execution ↔ git contract. Repository state is runtime state.  
> **Principle:** One Execution Context = One Branch Context. No exceptions.  
> **Version:** 1.0.0  
> **Status:** Active

---

## 1. Core Law

**No execution may start on a dirty worktree.**

Before ANY execution:

```bash
git status --porcelain
```

must return empty. If not: execution is **prohibited**.

---

## 2. Branch Taxonomy

Every execution context maps to an isolated branch:

| Prefix | Purpose | Example |
|--------|---------|---------|
| `feature/T{milestone}.{ticket}-` | Ticket implementation | `feature/T11.2-governance-taxonomy` |
| `hotfix/T{milestone}.{ticket}-` | Cross-cutting urgent fix | `hotfix/T0.5.1-test-timeout` |
| `governance/` | Runtime/protocol changes | `governance/M11-runtime-v2` |
| `stabilization/` | Recovery/resilience work | `stabilization/checkpoint-corruption` |
| `experiment/` | Isolated R&D | `experiment/algolia-ranking` |

**Rule:** Active branch name must match active ticket or governance task.

---

## 3. Pre-Execution Repository Validation

Before lock acquisition, the system MUST validate:

```yaml
repository_validation:
  clean_worktree:        # git status --porcelain == ""
  detached_head: false   # must be on named branch
  branch_matches_ticket: # branch name contains ticket ID
  upstream_synced:       # git fetch + check divergence
  no_untracked_runtime_mutations: # no unexpected files in runtime/
```

**Failure of any gate:** Execution blocked. Operator must remediate.

---

## 4. Execution-to-Branch Binding

Runtime state MUST track repository context:

```json
{
  "repository_context": {
    "branch": "feature/T11.2-governance-taxonomy",
    "base_branch": "develop",
    "worktree_clean": true,
    "head_commit": "abc1234",
    "commits_in_execution": ["abc1234", "def5678"],
    "promotion_status": "pending",
    "last_validated_at": "2026-05-22T06:00:00Z"
  }
}
```

**Rule:** Runtime state is incomplete without repository_context.

---

## 5. Execution Suspension Protocol

When work unrelated to current ticket must occur:

```
1. SAFE_EXIT current execution
2. Generate checkpoint
3. Release lock
4. COMMIT or STASH all mutations
5. CREATE new branch for unrelated work
6. EXECUTE unrelated work
7. COMMIT + PROMOTE unrelated work
8. RETURN to original branch
9. REBASE/SYNC if needed
10. RESUME original execution
```

**Forbidden:** Contaminating active branch with unrelated work.

---

## 6. Scope Expansion Governance

When related but unplanned work emerges mid-ticket:

```yaml
scope_expansion:
  reason: "naming conventions require taxonomy normalization"
  approved_by: "operator"
  affects: ["T11.2"]
  new_deliverables:
    - "meta/conventions/taxonomy.md"
  committed_in_same_branch: true
```

**Rule:** Scope expansion is formalized, not improvised.

---

## 7. Completion Requirements

No ticket may declare COMPLETE until:

```yaml
completion_requirements:
  - worktree_clean
  - minimum_one_semantic_commit
  - branch_pushed_or_promoted
  - checkpoint_generated
  - integrity_audit_passed
  - repository_context_validated
```

**Semantic commit format:**
```
<domain>(<capability>): <description> (T{milestone}.{ticket})
```

Example:
```
governance(runtime): implement checkpoint lifecycle validation (T11.2)
```

---

## 8. Promotion Path

After ticket completion:

```
1. Final commit on execution branch
2. Integrity audit (tool: runtime.audit)
3. Worktree validation (tool: repository.validate)
4. Merge to base branch
5. Delete execution branch
6. Update milestone state
7. Run continuation resolution
```

---

## 9. Integration

| Protocol | Integration Point |
|----------|-------------------|
| `EXECUTION_LIFECYCLE_PROTOCOL.md` | Step 0: repository validation before EXECUTION_START |
| `SAFE_EXIT_PROTOCOL.md` | Step 8: validate worktree clean before terminal state |
| `GOVERNANCE_GATES.md` | Gate 1.5: `GATE_REPOSITORY` — clean worktree, bound branch |
| `WORK_CONTINUATION_PROTOCOL.md` | Branch context restored on resume |
| `TOOL_CAPABILITY_PROTOCOL.md` | `repository.validate` capability for deterministic checks |

---

## 10. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-05-22 | Initial protocol. Branch taxonomy, pre-execution validation, execution-to-branch binding, suspension, scope expansion, completion requirements, promotion path. |
