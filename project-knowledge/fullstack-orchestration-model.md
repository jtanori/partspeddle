# VINTRACK — Fullstack Orchestration Model

> **Status:** Canonical Governance Document
> **Scope:** Backend, frontend, shared contracts, CI/CD, deployment
> **Effective:** 2026-05-19

---

## 1. Purpose

Define how frontend execution surfaces integrate into the existing VINTRACK orchestration system without forking governance, duplicating contracts, or creating isolated workspaces.

VINTRACK is an **operational platform**, not "a backend + a frontend." The frontend is a bounded execution surface governed by the same ticket system, ADR process, CI strategy, and traceability model as the backend.

---

## 2. Core Doctrine

### 2.1 The Methodology Remains Singular

There is ONE orchestration methodology for VINTRACK. It governs:

- Backend domains (Identity, Marketplace, Transactions, etc.)
- Frontend surfaces (pages, components, API access layer)
- Shared infrastructure (contracts, events, observability)
- CI/CD pipelines
- Deployment topology

**What this prevents:**
- Governance forks
- Contract duplication
- CI divergence
- Ownership blurring
- Frontend velocity bypassing architectural discipline

### 2.2 Execution Surfaces

| Surface | Location | Runtime | Role |
|---------|----------|---------|------|
| `backend` | `src/backend/` | Node.js | APIs, queues, events, domain logic |
| `frontend` | `src/frontend/` | Next.js (RSC + Client) | User interface, auth integration, data presentation |
| `shared` | `src/shared/` | Runtime-agnostic | Contracts, schemas, constants, feature flags |

Each surface has explicit runtime constraints, import rules, and deployment boundaries.

### 2.3 Contract Sovereignty

The **backend domain layer owns semantic truth**. Shared contracts in `src/shared/contracts/` are projections of backend domain semantics.

**Frontend may:**
- Compose data for presentation
- Transform shapes for UI convenience
- Aggregate multiple backend responses

**Frontend may NEVER:**
- Define its own API types
- Create "temporary client types" that bypass shared contracts
- Duplicate Zod schemas
- Interpret events with different semantics than backend

See `contract-evolution-policy.md` for detailed change governance.

---

## 3. Repository Structure

### 3.1 Canonical Layout

```
src/
  backend/
    identity/           # DDD bounded context
    marketplace/
    transactions/
    ...
    app.ts              # Express bootstrap
  frontend/
    app/                # Next.js App Router
    lib/
      api/              # Typed API access layer
      supabase/         # Browser + SSR clients
    components/
      ui/               # shadcn/ui primitives
      identity/         # Identity domain components
      marketplace/      # Marketplace domain components
      search/           # Search domain components
    hooks/
    styles/
  shared/
    contracts/          # Zod schemas, shared TypeScript types
    constants/
    feature-flags/      # Typed feature flag definitions
```

### 3.2 Migration Rule

Existing `src/identity/` → `src/backend/identity/`. All relative imports within backend domains prepend `backend/` to the path. This is a one-time move.

---

## 4. Cross-Surface Relationships

### 4.1 Backend → Frontend

```
Backend API (REST) ──→ Frontend consumes via lib/api/
Backend Events ──→ Frontend subscribes via realtime (future)
Backend Domain ──→ Owns contracts in src/shared/contracts/
```

### 4.2 Frontend → Backend

```
Frontend Server Component ──→ reads session, forwards JWT
Frontend Client Component ──→ calls API via lib/api/ (auth injected)
Frontend NEVER queries Supabase DB directly for business data
```

### 4.3 Shared Layer

```
src/shared/contracts/ ──→ Consumed by BOTH surfaces
src/shared/constants/ ──→ Consumed by BOTH surfaces
src/shared/feature-flags/ ──→ Evaluated by backend, read by frontend
```

---

## 5. Milestone Governance

### 5.1 Frontend Milestones Interleave with Backend

Milestones are numbered sequentially across ALL surfaces:

```
M1: Runtime Foundations      (backend)
M2: Identity Domain          (backend)
M3: Frontend Foundation      (frontend)
M4: Marketplace Search       (backend + frontend)
M5: Listings                 (backend + frontend)
M6: Transaction Orchestration(backend)
M7: Messaging                (backend + frontend)
M8: Payments                 (backend + frontend)
```

### 5.2 Ticket Format

Same `T{milestone}.{sequence}` format applies to frontend tickets:

