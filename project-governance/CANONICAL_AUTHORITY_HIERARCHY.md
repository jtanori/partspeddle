# Canonical Authority Hierarchy

> **Layer:** 1 (Execution Authority)  
> **Scope:** governance  
> **Status:** active  
> **Version:** 1.0.0  
> **Supersedes:** implicit authority claims in all `project-governance/` documents that predate this hierarchy  

---

## 1. Purpose

Eliminate authority fragmentation, drift risk, and contradictory agent interpretation by establishing a single, explicit precedence model for all governance documents.

**Without this hierarchy:** Multiple documents define overlapping responsibilities. Agents encounter contradictory instructions (e.g., auto-authorization in one document, explicit approval required in another). Governance entropy increases with every new protocol.

**With this hierarchy:** Every document declares its layer, scope, and supremacy relationships. Conflicts resolve deterministically by layer precedence.

---

## 2. The Six Layers

| Layer | Name | Location | Authority | Override Rule |
|-------|------|----------|-----------|---------------|
| 0 | **Schemas** | `project-management/schemas/`, `meta/schemas/` | Machine-parseable structural authority | Cannot be overridden by any text document |
| 0.5 | **Protocol Definitions** | `meta/governance/protocols/*.json` | Machine-readable operational semantics | Generated artifacts (markdown, validators) derive from here |
| 1 | **Runtime Kernel** | `project-governance/runtime/runtime-governance-kernel.md` | Execution authority — invariants, principles, escalation paths ONLY | Higher layers may extend but never contradict |
| 2 | **Protocols** | `project-governance/protocols/*.md` | Behavior authority — operational specifics | Overrides kernel on operational specifics when canonical. **Generated from Layer 0.5** |
| 3 | **Templates** | `project-governance/templates/` | Generation authority — artifact templates | Overrides protocols on artifact structure when canonical |
| 4 | **Projections** | `project-governance/runtime/projections/` | Read-only operational views | Never mutative; derived from layers 0–3 |
| 5 | **Human Guides** | `project-knowledge/`, `AGENTS.md` | Human-facing operational guidance | Subordinate to all other layers; may simplify but not contradict |

### 2.1 Layer Precedence Rules

1. **Lower layers override higher layers on specificity.** A Layer 2 protocol document that defines checkpoint triggers overrides a Layer 1 kernel statement about the same topic.
2. **JSON protocol definitions (Layer 0.5) are canonical for operational semantics.** The markdown protocols in Layer 2 are **generated reflections** of Layer 0.5. If a generated protocol contradicts the JSON definition, the JSON definition wins.
3. **The kernel cannot contradict schemas.** If `ticket.schema.json` (Layer 0) requires a field, no protocol (Layer 2) may declare it optional.
4. **Projections (Layer 4) are read-only.** They derive from canonical state and may never be treated as authority for behavior.
5. **Human guides (Layer 5) are lossy.** They exist for human comprehension and may omit edge cases, but they must not introduce rules absent from layers 0–3.

### 2.2 Cross-Silo Supremacy

Three authority silos operate in this project:

| Silo | Anchor Document | Layer |
|------|-----------------|-------|
| Runtime Governance | `runtime-governance-kernel.md` | 1 |
| Planning Orchestration | `project-knowledge/adr/003-planning-orchestration.md` | 5 (human guide) |
| Meta-State | `meta/state/canonical-state.json` | 0 (schema) |

**Resolution rule:**
- `meta/state/canonical-state.json` (Layer 0 / schema) wins over all text documents when it defines structural constraints.
- `runtime-governance-kernel.md` (Layer 1) wins over ADR-003 (Layer 5) on execution behavior.
- ADR-003 wins on planning-phase semantics (intake, compilation, approval) because the kernel does not define planning workflows.
- When `runtime-state.json` (legacy) and `meta/state/canonical-state.json` (current) conflict, the newer schema-governed file (`canonical-state.json`) takes precedence.

---

## 3. Authority Declaration Format

Every document in layers 1–4 MUST include this YAML frontmatter:

```yaml
---
authority:
  level: protocol        # kernel | protocol | template | projection | guide
  layer: 2               # 0–5
  canonical: true        # false for drafts, deprecated, or superseded
  supersedes:            # array of relative paths this document replaces
    - old-doc.md
  derives_from:          # array of higher-layer documents this extends
    - ../runtime/runtime-governance-kernel.md
  scope: behavior        # execution | behavior | state | recovery | authorization | planning | governance
  status: active         # active | deprecated | draft | superseded
  version: "1.0.0"
---
```

### 3.1 Field Semantics

| Field | Required | Description |
|-------|----------|-------------|
| `level` | Yes | Document type within the hierarchy |
| `layer` | Yes | Numeric layer (0–5) |
| `canonical` | Yes | `true` if this is the current authority for its scope; `false` if draft or deprecated |
| `supersedes` | No | Documents this one replaces. When present, the superseded documents should update their `status` to `superseded` |
| `derives_from` | No | Higher-layer documents this one extends or operationalizes |
| `scope` | Yes | Governance topic this document owns |
| `status` | Yes | Lifecycle state of the document itself |
| `version` | Yes | Semver for document revision tracking |

### 3.2 Supersession Protocol

When document A supersedes document B:

1. Document A declares `supersedes: [B]`
2. Document B updates `status: superseded` and adds `superseded_by: [A]`
3. All documents that previously `derives_from: [B]` must update to derive from A
4. A governance migration note is appended to B's header explaining the supersession

