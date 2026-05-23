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

# Ambiguity Resolution Protocol

> **Authority:** ADR-003, PLANNING_PROTOCOL.md  
> **Purpose:** Structured detection and resolution of specification ambiguity before compilation.  
> **Version:** 1.0.0  
> **Status:** Active

---

## Principle

> **Ambiguity that leaks into compilation becomes implementation drift.**

This protocol ensures all unknowns, contradictions, and missing constraints are surfaced and resolved (or explicitly accepted) before a plan is compiled.

---

## Ambiguity Score

```
ambiguity_score = 1.0 - (resolved_questions / total_questions)
```

Where:
- `total_questions` includes both agent-generated questions AND implicit unknowns
- `resolved_questions` have operator responses
- `ambiguity_score == 0.0` → fully resolved
- `ambiguity_score == 1.0` → completely ambiguous

### Special Cases

| Condition | ambiguity_score | Valid for compilation? |
|-----------|-----------------|------------------------|
| No questions generated | 1.0 | NO (unknown unknowns) |
| Some questions unresolved | > 0.0 | NO |
| All questions resolved | 0.0 | YES |
| operator_override == true | 0.0 | YES (risk accepted) |

---

## Ambiguity Categories

### 1. Unknowns

Information the agent cannot infer from the intake:
- Technical constraints not stated
- Business rules not documented
- Integration points not identified
- Performance requirements not specified

### 2. Contradictions

Conflicting requirements within the intake:
- "Fast AND memory-efficient" without tradeoff specification
- "Simple AND feature-complete"
- "Real-time AND batch-processed"

### 3. Missing Constraints

Boundaries not defined:
- Scope boundaries (what is explicitly out?)
- Time constraints (deadlines?)
- Resource constraints (team size? infrastructure?)
- Quality constraints (test coverage? accessibility?)

### 4. Cross-Domain Impact

Changes that affect multiple domains:
- Does this require auth changes?
- Does this affect database schema?
- Does this require frontend coordination?
- Does this change API contracts?

### 5. Implicit Assumptions

Unstated beliefs that may not hold:
- "Users will understand this UI" (usability untested)
- "This API is stable" (versioning unclear)
- "This scales" (load testing undefined)

---

## Resolution Workflow

### Phase 1 — Detection

Agent analyzes intake and produces ambiguity report:

```json
{
  "intake_id": "FEATURE-001",
  "analysis_type": "ambiguity-detection",
  "categories": {
    "unknowns": 3,
    "contradictions": 1,
    "missing_constraints": 2,
    "cross_domain_impact": 1,
    "implicit_assumptions": 2
  },
  "total_questions": 9,
  "resolved_questions": 0,
  "ambiguity_score": 1.0
}
```

### Phase 2 — Question Generation

Agent emits structured questions:

```json
{
  "id": "Q1",
  "category": "missing_constraints",
  "severity": "blocking",
  "question": "Are saved searches user-scoped or global?",
  "proposed_options": [
    {
      "label": "User-scoped only",
      "value": "user",
      "description": "Each user sees only their own saved searches",
      "impact": "Requires user_id index, no sharing"
    },
    {
      "label": "Global with user filters",
      "value": "global",
      "description": "Searches are global but filtered by user permissions",
      "impact": "Requires permission model, more complex queries"
    }
  ],
  "default_behavior_if_unanswered": "User-scoped (safer default)"
}
```

### Phase 3 — Operator Response

Operator selects option and provides rationale:

```json
{
  "selected_option": "user",
  "rationale": "Privacy requirements mandate user-scoped storage. Sharing can be added later.",
  "timestamp": "2026-05-22T12:00:00Z"
}
```

### Phase 4 — Score Update

Agent recalculates ambiguity_score:

```
resolved_questions = 1
total_questions = 9
ambiguity_score = 1.0 - (1/9) = 0.89
```

### Phase 5 — Loop or Exit

- If `ambiguity_score > 0.0` → Return to Phase 2 with remaining questions
- If `ambiguity_score == 0.0` → Exit to STABILIZED
- If operator invokes `operator_override` → Exit to STABILIZED with accepted risk

---

## Operator Override

The operator may accept ambiguity and override the resolution requirement:

```
OVERRIDE FEATURE-001
Rationale: Time-critical delivery. Known risks documented in T14.1.
```

### Rules

- Override MUST include explicit rationale
- Override MUST identify which risks are accepted
- Override is logged in intake traceability
- Override does NOT reduce ambiguity_score mathematically, but allows compilation
- Plans compiled with override SHOULD include risk mitigation tickets

---

## Clarification Request Format

When an agent needs operator input during execution (not just planning):

```json
{
  "protocol_version": "1.0.0",
  "type": "CLARIFICATION_REQUEST",
  "status": "PENDING",
  "execution_context": {
    "execution_id": "EXEC-...",
    "milestone_id": "M11",
    "ticket_id": "T11.5"
  },
  "blocking_question": "Description of what is blocked",
  "questions": [
    {
      "id": "Q1",
      "question": "Specific question",
      "proposed_options": [...],
      "default_behavior_if_unanswered": "..."
    }
  ],
  "resolution": {
    "ambiguity_score": 0.5,
    "operator_override": false,
    "next_action": "Await operator response"
  }
}
```

### Storage

Clarification requests stored in:
```
project-governance/runtime/clarifications/
```

### Lifecycle

```
PENDING → RESOLVED (operator response)
PENDING → OVERRIDDEN (operator override)
PENDING → EXPIRED (timeout, default behavior applied)
```

---

## Integration with Execution

During active execution, ambiguity may surface that was not detectable during planning:

1. Agent emits CLARIFICATION_REQUEST
2. Execution thread halts (lock retained)
3. Operator responds
4. Response logged to clarification file and ticket traceability
5. Execution resumes

This prevents:
- Agents making assumptions under uncertainty
- Silent deviations from specification
- Untracked decision drift

---

## Metrics

Track over time:
- Average ambiguity_score at compilation
- Average clarification rounds per intake
- Override frequency
- Time from INTAKE to STABILIZED

Target: Reduce average time-to-stabilized while maintaining score == 0.0 (or documented override).

---

## Enforcement

- `validate-planning.js` (future tool) will check ambiguity_score before compilation
- `resolve-continuation.ts` will not compile plans with ambiguity_score > 0.0 (unless override)
- Governance invariants will flag unapproved overrides
- Ambiguity resolution is auditable via clarification file archive
