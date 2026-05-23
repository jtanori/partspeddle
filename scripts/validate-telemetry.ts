#!/usr/bin/env tsx
/**
 * validate-telemetry.ts
 * Validates telemetry events against schema and policy.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const SCHEMA_PATH = resolve("project-governance/runtime/telemetry/schema/telemetry-event.schema.json");
const POLICY_PATH = resolve("project-governance/runtime/telemetry/schema/telemetry-policy.json");

interface TelemetryEvent {
  event_id: string;
  timestamp: string;
  category: string;
  name: string;
  value: unknown;
  unit?: string | null;
  severity: string;
  execution_id?: string | null;
  session_id?: string | null;
  correlation_id?: string | null;
  source?: string;
  metadata?: Record<string, unknown>;
}

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function validateEvent(event: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof event !== "object" || event === null) {
    return { valid: false, errors: ["Event must be an object"] };
  }
  const e = event as Record<string, unknown>;

  if (typeof e.event_id !== "string") errors.push("event_id must be a string");
  if (typeof e.timestamp !== "string") errors.push("timestamp must be a string");
  const isoRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
  if (typeof e.timestamp === "string" && !isoRe.test(e.timestamp)) errors.push("timestamp must be ISO-8601");

  const validCategories = ["execution", "planning", "validation", "recovery", "governance", "runtime", "diagnostics"];
  if (!validCategories.includes(e.category as string)) errors.push(`category must be one of ${validCategories.join(", ")}`);

  const nameRe = /^[a-z]+(_[a-z]+)*$/;
  if (typeof e.name !== "string" || !nameRe.test(e.name)) errors.push("name must match snake_case pattern");

  if (e.value === undefined) errors.push("value is required");

  const validSeverities = ["debug", "info", "warn", "error", "critical"];
  if (!validSeverities.includes(e.severity as string)) errors.push(`severity must be one of ${validSeverities.join(", ")}`);

  if (e.execution_id !== undefined && e.execution_id !== null) {
    const execRe = /^EXEC-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{3}$/;
    if (typeof e.execution_id !== "string" || !execRe.test(e.execution_id)) {
      errors.push("execution_id must match EXEC-YYYY-MM-DD-NNN");
    }
  }

  const eventSize = JSON.stringify(event).length;
  const policy = loadJson(POLICY_PATH) as { validation: { max_payload_size_bytes: number } };
  if (eventSize > policy.validation.max_payload_size_bytes) {
    errors.push(`Event size ${eventSize} exceeds max ${policy.validation.max_payload_size_bytes}`);
  }

  return { valid: errors.length === 0, errors };
}

function validateStream(streamPath: string): { total: number; valid: number; invalid: number; errors: string[] } {
  if (!existsSync(streamPath)) return { total: 0, valid: 0, invalid: 0, errors: [] };
  const text = readFileSync(streamPath, "utf-8");
  const lines = text.split("\n").filter(l => l.trim() !== "");
  let valid = 0;
  let invalid = 0;
  const errors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      const event = JSON.parse(lines[i]) as TelemetryEvent;
      const result = validateEvent(event);
      if (result.valid) valid++;
      else {
        invalid++;
        errors.push(`Line ${i + 1}: ${result.errors.join(", ")}`);
      }
    } catch {
      invalid++;
      errors.push(`Line ${i + 1}: JSON parse error`);
    }
  }

  return { total: lines.length, valid, invalid, errors };
}

export { validateEvent, validateStream };

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: tsx scripts/validate-telemetry.ts <stream_name> [--schema-only]");
    process.exit(1);
  }

  if (args[0] === "--schema-only") {
    console.log("Schema valid:", existsSync(SCHEMA_PATH));
    process.exit(0);
  }

  const streamName = args[0];
  function getStreamPath(streamName: string): string {
  const policy = loadJson(POLICY_PATH) as { streams: Array<{ name: string; path: string }> };
  const stream = policy.streams.find(s => s.name === streamName);
  if (stream) return resolve(stream.path);
  return resolve(`project-governance/runtime/telemetry/logs/${streamName}.ndjson`);
}
  const result = validateStream(getStreamPath(streamName));
  console.log(`Stream: ${streamName}`);
  console.log(`Total: ${result.total}, Valid: ${result.valid}, Invalid: ${result.invalid}`);
  if (result.errors.length > 0) {
    console.log("Errors:");
    result.errors.forEach(e => console.log(`  ${e}`));
    process.exit(1);
  }
}
