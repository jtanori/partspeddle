# ADR-004: TypeScript Surface Separation — Backend/Frontend Compiler Boundaries

**Status:** Accepted  
**Date:** 2026-05-25  
**Deciders:** VINTRACK Agent (governance reconciliation session)  
**Reference Commit:** `0b47cfe`

## Context

VINTRACK operates two distinct TypeScript compilation surfaces:

1. **Backend surface** — Node.js/Express API, domain logic, infrastructure, queue workers
2. **Frontend surface** — Next.js 16 App Router, React 19, client components

Both surfaces share `src/` as the root source directory but have incompatible module resolution requirements.

## Problem

A single `tsconfig.json` cannot simultaneously satisfy:

- **Backend NodeNext requirements**: `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `.js` extensions required on relative imports, `@types/node` resolution
- **Next.js frontend requirements**: `"jsx": "preserve"`, `"moduleResolution": "bundler"`, DOM libraries, `"paths": {"@/*": ["./src/*"]}`}, Next.js plugin integration

With a single `tsconfig.json` configured for NodeNext:
- All `.tsx` files failed with `TS17004: Cannot use JSX unless the '--jsx' flag is provided`
- Next.js built-in modules (`next/headers`, `next/server`, `next/link`) could not resolve
- Path aliases (`@/shared/contracts/...`) were unrecognized
- Modern npm packages with `exports` fields (e.g., `react-instantsearch`) failed to resolve under NodeNext
- `typecheck:frontend` script was identical to `typecheck` — no actual frontend typecheck existed

## Decision

Split into **two authoritative tsconfig files**:

| File | Surface | Module Resolution | Purpose |
|---|---|---|---|
| `tsconfig.json` | Frontend | `bundler` | Next.js App Router, React, DOM, path aliases |
| `tsconfig.backend.json` | Backend | `NodeNext` | Express API, domain logic, queue workers, Node.js builtins |

### Inheritance

There is **no extends relationship**. The two configs are independent because their `compilerOptions` are fundamentally incompatible (`NodeNext` vs `bundler`).

### Ownership Boundaries

```
tsconfig.json
├── src/frontend/**/*       ← PRIMARY
├── src/app/**/*            ← PRIMARY (Next.js app router root)
├── src/shared/contracts/*  ← CONSUMED (read-only)
├── .next/types/**/*        ← GENERATED (Next.js build artifacts)
└── next-env.d.ts           ← ENTRY

tsconfig.backend.json
├── src/backend/**/*        ← PRIMARY
├── src/shared/**/*         ← PRIMARY (event-bus, outbox, observability)
├── src/app.ts              ← PRIMARY (Express entry)
└── EXCLUDES: src/frontend, src/app, next-env.d.ts
```

### Why No Shared Base Config

A shared base config would need to omit `module`, `moduleResolution`, `jsx`, and `lib` — leaving no meaningful common ground. Both surfaces need `strict: true` and source map settings, but these are trivial to duplicate. The maintenance burden of a base config with two incompatible overrides exceeds the benefit.

## Consequences

### Positive

- Frontend typecheck: **234 errors → 0 errors**
- Backend typecheck: **0 errors** (unchanged)
- `react-instantsearch` hooks resolve correctly under bundler resolution
- Path aliases (`@/*`) resolve consistently for frontend imports
- Next.js plugin provides IDE support and typed routes

### Negative

- Two configs require explicit maintenance when adding global compiler options
- Backend build script must specify `-p tsconfig.backend.json`
- Developers must know which config applies to which surface

### Mitigations

- `package.json` scripts are self-documenting:
  - `typecheck` → backend
  - `typecheck:frontend` → frontend
  - `build` → backend
  - `build:frontend` → frontend (via Next.js, which auto-detects `tsconfig.json`)
- CI enforces both surfaces independently (see `.github/workflows/ci.yml`)

## Import Boundary Rules

### Allowed

| From | To | Example |
|---|---|---|
| `src/backend/*` | `src/shared/*` | `import { Outbox } from '../../../shared/outbox/outbox.js'` |
| `src/frontend/*` | `src/shared/contracts/*` | `import type { UserResponse } from '@/shared/contracts/identity/user-schema'` |
| `src/backend/*` | `src/shared/contracts/*` | `import type { SellerStatus } from '../../../../shared/contracts/identity/seller-schema.js'` |

### Forbidden

| From | To | Why |
|---|---|---|
| `src/frontend/*` | `src/backend/*` | Frontend must not depend on backend implementation |
| `src/backend/*` | `src/frontend/*` | Backend must not depend on frontend implementation |
| Any surface | Cross-surface direct import | Use `src/shared/contracts/` as the canonical boundary |

## Validation

```bash
# Frontend surface
npm run typecheck:frontend   # Uses tsconfig.json

# Backend surface
npm run typecheck            # Uses tsconfig.backend.json

# Full validation
npm run typecheck:frontend && npm run typecheck
```

## Future Work

- Consider `tsconfig.eslint.json` unification if ESLint parser options drift from either surface
- Monitor TypeScript releases for bundler/NodeNext convergence (unlikely before TS 6.x)
- Evaluate `moduleResolution: "bundler"` for backend if Node.js 22+ native ESM simplifies extension requirements
