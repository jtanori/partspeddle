# VINTRACK — Identity Domain API Contracts

## API Style

* REST, JSON, resource-oriented
* Explicit workflow actions over generic CRUD
* Version prefix: `/v1/identity/`
* TypeScript strict mode for all DTOs
* All endpoints propagate correlation IDs

---

## Authentication

All endpoints require a valid Supabase JWT in the `Authorization: Bearer <token>` header.

JWT validation occurs at the API Gateway. The Identity domain receives the resolved `actorId` (UUID) in request context.

---

## Error Contract

```json
{
  "error": {
    "code": "IDENTITY_SELLER_ALREADY_ACTIVE",
    "message": "Seller profile is already active.",
    "correlationId": "uuid",
    "details": {}
  }
}
```

### Error Codes

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `IDENTITY_UNAUTHORIZED` | 401 | Missing or invalid JWT |
| `IDENTITY_FORBIDDEN` | 403 | Insufficient role/permission |
| `IDENTITY_USER_NOT_FOUND` | 404 | User does not exist |
| `IDENTITY_PROFILE_NOT_FOUND` | 404 | Profile does not exist |
| `IDENTITY_SELLER_NOT_FOUND` | 404 | Seller profile does not exist |
| `IDENTITY_SELLER_ALREADY_ACTIVE` | 409 | Seller is already active |
| `IDENTITY_ONBOARDING_INCOMPLETE` | 422 | Required onboarding steps missing |
| `IDENTITY_INVALID_STATUS_TRANSITION` | 422 | Illegal state machine transition |
| `IDENTITY_DUPLICATE_EMAIL` | 409 | Email already registered |
| `IDENTITY_RATE_LIMITED` | 429 | Too many requests |
| `IDENTITY_INTERNAL_ERROR` | 500 | Unhandled domain error |

---

## Endpoints

### User Endpoints

#### GET /v1/identity/users/me

Retrieve the authenticated user's identity record.

**Request**

```http
GET /v1/identity/users/me
Authorization: Bearer <jwt>
X-Correlation-Id: <uuid>
```

**Response: 200 OK**

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "phone": "+1234567890",
  "role": "buyer",
  "status": "active",
  "email_verified": true,
  "phone_verified": false,
  "created_at": "2026-01-01T00:00:00.000Z",
  "updated_at": "2026-01-01T00:00:00.000Z",
  "last_sign_in_at": "2026-01-01T00:00:00.000Z"
}
```

---

#### GET /v1/identity/users/:id

Retrieve a user by ID. Public fields only. Admin or self access.

**Response: 200 OK**

```json
{
  "id": "uuid",
  "role": "seller",
  "status": "active",
  "created_at": "2026-01-01T00:00:00.000Z"
}
```

---

### Profile Endpoints

#### GET /v1/identity/profiles/me

Retrieve the authenticated user's full profile.

**Response: 200 OK**

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "display_name": "CollectorJane",
  "avatar_url": "https://cdn.vintrack.io/avatars/uuid.jpg",
  "bio": "Vintage car parts enthusiast",
  "location": {
    "city": "Portland",
    "state": "OR",
    "country": "US",
    "postal_code": "97201"
  },
  "timezone": "America/Los_Angeles",
  "locale": "en-US",
  "notification_preferences": {
    "email_transactional": true,
    "email_marketing": false,
    "push_enabled": true
  },
  "created_at": "2026-01-01T00:00:00.000Z",
  "updated_at": "2026-01-01T00:00:00.000Z"
}
```

---

#### PATCH /v1/identity/profiles/me

Update the authenticated user's profile.

**Request Body**

```json
{
  "display_name": "JaneDoeCollects",
  "bio": "Updated bio text",
  "location": {
    "city": "Seattle",
    "state": "WA",
    "country": "US"
  },
  "timezone": "America/Los_Angeles",
  "notification_preferences": {
    "email_transactional": true
  }
}
```

**Validation Rules**

* `display_name`: 1–100 chars, sanitized
* `bio`: Max 2000 chars
* `avatar_url`: Ignored (managed via separate upload flow)
* `location`: Object with optional `city`, `state`, `country`, `postal_code` string fields

**Response: 200 OK**

Returns updated profile object.

**Emitted Event**: `profile.updated`

---

#### GET /v1/identity/profiles/:userId

Retrieve a public profile by user ID.

**Response: 200 OK**

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "display_name": "CollectorJane",
  "avatar_url": "https://cdn.vintrack.io/avatars/uuid.jpg",
  "bio": "Vintage car parts enthusiast",
  "location": {
    "city": "Portland",
    "state": "OR",
    "country": "US"
  },
  "created_at": "2026-01-01T00:00:00.000Z"
}
```

---

### Seller Endpoints

#### POST /v1/identity/sellers/register

Initiate seller registration. Creates `SellerProfile` with status `pending` → `onboarding`.

**Request Body**

```json
{
  "idempotency_key": "uuid"
}
```

**Idempotency**

* Key cached for 24 hours
* Duplicate requests with same key return existing seller profile if within window

**Response: 201 Created**

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "status": "onboarding",
  "stripe_connect_account_id": null,
  "payout_enabled": false,
  "listing_count": 0,
  "total_sales_cents": 0,
  "verified_identity": false,
  "created_at": "2026-01-01T00:00:00.000Z",
  "updated_at": "2026-01-01T00:00:00.000Z",
  "onboarding": {
    "step_identity": false,
    "step_payout": false,
    "step_terms": false,
    "step_profile": false
  }
}
```

