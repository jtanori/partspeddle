-- T1.3 — Outbox Pattern Implementation
-- Transactional outbox table for durable event emission

CREATE TYPE outbox_status AS ENUM ('pending', 'processing', 'published', 'failed');

CREATE TABLE outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  aggregate_id UUID NOT NULL,
  correlation_id TEXT NOT NULL,
  traceparent TEXT,
  status outbox_status NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  last_error TEXT,

  -- Index for relay worker polling
  CONSTRAINT outbox_event_id_unique UNIQUE (event_id)
);

-- Relay worker queries pending events ordered by creation time
CREATE INDEX idx_outbox_status_created ON outbox(status, created_at);

-- Query for exhausted events (DLQ candidates)
CREATE INDEX idx_outbox_retry_status ON outbox(retry_count, status) WHERE status != 'published';

COMMENT ON TABLE outbox IS 'Transactional outbox: events are inserted within the same DB transaction as domain mutations. The relay worker polls pending events and publishes them to the event bus.';
