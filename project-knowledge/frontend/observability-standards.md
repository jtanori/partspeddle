# VINTRACK — Frontend Observability Standards

> **Status:** Canonical Governance Document
> **Scope:** Error tracking, logging, tracing, and monitoring for frontend code
> **Effective:** 2026-05-19

---

## 1. Purpose

Frontend failures are often invisible to backend monitoring. RSC debugging is difficult. SSR failures are subtle. Auth bugs become opaque. Frontend observability is mandatory infrastructure, not optional tooling.

---

## 2. Error Tracking

### 2.1 Sentry Integration

Install Sentry for both browser and server contexts:

```bash
npm install @sentry/nextjs
```

Configure in:
- `src/frontend/lib/sentry.ts` — shared initialization
- `next.config.js` — source maps, build plugin
- `src/frontend/app/global-error.tsx` — global error boundary

### 2.2 What to Capture

| Error Type | Capture | Context |
|-----------|---------|---------|
| Unhandled exceptions | Yes | Component stack, props |
| API errors (5xx) | Yes | Request URL, correlation ID |
| Auth failures | Yes | Auth provider, error code |
| Hydration mismatches | Yes | Component path, HTML diff |
| RSC render errors | Yes | Server component path |
| Client-side exceptions | Yes | Browser, OS, URL |

### 2.3 What NOT to Capture

- 4xx API errors (expected user errors)
- Network timeouts (captured by API layer)
- Console warnings

---

## 3. Structured Logging

### 3.1 Correlation ID Propagation

Correlation IDs flow from backend → SSR → browser:

```
Backend API response
  → RSC receives response + correlation-id header
  → RSC renders HTML with correlation-id in data attribute
  → Browser hydration reads correlation-id
  → Client API calls include correlation-id
```

### 3.2 Log Levels

| Level | Usage | Example |
|-------|-------|---------|
| `error` | Unhandled exceptions, auth failures | `Failed to fetch user profile` |
| `warn` | Degraded UX, recoverable failures | `Stale cache served` |
| `info` | Significant user actions | `User logged in`, `Listing viewed` |
| `debug` | Development only | Component lifecycle |

### 3.3 Log Format

Use the same structured JSON format as backend:

```json
{
  "timestamp": "2026-05-19T10:30:00.000Z",
  "level": "error",
  "service": "vintrack-frontend",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "traceparent": "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
  "message": "Failed to load featured listings",
  "context": {
    "error": "API_TIMEOUT",
    "url": "/v1/marketplace/listings/featured",
    "userId": "user-123"
  }
}
```

---

## 4. Request Tracing

### 4.1 End-to-End Trace

```
Browser Request
  → Next.js middleware (generate traceparent if missing)
  → RSC render (forward traceparent to backend API)
  → Backend API (log traceparent)
  → Database query (log traceparent)
```

### 4.2 Traceparent Format

W3C Trace Context: `00-{traceId}-{parentId}-{flags}`

---

## 5. React Error Boundaries

### 5.1 Global Error Boundary

```tsx
// src/frontend/app/global-error.tsx
'use client';

import * as Sentry from '@sentry/nextjs';

export default function GlobalError({ error }: { error: Error }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <h1>Something went wrong</h1>
        <p>We've been notified and are working on it.</p>
      </body>
    </html>
  );
}
```

### 5.2 Domain Error Boundaries

```tsx
// src/frontend/components/marketplace/listing-error-boundary.tsx
'use client';

export class ListingErrorBoundary extends React.Component {
  componentDidCatch(error: Error) {
    Sentry.captureException(error, { tags: { component: 'ListingCard' } });
  }

  render() {
    if (this.state.hasError) {
      return <div>Failed to load listing. Please try again.</div>;
    }
    return this.props.children;
  }
}
```

---

## 6. Hydration Mismatch Detection

### 6.1 Logging

Next.js logs hydration mismatches in development. In production, capture via Sentry:

```tsx
// In global-error.tsx or middleware
if (error.message.includes('hydration')) {
  Sentry.captureException(error, {
    tags: { type: 'hydration-mismatch' },
    extra: { url: window.location.href },
  });
}
```

### 6.2 Prevention

- Never use `typeof window` in RSC
- Never access `localStorage` during SSR
- Ensure server and client render identical initial HTML

---

## 7. RSC Debugging Telemetry

### 7.1 Render Timing

Track RSC render duration:

```typescript
// Instrumented in API layer
const start = performance.now();
const data = await api.getFeaturedListings();
const duration = performance.now() - start;

logger.info('RSC data fetch', { duration, url });
```

### 7.2 Data Fetch Latency

Log slow data fetches:

```typescript
if (duration > 1000) {
  logger.warn('Slow RSC data fetch', { duration, url });
}
```

---

## 8. Auth Flow Observability

### 8.1 Metrics

| Metric | Type | Alert Threshold |
|--------|------|----------------|
| Login success rate | Ratio | <95% |
| Session refresh latency | Histogram | p99 >500ms |
| Auth callback errors | Counter | >5/min |
| Token expiration rate | Counter | >10/min |

### 8.2 Logging

```json
{
  "event": "auth.login.success",
  "userId": "...",
  "provider": "supabase",
  "duration_ms": 245
}
```

---

## 9. Review Checklist

For any PR adding frontend observability:

- [ ] Sentry captures unhandled exceptions
- [ ] Error boundaries added for new domain components
- [ ] Correlation IDs propagate from SSR to browser
- [ ] Structured logging follows backend format
- [ ] Hydration mismatches detected and logged
- [ ] Auth flows instrumented
- [ ] No PII in logs or Sentry events
