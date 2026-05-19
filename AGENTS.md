# VINTRACK Agent Configuration

> Project-level agent directives for the VINTRACK MVP.
> These rules supplement user-scope skills (`blueprint-init`, `rtk-optimization`, `session-optimizer`).
>
> This document merges Master Blueprint discipline with JSON-based project management.

---

## Source of Truth Hierarchy

| Authority | Location | Format |
|-----------|----------|--------|
| Architecture | `project-knowledge/` | Markdown |
| Milestones & Tickets | `project-management/data/` | JSON + Schema |
| Domain Blueprints | `blueprints/<domain>/` | Markdown |
| Reference Cards | `project-knowledge/<domain>/` | Markdown |
| Governance | `project-knowledge/*-standards.md` | Markdown |

**Rule:** `project-management/data/milestones.json` and `data/tickets/*.json` are the absolute authorities for implementation sequencing. No code work without a valid ticket.

---

## Session Management Rules

### Context Budget

VINTRACK blueprints are dense. Each domain generates ~3,000+ lines of specification. Observe these limits:

| Phase | Max Context | Action at Limit |
|-------|------------|-----------------|
| Blueprint synthesis | 1 domain (~3,000 lines) | Generate REFERENCE.md, then reset |
| Implementation | 1 bounded context | Reset when switching contexts |
| Cross-domain review | 2 domains max | Use reference cards only |
| Architecture review | All REFERENCE.md files | Never load full blueprints |

### Domain Switch Protocol

When moving from one bounded context to another:

1. **STOP** — Do not accumulate context
2. **Generate REFERENCE.md** for the current domain if not exists
3. **Recommend reset** — Offer fresh session with only the new domain's canonical docs
4. **If user declines** — Compress old domain to reference-card-only; do not quote inline

### Progressive Loading Order

When starting work on any VINTRACK task:

```
1. Read ticket from project-management/data/tickets/T{milestone}.{sequence}.json
2. Grep/Find for keywords → locate relevant files
3. Read <DOMAIN>-REFERENCE.md (if exists) → 300-400 lines
4. Read specific sections via line_offset → 50-100 lines
5. Read full file → ONLY when granular detail required
6. NEVER pre-load all of project-knowledge/
```

---

## Communication Rules

### Question Refinement

If the user asks a broad question, offer a scope-narrowed rewrite in ≤ 3 lines before answering. Examples:

- "Implement Transactions" → "Generate `transactions/entities.md` and `state-machine.md` only?"
- "Review the blueprints" → "Review `overview.md` for consistency with domain-map — flag 3 issues?"
- "Add tests" → "Add unit tests for state machine transitions, or integration tests for outbox relay?"

### Response Constraints

- Reference files by path: "See `entities.md` lines 45-60" instead of quoting
- End every substantive response with 2–3 concise next questions
- Use `[Decision]`, `[Deep-dive]`, `[Scope]`, `[Action]` prefixes on next questions

---

## RTK Optimization

RTK is installed on this system. **All shell commands must be RTK-prefixed** when a filter exists:

```bash
rtk ls .              # instead of ls -la
rtk read file.md      # instead of cat
rtk grep "pattern" .  # instead of grep -r
rtk git status        # instead of git status
rtk git diff          # instead of git diff
rtk find "*.md" .     # instead of find
```

Keep raw (no prefix): `ps`, `mkdir`, `touch`, `rm`, `echo`, `chmod`, short one-liners.

See `~/.kimi/skills/rtk-optimization/references/command-matrix.md` for full mapping.

---

## Ticket-Driven Development (TDD)

### Ticket Authority

- Every implementation task MUST trace to a ticket in `project-management/data/tickets/*.json`
- Ticket IDs follow the format `T{milestone}.{sequence}`: `T1.1`, `T2.3`, `T6.7`
- No implementation without an approved ticket
- Tickets are validated against `schemas/ticket.schema.json`

### Ticket Lifecycle

```
planned → in_progress → review → completed
```

| Transition | Trigger | Required Action |
|------------|---------|-----------------|
| `planned` → `in_progress` | Agent starts work | Update `status`, set `assignee` |
| `in_progress` → `review` | Code complete | All acceptance criteria checked |
| `review` → `completed` | Human approval + CI pass | Update `status`, record `git_commit` |

### Traceability

Every code change MUST update the ticket's traceability:

```json
{
  "traceability": [
    {
      "commit_hash": "abc1234",
      "files_changed": ["src/identity/domain/entities/user.ts"],
      "description": "Implemented User aggregate with email uniqueness invariant",
      "timestamp": "2026-05-18T12:00:00Z"
    }
  ]
}
```

