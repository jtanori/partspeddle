#!/usr/bin/env tsx
/**
 * run-replay-tests.ts
 * Integration tests for runtime replay system.
 */
import { readFileSync, existsSync, rmSync, readdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";
import { emit as emitGovEvent } from "../../../../scripts/emit-governance-event.js";
import { emit as emitTelemetry } from "../../../../scripts/emit-telemetry.js";
import { replay, replayFromCheckpoint, collectEventsForExecution, inferStatus, computeIntegrityHash } from "../../../../scripts/replay-execution.js";
import { validateReplay } from "../../../../scripts/validate-replay.js";

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

console.log("Running Replay Tests...\n");

// Clean replay outputs
const REPLAY_DIRS = [
  resolve("project-governance/runtime/replay/manifests"),
  resolve("project-governance/runtime/replay/timelines"),
];
for (const dir of REPLAY_DIRS) {
  if (existsSync(dir)) {
    const files = readdirSync(dir);
    for (const f of files) rmSync(resolve(dir, f));
  }
}

const TEST_EXEC_ID = "EXEC-2026-05-20-001";

// Seed events for test execution
emitGovEvent({
  event_id: randomUUID(),
  timestamp: "2026-05-20T09:00:00.000Z",
  event_type: "execution.started",
  severity: "info",
  category: "execution",
  execution_id: TEST_EXEC_ID,
  actor: "system",
  payload: { command: "test-run" },
});

emitTelemetry({
  event_id: randomUUID(),
  timestamp: "2026-05-20T09:00:01.000Z",
  category: "execution",
  name: "step_init",
  value: true,
  severity: "info",
  execution_id: TEST_EXEC_ID,
  source: "test",
});

emitGovEvent({
  event_id: randomUUID(),
  timestamp: "2026-05-20T09:00:05.000Z",
  event_type: "validation.passed",
  severity: "info",
  category: "validation",
  execution_id: TEST_EXEC_ID,
  actor: "system",
  payload: { check: "schema" },
});

emitTelemetry({
  event_id: randomUUID(),
  timestamp: "2026-05-20T09:00:06.000Z",
  category: "execution",
  name: "duration_ms",
  value: 120,
  severity: "info",
  execution_id: TEST_EXEC_ID,
  source: "test",
  unit: "ms",
});

emitGovEvent({
  event_id: randomUUID(),
  timestamp: "2026-05-20T09:00:10.000Z",
  event_type: "execution.completed",
  severity: "info",
  category: "execution",
  execution_id: TEST_EXEC_ID,
  actor: "system",
  payload: {},
});

// ── Replay Tests ──

test("replay reconstructs execution from event streams", () => {
  const result = replay(TEST_EXEC_ID);
  if (result.manifest.event_count === 0) throw new Error("No events reconstructed");
  if (result.manifest.status !== "complete") throw new Error(`Expected complete, got ${result.manifest.status}`);
});

test("replay generates manifest with integrity hash", () => {
  const result = replay(TEST_EXEC_ID);
  if (!result.manifest.integrity_hash) throw new Error("Missing integrity hash");
  if (result.manifest.integrity_hash.length < 8) throw new Error("Hash too short");
});

test("replay generates timeline markdown", () => {
  const result = replay(TEST_EXEC_ID);
  if (!existsSync(result.timelinePath)) throw new Error("Timeline not generated");
  const md = readFileSync(result.timelinePath, "utf-8");
  if (!md.includes("Execution Replay")) throw new Error("Missing header");
  if (!md.includes("read-only reconstruction")) throw new Error("Missing read-only disclaimer");
});

test("replayFromCheckpoint filters events after checkpoint", () => {
  const result = replayFromCheckpoint(TEST_EXEC_ID, "2026-05-20T09:00:05.000Z");
  const hasPreCheckpoint = result.events.some(e => e.timestamp < "2026-05-20T09:00:05.000Z");
  if (hasPreCheckpoint) throw new Error("Pre-checkpoint events should be filtered");
});

test("validateReplay passes for consistent replay", () => {
  replay(TEST_EXEC_ID);
  const validation = validateReplay(TEST_EXEC_ID);
  if (!validation.valid) throw new Error(validation.errors.join(", "));
  if (!validation.integrity_match) throw new Error("Integrity mismatch");
});

test("validateReplay detects event count mismatch", () => {
  replay(TEST_EXEC_ID);
  // Corrupt manifest by rewriting with wrong count
  const manifestPath = resolve(`project-governance/runtime/replay/manifests/${TEST_EXEC_ID}.json`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  manifest.event_count = 999;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const validation = validateReplay(TEST_EXEC_ID);
  if (validation.valid) throw new Error("Should have detected mismatch");
  if (!validation.errors.some(e => e.includes("Event count mismatch"))) throw new Error("Wrong error");
});

test("inferStatus returns complete for completed execution", () => {
  const events = collectEventsForExecution(TEST_EXEC_ID);
  const status = inferStatus(events);
  if (status !== "complete") throw new Error(`Expected complete, got ${status}`);
});

test("inferStatus returns interrupted for started-only execution", () => {
  const execId = "EXEC-2026-05-20-002";
  emitGovEvent({
    event_id: randomUUID(),
    timestamp: "2026-05-20T10:00:00.000Z",
    event_type: "execution.started",
    severity: "info",
    category: "execution",
    execution_id: execId,
    actor: "system",
    payload: {},
  });
  const events = collectEventsForExecution(execId);
  const status = inferStatus(events);
  if (status !== "interrupted") throw new Error(`Expected interrupted, got ${status}`);
});

test("computeIntegrityHash is deterministic", () => {
  const events = collectEventsForExecution(TEST_EXEC_ID);
  const h1 = computeIntegrityHash(events);
  const h2 = computeIntegrityHash(events);
  if (h1 !== h2) throw new Error("Hash not deterministic");
});

test("replay manifest includes all required fields", () => {
  const result = replay(TEST_EXEC_ID);
  const m = result.manifest;
  if (!m.execution_id) throw new Error("Missing execution_id");
  if (!m.reconstructed_at) throw new Error("Missing reconstructed_at");
  if (!m.timeline_start) throw new Error("Missing timeline_start");
  if (!m.timeline_end) throw new Error("Missing timeline_end");
  if (!m.sources || m.sources.length === 0) throw new Error("Missing sources");
});

test("O(1) lookup by execution_id via manifest file", () => {
  replay(TEST_EXEC_ID);
  const manifestPath = resolve(`project-governance/runtime/replay/manifests/${TEST_EXEC_ID}.json`);
  const start = Date.now();
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const elapsed = Date.now() - start;
  if (elapsed > 100) throw new Error(`Lookup took ${elapsed}ms, expected <100ms`);
  if (manifest.execution_id !== TEST_EXEC_ID) throw new Error("Wrong execution");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
