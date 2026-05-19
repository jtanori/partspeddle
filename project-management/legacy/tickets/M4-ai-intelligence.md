# M4 — AI Intelligence Tickets

> Assistive AI, never authoritative.

---

## T4.1 — AI Processing Queue & Job Infrastructure

**Domain:** AI Intelligence
**Capability:** Async Orchestration

**Purpose:** Establish queue infrastructure for AI analysis workflows.

**Dependencies:** T1.4 (queue bootstrap), T3.4 (listing events)

**Architectural Constraints:**
- Queue: `ai-processing`
- Concurrency: 2 (Gemini API rate limits)
- Retry: 3x exponential
- Timeout: 60s per job

**Deliverables:**
- `src/ai-intelligence/queue/ai-processing-worker.ts`
- Job definitions for image analysis, enrichment

**Acceptance Criteria:**
- [ ] Job enqueued on `media.uploaded` event consumption
- [ ] Worker processes with 2 concurrent jobs
- [ ] Timeout fires after 60s
- [ ] Failed job retries 3x

**Observability:**
- `ai_jobs_completed_total` counter
- `ai_job_duration_seconds` histogram

**Failure Modes:**
- Gemini API down → retry with backoff
- Timeout → DLQ with partial results logged

---

## T4.2 — Image Ingestion & Identification

**Domain:** AI Intelligence
**Capability:** Part Identification

**Purpose:** Analyze uploaded images and identify inventory items.

**Dependencies:** T4.1

**Architectural Constraints:**
- Gemini API for image analysis
- Confidence score included in result
- No mutation of listing without seller approval
- Result stored as `AIAnalysis` record

**Deliverables:**
- `src/ai-intelligence/application/services/identification-service.ts`
- `src/ai-intelligence/domain/entities/ai-analysis.ts`
- `src/ai-intelligence/domain/entities/identification-result.ts`
- Gemini API adapter

**Acceptance Criteria:**
- [ ] Image analyzed within 60s
- [ ] Result includes confidence score (0.0–1.0)
- [ ] Low confidence (< 0.7) flagged for manual review
- [ ] `item.identified` event emitted on completion

**Observability:**
- `ai_identification_completed_total` counter
- `ai_identification_confidence_average` gauge

**Failure Modes:**
- Gemini rate limit → queue backoff
- Nonsense input → low confidence, no listing mutation

---

## T4.3 — Enrichment Workflows

**Domain:** AI Intelligence
**Capability:** Listing Enhancement

**Purpose:** Generate metadata suggestions for listings.

**Dependencies:** T4.2

**Architectural Constraints:**
- Enrichment is advisory
- Seller must explicitly approve suggestions
- Events: `listing.enriched`
- Max 5 suggestions per listing

**Deliverables:**
- `src/ai-intelligence/application/services/enrichment-service.ts`
- `src/ai-intelligence/domain/entities/enrichment-task.ts`
- Suggestion approval workflow

**Acceptance Criteria:**
- [ ] Enrichment generates structured suggestions
- [ ] Suggestions linked to listing but not applied
- [ ] Seller approval triggers `listing.enriched` event
- [ ] Rejection logged for model improvement

**Observability:**
- `ai_enrichment_completed_total` counter
- `ai_enrichment_acceptance_rate` gauge

**Failure Modes:**
- Enrichment fails → listing unchanged, event not emitted

---

## T4.4 — AI Intelligence Integration Tests

**Domain:** AI Intelligence
**Capability:** Quality Assurance

**Purpose:** Verify AI pipeline correctness.

**Dependencies:** T4.1–T4.3

**Architectural Constraints:**
- Mock Gemini API in unit tests
- Integration tests use test API key
- Deterministic test images

**Deliverables:**
- Service tests with mocked API
- Integration tests for queue processing

**Acceptance Criteria:**
- [ ] Mocked identification returns expected result
- [ ] Queue job processes with timeout
- [ ] Enrichment suggestions structured correctly

**Observability:** N/A

**Failure Modes:** N/A