### Atomic Commit Rule

- One ticket = One atomic commit (or tightly scoped PR)
- Commit message format: `{type}({domain}): {description} (T{milestone}.{sequence})`
- Examples:
  - `feat(identity): implement User aggregate with email validation (T2.2)`
  - `fix(transactions): handle duplicate PaymentIntent idempotency (T6.3)`
  - `test(marketplace): add RLS integration tests for listings (T3.6)`

### Validation Gate

Every commit MUST pass:

```bash
npm run lint        # ESLint + Prettier
npm run typecheck   # tsc --noEmit
npm run test:unit   # Unit tests for affected domain
```

CI blocks merge on any failure.

---

## Workflow Orchestration

### Plan Mode Default

Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions):

1. Read the ticket from `project-management/data/tickets.json`
2. Identify dependencies and blockers
3. List acceptance criteria from the ticket
4. Plan implementation steps
5. Verify plan before writing code

If something goes sideways, STOP and re-plan immediately.

### Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- One task per subagent for focused execution
- Subagents MUST reference ticket ID in their prompt

### Batch Processing

Agents work in **batches**, not single tickets:

| Batch | Scope | Review Gate |
|-------|-------|-------------|
| Batch A | M1 + M2 schema + entities | Architecture Gate |
| Batch B | M2 repositories + API + M3 schema | Schema Gate + API Gate |
| Batch C | M3 implementation + M4/M5 parallel | API Gate |
| Batch D | M6 core (cart → checkout → escrow) | **Trust Gate (mandatory)** |
| Batch E | M6 settlement + M7/M8/M9 parallel | Trust Gate |
| Batch F | M10 + integration hardening | Architecture Gate |

**Rule:** Batch size constrained by context score. If 🟠 Compress triggered, split batch.

### Self-Improvement Loop

After ANY correction from the user:

1. Log the pattern in `project-management/lessons.md`
2. Write a rule to prevent recurrence
3. Review `lessons.md` at session start

Format:

```markdown
## 2026-05-18 — Pattern: Cross-domain import

**Mistake:** Imported `transactions/domain/entities` from `marketplace/`
**Fix:** Added ESLint rule, reverted import, used event instead
**Rule:** NEVER import across domain boundaries. Use events only.
```

---

## Verification & Quality Standards

### "Staff Engineer" Standard

Never mark a task complete without proving it works:

- [ ] Unit tests pass for new domain logic
- [ ] Integration tests pass for DB schema changes
- [ ] Event contract tests pass for new/changed events
- [ ] TypeScript compiles with `strict: true`
- [ ] Lint passes with zero errors
- [ ] Diff reviewed: only intended files changed

Ask: **"Would a staff engineer approve this?"**

### Demand Elegance

For non-trivial changes, pause and ask: **"Is there a more elegant way?"**

- If a fix feels hacky, re-implement elegantly
- Skip this for simple, obvious fixes
- Challenge your own work before presenting it

### Autonomous Bug Fixing

When given a bug:

1. Read logs, errors, failing tests
2. Identify root cause (not symptom)
3. Fix deterministically
4. Add regression test
5. No hand-holding required

Fix failing CI tests autonomously.

---

## Blueprint Discipline

### Scope Boundaries (MVP)

Allowed domains: Identity, Marketplace, AI Intelligence, Search, Transactions, Messaging, Vault (simplified), Notifications.

**Explicitly excluded:** Advanced reputation, multi-vault orchestration, distributed logistics, graph-native runtime, autonomous moderation, complex fraud systems.

### Implementation Sequence

```
Ticket approved → Domain blueprinting → State machine → DB schema →
API contracts → Queue topology → Observability → Security → Tests →
Code generation → Validation gate → Review → Complete
```

---

## Testing Discipline

TDD is non-negotiable. Every subsystem must support:

- Deterministic unit tests
- Integration tests (DB triggers, RLS, queues)
- Event contract tests
- Failure-path tests

Untestable systems are incomplete systems.

---

## Core Principles

- **Simplicity First:** Make every change as simple as possible. Impact minimal code.
- **Determinism:** Every system action must be repeatable.
- **Atomic Commits:** One ticket = One atomic, verified commit.
- **No Laziness:** Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact:** Changes should only touch what's necessary.

---

## Project Management Commands

```bash
# Validate all JSON against schemas
npm run pm:validate

# Generate status report from JSON
npm run pm:status

# Generate REPORT.md from JSON
npm run pm:report

# Show critical path
npm run pm:critical-path
```

---

## Final Principle

VINTRACK is infrastructure, and application software. Every decision reinforces: trust, determinism, auditability, observability, and operational resilience.
