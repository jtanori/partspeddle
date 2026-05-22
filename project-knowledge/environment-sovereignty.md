# VINTRACK — Environment Sovereignty

> **Status:** Canonical Governance Document
> **Scope:** All environment variables across surfaces
> **Effective:** 2026-05-19

---

## 1. Purpose

Prevent secret leakage, runtime contamination, and cross-surface env variable misuse. Every variable has an explicit owner surface.

---

## 2. Variable Classification

### 2.1 By Surface

| Variable | Allowed Surface | Forbidden Surface | Rationale |
|----------|----------------|-------------------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser, RSC | — | Public Supabase project URL |
| `NEXT_PUBLIC_ALGOLIA_APP_ID` | Browser, RSC | — | Public Algolia app identifier |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Browser, RSC | — | Stripe publishable key (safe for client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend only | Browser, RSC | Root access; bypasses RLS |
| `SUPABASE_ANON_KEY` | Frontend (RSC + browser) | — | Safe for client; respects RLS |
| `ALGOLIA_ADMIN_KEY` | Backend only | Browser, RSC | Admin operations only |
| `ALGOLIA_SEARCH_KEY` | Frontend (RSC + browser) | — | Search-only permissions |
| `DATABASE_URL` | Backend only | Browser, RSC | Direct DB connection |
| `REDIS_URL` | Backend only | Browser, RSC | Internal infrastructure |
| `JWT_SECRET` | Backend only | Browser, RSC | Token signing |
| `STRIPE_SECRET_KEY` | Backend only | Browser, RSC | Payment operations |
| `STRIPE_WEBHOOK_SECRET` | Backend only | Browser, RSC | Webhook verification |
| `SENTRY_DSN` | Frontend (RSC + browser) | — | Error tracking (public DSN) |

### 2.2 By Sensitivity

| Level | Pattern | Example |
|-------|---------|---------|
| Public | `NEXT_PUBLIC_*` | `NEXT_PUBLIC_SUPABASE_URL` |
| Frontend-safe | No prefix, consumed by frontend | `SUPABASE_ANON_KEY`, `ALGOLIA_SEARCH_KEY` |
| Backend-only | No prefix, backend only | `DATABASE_URL`, `STRIPE_SECRET_KEY` |
| Secret | Any key/token with write/admin access | `SUPABASE_SERVICE_ROLE_KEY` |

---

## 3. Critical Rules

### 3.1 `NEXT_PUBLIC_*` Rule

`NEXT_PUBLIC_*` variables are **inlined at build time** into the browser bundle. They are visible to anyone who inspects the bundle.

**NEVER prefix sensitive values with `NEXT_PUBLIC_`.**

```bash
# CORRECT
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...

# FORBIDDEN
NEXT_PUBLIC_SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIs...  # NEVER
```

### 3.2 Build-Time Validation

CI MUST fail if required environment variables are missing:

```typescript
// src/shared/env/validate.ts
const REQUIRED_BACKEND = ['DATABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const REQUIRED_FRONTEND = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_ANON_KEY'];

export function validateEnv(surface: 'backend' | 'frontend'): void {
  const required = surface === 'backend' ? REQUIRED_BACKEND : REQUIRED_FRONTEND;
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}
```

### 3.3 `.env.example` Documentation

Every variable in `.env.example` MUST include a surface annotation:

```bash
# [PUBLIC] Browser-safe Supabase project URL
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co

# [BACKEND-ONLY] Direct database connection string
DATABASE_URL=postgresql://...

# [FRONTEND] Safe for browser; respects RLS
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...

# [BACKEND-ONLY] Root access; NEVER expose to browser
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
```

### 3.4 Platform Management

| Platform | Manages |
|----------|---------|
| Vercel dashboard | Frontend env vars (`NEXT_PUBLIC_*`, frontend-safe vars) |
| Backend deployment platform | Backend-only vars, secrets |
| GitHub Secrets | CI/CD secrets (used in GitHub Actions only) |
| Local `.env` | Development only; never committed |

---

## 4. Secret Scanning

Pre-commit hooks + CI MUST scan for:

- `NEXT_PUBLIC_*` values that look like secrets (long base64 strings)
- Hardcoded API keys in source code
- `SUPABASE_SERVICE_ROLE_KEY` in any frontend file
- `DATABASE_URL` with credentials in logs

---

## 5. Anti-Patterns

| Anti-Pattern | Consequence | Prevention |
|-------------|-------------|------------|
| `NEXT_PUBLIC_STRIPE_SECRET_KEY` | Secret exposed in browser bundle | Prefix audit in CI |
| `process.env.DATABASE_URL` in RSC | Connection string visible in SSR output | ESLint + build validation |
| Logging `SUPABASE_SERVICE_ROLE_KEY` | Secret in logs | Structured logger redaction |
| `.env` committed to repo | Secrets in git history | `.gitignore` + pre-commit hook |
| Frontend calling backend env directly | Runtime error or secret leak | Import direction matrix |

---

## 6. Validation Checklist

For any PR adding or modifying environment variables:

- [ ] Variable classified (public / frontend-safe / backend-only / secret)
- [ ] `.env.example` updated with surface annotation
- [ ] CI build-time validation updated if required
- [ ] No `NEXT_PUBLIC_*` prefix on sensitive values
- [ ] Vercel dashboard updated (if frontend variable)
- [ ] Backend deployment platform updated (if backend variable)
- [ ] Secret scanning passes
