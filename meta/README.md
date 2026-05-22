# /meta — Canonical Governance Root

> **Authority:** `runtime-governance-kernel.md`  
> **Purpose:** Stable, detachable governance root for the VINTRACK execution runtime.  
> **Principle:** JSON is truth. Markdown is projection.  
> **Version:** 1.0.0

---

## Canonical State Principle

This directory is the **single source of truth** for all governance artifacts that must survive independent of any agent session, context window, or execution surface.

```
JSON  = canonical state (machine-readable, validated, versioned)
Markdown = human projection (generated, not authored)
```

No Markdown file in this tree is authored by hand. All Markdown is derived from JSON via the projection engine.

## Directory Taxonomy

| Directory | Purpose | Authority |
|-----------|---------|-----------|
| `schemas/` | Canonical JSON Schema definitions for all governance entities | `protocols/EXECUTION_LIFECYCLE_PROTOCOL.md` |
| `runtime/` | Runtime state snapshots, checkpoints, and execution logs | `protocols/CHECKPOINT_PROTOCOL.md` |
| `workflows/` | Execution workflow definitions and lifecycle state machines | `protocols/EXECUTION_LIFECYCLE_PROTOCOL.md` |
| `events/` | Governance event log storage (append-only) | `protocols/STATE_MUTATION_RULES.md` |
| `projections/` | Markdown projections generated from canonical JSON | `scripts/generate-runtime-projections.ts` |

## Detachability

This directory contains **zero VINTRACK product runtime code**. It is governance infrastructure only. It may be extracted, versioned, and reused across projects without modification.

## Migration from project-governance/

The existing `project-governance/` directory contains historical governance artifacts. Migration to `/meta` is phased:

1. **Phase 1:** `/meta` structure created (this ticket)
2. **Phase 2:** Schemas migrate to `/meta/schemas/`
3. **Phase 3:** Runtime state migrates to `/meta/runtime/`
4. **Phase 4:** Projections migrate to `/meta/projections/`
5. **Phase 5:** `project-governance/` deprecated

## Schema Versioning

All JSON schemas in `/meta/schemas/` follow these rules:

- **Schema `$id`:** `https://vintrack.io/schemas/{entity}.schema.json`
- **Semantic versioning:** Major bumps on breaking structural changes; minor on additive changes; patch on documentation fixes.
- **Draft 07:** All schemas use JSON Schema Draft 07 for broad tooling compatibility.
- **Evolution pattern:** Base schemas (T11.3) define core structures. Specialized schemas (T14.1) extend or finalize via `$ref` or replacement.
- **Validation gate:** Every schema change must pass against at least one existing canonical artifact before merge.

## Versioning

All schemas and state definitions in this tree are versioned under SemVer.

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-05-22 | Initial `/meta` root established. |
