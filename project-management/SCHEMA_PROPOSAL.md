# VINTRACK — Schema Proposal: JSON Migration for Milestones & Tickets

## Objective

Convert milestones and tickets from Markdown to JSON with strict schemas. This enables machine validation, programmatic querying, and tool integration.

---

## 1. Directory Structure Change

```
project-management/
├── schemas/
│   ├── milestone.schema.json      # JSON Schema for milestones
│   └── ticket.schema.json         # JSON Schema for tickets
├── data/
│   ├── milestones.json            # All 10 milestones as JSON array
│   └── tickets.json               # All 53 tickets as JSON array
├── legacy/                        # Archive of MD files post-migration
│   ├── milestones.md
│   └── tickets/
├── REPORT.md                      # Stays as MD (human-readable)
├── execution-order/
├── dependency-graph/
└── risk-register/
```

---

## 2. Milestone Schema (`milestone.schema.json`)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://vintrack.io/schemas/milestone",
  "title": "Milestone",
  "type": "object",
  "required": ["id", "phase", "title", "purpose", "trust_principle", "exit_criteria", "tickets"],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^M[0-9]+$",
      "description": "Milestone identifier, e.g. M1, M2"
    },
    "phase": {
      "type": "integer",
      "minimum": 1,
      "description": "Phase number in execution sequence"
    },
    "title": {
      "type": "string",
      "minLength": 3,
      "description": "Human-readable milestone title"
    },
    "purpose": {
      "type": "string",
      "minLength": 10,
      "description": "One-paragraph purpose statement"
    },
    "trust_principle": {
      "type": "string",
      "description": "Trust-level justification for this milestone"
    },
    "scope": {
      "type": "object",
      "properties": {
        "in": {
          "type": "array",
          "items": { "type": "string" }
        },
        "out": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    },
    "exit_criteria": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1
    },
    "tickets": {
      "type": "array",
      "items": { "type": "string", "pattern": "^T[0-9]+\\.[0-9]+$" },
      "description": "Array of ticket IDs belonging to this milestone"
    },
    "dependencies": {
      "type": "array",
      "items": { "type": "string", "pattern": "^M[0-9]+$" },
      "description": "Milestone IDs that must complete before this one"
    },
    "downstream_impact": {
      "type": "string",
      "description": "Description of what this milestone blocks"
    },
    "estimated_duration_days": {
      "type": "number",
      "minimum": 0.5
    },
    "status": {
      "type": "string",
      "enum": ["planned", "in_progress", "blocked", "completed"],
      "default": "planned"
    },
    "metadata": {
      "type": "object",
      "properties": {
        "created_at": { "type": "string", "format": "date-time" },
        "updated_at": { "type": "string", "format": "date-time" },
        "version": { "type": "integer", "minimum": 1 }
      }
    }
  }
}
```

### Example: M1 as JSON

```json
{
  "id": "M1",
  "phase": 1,
  "title": "Runtime Foundations",
  "purpose": "Establish the runtime layer upon which all domains depend.",
  "trust_principle": "If the foundation is wrong, every domain built on it is wrong.",
  "scope": {
    "in": [
      "Repository initialization",
      "Shared infrastructure (event bus, outbox, queue, observability)",
      "Database governance (migrations, RLS patterns, connection pooling)",
      "CI pipeline (lint, test, build)",
      "Local development environment"
    ],
    "out": [
      "Business logic",
      "Domain-specific code",
      "Frontend code",
      "Production deployment automation"
    ]
  },
  "exit_criteria": [
    "npm run dev starts API server",
    "npm run test:ci passes with empty test suite",
    "npm run infra:up starts Postgres + Redis",
    "supabase db reset applies migrations cleanly",
    "Shared event envelope library compiles",
    "Queue bootstrap connects to Redis"
  ],
  "tickets": ["T1.1", "T1.2", "T1.3", "T1.4", "T1.5", "T1.6", "T1.7", "T1.8"],
  "dependencies": [],
  "downstream_impact": "Blocks ALL subsequent milestones.",
  "estimated_duration_days": 3,
  "status": "in_progress",
  "metadata": {
    "created_at": "2026-05-18T00:00:00Z",
    "updated_at": "2026-05-18T17:00:00Z",
    "version": 1
  }
}
```

---

## 3. Ticket Schema (`ticket.schema.json`)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://vintrack.io/schemas/ticket",
  "title": "Ticket",
  "type": "object",
  "required": ["id", "milestone_id", "title", "domain", "capability", "purpose", "deliverables", "acceptance_criteria"],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^T[0-9]+\\.[0-9]+$",
      "description": "Ticket identifier, e.g. T1.1, T2.3"
    },
    "milestone_id": {
      "type": "string",
      "pattern": "^M[0-9]+$"
    },
    "title": {
      "type": "string",
      "minLength": 5
    },
    "domain": {
      "type": "string",
      "enum": ["Shared", "Identity", "Marketplace", "AI Intelligence", "Search", "Transactions", "Messaging", "Vault", "Notifications"]
    },
    "capability": {
      "type": "string",
      "description": "Capability group within the domain"
    },
    "purpose": {
      "type": "string",
      "minLength": 10
    },
    "dependencies": {
      "type": "array",
      "items": { "type": "string", "pattern": "^T[0-9]+\\.[0-9]+$" }
    },
    "architectural_constraints": {
      "type": "array",
      "items": { "type": "string" }
    },
    "deliverables": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["path", "description"],
        "properties": {
          "path": { "type": "string" },
          "description": { "type": "string" },
          "type": {
            "type": "string",
            "enum": ["file", "directory", "migration", "config", "test"],
            "default": "file"
          }
        }
      }
    },
    "acceptance_criteria": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1
    },
    "observability": {
      "type": "object",
      "properties": {
        "metrics": {
          "type": "array",
          "items": { "type": "string" }
        },
        "logs": {
          "type": "array",
          "items": { "type": "string" }
        },
        "traces": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    },
    "failure_modes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["scenario", "mitigation"],
        "properties": {
          "scenario": { "type": "string" },
          "mitigation": { "type": "string" },
          "severity": {
            "type": "string",
            "enum": ["low", "medium", "high", "critical"]
          }
        }
      }
    },
    "estimated_hours": {
      "type": "number",
      "minimum": 0.5
    },
    "status": {
      "type": "string",
      "enum": ["planned", "in_progress", "review", "blocked", "completed"],
      "default": "planned"
    },
    "assignee": {
      "type": ["string", "null"],
      "description": "Agent or human owner"
    },
    "metadata": {
      "type": "object",
      "properties": {
        "created_at": { "type": "string", "format": "date-time" },
        "updated_at": { "type": "string", "format": "date-time" },
        "version": { "type": "integer", "minimum": 1 }
      }
    }
  }
}
```

