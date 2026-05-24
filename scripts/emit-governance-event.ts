#!/usr/bin/env tsx
/**
 * emit-governance-event.ts
 * Append-only governance event emitter with sequence assignment — T29.1 deliverable
 *
 * Assigns global_sequence, execution_sequence, parent_event_id, and causality_chain
 * to every emitted event for deterministic replay under concurrency.
 */

import { readFileSync, existsSync } from "fs";
import { randomUUID } from "crypto";
import { resolve } from "path";
import { appendToStream, selectStreams, validatePayloadSize } from "./lib/stream-emitter.js";
import { assignSequences } from "./sequence-tracker.ts";

const POLICY_PATH = resolve("meta/governance/events/event-stream-policy.json");
const SCHEMA_PATH = resolve("meta/governance/events/schemas/governance-event.schema.json");

interface Policy {
  format: string;
  encoding: string;
  line_ending: string;
  retention: { immutable: boolean; max_payload_size_bytes?: number };
  ordering: { timestamp_field: string };
  validation: { reject_on_invalid: boolean; max_payload_size_bytes: number };
  streams: Array<{
    name: string;
    path: string;
    severity_filter: string[];
    categories: string[];
  }>;
}

type Severity = "debug" | "info" | "warn" | "error" | "critical";
type Category = "execution" | "validation" | "recovery" | "governance" | "runtime" | "planning" | "diagnostics";

interface GovernanceEvent {
  event_id: string;
  timestamp: string;
  event_type: string;
  severity: Severity;
  category: Category;
  execution_id?: string | null;
  milestone?: string | null;
  ticket?: string | null;
  actor?: string;
  session_id?: string | null;
  correlation_id?: string | null;
  causation_id?: string | null;
  global_sequence?: number;
  execution_sequence?: number;
  parent_event_id?: string | null;
  causality_chain?: string[];
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

function loadPolicy(): Policy {
  return JSON.parse(readFileSync(POLICY_PATH, "utf-8")) as Policy;
}

function validateEvent(event: GovernanceEvent, policy: Policy): string[] {
  const errors: string[] = [];
  if (!event.event_id) errors.push("Missing event_id");
  if (!event.timestamp) errors.push("Missing timestamp");
  if (!event.event_type) errors.push("Missing event_type");
  const eventTypeRe = /^[a-z]+\.[a-z]+(_[a-z]+)*$/;
  if (event.event_type && !eventTypeRe.test(event.event_type)) errors.push(`Invalid event_type format: ${event.event_type}`);
  const validSeverities: Severity[] = ["debug", "info", "warn", "error", "critical"];
  if (!validSeverities.includes(event.severity)) errors.push(`Invalid severity: ${event.severity}`);
  const validCategories: Category[] = ["execution", "validation", "recovery", "governance", "runtime", "planning", "diagnostics"];
  if (!validCategories.includes(event.category)) errors.push(`Invalid category: ${event.category}`);

  // Validate sequence fields if present
  if (event.global_sequence !== undefined && (!Number.isInteger(event.global_sequence) || event.global_sequence < 1)) {
    errors.push("global_sequence must be a positive integer");
  }
  if (event.execution_sequence !== undefined && (!Number.isInteger(event.execution_sequence) || event.execution_sequence < 1)) {
    errors.push("execution_sequence must be a positive integer");
  }

  const sizeErrors = validatePayloadSize(event, policy.validation.max_payload_size_bytes);
  errors.push(...sizeErrors);
  return errors;
}

function selectGovStreams(event: GovernanceEvent, policy: Policy): Array<{ name: string; path: string }> {
  return selectStreams(event, policy).map(s => ({ name: s.name, path: resolve(s.path) }));
}

function buildEvent(
  eventType: string,
  severity: Severity,
  category: Category,
  payload: Record<string, unknown> = {},
  opts: Partial<GovernanceEvent> = {}
): GovernanceEvent {
  const eventId = opts.event_id ?? randomUUID();
  const executionId = opts.execution_id ?? null;

  // Determine if cross-execution linkage is requested
  const customParent = opts.parent_event_id;
  const customChain = opts.causality_chain;

  // Validate cross-execution linkage classification
  if (customParent && executionId) {
    const linkageType = (opts.metadata?.linkage_type as string) || (payload.linkage_type as string);
    const validTypes = ["handoff", "recovery", "escalation", "replay", "delegation"];
    // Note: strict validation deferred to caller; we warn here
    if (!linkageType || !validTypes.includes(linkageType)) {
      console.warn(`[emit-governance-event] Cross-execution linkage without valid linkage_type: ${linkageType}. Valid: ${validTypes.join(", ")}`);
    }
  }

  // Assign sequences for deterministic replay
  const sequences = assignSequences(executionId, eventId, {
    parentEventId: customParent,
    parentChain: customChain,
  });

  return {
    event_id: eventId,
    timestamp: opts.timestamp ?? new Date().toISOString(),
    event_type: eventType,
    severity,
    category,
    execution_id: executionId,
    milestone: opts.milestone ?? null,
    ticket: opts.ticket ?? null,
    actor: opts.actor ?? "system",
    session_id: opts.session_id ?? null,
    correlation_id: opts.correlation_id ?? null,
    causation_id: opts.causation_id ?? null,
    global_sequence: sequences.global_sequence,
    execution_sequence: sequences.execution_sequence,
    parent_event_id: sequences.parent_event_id,
    causality_chain: sequences.causality_chain,
    payload,
    metadata: opts.metadata ?? {},
  };
}

export function emit(event: GovernanceEvent): { ok: boolean; streams: string[]; errors: string[] } {
  const policy = loadPolicy();
  const errors = validateEvent(event, policy);
  if (errors.length > 0 && policy.validation.reject_on_invalid) {
    return { ok: false, streams: [], errors };
  }
  const streams = selectGovStreams(event, policy);
  for (const s of streams) {
    appendToStream(event, s.path, policy);
  }
  return { ok: true, streams: streams.map(s => s.name), errors };
}

export { buildEvent, loadPolicy, validateEvent, selectGovStreams as selectStreams };

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error("Usage: tsx scripts/emit-governance-event.ts <event_type> <severity> <category> [payload_json]");
    process.exit(1);
  }
  const [eventType, severity, category, payloadRaw] = args;
  const payload = payloadRaw ? JSON.parse(payloadRaw) : {};
  const event = buildEvent(eventType, severity as Severity, category as Category, payload, { actor: "system" });
  const result = emit(event);
  if (!result.ok) {
    console.error("Validation failed:", result.errors);
    process.exit(1);
  }
  console.log("Emitted to:", result.streams.join(", "), "event_id:", event.event_id, "global_seq:", event.global_sequence, "exec_seq:", event.execution_sequence);
}
