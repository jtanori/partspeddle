# VINTRACK — Project Management Scripts Reference

> Operational guide for the `scripts/` directory. Every command validates data integrity before reporting.

---

## Prerequisites

All scripts are Node.js ESM. They read from `project-management/data/` and validate against `project-management/schemas/`.

```bash
npm install        # ensures ajv, ajv-formats are present
```

---

## Script Inventory

| Script | Purpose | Typical Use |
|--------|---------|-------------|
| `validate-pm.js` | Schema + cross-reference validation | CI gate, pre-commit hook |
| `pm-status.js` | Colorful terminal dashboard | Daily standup, quick pulse check |
| `pm-report.js` | Markdown or JSON report | Sprint reviews, stakeholder updates |
| `pm-assess.js` | Structural ticket assessment | Pre-implementation sanity check |

---

## `validate-pm.js`

**What it does:**
- Validates all 53 ticket JSON files against `ticket.schema.json`
- Validates 10 milestones against `milestone.schema.json`
- Validates `dependency-graph.json`, `sequence.json`, `risk-register.json`
- Cross-references: every milestone ticket reference resolves to an existing ticket
- Cross-references: every ticket is referenced by exactly one milestone
- Detects orphaned ticket files in `data/tickets/`

**Usage:**

```bash
npm run pm:validate
# or directly
node scripts/validate-pm.js
```

**Exit codes:**

| Code | Meaning |
|------|---------|
| `0` | All validations passed |
| `1` | One or more validation errors (printed to stderr) |

**CI Integration:**

```yaml
# .github/workflows/ci.yml
- name: Validate Project Management Artifacts
  run: npm run pm:validate
```

**Example Output:**

```
Validating milestones...
  ✅ M1
  ✅ M2
  ...
Validating tickets...
  ✅ T1.1
  ✅ T1.2
  ...
Validating dependency graph...
  ✅ dependency-graph.json
Validating sequence...
  ✅ sequence.json
Validating risk register...
  ✅ risk-register.json
Cross-referencing...

✅ All validations passed
```

---

## `pm-status.js`

**What it does:**
- Prints a color-coded terminal dashboard
- Shows ticket counts by status
- Shows milestone progress bars
- Shows critical path status
- Lists blocked tickets
- Shows next-up ticket

**Usage:**

```bash
npm run pm:status
# or directly
node scripts/pm-status.js
```

**Output Sections:**

| Section | Description |
|---------|-------------|
| `📊 OVERVIEW` | Total tickets, breakdown by status with percentages |
| `📋 MILESTONES` | Progress bar per milestone (completed / total) |
| `🛤️ CRITICAL PATH` | M1 → M2 → M3 → M6 → M10 with icons |
| `🚨 BLOCKED` | Any tickets with `status: blocked` |
| `🎯 IN PROGRESS / NEXT UP` | What's active or queued next |

**Icon Legend:**

| Icon | Meaning |
|------|---------|
| `✅` | Completed |
| `🔄` | In Progress |
| `⏳` | Planned |
| `🚨` | Blocked |

---

## `pm-report.js`

**What it does:**
- Generates a project status report
- Default: Markdown format to stdout
- Optional: JSON format for programmatic consumption

**Usage:**

```bash
# Markdown report (default)
npm run pm:report

# JSON report
npm run pm:report:json

# Direct invocation
node scripts/pm-report.js
node scripts/pm-report.js --json
```

**Markdown Output Includes:**

- Summary table (total tickets, hours, completion rate)
- Milestone progress table
- Critical path table
- Blocked tickets table
- Domain distribution table

**JSON Output Structure:**

```json
{
  "generated_at": "2026-05-19T...",
  "summary": {
    "total_tickets": 53,
    "by_status": { "completed": 1, "planned": 52 },
    "by_domain": { "Shared": 13, "Identity": 8, ... },
    "total_hours": 155,
    "completed_hours": 4
  },
  "milestones": [...],
  "tickets": [...]
}
```

**Redirect to File:**

```bash
npm run pm:report > PROJECT_STATUS.md
npm run pm:report:json > project-status.json
```

---

## `pm-assess.js`

**What it does:**
- Assesses structural health of tickets against the actual codebase
- Checks if deliverables exist on disk
- Checks if tests exist
- Validates ticket schema compliance
- Verifies dependency satisfaction
- Checks governance compliance (traceability, versioning)
- Prints an acceptance criteria matrix

**Usage Modes:**

```bash
# Assess a single ticket
node scripts/pm-assess.js --ticket T1.2

# Assess all tickets in a milestone
node scripts/pm-assess.js --milestone M1

# Assess all tickets in a domain
node scripts/pm-assess.js --domain Shared

# Assess all tickets grouped by domain
node scripts/pm-assess.js --grouped

# Assess all tickets (default)
node scripts/pm-assess.js --all
```

