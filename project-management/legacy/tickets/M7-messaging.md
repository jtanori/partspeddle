# M7 — Messaging Tickets

> Transaction-aware communication.

---

## T7.1 — Conversation Aggregate

**Domain:** Messaging
**Capability:** Domain Model

**Purpose:** Implement durable conversation between transaction participants.

**Dependencies:** T6.1 (transaction context), T2.1 (user context)

**Architectural Constraints:**
- Conversation scoped to transaction OR direct (pre-transaction)
- Participants: buyer, seller
- Events: `conversation.created`, `message.sent`, `message.read`
- RLS: participants only

**Deliverables:**
- `src/messaging/domain/entities/conversation.ts`
- `src/messaging/domain/entities/message.ts`
- `src/messaging/domain/events/message-events.ts`

**Acceptance Criteria:**
- [ ] Conversation created between two users
- [ ] Messages ordered by timestamp
- [ ] Read receipts tracked
- [ ] Events emitted on send/read

**Observability:**
- `messaging_conversations_total` gauge
- `messaging_messages_sent_total` counter

**Failure Modes:**
- Non-participant access → RLS prevents

---

## T7.2 — Realtime Delivery

**Domain:** Messaging
**Capability:** Transport

**Purpose:** Deliver messages in real time via Supabase Realtime.

**Dependencies:** T7.1

**Architectural Constraints:**
- Supabase Realtime broadcast
- Fallback to polling (MVP minimal)
- Message persistence in Postgres
- No message mutation after send

**Deliverables:**
- `src/messaging/infrastructure/realtime/supabase-realtime.ts`
- Realtime channel management

**Acceptance Criteria:**
- [ ] Message broadcast to participant within 1s
- [ ] Offline participants receive on reconnect
- [ ] Message order preserved

**Observability:**
- `messaging_realtime_latency_seconds` histogram

**Failure Modes:**
- Realtime down → polling fallback

---

## T7.3 — Messaging API

**Domain:** Messaging
**Capability:** HTTP Boundary

**Purpose:** Expose conversation and message endpoints.

**Dependencies:** T7.1, T7.2

**Architectural Constraints:**
- Cursor pagination for messages
- Rate limit: 30 messages/min per user
- No message deletion (MVP)

**Deliverables:**
- `src/messaging/api/routes/conversation-routes.ts`
- `src/messaging/api/controllers/conversation-controller.ts`

**Acceptance Criteria:**
- [ ] `POST /v1/messaging/conversations` creates conversation
- [ ] `POST /v1/messaging/conversations/:id/messages` sends message
- [ ] `GET /v1/messaging/conversations/:id/messages` paginates
- [ ] Rate limit enforced

**Observability:**
- `messaging_api_requests_total` counter

**Failure Modes:**
- Rate limit exceeded → 429