### Example: T1.1 as JSON

```json
{
  "id": "T1.1",
  "milestone_id": "M1",
  "title": "Repository & Runtime Initialization",
  "domain": "Shared",
  "capability": "Runtime Bootstrap",
  "purpose": "Generate the entire foundational file system upon which all subsequent implementation depends. This ticket is the root of reproducibility.",
  "dependencies": [],
  "architectural_constraints": [
    "TypeScript 5.x strict mode (strict: true)",
    "ESM modules only (\"type\": \"module\")",
    "Exact version pinning (no ^ or ~)",
    "Node.js 20+ LTS"
  ],
  "deliverables": [
    { "path": "package.json", "description": "Dependencies, scripts, engine requirements", "type": "config" },
    { "path": "tsconfig.json", "description": "TypeScript 5.x strict, ESM, NodeNext resolution", "type": "config" },
    { "path": "eslint.config.js", "description": "Lint rules, no-explicit-any, cross-domain import guards", "type": "config" },
    { "path": ".prettierrc", "description": "Formatting rules", "type": "config" },
    { "path": ".gitignore", "description": "Ignore patterns", "type": "config" },
    { "path": ".env.example", "description": "Environment variable template", "type": "config" },
    { "path": "docker-compose.dev.yml", "description": "Postgres + Redis with healthchecks", "type": "config" },
    { "path": "vitest.config.ts", "description": "Base test config with coverage thresholds", "type": "config" },
    { "path": "src/app.ts", "description": "Express bootstrap with health endpoints", "type": "file" },
    { "path": "src/shared/observability/logger.ts", "description": "Structured JSON logger", "type": "file" },
    { "path": "src/shared/errors/domain-error.ts", "description": "Base domain error class", "type": "file" },
    { "path": "src/<domain>/...", "description": "Full directory scaffold per module-template.md", "type": "directory" }
  ],
  "acceptance_criteria": [
    "npm install succeeds with zero warnings",
    "npm run typecheck passes (tsc --noEmit)",
    "npm run lint passes with zero errors",
    "npm run infra:up starts Postgres + Redis",
    "npm run dev starts API server on port 3000",
    "GET /health/ready returns 200",
    "Directory structure matches repository-structure.md",
    "All files committed to git with descriptive message"
  ],
  "observability": {
    "metrics": [],
    "logs": [],
    "traces": []
  },
  "failure_modes": [
    {
      "scenario": "Engine mismatch",
      "mitigation": "package.json engines field blocks install",
      "severity": "medium"
    },
    {
      "scenario": "Port conflict",
      "mitigation": ".env.example documents PORT override",
      "severity": "low"
    },
    {
      "scenario": "Docker unavailable",
      "mitigation": "Document local Postgres/Redis install steps",
      "severity": "medium"
    }
  ],
  "estimated_hours": 4,
  "status": "completed",
  "assignee": "Agent 1",
  "metadata": {
    "created_at": "2026-05-18T00:00:00Z",
    "updated_at": "2026-05-18T17:00:00Z",
    "version": 1
  }
}
```

