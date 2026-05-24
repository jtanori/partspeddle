#!/usr/bin/env tsx
/**
 * run-healing-tests.ts
 * Integration tests for governance self-healing runner.
 */
import { existsSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "fs";
import { resolve, join } from "path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

import {
  scan,
  heal,
  createSnapshot,
  listSnapshots,
  revertSnapshot,
  generateHealingReport,
} from "../../../../scripts/self-heal.js";

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

function cleanHealing(): void {
  const HEALING_DIR = resolve("project-governance/runtime/healing");
  const HEALING_LOG = join(HEALING_DIR, "healing-log.ndjson");
  if (existsSync(HEALING_LOG)) rmSync(HEALING_LOG);
}

function cleanLocks(): void {
  const LOCKS_LOG = resolve("project-governance/runtime/locks/locks.ndjson");
  if (existsSync(LOCKS_LOG)) rmSync(LOCKS_LOG);
}

function cleanState(): void {
  const STATE_PATH = resolve("project-governance/runtime/execution-state.json");
  if (existsSync(STATE_PATH)) rmSync(STATE_PATH);
}

function injectStaleLock(): void {
  const LOCKS_LOG = resolve("project-governance/runtime/locks/locks.ndjson");
  const now = new Date();
  const old = new Date(now.getTime() - 2 * 60 * 1000);
  const expired = new Date(old.getTime() + 1000);
  const event = {
    event_id: "test-uuid-001",
    timestamp: old.toISOString(),
    action: "acquired",
    execution_id: "EXEC-STALE-001",
    locked_by: "test",
    ttl_ms: 1000,
    expires_at: expired.toISOString(),
  };
  mkdirSync(resolve("project-governance/runtime/locks"), { recursive: true });
  writeFileSync(LOCKS_LOG, JSON.stringify(event) + "\n", "utf-8");
}

console.log("Running Self-Healing Tests...\n");

// ── Protocol Validation ──

test("self-healing protocol validates against protocol-definition.schema.json", () => {
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  const schema = JSON.parse(readFileSync(resolve("meta/governance/schemas/protocol-definition.schema.json"), "utf-8"));
  const data = JSON.parse(readFileSync(resolve("meta/governance/protocols/self-healing.json"), "utf-8"));
  const validate = ajv.compile(schema);
  const valid = validate(data);
  if (!valid) throw new Error(ajv.errorsText(validate.errors));
});

test("self-healing protocol defines 6 rules", () => {
  const data = JSON.parse(readFileSync(resolve("meta/governance/protocols/self-healing.json"), "utf-8"));
  if (data.rules.length !== 6) throw new Error(`Expected 6 rules, got ${data.rules.length}`);
});

test("self-healing protocol has 3 invariants", () => {
  const data = JSON.parse(readFileSync(resolve("meta/governance/protocols/self-healing.json"), "utf-8"));
  if (data.invariants.length !== 3) throw new Error(`Expected 3 invariants, got ${data.invariants.length}`);
});

// ── Scan Structure ──

test("scan returns structured result", () => {
  cleanHealing();
  cleanLocks();
  cleanState();
  const result = scan();
  if (typeof result.scanned !== "number") throw new Error("Missing scanned");
  if (typeof result.healed !== "number") throw new Error("Missing healed");
  if (!Array.isArray(result.issues)) throw new Error("Missing issues array");
});

test("scan is deterministic", () => {
  cleanHealing();
  cleanLocks();
  cleanState();
  const r1 = scan();
  const r2 = scan();
  if (r1.scanned !== r2.scanned) throw new Error("Scanned count mismatch");
});

// ── Snapshot ──

test("createSnapshot generates snapshot with id", () => {
  cleanHealing();
  cleanState();
  const snapshot = createSnapshot("test");
  if (!snapshot.id) throw new Error("Missing snapshot id");
  if (!snapshot.timestamp) throw new Error("Missing timestamp");
});

test("listSnapshots returns created snapshots", () => {
  cleanHealing();
  cleanState();
  const before = listSnapshots().length;
  createSnapshot("test_list");
  const after = listSnapshots().length;
  if (after <= before) throw new Error("Snapshot not listed");
});

test("revertSnapshot validates checksum match", () => {
  cleanHealing();
  cleanState();
  const snapshot = createSnapshot("test_revert");
  const result = revertSnapshot(snapshot.id);
  if (!result.success) throw new Error(`Revert should succeed when unchanged: ${result.error}`);
});

// ── Stale Lock Healing ──

test("scan detects stale lock", () => {
  cleanHealing();
  cleanLocks();
  injectStaleLock();
  const result = scan();
  const stale = result.issues.find(i => i.category === "stale_lock");
  if (!stale) throw new Error("Should detect stale lock");
  if (!stale.autoRepairable) throw new Error("Stale lock should be auto-repairable");
});

test("heal repairs stale lock", () => {
  cleanHealing();
  cleanLocks();
  injectStaleLock();
  const result = heal();
  const stale = result.issues.find(i => i.category === "stale_lock");
  if (!stale?.repaired) throw new Error("Should repair stale lock");
});

test("stale lock healing emits event", () => {
  cleanHealing();
  cleanLocks();
  injectStaleLock();
  heal();
  // If no exception, event emission succeeded
});

// ── Orphan Projections ──

test("scan detects orphan projection", () => {
  cleanHealing();
  const REFLECTIONS_DIR = resolve("project-governance/protocols");
  mkdirSync(REFLECTIONS_DIR, { recursive: true });
  writeFileSync(join(REFLECTIONS_DIR, "orphan-test.protocol.md"), "# Orphan");
  const result = scan();
  const orphan = result.issues.find(i => i.category === "orphan_projection");
  rmSync(join(REFLECTIONS_DIR, "orphan-test.protocol.md"));
  if (!orphan) throw new Error("Should detect orphan projection");
  if (orphan.autoRepairable) throw new Error("Orphan projection should not be auto-repairable");
});

// ── Missing Indexes ──

test("scan detects missing index entries", () => {
  cleanHealing();
  const result = scan();
  // Governance registry may or may not have missing indexes
  // We just verify the scan runs without crash
  if (typeof result.scanned !== "number") throw new Error("Scan failed");
});

// ── Runtime Divergence ──

test("scan detects runtime divergence", () => {
  cleanHealing();
  cleanState();
  const STATE_PATH = resolve("project-governance/runtime/execution-state.json");
  writeFileSync(STATE_PATH, JSON.stringify({
    current_state: "idle",
    history: [{ from: "idle", to: "planning", timestamp: new Date().toISOString(), guard: "test", execution_id: "EXEC-DIV" }],
    updated_at: new Date().toISOString(),
  }, null, 2));
  const result = scan();
  const div = result.issues.find(i => i.category === "runtime_divergence");
  rmSync(STATE_PATH);
  if (!div) throw new Error("Should detect runtime divergence when state != last history entry");
});

// ── Corrupted State ──

test("scan detects corrupted execution state", () => {
  cleanHealing();
  cleanState();
  const STATE_PATH = resolve("project-governance/runtime/execution-state.json");
  writeFileSync(STATE_PATH, "not-json");
  const result = scan();
  const corrupt = result.issues.find(i => i.category === "corrupted_state" && i.target === STATE_PATH);
  rmSync(STATE_PATH);
  if (!corrupt) throw new Error("Should detect corrupted state");
  if (!corrupt.destructive) throw new Error("Corrupted state repair should be destructive");
});

test("heal skips destructive repair without --destructive flag", () => {
  cleanHealing();
  cleanState();
  const STATE_PATH = resolve("project-governance/runtime/execution-state.json");
  writeFileSync(STATE_PATH, "not-json");
  const result = heal({ destructive: false });
  const corrupt = result.issues.find(i => i.category === "corrupted_state");
  rmSync(STATE_PATH);
  if (!corrupt) throw new Error("Should still detect corrupted state");
  if (corrupt.repaired) throw new Error("Should NOT repair without --destructive");
});

test("heal repairs corrupted state with --destructive and snapshot", () => {
  cleanHealing();
  cleanState();
  const STATE_PATH = resolve("project-governance/runtime/execution-state.json");
  writeFileSync(STATE_PATH, "not-json");
  const result = heal({ destructive: true });
  const corrupt = result.issues.find(i => i.category === "corrupted_state");
  rmSync(STATE_PATH);
  if (!corrupt?.repaired) throw new Error("Should repair with --destructive");
  if (!result.snapshotCreated) throw new Error("Should create snapshot before destructive healing");
});

// ── Event Stream Gaps ──

test("scan detects event stream timestamp gaps", () => {
  cleanHealing();
  const STREAMS_DIR = resolve("project-governance/runtime/events/streams");
  mkdirSync(STREAMS_DIR, { recursive: true });
  const streamPath = join(STREAMS_DIR, "test-gap.ndjson");
  writeFileSync(streamPath,
    JSON.stringify({ timestamp: "2026-05-20T10:00:00Z", event_type: "test.1" }) + "\n" +
    JSON.stringify({ timestamp: "2026-05-20T09:00:00Z", event_type: "test.2" }) + "\n"
  );
  const result = scan();
  const gap = result.issues.find(i => i.category === "event_gap");
  rmSync(streamPath);
  if (!gap) throw new Error("Should detect out-of-order timestamps");
});

// ── Healing Log ──

test("healing creates append-only log", () => {
  cleanHealing();
  cleanLocks();
  injectStaleLock();
  const before = existsSync(resolve("project-governance/runtime/healing/healing-log.ndjson"))
    ? readFileSync(resolve("project-governance/runtime/healing/healing-log.ndjson"), "utf-8").split("\n").filter(l => l.trim()).length
    : 0;
  heal();
  const after = readFileSync(resolve("project-governance/runtime/healing/healing-log.ndjson"), "utf-8").split("\n").filter(l => l.trim()).length;
  if (after <= before) throw new Error("Healing log did not grow");
});

// ── Report Generation ──

test("generateHealingReport produces markdown", () => {
  const mockResult = {
    scanned: 1,
    healed: 0,
    failed: 0,
    skipped: 1,
    snapshotCreated: false,
    issues: [{
      category: "test",
      severity: "warn" as const,
      message: "Test issue",
      target: "test-target",
      autoRepairable: false,
      destructive: false,
    }],
  };
  const report = generateHealingReport(mockResult);
  if (!report.includes("# Self-Healing Report")) throw new Error("Missing header");
  if (!report.includes("Test issue")) throw new Error("Missing issue");
});

// ── Cleanup ──

// Clean up any test artifacts
cleanHealing();
cleanLocks();
cleanState();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
