# M3 — Marketplace Domain Tickets

> Inventory ownership and listing lifecycle.

---

## T3.1 — Marketplace Database Schema

**Domain:** Marketplace
**Capability:** Persistence

**Purpose:** Create listing, inventory, and catalog tables.

**Dependencies:** T2.1 (RLS patterns), T1.5 (Supabase client)

**Architectural Constraints:**
- Tables: `listings`, `inventory_items`, `collections`, `garages`, `yards`, `media_assets`
- FK to `users.id` (seller ownership)
- Listing status enum: `draft`, `published`, `archived`, `deleted`
- RLS: seller owns inventory, public reads published listings

**Deliverables:**
- Migration for all marketplace tables
- Indexes: `status`, `seller_id`, `created_at`
- RLS policies

**Acceptance Criteria:**
- [ ] Tables created with correct constraints
- [ ] FK to users enforced
- [ ] RLS prevents cross-seller mutation
- [ ] Published listings readable by public

**Observability:**
- `marketplace_listings_total` gauge by status

**Failure Modes:**
- Orphaned listing (seller deleted) → cascade deactivate, not delete

---

## T3.2 — Listing Aggregate & State Machine

**Domain:** Marketplace
**Capability:** Domain Model

**Purpose:** Implement listing lifecycle with deterministic transitions.

**Dependencies:** T3.1

**Architectural Constraints:**
- States: `draft → published → archived → deleted`
- Only `active` sellers may publish
- Events: `listing.created`, `listing.published`, `listing.archived`
- Media assets linked but not owned by listing

**Deliverables:**
- `src/marketplace/domain/entities/listing.ts`
- `src/marketplace/domain/entities/inventory-item.ts`
- `src/marketplace/domain/events/listing-events.ts`

**Acceptance Criteria:**
- [ ] Invalid transitions rejected
- [ ] Publish blocked if seller not active
- [ ] Event emitted on every transition
- [ ] Draft listings not publicly visible

**Observability:**
- `marketplace_listing_publishes_total` counter
- `marketplace_listing_archives_total` counter

**Failure Modes:**
- Seller deactivated after publish → listing auto-archived via event consumption

---

## T3.3 — Media Pipeline

**Domain:** Marketplace
**Capability:** Asset Management

**Purpose:** Handle image upload and attachment to listings.

**Dependencies:** T3.2

**Architectural Constraints:**
- Supabase Storage for blob storage
- Metadata stored in `media_assets` table
- Async virus scan (MVP: deferred)
- Max file size: 10MB
- Allowed types: jpg, png, webp

**Deliverables:**
- `src/marketplace/application/services/media-service.ts`
- `src/marketplace/infrastructure/storage/supabase-storage.ts`
- Upload validation and URL generation

**Acceptance Criteria:**
- [ ] Upload returns signed URL
- [ ] Metadata persisted in `media_assets`
- [ ] Invalid file type rejected
- [ ] Oversized file rejected

**Observability:**
- `marketplace_media_uploads_total` counter
- `marketplace_media_upload_errors_total` counter

**Failure Modes:**
- Storage unavailable → retry queue
- Invalid file → immediate rejection

---

## T3.4 — Marketplace Repositories & API

**Domain:** Marketplace
**Capability:** HTTP Boundary

**Purpose:** Expose listing CRUD and publishing workflow.

**Dependencies:** T3.2, T3.3, T1.3 (outbox)

**Architectural Constraints:**
- Thin controllers
- DTOs with zod validation
- Outbox integration on mutations
- Cursor pagination for listings

**Deliverables:**
- `src/marketplace/infrastructure/persistence/listing-repository.ts`
- `src/marketplace/api/routes/listing-routes.ts`
- `src/marketplace/api/controllers/listing-controller.ts`

**Acceptance Criteria:**
- [ ] `POST /v1/marketplace/listings` creates draft
- [ ] `POST /v1/marketplace/listings/:id/publish` transitions to published
- [ ] `GET /v1/marketplace/listings` returns public listings (cursor pagination)
- [ ] `PATCH /v1/marketplace/listings/:id` updates draft

**Observability:**
- `marketplace_api_requests_total` counter

**Failure Modes:**
- Publish by non-active seller → 403
- Update published listing → 422 (must archive first)

---

## T3.5 — Catalog Organization

**Domain:** Marketplace
**Capability:** Inventory Management

**Purpose:** Enable seller inventory organization (garages, yards, collections).

**Dependencies:** T3.1

**Architectural Constraints:**
- Hierarchical: User → Garage → Yard → InventoryItem
- Collections are non-hierarchical groupings
- Events emitted on reorganization

**Deliverables:**
- `src/marketplace/domain/entities/garage.ts`
- `src/marketplace/domain/entities/yard.ts`
- `src/marketplace/domain/entities/collection.ts`
- CRUD APIs

**Acceptance Criteria:**
- [ ] Seller can create garage/yard
- [ ] Inventory item assigned to yard
- [ ] Collection groups items across yards
- [ ] Delete garage cascades to yards (not items)

**Observability:**
- `marketplace_garages_total` gauge

**Failure Modes:**
- Cross-seller assignment → RLS prevents

---

## T3.6 — Marketplace Integration Tests

**Domain:** Marketplace
**Capability:** Quality Assurance

**Purpose:** Verify listing lifecycle and media handling.

**Dependencies:** T3.1–T3.5

**Architectural Constraints:**
- Test DB per run
- Mock Supabase Storage in unit tests
- Integration tests use real storage (test bucket)

**Deliverables:**
- Domain entity tests
- API contract tests
- RLS verification tests

**Acceptance Criteria:**
- [ ] Listing state machine transitions validated
- [ ] Publish blocked for inactive seller
- [ ] Media upload persists metadata
- [ ] Public listing query respects RLS

**Observability:** N/A

**Failure Modes:** N/A
