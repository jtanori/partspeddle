---
authority:
  level: protocol
  layer: 2
  canonical: true
  supersedes: []
  derives_from:
    - runtime-governance-kernel.md
  scope: planning
  status: active
  version: 1.0.0
---

# Ticket Creation Protocol

> **Authority:** `meta/state/canonical-state.json`  
> **Purpose:** Ensure every ticket is created as a single, validated JSON file with provenance tracked in its parent milestone.  
> **Version:** 1.0.0  
> **Status:** Active

---

## Principle

> **Every ticket must exist as exactly one JSON file in `project-management/data/tickets/`. No monolithic ticket arrays permitted.**

This protocol eliminates the `governance-tickets.json` anti-pattern by enforcing one-ticket-one-file from inception.

---

## Prerequisites

Before creating a ticket:

1. The parent **milestone must exist** in either:
   - `project-management/data/milestones.json`
   - `project-management/data/governance-milestones.json`
2. The ticket ID must be **reserved** in the milestone's `tickets` array.
3. The ticket ID must conform to pattern `^T[0-9]+(\.[0-9A-Z]+)+$`.

---

## Creation Workflow

### Step 1 — Draft Ticket JSON

Create a JSON object conforming to `project-management/schemas/ticket.schema.json`.

**Minimum required fields:**

```json
{
  "id": "T12.1",
  "milestone_id": "M12",
  "title": "Define JSON source format",
  "domain": "Shared",
  "capability": "Projection",
  "purpose": "Why this ticket exists",
  "dependencies": [],
  "deliverables": [
    { "path": "meta/projections/json-source-format.md", "description": "...", "type": "file" }
  ],
  "acceptance_criteria": ["Criterion 1", "Criterion 2"],
  "estimated_hours": 2,
  "status": "planned"
}
```

### Step 2 — Write File

Write the JSON to `project-management/data/tickets/{id}.json` with `JSON.stringify(data, null, 2)`.

### Step 3 — Register in Milestone

Update the parent milestone's `ticket_paths` object:

```json
"ticket_paths": {
  "T12.1": {
    "path": "tickets/T12.1.json",
    "exists": true,
    "isValid": false
  }
}
```

### Step 4 — Validate

Run the project management validator:

```bash
node scripts/validate-pm.js
```

If validation fails:
- Fix the ticket JSON
- Re-run validation
- Do **not** proceed to Step 5 until it passes

### Step 5 — Mark Valid

On successful validation, update the milestone:

```json
"ticket_paths": {
  "T12.1": {
    "path": "tickets/T12.1.json",
    "exists": true,
    "isValid": true
  }
}
```

### Step 6 — Commit

```bash
git add project-management/data/tickets/T12.1.json project-management/data/governance-milestones.json
git commit -m "feat(governance): add ticket T12.1 (M12)"
```

---

## Automation

Use `scripts/create-ticket.ts` to perform Steps 2–5 automatically:

```bash
./node_modules/.bin/tsx scripts/create-ticket.ts \
  --file path/to/draft-ticket.json
```

Or create inline:

```bash
./node_modules/.bin/tsx scripts/create-ticket.ts \
  --id T12.1 \
  --milestone M12 \
  --title "Define JSON source format" \
  --domain Shared \
  --capability "Projection" \
  --purpose "Document the canonical JSON source format for projections" \
  --deliverables '[{"path":"meta/projections/json-source-format.md","type":"file","description":"JSON source format spec"}]' \
  --acceptance-criteria '["Schema defines all required fields","Example JSON provided"]'
```

---

## State Machine

```
DRAFT ──► WRITTEN ──► REGISTERED (exists=true, isValid=false)
                              │
                              ▼
                        VALIDATED (isValid=true)
                              │
                              ▼
                         COMMITTED
```

A ticket is **not considered valid** for execution until `ticket_paths[id].isValid === true`.

---

## Enforcement

- `validate-pm.js` will fail if a ticket file exists but is not registered in `ticket_paths`
- `resolve-continuation.ts` will not select a ticket whose `isValid` is `false`
- Milestone progress reports exclude invalid tickets from completion metrics
