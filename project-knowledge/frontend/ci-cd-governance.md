# VINTRACK — Frontend CI/CD Governance

> **Status:** Canonical Governance Document
> **Scope:** Frontend build, lint, test, and deployment pipelines
> **Effective:** 2026-05-19

---

## 1. Purpose

Ensure frontend code meets the same quality bar as backend code before reaching any environment.

---

## 2. CI Pipeline

### 2.1 Jobs

```yaml
# .github/workflows/ci.yml
jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint        # Includes frontend files
      - run: npm run typecheck   # Includes frontend tsconfig

  frontend-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build:frontend

  frontend-unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:unit -- --config vitest.config.ts

  frontend-e2e-tests:
    runs-on: ubuntu-latest
    needs: [frontend-build, backend-integration-tests]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
```

### 2.2 Job Dependencies

```
lint-and-typecheck ──→ frontend-build ──→ frontend-e2e-tests
                          ↑
backend-integration-tests ─┘
```

E2E tests require both frontend build AND backend integration tests to pass.

---

## 3. Lint Rules

### 3.1 Frontend-Specific Rules

Add to `eslint.config.js`:

```js
{
  files: ['src/frontend/**/*.{ts,tsx}'],
  rules: {
    // React-specific
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // Next.js-specific
    '@next/next/no-html-link-for-pages': 'error',
    '@next/next/no-img-element': 'warn',

    // Import order
    'import/order': ['error', {
      groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
      'newlines-between': 'always',
    }],
  },
}
```

### 3.2 Test-Specific Relaxations

Same as backend: scoped override for `**/*.test.ts` files.

---

## 4. Build Requirements

### 4.1 `next build` Must Pass

```bash
npm run build:frontend
```

Failure conditions:
- TypeScript errors
- ESLint errors (if configured in `next.config.js`)
- Missing environment variables
- Import violations

### 4.2 Build Warnings

Warnings are acceptable during development but SHOULD be resolved before merge:

- Large bundle sizes
- Unused exports
- Deprecated API usage

---

## 5. Deployment

### 5.1 Vercel Integration

| Environment | Branch | Trigger |
|-------------|--------|---------|
| Preview | Any PR | Automatic |
| Production | `main` | Automatic |

### 5.2 Environment Variables

Managed in Vercel dashboard:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_ALGOLIA_APP_ID`
- `SENTRY_DSN`

**Never commit secrets.** Vercel injects env vars at build time.

### 5.3 Build-Time Validation

```typescript
// next.config.js
const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}
```

---

## 6. Preview Deployments

Every PR gets a Vercel preview URL. Use for:
- Manual QA
- Design review
- Stakeholder demos
- E2E test execution

---

## 7. Anti-Patterns

| Anti-Pattern | Why Forbidden |
|-------------|--------------|
| Bypassing `next build` | Unbuilt code may have hidden errors |
| Committing `.env` | Secrets in git history |
| Using `NEXT_PUBLIC_*` for secrets | Exposed in browser bundle |
| Skipping E2E tests | Critical journeys untested |
| Deploying without CI pass | Broken code reaches users |

---

## 8. Review Checklist

For any PR with frontend changes:

- [ ] `npm run build:frontend` passes
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] Unit/component tests pass
- [ ] E2E tests pass (if critical journey affected)
- [ ] Preview deployment successful
- [ ] No secrets in `NEXT_PUBLIC_*`
