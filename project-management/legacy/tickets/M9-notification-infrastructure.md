# M9 — Notification Infrastructure Tickets

> Operational alerts to users.

---

## T9.1 — Notification Database Schema

**Domain:** Notifications
**Capability:** Persistence

**Purpose:** Store notification history and preferences.

**Dependencies:** T2.1 (user context), T1.5 (Supabase client)

**Architectural Constraints:**
- Tables: `notifications`, `notification_preferences`
- FK to `users.id`
- Status: `pending`, `sent`, `delivered`, `failed`
- RLS: self only

**Deliverables:**
- Migration for notification tables

**Acceptance Criteria:**
- [ ] Tables created with correct constraints
- [ ] RLS prevents cross-user access

**Observability:**
- `notifications_total` gauge by status

**Failure Modes:**
- N/A

---

## T9.2 — Notification Event Consumers

**Domain:** Notifications
**Capability:** Event-Driven Delivery

**Purpose:** Consume domain events and enqueue notifications.

**Dependencies:** T1.4 (queue), T9.1

**Architectural Constraints:**
- Consume: `seller.activated`, `payment.authorized`, `escrow.locked`, `settlement.completed`
- Queue: `notification-delivery`
- Template selection by event type
- User preferences respected

**Deliverables:**
- `src/notifications/queue/notification-consumer.ts`
- `src/notifications/queue/notification-delivery-worker.ts`
- Event-to-template mapping

**Acceptance Criteria:**
- [ ] Event consumed triggers notification enqueue
- [ ] Template selected by event type
- [ ] User preferences filter channels
- [ ] Failed delivery retries 3x

**Observability:**
- `notifications_enqueued_total` counter
- `notifications_sent_total` counter
- `notifications_failed_total` counter

**Failure Modes:**
- Email provider down → retry, then DLQ
- User preference missing → default to email

---

## T9.3 — Email Delivery

**Domain:** Notifications
**Capability:** Transport

**Purpose:** Send transactional emails.

**Dependencies:** T9.2

**Architectural Constraints:**
- Transactional email provider (Resend/Postmark)
- HTML + text templates
- No marketing emails (MVP)
- Rate limit: 100 emails/min

**Deliverables:**
- `src/notifications/infrastructure/email/email-provider.ts`
- `src/notifications/infrastructure/email/templates/`
- Template renderer

**Acceptance Criteria:**
- [ ] Email sent on transaction events
- [ ] Template renders correctly
- [ ] Bounce handling logs failure
- [ ] Rate limit enforced

**Observability:**
- `notifications_email_latency_seconds` histogram

**Failure Modes:**
- Provider rate limit → queue backoff
- Invalid email → mark failed, no retry

---

## T9.4 — Notification API

**Domain:** Notifications
**Capability:** HTTP Boundary

**Purpose:** Expose notification history and preferences.

**Dependencies:** T9.1, T9.3

**Architectural Constraints:**
- Read-only history
- Preference updates self-service
- Cursor pagination

**Deliverables:**
- `src/notifications/api/routes/notification-routes.ts`
- `src/notifications/api/controllers/notification-controller.ts`

**Acceptance Criteria:**
- [ ] `GET /v1/notifications` returns user history
- [ ] `PATCH /v1/notifications/preferences` updates settings
- [ ] Unread count returned

**Observability:**
- `notifications_api_requests_total` counter

**Failure Modes:**
- N/A
