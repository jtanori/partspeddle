# M5 — Search Infrastructure Tickets

> Inventory discovery via Algolia.

---

## T5.1 — Algolia Sync Pipeline

**Domain:** Search
**Capability:** Index Management

**Purpose:** Sync listing data to Algolia index on domain events.

**Dependencies:** T1.4 (queue), T3.4 (listing events)

**Architectural Constraints:**
- Event-driven: consumes `listing.published`, `listing.updated`, `listing.archived`
- Queue: `search-indexing`
- Idempotent index operations
- Partial updates preferred over full reindex

**Deliverables:**
- `src/search/infrastructure/algolia/client.ts`
- `src/search/queue/search-indexing-worker.ts`
- Index configuration (searchable attributes, ranking)

**Acceptance Criteria:**
- [ ] `listing.published` triggers index insert
- [ ] `listing.updated` triggers partial update
- [ ] `listing.archived` triggers index removal
- [ ] Duplicate index operations are idempotent

**Observability:**
- `search_indexed_total` counter
- `search_index_failed_total` counter

**Failure Modes:**
- Algolia down → backlog in queue, retry
- Invalid payload → DLQ, alert

---

## T5.2 — Searchable Projections

**Domain:** Search
**Capability:** Query Model

**Purpose:** Define what listing data is searchable.

**Dependencies:** T5.1

**Architectural Constraints:**
- Projection built from marketplace events
- No direct DB reads from marketplace tables
- Include: title, description, category, seller info, price
- Exclude: internal IDs, draft listings

**Deliverables:**
- `src/search/domain/search-document.ts`
- `src/search/application/services/projection-builder.ts`
- Document mapping from listing events

**Acceptance Criteria:**
- [ ] Projection includes all searchable fields
- [ ] Draft listings excluded from index
- [ ] Seller display name included
- [ ] Price indexed as numeric for range filters

**Observability:**
- `search_projection_latency_seconds` histogram

**Failure Modes:**
- Event deserialization failure → skip + log

---

## T5.3 — Search API

**Domain:** Search
**Capability:** HTTP Boundary

**Purpose:** Expose search retrieval endpoints.

**Dependencies:** T5.2

**Architectural Constraints:**
- Thin controller: delegates to Algolia
- Query params: `q`, `filters`, `page`, `limit`
- Max results per page: 20
- Cursor pagination not required for MVP

**Deliverables:**
- `src/search/api/routes/search-routes.ts`
- `src/search/api/controllers/search-controller.ts`
- Query validation (zod)

**Acceptance Criteria:**
- [ ] `GET /v1/search?q=keyword` returns results
- [ ] Filtering by category works
- [ ] Empty query returns recent listings
- [ ] Response time < 100ms

**Observability:**
- `search_api_latency_seconds` histogram
- `search_api_requests_total` counter

**Failure Modes:**
- Algolia timeout → 503 with retry guidance

---

## T5.4 — Search Integration Tests

**Domain:** Search
**Capability:** Quality Assurance

**Purpose:** Verify index sync and query behavior.

**Dependencies:** T5.1–T5.3

**Architectural Constraints:**
- Mock Algolia in unit tests
- Integration tests use Algolia test index
- Clean index between tests

**Deliverables:**
- Index sync tests
- Query endpoint tests

**Acceptance Criteria:**
- [ ] Published listing appears in index
- [ ] Archived listing removed from index
- [ ] Query returns matching results

**Observability:** N/A

**Failure Modes:** N/A