**Response: 409 Conflict** — Seller profile already exists

---

#### GET /v1/identity/sellers/me

Retrieve the authenticated user's seller profile.

**Response: 200 OK**

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "status": "active",
  "stripe_connect_account_id": "acct_1234567890",
  "payout_enabled": true,
  "listing_count": 12,
  "total_sales_cents": 450000,
  "rating_average": 4.8,
  "verified_identity": true,
  "activated_at": "2026-01-15T00:00:00.000Z",
  "created_at": "2026-01-01T00:00:00.000Z",
  "updated_at": "2026-01-01T00:00:00.000Z",
  "onboarding": {
    "step_identity": true,
    "step_payout": true,
    "step_terms": true,
    "step_profile": true,
    "completed_at": "2026-01-10T00:00:00.000Z"
  }
}
```

---

#### POST /v1/identity/sellers/me/onboarding/:step

Complete an onboarding step. Valid steps: `identity`, `payout`, `terms`, `profile`.

**Request Body**

```json
{
  "step_identity": {
    "verified_document_type": "drivers_license",
    "verification_reference": "verif_123"
  },
  "step_payout": {
    "stripe_connect_account_id": "acct_1234567890"
  },
  "step_terms": {
    "accepted_at": "2026-01-01T00:00:00.000Z",
    "terms_version": "1.0.0"
  },
  "step_profile": {
    "business_name": "Jane's Parts",
    "return_policy": "30_day"
  }
}
```

**Response: 200 OK**

Returns updated seller profile with onboarding state.

**Business Rules**

* `step_payout`: Must provide valid `stripe_connect_account_id` beginning with `acct_`
* `step_identity`: Must include `verification_reference`
* `step_terms`: Must include `accepted_at` timestamp (not future-dated)
* `step_profile`: Must include `business_name`

---

#### POST /v1/identity/sellers/me/deactivate

Deactivate seller profile (self-initiated or admin).

**Request Body**

```json
{
  "reason": "user_request"
}
```

**Response: 200 OK**

Returns updated seller profile with `status: suspended`.

**Emitted Event**: `seller.deactivated`

---

### Session Endpoints

#### GET /v1/identity/sessions/me

Retrieve active sessions for the authenticated user.

**Response: 200 OK**

```json
{
  "sessions": [
    {
      "id": "uuid",
      "session_type": "web",
      "ip_address": "192.168.1.1",
      "user_agent": "Mozilla/5.0...",
      "started_at": "2026-01-01T00:00:00.000Z",
      "ended_at": null,
      "revoked": false
    }
  ]
}
```

---

#### DELETE /v1/identity/sessions/me

Revoke all active sessions for the authenticated user (sign out everywhere).

**Response: 202 Accepted**

```json
{
  "status": "accepted",
  "correlationId": "uuid",
  "workflowId": "uuid"
}
```

**Note**: This initiates an async session revocation workflow via the `identity-sessions` queue. Supabase Auth tokens are also invalidated via Supabase API.

---

## Webhooks

### POST /v1/identity/webhooks/supabase-auth

Supabase Auth webhook receiver. Thin handler — validates signature and enqueues to `identity-webhooks` queue.

**Request Body** (Supabase payload)

```json
{
  "type": "USER_CREATED",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "created_at": "2026-01-01T00:00:00.000Z"
  }
}
```

**Response: 202 Accepted**

**Validation**

* Webhook signature verified using `WEBHOOK_SECRET`
* Duplicate detection via `eventId` idempotency check (24h window)

---

## DTO Specifications

### ProfileUpdateDto

```typescript
interface ProfileUpdateDto {
  display_name?: string;        // 1-100 chars, sanitized
  bio?: string;                 // max 2000 chars
  location?: {
    city?: string;
    state?: string;
    country?: string;
    postal_code?: string;
  };
  timezone?: string;            // IANA timezone identifier
  locale?: string;              // BCP 47 language tag
  notification_preferences?: Record<string, boolean>;
}
```

### SellerOnboardingStepDto

```typescript
interface SellerOnboardingStepDto {
  step: 'identity' | 'payout' | 'terms' | 'profile';
  payload:
    | { verified_document_type: string; verification_reference: string }
    | { stripe_connect_account_id: string }
    | { accepted_at: string; terms_version: string }
    | { business_name: string; return_policy?: string };
}
```

### UserPublicDto

```typescript
interface UserPublicDto {
  id: string;
  role: 'buyer' | 'seller' | 'admin';
  status: 'active' | 'suspended' | 'deactivated';
  created_at: string;
}
```

---

## Pagination

List endpoints (if introduced post-MVP) use cursor pagination:

```json
{
  "data": [],
  "next_cursor": "base64encoded",
  "has_more": true
}
```

No list endpoints are required for MVP Identity domain.

---

## Async Response Pattern

Session revocation is the only async endpoint in MVP Identity. It returns:

```json
{
  "status": "accepted",
  "correlationId": "uuid",
  "workflowId": "uuid"
}
```

Clients may poll `/v1/identity/sessions/me` to observe completion.

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /sellers/register` | 5 | 1 hour |
| `PATCH /profiles/me` | 30 | 1 minute |
| `POST /sellers/me/onboarding/*` | 20 | 1 minute |
| All other endpoints | 100 | 1 minute |

Rate limiting enforced at API Gateway.