**npm Shortcut:**

```bash
npm run pm:assess -- --ticket T1.2
npm run pm:assess -- --milestone M1 --grouped
```

**Check Categories:**

| Category | Checks |
|----------|--------|
| `STRUCTURE` | Schema validation, milestone reference, acceptance criteria presence |
| `DEPENDENCIES` | Each dependency ticket exists and is `completed` or `review` |
| `IMPLEMENTATION` | Deliverable files exist on disk, test files detected |
| `GOVERNANCE` | Traceability recorded for `completed`/`review` tickets, metadata version |

**Status Icons:**

| Icon | Meaning |
|------|---------|
| `✅` | Check passed |
| `❌` | Check failed |
| `⚠️` | Partial (some deliverables found, not all) |
| `⏸️` | Manual verification required |

**Acceptance Criteria Matrix:**

Each acceptance criterion gets mapped to a verification status:

| Status | When |
|--------|------|
| `✅ VERIFIED` | Automated check confirms (e.g., deliverable file exists) |
| `⏸️ MANUAL` | Requires human verification (suggested command shown) |
| `⚠️ PARTIAL` | Some preconditions met, not all |
| `❌ FAILED` | Automated check failed |

**Example Manual Mappings:**

| Criterion Keyword | Suggested Command |
|-------------------|-------------------|
| `npm run typecheck` | `npm run typecheck` |
| `npm run lint` | `npm run lint` |
| `npm run test` / `test:ci` | Run test suite manually |
| `db migration` / `RLS` | `supabase db reset` |

**Exit Codes:**

| Code | Meaning |
|------|---------|
| `0` | Assessment completed (may contain failures) |

The script always exits `0` — parse stdout for pass/fail counts.

**Example: Pre-Implementation Gate:**

```bash
# Before starting work on a ticket, verify it's ready
node scripts/pm-assess.js --ticket T1.3

# Expected: all dependencies pass, status is planned or in_progress
# If dependencies show ❌, do NOT start implementation
```

**Example: Milestone Readiness Check:**

```bash
# Before declaring a milestone complete
node scripts/pm-assess.js --milestone M1

# Look for:
# - 0 failures across all tickets
# - All deliverables exist
# - All acceptance criteria at least partially verifiable
```

---

## Data Flow

```
project-management/data/
  ├── milestones.json          ← validate-pm.js, pm-status.js, pm-report.js, pm-assess.js
  ├── tickets/*.json           ← all scripts
  ├── dependency-graph.json    ← validate-pm.js
  ├── sequence.json            ← validate-pm.js
  └── risk-register.json       ← validate-pm.js

project-management/schemas/
  ├── milestone.schema.json    ← validate-pm.js
  ├── ticket.schema.json       ← validate-pm.js, pm-assess.js
  ├── dependency-graph.schema.json
  ├── sequence.schema.json
  └── risk-register.schema.json
```

---

## Common Workflows

### Daily Standup

```bash
npm run pm:status
```

### Before Starting a Ticket

```bash
npm run pm:assess -- --ticket T2.3
# Verify dependencies are complete
# Verify deliverables from prior tickets exist
```

### Before a PR

```bash
npm run pm:validate    # ensure JSON is still valid
npm run lint           # code quality
npm run typecheck      # TypeScript strict
npm run test:unit      # unit tests
npm run pm:assess -- --ticket T1.2   # verify ticket health
```

### Sprint Review

```bash
npm run pm:report > sprint-review.md
```

### Adding a New Ticket

1. Create `project-management/data/tickets/T{x}.{y}.json`
2. Add ticket ID to `project-management/data/milestones.json` under correct milestone
3. Run `npm run pm:validate`
4. Run `npm run pm:assess -- --ticket T{x}.{y}`

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `unknown format "date-time"` | ajv-cli without formats | Use `scripts/validate-pm.js` instead of raw `ajv-cli` |
| `Module not found` | Missing `ajv` or `ajv-formats` | `npm install` |
| `Orphaned ticket file` | Ticket file exists but not referenced by any milestone | Add ticket ID to milestone, or delete file |
| `Milestone references missing ticket` | Ticket ID typo in milestone | Fix milestone JSON |
| `Status planned does not require traceability` | Info, not error | Only `completed`/`review` tickets require traceability |
| `14/15 found` on deliverables | Template placeholder (`src/<domain>/...`) | Expected — assess script skips template paths |

---

## Script Maintenance

When modifying scripts:

1. Update this reference document
2. Run `npm run pm:validate`
3. Run `npm run pm:assess -- --all` to verify no regressions
4. Commit with message: `chore(shared): update pm-assess to support X (T1.x)`

---

## Final Principle

These scripts are the operational interface to the project's governance. If they lie, the governance is meaningless. If they are ignored, the governance is theoretical. Treat script output as authoritative.
