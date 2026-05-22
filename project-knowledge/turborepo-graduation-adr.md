# VINTRACK — Turborepo Graduation ADR

> **Status:** Architectural Decision Record
> **Decision:** Remain monorepo-lite (single package.json) for MVP
> **Date:** 2026-05-19

---

## 1. Context

VINTRACK currently uses a "monorepo-lite" approach: single `package.json` at root, no workspaces (Turborepo, Nx, pnpm workspaces).

This is intentional and correct for MVP scope.

---

## 2. Decision

**Keep monorepo-lite for MVP. Graduate to workspace orchestration only when trigger criteria are met.**

---

## 3. Rationale

### 3.1 Why Monorepo-Lite Is Correct Now

- **Simplicity:** One `package.json`, one `node_modules`, one `tsconfig.json`
- **Speed:** No workspace resolution overhead
- **Governance:** Single lint config, single CI pipeline, single test runner
- **Team size:** Small team doesn't need package isolation
- **Deployment:** One deployable for MVP (frontend on Vercel, backend separately)

### 3.2 Why Not Turborepo/Nx Now

- Adds configuration complexity without solving current problems
- Remote caching requires infrastructure
- Workspace boundaries create friction for rapid MVP iteration
- Frontend and backend share many devDependencies (TypeScript, Zod, Vitest)

---

## 4. Graduation Criteria

Graduate to Turborepo/Nx when ANY of the following triggers are met:

| Trigger | Threshold | Rationale |
|---------|-----------|-----------|
| Multiple deployables | >2 independently deployed services | Frontend, backend, edge workers all deploy separately |
| Mobile app | React Native or Flutter added | Needs separate build pipeline |
| Build time degradation | CI build >5 minutes | Remote caching becomes valuable |
| Package isolation | Different dependency versions needed | e.g., backend needs Express 4, edge needs Express 5 |
| AI services | Separate Python/Go services | Different runtime, different tooling |
| Team scale | >8 engineers | Workspace boundaries reduce merge conflicts |
| External packages | Publishing internal packages | Needs versioning and publishing pipeline |

---

## 5. Pre-Graduation Checklist

Before graduating, ensure:

- [ ] Current monorepo-lite is documented and stable
- [ ] All shared code is in `src/shared/` (easy to extract to packages)
- [ ] Contracts layer is well-defined (becomes first internal package)
- [ ] CI pipeline is modular (jobs can be split per workspace)
- [ ] Team understands workspace boundaries

---

## 6. Post-Graduation Plan

When graduation occurs:

1. **Create packages:**
   - `@vintrack/contracts` (from `src/shared/contracts/`)
   - `@vintrack/types` (from `src/shared/types/`)
   - `@vintrack/constants` (from `src/shared/constants/`)

2. **Create workspaces:**
   - `apps/web` (frontend)
   - `apps/api` (backend)
   - `packages/shared` (contracts, types, constants)

3. **Preserve governance:**
   - Ticket-driven methodology remains
   - ADR process remains
   - Import direction matrix updated for workspace boundaries
   - Surface switch protocol updated for workspace context

4. **CI migration:**
   - Turborepo remote caching
   - Affected workspace detection (only test what changed)
   - Parallel job execution

---

## 7. Risks of Premature Graduation

| Risk | Likelihood | Impact |
|------|-----------|--------|
| Configuration overhead slows development | High | Medium |
| Workspace boundaries create artificial friction | Medium | Medium |
| Remote caching adds infrastructure complexity | Medium | Low |
| Team confusion about package boundaries | Medium | Medium |

---

## 8. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-19 | Monorepo-lite for MVP | Simplicity, speed, team size |
| TBD | Graduate when criteria met | Scale demands |
