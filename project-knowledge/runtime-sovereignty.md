# VINTRACK — Runtime Sovereignty

> **Status:** Canonical Governance Document
> **Scope:** All execution surfaces (backend, frontend-rsc, frontend-client, edge, shared)
> **Effective:** 2026-05-19

---

## 1. Purpose

Prevent runtime contamination: server-only modules leaking into browser bundles, Node APIs breaking Edge runtimes, backend infrastructure leaking into RSCs, and SSR hydration mismatches proliferating.

---

## 2. Runtime Categories

| Runtime | Location | APIs Allowed | Explicitly Forbidden |
|---------|----------|-------------|---------------------|
| `backend-node` | `src/backend/` | Full Node.js APIs (`fs`, `net`, `crypto`, `process`) | None |
| `frontend-rsc` | `src/frontend/app/**/*.tsx` (no `"use client"`) | Server-safe APIs, `fetch`, Node.js built-ins that are server-safe | `window`, `document`, `localStorage`, `navigator`, browser-only APIs |
| `frontend-client` | `src/frontend/app/**/*.tsx` (with `"use client"`), `src/frontend/hooks/`, `src/frontend/lib/` (browser) | Browser APIs (`window`, `document`, `localStorage`, Web Crypto) | Node.js `fs`, `net`, `crypto` (use Web Crypto), `process.env` (use build-time env) |
| `edge-runtime` | Future: middleware, edge functions | Web-standard APIs (`fetch`, `Request`, `Response`, `crypto`) | Node-specific APIs (`fs`, `net`, `child_process`) |
| `shared-runtime` | `src/shared/` | Runtime-agnostic code ONLY | ANY runtime-specific API |

---

## 3. Enforcement

### 3.1 ESLint Rules

Add to `eslint.config.js`:

```js
// For frontend client files
{
  files: ['src/frontend/**/*.{ts,tsx}'],
  excludedFiles: ['src/frontend/app/**/*.tsx'], // RSC files have different rules
  rules: {
    'no-restricted-globals': ['error', 'process', 'Buffer', '__dirname', '__filename'],
    'no-restricted-imports': ['error', { paths: [
      { name: 'fs', message: 'Node fs is forbidden in browser code' },
      { name: 'path', message: 'Node path is forbidden in browser code' },
      { name: 'crypto', message: 'Use Web Crypto API instead' },
    ]}],
  },
}

// For shared files
{
  files: ['src/shared/**/*.ts'],
  rules: {
    'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'process'],
    'no-restricted-imports': ['error', { paths: [
      { name: 'fs', message: 'Shared code must be runtime-agnostic' },
      { name: 'path', message: 'Shared code must be runtime-agnostic' },
    ]}],
  },
}
```

### 3.2 CI Validation

- `next build` bundle analysis detects server-only leaks
- `npm run typecheck` validates cross-runtime types
- Architecture review gate for any new runtime category introduction

### 3.3 File Naming Convention

No strict naming required, but preferred:
- Server Components: no suffix (default)
- Client Components: `"use client"` directive at top
- Browser-only utilities: `*.browser.ts` suffix (optional, for clarity)

---

## 4. Anti-Patterns

| Anti-Pattern | Why Forbidden | Detection |
|-------------|--------------|-----------|
| `import fs from 'fs'` in client code | Breaks browser bundle | ESLint `no-restricted-imports` |
| `process.env.*` in client code | Exposes build-time env unexpectedly | ESLint `no-restricted-globals` |
| `window` reference in RSC | Breaks SSR/hydration | ESLint `no-restricted-globals` |
| `crypto` (Node) in client code | Not available in browser | ESLint `no-restricted-imports` |
| Node `path` in shared code | Not available in Edge runtime | ESLint + typecheck |

---

## 5. Web Crypto Exception

For cryptographic operations in browser code, use the Web Crypto API:

```typescript
// CORRECT (browser-safe)
const digest = await crypto.subtle.digest('SHA-256', data);

// FORBIDDEN (Node-only)
import { createHash } from 'crypto';
const digest = createHash('sha256').update(data).digest();
```

---

## 6. Environment Access

| Surface | Access Method | Example |
|---------|--------------|---------|
| `backend-node` | `process.env.VAR` | `process.env.DATABASE_URL` |
| `frontend-rsc` | `process.env.VAR` (build-time) | `process.env.NEXT_PUBLIC_API_URL` |
| `frontend-client` | Build-time constants ONLY | Values inlined at build |
| `shared` | **No direct env access** | Accept as function parameter |

---

## 7. Shared Code Rule

`src/shared/` code MUST be importable into ANY runtime without modification.

**If code needs runtime-specific behavior:**
- Accept the runtime-specific dependency as a parameter (dependency injection)
- Split into `*.node.ts` and `*.browser.ts` variants (last resort)
- Never conditionally check `typeof window` in shared code

---

## 8. Architecture Review Trigger

Any PR introducing:
- New runtime category
- New `no-restricted-imports` exception
- `typeof window` checks in shared code
- Direct `process.env` access in client components

requires explicit runtime sovereignty review in PR description.
