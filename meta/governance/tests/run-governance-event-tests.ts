#!/usr/bin/env tsx
/**
 * run-governance-event-tests.ts
 * Integration tests for the governance event bus.
 */
import { readFileSync, readdirSync, rmSync, existsSync } from "fs";
import { join, resolve } from "path";
import { randomUUID } from "crypto";
import {
  validateGovernanceEvent,
  type GovernanceEvent,
} from "../../../scripts/validators/governance/governance-event.js";
import {
  emit,
  buildEvent,
  loadPolicy,
  validateEvent,
  selectStreams,
} from "../../../scripts/emit-governance-event.js";
import { query } from "../../../scripts/query-governance-events.js";

const GOVERNANCE_DIR = resolve("meta/governance");
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

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

console.log("Running Governance Event Bus Tests...\n");

// ── Schema Tests ──

test("governance-event.schema.json exists and is valid JSON", () => {
  const schema = loadJson(join(GOVERNANCE_DIR, "events/schemas/governance-event.schema.json"));
  if (typeof schema !== "object" || schema === null) throw new Error("Invalid schema");
});

test("event-catalog.json exists and defines 11+ event types", () => {
  const catalog = loadJson(join(GOVERNANCE_DIR, "events/event-catalog.json")) as { events: unknown[] };
  if (!Array.isArray(catalog.events)) throw new Error("Missing events array");
  if (catalog.events.length < 11) throw new Error(`Only ${catalog.events.length} event types, expected 11+`);
});

test("event-stream-policy.json exists and defines 5 streams", () => {
  const policy = loadJson(join(GOVERNANCE_DIR, "events/event-stream-policy.json")) as { streams: unknown[] };
  if (!Array.isArray(policy.streams)) throw new Error("Missing streams array");
  if (policy.streams.length < 5) throw new Error(`Only ${policy.streams.length} streams, expected 5+`);
});

// ── Validation Tests ──

test("validateGovernanceEvent accepts a valid event", () => {
  const event: GovernanceEvent = {
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
    event_type: "execution.started",
    severity: "info",
    category: "execution",
    actor: "system",
    payload: { command: "test" },
  };
  const result = validateGovernanceEvent(event);
  if (!result.valid) throw new Error(result.errors.join(", "));
});

test("validateGovernanceEvent rejects missing event_id", () => {
  const result = validateGovernanceEvent({
    timestamp: new Date().toISOString(),
    event_type: "execution.started",
    severity: "info",
    category: "execution",
  });
  if (result.valid) throw new Error("Should have rejected missing event_id");
});

test("validateGovernanceEvent rejects invalid severity", () => {
  const result = validateGovernanceEvent({
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
    event_type: "execution.started",
    severity: "unknown" as "info",
    category: "execution",
  });
  if (result.valid) throw new Error("Should have rejected invalid severity");
});

test("validateGovernanceEvent rejects invalid category", () => {
  const result = validateGovernanceEvent({
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
    event_type: "execution.started",
    severity: "info",
    category: "unknown" as "execution",
  });
  if (result.valid) throw new Error("Should have rejected invalid category");
});

test("validateGovernanceEvent rejects invalid execution_id format", () => {
  const result = validateGovernanceEvent({
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
    event_type: "execution.started",
    severity: "info",
    category: "execution",
    execution_id: "bad-id",
  });
  if (result.valid) throw new Error("Should have rejected invalid execution_id");
});

test("validateGovernanceEvent rejects invalid ticket format", () => {
  const result = validateGovernanceEvent({
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
    event_type: "execution.started",
    severity: "info",
    category: "execution",
    ticket: "bad-ticket",
  });
  if (result.valid) throw new Error("Should have rejected invalid ticket");
});

// ── Emitter Tests ──

// Clean test streams before emitter tests
const TEST_STREAMS = ["default", "errors", "execution", "validation", "diagnostics"];
for (const s of TEST_STREAMS) {
  const p = resolve(`project-governance/runtime/events/streams/${s}.ndjson`);
  if (existsSync(p)) rmSync(p);
}

test("emit appends a valid event to default stream", () => {
  const event = buildEvent("execution.started", "info", "execution", { command: "test" }, { actor: "system" });
  const result = emit(event);
  if (!result.ok) throw new Error(result.errors.join(", "));
  if (!result.streams.includes("default")) throw new Error("Expected default stream");
});

