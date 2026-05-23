#!/usr/bin/env tsx
/**
 * run-telemetry-tests.ts
 * Integration tests for runtime telemetry infrastructure.
 */
import { readFileSync, existsSync, rmSync } from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";
import { emit, buildEvent, loadPolicy, validateEvent, selectStreams } from "../../../../scripts/emit-telemetry.js";
import { validateEvent as validateTelemetryEvent, validateStream } from "../../../../scripts/validate-telemetry.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e: unknown) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e instanceof Error ? e.message : String(e)}`);
    failed++;
  }
}

console.log("Running Telemetry Tests...\n");

// Clean test streams
const STREAM_PATHS = [
  resolve("project-governance/runtime/telemetry/logs/default.ndjson"),
  resolve("project-governance/runtime/telemetry/errors/errors.ndjson"),
  resolve("project-governance/runtime/telemetry/traces/traces.ndjson"),
];
for (const p of STREAM_PATHS) {
  if (existsSync(p)) rmSync(p);
}

// ── Schema Tests ──

test("telemetry-event.schema.json exists and is valid JSON", () => {
  const schema = JSON.parse(readFileSync(resolve("project-governance/runtime/telemetry/schema/telemetry-event.schema.json"), "utf-8"));
  if (typeof schema !== "object" || schema === null) throw new Error("Invalid schema");
});

test("telemetry-policy.json exists and defines 3 streams", () => {
  const policy = JSON.parse(readFileSync(resolve("project-governance/runtime/telemetry/schema/telemetry-policy.json"), "utf-8"));
  if (!Array.isArray(policy.streams)) throw new Error("Missing streams");
  if (policy.streams.length < 3) throw new Error(`Only ${policy.streams.length} streams`);
});

// ── Validation Tests ──

test("validateTelemetryEvent accepts a valid event", () => {
  const event = {
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
    category: "execution",
    name: "test_metric",
    value: 42,
    severity: "info",
    source: "test",
  };
  const result = validateTelemetryEvent(event);
  if (!result.valid) throw new Error(result.errors.join(", "));
});

test("validateTelemetryEvent rejects missing event_id", () => {
  const result = validateTelemetryEvent({
    timestamp: new Date().toISOString(),
    category: "execution",
    name: "test",
    value: 1,
    severity: "info",
  });
  if (result.valid) throw new Error("Should have rejected");
});

test("validateTelemetryEvent rejects invalid category", () => {
  const result = validateTelemetryEvent({
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
    category: "invalid",
    name: "test",
    value: 1,
    severity: "info",
  });
  if (result.valid) throw new Error("Should have rejected invalid category");
});

test("validateTelemetryEvent rejects invalid name format", () => {
  const result = validateTelemetryEvent({
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
    category: "execution",
    name: "Bad Name!",
    value: 1,
    severity: "info",
  });
  if (result.valid) throw new Error("Should have rejected invalid name");
});

test("validateTelemetryEvent rejects invalid severity", () => {
  const result = validateTelemetryEvent({
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
    category: "execution",
    name: "test",
    value: 1,
    severity: "unknown",
  });
  if (result.valid) throw new Error("Should have rejected invalid severity");
});

// ── Emitter Tests ──

test("emit appends a valid event to default stream", () => {
  const event = buildEvent("execution", "duration_ms", 100, "info", { source: "test" });
  const result = emit(event);
  if (!result.ok) throw new Error(result.errors.join(", "));
  if (!result.streams.includes("default")) throw new Error("Expected default stream");
});

test("emit routes error events to errors stream", () => {
  const event = buildEvent("validation", "failure_count", 1, "error", { source: "test" });
  const result = emit(event);
  if (!result.ok) throw new Error(result.errors.join(", "));
  if (!result.streams.includes("errors")) throw new Error("Expected errors stream");
});

test("emit routes execution events to traces stream", () => {
  const event = buildEvent("execution", "step_completed", true, "debug", { source: "test" });
  const result = emit(event);
  if (!result.ok) throw new Error(result.errors.join(", "));
  if (!result.streams.includes("traces")) throw new Error("Expected traces stream");
});

test("emit rejects invalid event when reject_on_invalid is true", () => {
  const event = buildEvent("execution", "bad name!", 1, "info", { source: "test" });
  event.name = "bad name!";
  const result = emit(event);
  if (result.ok) throw new Error("Should have rejected invalid name");
});

// ── Stream Validation Tests ──

test("validateStream reports correct counts for default stream", () => {
  const result = validateStream(resolve("project-governance/runtime/telemetry/logs/default.ndjson"));
  if (result.total === 0) throw new Error("Expected events in default stream");
  if (result.invalid > 0) throw new Error(`Invalid events: ${result.invalid}`);
});

test("validateStream reports correct counts for errors stream", () => {
  const result = validateStream(resolve("project-governance/runtime/telemetry/errors/errors.ndjson"));
  if (result.total === 0) throw new Error("Expected events in errors stream");
  if (result.invalid > 0) throw new Error(`Invalid events: ${result.invalid}`);
});

test("validateStream reports correct counts for traces stream", () => {
  const result = validateStream(resolve("project-governance/runtime/telemetry/traces/traces.ndjson"));
  if (result.total === 0) throw new Error("Expected events in traces stream");
  if (result.invalid > 0) throw new Error(`Invalid events: ${result.invalid}`);
});

// ── Policy Tests ──

test("loadPolicy returns valid telemetry policy", () => {
  const policy = loadPolicy();
  if (!policy.streams || policy.streams.length < 3) throw new Error("Policy missing streams");
  if (policy.validation.reject_on_invalid !== true) throw new Error("Expected reject_on_invalid=true");
});

test("deterministic timestamps are ISO-8601 UTC", () => {
  const event = buildEvent("execution", "timestamp_test", 1, "info");
  const ts = event.timestamp;
  const isoRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
  if (!isoRe.test(ts)) throw new Error(`Timestamp not ISO-8601: ${ts}`);
});

// ── Distinctness from Governance Events ──

test("telemetry events do not use governance event_type field", () => {
  const event = buildEvent("execution", "test", 1, "info");
  if ("event_type" in event) throw new Error("Telemetry should not have event_type");
});

test("telemetry streams are separate from governance event streams", () => {
  const policy = loadPolicy();
  for (const stream of policy.streams) {
    if (stream.path.includes("governance/events")) {
      throw new Error(`Telemetry stream overlaps governance: ${stream.path}`);
    }
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