- `T3.1` — Repository Restructure + Next.js Scaffold
- `T3.2` — Shared Contract Layer
- `T3.3` — Supabase Auth Topology

### 5.3 Cross-Surface Dependencies

A frontend ticket MAY depend on a backend ticket. The dependency is explicit in the ticket JSON:

```json
{
  "id": "T3.4",
  "dependencies": ["T2.5"],
  "reason": "Homepage requires /v1/identity/users/me endpoint"
}
```

---

## 6. Architectural Philosophy

### 6.1 Server-First Rendering

Default to React Server Components (RSC). Use `"use client"` only for:
- Auth state management
- Forms with complex client-side validation
- Real-time UI updates
- Browser-specific APIs (geolocation, media)

### 6.2 Direct API for MVP

Frontend calls backend REST APIs directly. No BFF layer for MVP.

**BFF only if:**
- Backend APIs become too chatty for frontend needs
- Multiple frontend surfaces need different aggregation
- External API consumers need different contracts

### 6.3 Auth Topology

Supabase Auth is the **identity authority**. Frontend uses `@supabase/ssr` for session management.

**Critical rule:** Frontend calls Supabase ONLY for auth/session operations. ALL business operations flow through backend APIs.

See `frontend/auth-topology.md` for detailed flow.

### 6.4 Caching Strategy

| Layer | Owner | Mechanism |
|-------|-------|-----------|
| Backend query cache | Backend | `unstable_cache` + `revalidateTag` |
| Backend invalidation | Backend | Domain events trigger revalidation |
| Frontend rendering | Frontend | Next.js `cacheLife`, `cacheTag` |
| API response cache | Backend | CDN headers + `stale-while-revalidate` |

Backend owns WHAT to invalidate. Frontend owns WHEN and HOW to re-render.

---

## 7. CI/CD Integration

### 7.1 Unified Pipeline

One CI pipeline validates ALL surfaces:

```yaml
jobs:
  lint-and-typecheck    # Backend + frontend + shared
  backend-unit-tests
  backend-integration-tests
  frontend-build        # next build
  frontend-e2e-tests    # Playwright
```

### 7.2 Deployment Topology

| Surface | Platform | Trigger |
|---------|----------|---------|
| Frontend | Vercel | PR preview + main deployment |
| Backend | TBD (Fly/Railway/ECS) | main branch only |

### 7.3 Environment Variables

See `environment-sovereignty.md` for full matrix. Critical rule: `NEXT_PUBLIC_*` is browser-safe only. No secrets in `NEXT_PUBLIC_*`.

---

## 8. Surface Switch Protocol

When an engineer/agent changes execution surfaces (backend ↔ frontend, frontend ↔ shared), they MUST re-evaluate:

1. **Runtime constraints** — Which APIs are available?
2. **Import legality** — Is this import allowed per the direction matrix?
3. **Contract ownership** — Am I consuming or defining?
4. **Auth assumptions** — Server-side JWT forward vs client-side session?
5. **Caching semantics** — Who invalidates? Who re-renders?
6. **Deployment implications** — Vercel, backend compute, or both?
7. **Test surface** — Unit, component, integration, or E2E?

See `surface-switch-protocol.md` for full formalization.

---

## 9. What Is Explicitly Avoided

| Technology | Verdict | Reason |
|------------|---------|--------|
| tRPC | Avoid | Tight TS coupling; VINTRACK needs formal REST for external consumers |
| Redux/Zustand global | Avoid | Server-first makes global client state unnecessary for MVP |
| TanStack Query | Defer | Introduce only when optimistic updates/websocket sync become common |
| Storybook | Defer | Add only when design system exceeds ~30 components |
| Turborepo/Nx | Defer | Graduate when build times exceed 5min or mobile app added |
| BFF layer | Avoid | Direct API is correct for MVP complexity |
| Frontend direct Supabase DB access | FORBIDDEN | Domain governance collapses |
| NextAuth/Auth.js | Avoid | Supabase Auth is the identity authority |

---

## 10. Success Criteria

This governance model is operational when:

- [ ] All 11 governance documents exist and are linked
- [ ] M3 milestone and tickets created in JSON
- [ ] Repository restructure complete (`src/backend/`, `src/frontend/`, `src/shared/contracts/`)
- [ ] Both backend and frontend build in CI
- [ ] No import violations per direction matrix
- [ ] Shared contracts consumed by both surfaces
- [ ] `npm run lint` passes for all surfaces