---

## 4. Benefits of JSON + Schema

| Capability | Markdown | JSON + Schema |
|------------|----------|---------------|
| Machine validation | ❌ Manual review | ✅ `ajv validate` |
| Programmatic query | ❌ Regex/grep | ✅ `jq '.tickets[] | select(.domain == "Identity")'` |
| Dashboard generation | ❌ Manual | ✅ Auto-generated from JSON |
| Status tracking | ❌ Text search | ✅ `status` enum field |
| Dependency graph | ❌ Manual draw | ✅ Auto-render from `dependencies` arrays |
| CI integration | ❌ None | ✅ Validate schemas in CI |
| Report generation | ❌ Manual | ✅ Template + data = report |

---

## 5. Migration Plan

### Step 1: Create schemas
- Write `schemas/milestone.schema.json`
- Write `schemas/ticket.schema.json`
- Validate schemas against JSON Schema meta-schema

### Step 2: Convert existing data
- Parse all MD milestone/ticket files
- Extract structured data
- Emit `data/milestones.json` (array of 10 milestones)
- Emit `data/tickets.json` (array of 53 tickets)

### Step 3: Validate
- Run `ajv` against schemas
- Fix any validation errors
- Ensure all ticket `milestone_id` values reference valid milestones
- Ensure all milestone `tickets` arrays reference valid tickets

### Step 4: Archive
- Move `milestones.md` and `tickets/*.md` to `legacy/`
- Update `AGENTS.md` to reference JSON files
- Update `REPORT.md` generation to use JSON source

### Step 5: Tooling
- Add `npm run pm:validate` script (validate JSON against schemas)
- Add `npm run pm:report` script (generate REPORT.md from JSON)
- Add `npm run pm:status` script (show milestone/ticket status summary)

---

## 6. Impact Assessment

| Area | Impact | Mitigation |
|------|--------|------------|
| Existing MD files | Archived to `legacy/` | Preserved, not deleted |
| REPORT.md | Regenerated from JSON | Script auto-generates |
| Execution order | References milestone IDs | No change needed |
| Dependency graph | References milestone/ticket IDs | No change needed |
| Risk register | Standalone MD | No change needed |
| AGENTS.md | Reference update | Single line change |
| Skills | None | Skills reference AGENTS.md |

---

## 7. Validation Example

```bash
# Validate milestones
npx ajv validate -s schemas/milestone.schema.json -d data/milestones.json

# Validate tickets
npx ajv validate -s schemas/ticket.schema.json -d data/tickets.json

# Query: find all Identity domain tickets
jq '.[] | select(.domain == "Identity") | .id' data/tickets.json

# Query: find incomplete milestones
jq '.[] | select(.status != "completed") | {id, title, status}' data/milestones.json
```

---

## Recommendation

**Proceed with migration.** JSON + schema provides:
- Deterministic validation (no drift)
- Programmatic access (scripts, dashboards)
- CI enforcement (break build on invalid JSON)
- Single source of truth (generate all reports from data)

The upfront cost is low (~30 min conversion). The long-term value is high.