---

## 4. Document Registry

### 4.1 Layer 0.5 — Protocol Definitions (JSON Canonical)

| Document | Scope | Status | Generates |
|----------|-------|--------|-----------|
| `meta/governance/protocols/execution-lifecycle.json` | execution | active | `project-governance/protocols/execution-lifecycle.protocol.md`, `scripts/validators/protocol-execution-lifecycle.ts` |
| `meta/governance/protocols/checkpoint.json` | recovery | active | `project-governance/protocols/checkpoint.protocol.md`, `scripts/validators/protocol-checkpoint.ts` |
| `meta/governance/protocols/state-mutation.json` | state | active | `project-governance/protocols/state-mutation.protocol.md`, `scripts/validators/protocol-state-mutation.ts` |

### 4.2 Layer 1 — Runtime Kernel

| Document | Scope | Status | Derives From |
|----------|-------|--------|--------------|
| `runtime/runtime-governance-kernel.md` | execution | active | — |
| `runtime/execution-modes.md` | execution | active | `runtime-governance-kernel.md` |

### 4.3 Layer 2 — Protocols

| Document | Scope | Status | Derives From |
|----------|-------|--------|--------------|
| `protocols/EXECUTION_AUTHORIZATION_PROTOCOL.md` | authorization | active | `runtime-governance-kernel.md` |
| `protocols/EXECUTION_LIFECYCLE_PROTOCOL.md` | execution | active | `runtime-governance-kernel.md` |
| `protocols/WORK_CONTINUATION_PROTOCOL.md` | execution | active | `runtime-governance-kernel.md` |
| `protocols/STATE_MUTATION_RULES.md` | state | active | `runtime-governance-kernel.md` |
| `protocols/CHECKPOINT_PROTOCOL.md` | recovery | active | `runtime-governance-kernel.md` |
| `protocols/SAFE_EXIT_PROTOCOL.md` | recovery | active | `runtime-governance-kernel.md` |
| `protocols/DRIFT_RECOVERY_PROTOCOL.md` | recovery | active | `runtime-governance-kernel.md` |
| `protocols/HEARTBEAT_POLICY.md` | governance | active | `runtime-governance-kernel.md` |
| `protocols/AMBIGUITY_RESOLUTION_PROTOCOL.md` | governance | active | `runtime-governance-kernel.md` |
| `protocols/TICKET_CREATION_PROTOCOL.md` | planning | active | `runtime-governance-kernel.md` |
| `protocols/PLANNING_PROTOCOL.md` | planning | active | ADR-003, `runtime-governance-kernel.md` |
| `protocols/PLAN_COMPILATION_PROTOCOL.md` | planning | active | ADR-003, `runtime-governance-kernel.md` |
| `protocols/REPOSITORY_GOVERNANCE_PROTOCOL.md` | governance | active | `runtime-governance-kernel.md` |
| `protocols/TOKEN_EFFICIENCY_PROTOCOL.md` | governance | active | `runtime-governance-kernel.md` |
| `protocols/TOOL_CAPABILITY_PROTOCOL.md` | governance | active | `runtime-governance-kernel.md` |
| `protocols/COMPLETION_REPORT_SCHEMA.md` | governance | active | `runtime-governance-kernel.md` |
| `protocols/README.md` | guide | active | — |

### 4.4 Deprecated / Merged Documents

| Document | Status | Superseded By | Reason |
|----------|--------|---------------|--------|
| `runtime/continuation-policy.md` | deprecated | `EXECUTION_AUTHORIZATION_PROTOCOL.md`, `EXECUTION_LIFECYCLE_PROTOCOL.md` | Contradicted explicit authorization requirement; auto-continuation semantics merged into lifecycle protocol |

---

## 5. Conflict Resolution Procedure

When two documents appear to conflict:

1. **Identify layers.** The lower-layer document wins on specificity.
2. **If same layer, identify scope.** The document whose `scope` value matches the topic wins.
3. **If same layer and scope, identify version.** The higher version wins.
4. **If still ambiguous,** escalate to `runtime-governance-kernel.md` §11 (Escalation Rules).
5. **Log the conflict.** Create an entry in `project-governance/runtime/drift-log/` with:
   - Conflicting documents
   - Layer and scope of each
   - Resolution applied
   - Timestamp

---

## 6. Migration Notes

### From Implicit Authority to Explicit Hierarchy

Before this document, authority was implicit:
- Protocols cited `runtime-governance-kernel.md` in ad-hoc header notes
- No precedence rule existed for ADR-003 vs kernel conflicts
- `continuation-policy.md` contradicted `EXECUTION_AUTHORIZATION_PROTOCOL.md` without any resolution mechanism

After this document:
- Every governance document carries explicit authority metadata
- Layer precedence resolves conflicts deterministically
- Superseded documents are explicitly marked and referenced
- The kernel is reduced to principles-only; operational specifics live in protocols

---

## 7. Validation

To verify this hierarchy is correctly applied:

```bash
# All governance documents must have authority frontmatter
grep -L "^---$" project-governance/runtime/*.md project-governance/protocols/*.md | grep -v README

# All deprecated documents must reference their successor
grep "status: deprecated" project-governance/runtime/*.md project-governance/protocols/*.md

# No document should claim authority from a superseded source
grep -r "superseded_by" project-governance/
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-05-22 | Initial hierarchy. Defined 6 layers, supersession protocol, conflict resolution, and document registry. Deprecated `continuation-policy.md`. |
