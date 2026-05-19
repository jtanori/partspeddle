# VINTRACK — Security Baseline

## Purpose

Minimum viable security posture for the MVP. Not a comprehensive security program — a baseline that prevents common failures.

---

## Authentication

- Supabase Auth is the sole identity provider
- JWT validation at API Gateway only
- No custom session management
- Access tokens: 1-hour expiry
- Refresh tokens: 7-day expiry, rotation on use

## Authorization

- RLS on all application tables
- Role enum: `buyer`, `seller`, `admin`
- Service role bypasses RLS (workers only)
- No client-side role enforcement (server authoritative)

## Data Protection

| Data Type | Storage | Rule |
|-----------|---------|------|
| Passwords | Supabase Auth only | Never stored in application DB |
| Card data | Stripe only | Never touch raw card numbers |
| PII | Postgres with RLS | Encrypt sensitive fields at rest (Supabase default) |
| JWTs | Client localStorage | Short-lived, no server logging |
| API keys | Environment variables | Never committed, rotated quarterly |

## API Security

- Rate limiting at gateway: 100 req/min default, 10 req/min for financial endpoints
- Input validation via zod on all endpoints
- No SQL injection (parameterized queries only)
- No mass assignment (explicit DTOs only)
- CORS restricted to known origins

## Webhook Security

- Signature verification mandatory (Stripe, Supabase)
- Idempotency check before processing
- Webhook endpoints return 202 immediately, process async
- No webhook payload logging (contains PII)

## Secrets Management

- Development: `.env` file (gitignored)
- Staging/Production: Supabase secrets + GitHub Actions secrets
- No secrets in logs, error messages, or client bundles
- Quarterly rotation schedule for API keys

---

## Final Principle

Security is not a feature. It is a property of the architecture. If a security control requires user discipline, it will fail.
