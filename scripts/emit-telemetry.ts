#!/usr/bin/env tsx
/**
 * emit-telemetry.ts
 * Runtime telemetry emitter. Emits structured operational telemetry
 * to NDJSON streams. Distinct from governance event bus.
 */
import { readFileSync, existsSync } from "fs";
import { randomUUID } from "crypto";
import { resolve } from "path";
import { appendToStream, selectStreams, validatePayloadSize } from "./lib/stream-emitter.js";

const POLICY_PATH = resolve("project-governance/runtime/telemetry/schema/telemetry-policy.json");

interface Policy {
  format: string;
  encoding: string;
  line_ending: string;
  retention: Record<string, unknown>;
  validation: { reject_on_invalid: boolean; max_payload_size_bytes: number };
  streams: Array<{
    name: string;
    path: string;
    severity_filter: string[];
    categories: string[];
  }>;
}

type Severity = "debug" | "info" | "warn" | "error" | "critical";
type Category = "execution" | "planning" | "validation" | "recovery" | "governance" | "runtime" | "diagnostics";

interface TelemetryEvent {
  event_id: string;
  timestamp: string;
  category: Category;
  name: string;
  value: unknown;
  unit?: string | null;
  severity: Severity;
  execution_id?: string | null;
  session_id?: string | null;
  correlation_id?: string | null;
  source?: string;
  metadata?: Record<string, unknown>;
}

function loadPolicy(): Policy {
  return JSON.parse(readFileSync(POLICY_PATH, "utf-8")) as Policy;
}

function validateEvent(event: TelemetryEvent, policy: Policy): string[] {
  const errors: string[] = [];
  if (!event.event_id) errors.push("Missing event_id");
  if (!event.timestamp) errors.push("Missing timestamp");
  if (!event.category) errors.push("Missing category");
  const validCategories: Category[] = ["execution", "planning", "validation", "recovery", "governance", "runtime", "diagnostics"];
  if (!validCategories.includes(event.category)) errors.push(`Invalid category: ${event.category}`);
  if (!event.name || !/^[a-z]+(_[a-z]+)*$/.test(event.name)) errors.push(`Invalid name: ${event.name}`);
  if (event.value === undefined) errors.push("Missing value");
  const validSeverities: Severity[] = ["debug", "info", "warn", "error", "critical"];
  if (!validSeverities.includes(event.severity)) errors.push(`Invalid severity: ${event.severity}`);
  const sizeErrors = validatePayloadSize(event, policy.validation.max_payload_size_bytes);
  errors.push(...sizeErrors);
  return errors;
}

function selectTelStreams(event: TelemetryEvent, policy: Policy): Array<{ name: string; path: string }> {
  return selectStreams(event, policy).map(s => ({ name: s.name, path: resolve(s.path) }));
}

function buildEvent(
  category: Category,
  name: string,
  value: unknown,
  severity: Severity = "info",
  opts: Partial<TelemetryEvent> = {}
): TelemetryEvent {
  return {
    event_id: opts.event_id ?? randomUUID(),
    timestamp: opts.timestamp ?? new Date().toISOString(),
    category,
    name,
    value,
    unit: opts.unit ?? null,
    severity,
    execution_id: opts.execution_id ?? null,
    session_id: opts.session_id ?? null,
    correlation_id: opts.correlation_id ?? null,
    source: opts.source ?? "runtime",
    metadata: opts.metadata ?? {},
  };
}

export function emit(event: TelemetryEvent): { ok: boolean; streams: string[]; errors: string[] } {
  const policy = loadPolicy();
  const errors = validateEvent(event, policy);
  if (errors.length > 0 && policy.validation.reject_on_invalid) {
    return { ok: false, streams: [], errors };
  }
  const streams = selectTelStreams(event, policy);
  for (const s of streams) {
    appendToStream(event, s.path, policy);
  }
  return { ok: true, streams: streams.map(s => s.name), errors };
}

export { buildEvent, loadPolicy, validateEvent, selectTelStreams as selectStreams };

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error("Usage: tsx scripts/emit-telemetry.ts <category> <name> <value> [severity] [unit]");
    process.exit(1);
  }
  const [category, name, valueRaw, severityRaw, unit] = args;
  let value: unknown = valueRaw;
  if (!Number.isNaN(Number(valueRaw))) value = Number(valueRaw);
  else if (valueRaw === "true" || valueRaw === "false") value = valueRaw === "true";
  else try { value = JSON.parse(valueRaw); } catch { /* keep string */ }

  const event = buildEvent(
    category as Category,
    name,
    value,
    (severityRaw as Severity) || "info",
    { unit, source: "cli" }
  );
  const result = emit(event);
  if (!result.ok) {
    console.error("Validation failed:", result.errors);
    process.exit(1);
  }
  console.log("Emitted to:", result.streams.join(", "), "event_id:", event.event_id);
}