test("emit routes error events to errors stream", () => {
  const event = buildEvent("execution.failed", "error", "execution", { reason: "timeout" }, { actor: "system" });
  const result = emit(event);
  if (!result.ok) throw new Error(result.errors.join(", "));
  if (!result.streams.includes("errors")) throw new Error("Expected errors stream");
});

test("emit routes debug events to diagnostics stream only", () => {
  const event = buildEvent("runtime.ping", "debug", "runtime", {}, { actor: "system" });
  const result = emit(event);
  if (!result.ok) throw new Error(result.errors.join(", "));
  if (result.streams.includes("default")) throw new Error("Debug should not go to default");
  if (!result.streams.includes("diagnostics")) throw new Error("Expected diagnostics stream");
});

test("emit rejects invalid event when reject_on_invalid is true", () => {
  const event = buildEvent("bad type!", "info", "execution", {}, { actor: "system" });
  event.event_type = "bad type!";
  const result = emit(event);
  if (result.ok) throw new Error("Should have rejected invalid event_type");
});

// ── Query Tests ──

test("query returns events from a stream", () => {
  const results = query({ stream: "default" });
  if (results.length === 0) throw new Error("Expected at least one event");
});

test("query filters by category", () => {
  const results = query({ stream: "default", category: "execution" });
  if (results.length === 0) throw new Error("Expected execution events");
  for (const e of results) {
    if (e.category !== "execution") throw new Error(`Wrong category: ${e.category}`);
  }
});

test("query filters by severity", () => {
  const results = query({ stream: "errors", severity: "error" });
  if (results.length === 0) throw new Error("Expected error events");
  for (const e of results) {
    if (e.severity !== "error") throw new Error(`Wrong severity: ${e.severity}`);
  }
});

test("query respects limit", () => {
  const results = query({ stream: "default", limit: 1 });
  if (results.length > 1) throw new Error("Limit not respected");
});

// ── Policy Tests ──

test("loadPolicy returns valid event stream policy", () => {
  const policy = loadPolicy();
  if (!policy.streams || policy.streams.length < 5) throw new Error("Policy missing streams");
  if (policy.validation.reject_on_invalid !== true) throw new Error("Expected reject_on_invalid=true");
});

test("selectStreams routes validation category to validation stream", () => {
  const policy = loadPolicy();
  const event = buildEvent("validation.passed", "info", "validation", {}, { actor: "system" });
  const streams = selectStreams(event, policy);
  const names = streams.map(s => s.name);
  if (!names.includes("validation")) throw new Error("Expected validation stream");
});

// ── Catalog Coverage Tests ──

test("event catalog covers all 7 categories from schema", () => {
  const catalog = loadJson(join(GOVERNANCE_DIR, "events/event-catalog.json")) as { events: Array<{ category: string }> };
  const categories = new Set(catalog.events.map(e => e.category));
  const required = ["execution", "validation", "recovery", "governance", "runtime", "planning", "diagnostics"];
  for (const c of required) {
    if (!categories.has(c)) throw new Error(`Missing category: ${c}`);
  }
});

test("event catalog covers all 5 severity levels", () => {
  const catalog = loadJson(join(GOVERNANCE_DIR, "events/event-catalog.json")) as { events: Array<{ severity: string }> };
  const severities = new Set(catalog.events.map(e => e.severity));
  const required = ["debug", "info", "warn", "error", "critical"];
  for (const s of required) {
    if (!severities.has(s)) throw new Error(`Missing severity: ${s}`);
  }
});

// ── Duplicate Check ──

test("no governance event types duplicate application event types", () => {
  const catalog = loadJson(join(GOVERNANCE_DIR, "events/event-catalog.json")) as { events: Array<{ event_type: string }> };
  const appEventsDir = resolve("src/shared/event-bus");
  const governanceTypes = new Set(catalog.events.map(e => e.event_type));
  // If application event catalog exists, check for overlap
  if (existsSync(appEventsDir)) {
    const files = readdirSync(appEventsDir).filter(f => f.endsWith(".ts"));
    for (const file of files) {
      const content = readFileSync(join(appEventsDir, file), "utf-8");
      for (const govType of governanceTypes) {
        if (content.includes(`"${govType}"`) || content.includes(`'${govType}'`)) {
          throw new Error(`Potential duplicate event type '${govType}' found in ${file}`);
        }
      }
    }
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
