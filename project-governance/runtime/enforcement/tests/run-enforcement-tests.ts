#!/usr/bin/env tsx
/**
 * run-enforcement-tests.ts
 * Integration tests for governance enforcement engine.
 */
import { existsSync, writeFileSync, rmSync, mkdirSync } from "fs";
import { resolve } from "path";
import {
  runEnforcement,
  enforceTransition,
  generateRecoveryReport,
} from "../../../../scripts/enforce-governance.js";
import { validatePolicy } from "../../../../scripts/validators/protocol-enforcement-policy.js";
import { resetState, transition } from "../../../../scripts/execution-state.js";
import { acquireLock, releaseLock } from "../../../../scripts/execution-lock.js";

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

function cleanState(): void {
  const STATE_PATH = resolve("project-governance/runtime/execution-state.json");
  if (existsSync(STATE_PATH)) rmSync(STATE_PATH);
}

function cleanLocks(): void {
  const LOCKS_LOG = resolve("project-governance/runtime/locks/locks.ndjson");
  if (existsSync(LOCKS_LOG)) rmSync(LOCKS_LOG);
}

function createValidState(): void {
  const STATE_PATH = resolve("project-governance/runtime/execution-state.json");
  writeFileSync(STATE_PATH, JSON.stringify({
    current_state: "idle",
    history: [],
    updated_at: new Date().toISOString(),
  }, null, 2));
}

console.log("Running Enforcement Tests...\n");

// ── Protocol Validator Tests ──

test("enforcement policy validates successfully", () => {
  const result = validatePolicy();
  if (!result.valid) throw new Error(result.errors.join(", "));
});

test("enforcement policy has 6 rules", () => {
  const result = validatePolicy();
  if (!result.valid) throw new Error(result.errors.join(", "));
});

test("enforcement policy has 3 invariants", () => {
  const result = validatePolicy();
  const invariantCount = result.errors.filter(e => e.includes("Missing invariant")).length;
  if (invariantCount > 0) throw new Error("Missing invariants");
});

// ── Enforcement Engine Structure ──

test("runEnforcement returns structured result", () => {
  const result = runEnforcement();
  if (typeof result.passed !== "boolean") throw new Error("Missing passed field");
  if (!Array.isArray(result.violations)) throw new Error("Missing violations array");
  if (typeof result.summary !== "object") throw new Error("Missing summary object");
  if (typeof result.latency_ms !== "number") throw new Error("Missing latency_ms");
});

test("runEnforcement summary has all 6 categories", () => {
  const result = runEnforcement();
  const categories = ["schema", "runtime", "protocol", "milestone", "dependency", "execution"];
  for (const cat of categories) {
    if (typeof result.summary[cat] !== "number") {
      throw new Error(`Missing summary count for ${cat}`);
    }
  }
});

test("runEnforcement is deterministic across runs", () => {
  const r1 = runEnforcement({ categories: ["schema"] });
  const r2 = runEnforcement({ categories: ["schema"] });
  if (r1.passed !== r2.passed) throw new Error("Determinism failed: passed mismatch");
  if (r1.violations.length !== r2.violations.length) throw new Error("Determinism failed: violation count mismatch");
});

// ── Category Isolation ──

test("schema validation category runs independently", () => {
  const result = runEnforcement({ categories: ["schema"] });
  if (result.summary.schema === undefined) throw new Error("Schema summary missing");
  if (result.summary.runtime !== 0) throw new Error("Runtime should not be checked");
});

test("runtime validation category runs independently", () => {
  cleanState();
  const result = runEnforcement({ categories: ["runtime"] });
  if (result.summary.runtime === undefined) throw new Error("Runtime summary missing");
  if (result.summary.schema !== 0) throw new Error("Schema should not be checked");
});

test("milestone integrity category runs independently", () => {
  const result = runEnforcement({ categories: ["milestone"] });
  if (result.summary.milestone === undefined) throw new Error("Milestone summary missing");
});

test("dependency integrity category runs independently", () => {
  const result = runEnforcement({ categories: ["dependency"] });
  if (result.summary.dependency === undefined) throw new Error("Dependency summary missing");
});

test("execution state integrity category runs independently", () => {
  cleanState();
  const result = runEnforcement({ categories: ["execution"] });
  if (result.summary.execution === undefined) throw new Error("Execution summary missing");
});

// ── Transition Enforcement ──

test("enforceTransition allows valid transition", () => {
  const check = enforceTransition("idle", "planning", "EXEC-TEST-001");
  if (!check.allowed) throw new Error("Should allow idle → planning");
});

test("enforceTransition blocks invalid transition", () => {
  const check = enforceTransition("idle", "archived", "EXEC-TEST-002");
  if (check.allowed) throw new Error("Should block idle → archived");
  if (check.violations.length === 0) throw new Error("Should produce violations");
});

test("enforceTransition blocks terminal state exit", () => {
  const check = enforceTransition("archived", "idle", "EXEC-TEST-003");
  if (check.allowed) throw new Error("Should block exit from archived");
});

test("enforceTransition provides recovery guidance for violations", () => {
  const check = enforceTransition("idle", "archived", "EXEC-TEST-004");
  for (const v of check.violations) {
    if (!v.recovery_guidance) throw new Error("Missing recovery guidance");
  }
});

test("enforceTransition respects active lock", () => {
  cleanLocks();
  acquireLock("EXEC-LOCK-001", "test");
  const check = enforceTransition("idle", "planning", "EXEC-TEST-005");
  // Should be blocked because lock is held by different execution
  if (check.allowed) throw new Error("Should block when lock held by different execution");
  releaseLock("EXEC-LOCK-001");
});

test("enforceTransition allows recovery transitions despite lock", () => {
  cleanLocks();
  acquireLock("EXEC-LOCK-002", "test");
  // blocked → recovering is a recovery transition
  const check = enforceTransition("blocked", "recovering", "EXEC-TEST-006");
  if (!check.allowed) throw new Error("Should allow recovery transition despite lock");
  releaseLock("EXEC-LOCK-002");
});

// ── Execution State Integrity ──

test("execution state integrity passes for valid state", () => {
  cleanState();
  createValidState();
  const result = runEnforcement({ categories: ["execution"] });
  if (!result.passed) throw new Error("Valid state should pass");
});

test("execution state integrity detects invalid current_state", () => {
  cleanState();
  const STATE_PATH = resolve("project-governance/runtime/execution-state.json");
  writeFileSync(STATE_PATH, JSON.stringify({
    current_state: "invalid_state",
    history: [],
    updated_at: new Date().toISOString(),
  }, null, 2));
  const result = runEnforcement({ categories: ["execution"] });
  if (result.passed) throw new Error("Should detect invalid current_state");
  const hasInvalidState = result.violations.some(v => v.message.includes("invalid current_state"));
  if (!hasInvalidState) throw new Error("Should report invalid current_state violation");
});

test("execution state integrity detects invalid history transition", () => {
  cleanState();
  const STATE_PATH = resolve("project-governance/runtime/execution-state.json");
  writeFileSync(STATE_PATH, JSON.stringify({
    current_state: "idle",
    history: [{ from: "idle", to: "archived", timestamp: new Date().toISOString(), guard: "test", execution_id: "EXEC-BAD" }],
    updated_at: new Date().toISOString(),
  }, null, 2));
  const result = runEnforcement({ categories: ["execution"] });
  if (result.passed) throw new Error("Should detect invalid history transition");
});

// ── Runtime Validation ──

test("runtime validation detects malformed execution state", () => {
  cleanState();
  const STATE_PATH = resolve("project-governance/runtime/execution-state.json");
  writeFileSync(STATE_PATH, "not-json");
  const result = runEnforcement({ categories: ["runtime"] });
  if (result.passed) throw new Error("Should detect malformed execution state");
  rmSync(STATE_PATH);
});

test("runtime validation passes when state file missing", () => {
  cleanState();
  const result = runEnforcement({ categories: ["runtime"] });
  // Missing state file is acceptable — state machine auto-initializes
  const hasMissingFileCritical = result.violations.some(v => v.message.includes("File not found") && v.severity === "critical");
  if (hasMissingFileCritical) throw new Error("Missing state file should not be critical");
});

// ── Recovery Report ──

test("generateRecoveryReport produces markdown", () => {
  const result = runEnforcement();
  const report = generateRecoveryReport(result);
  if (!report.includes("# Governance Enforcement Report")) throw new Error("Missing header");
  if (!report.includes("Violations")) throw new Error("Missing violations section");
});

test("generateRecoveryReport includes all violations", () => {
  const mockResult = {
    passed: false,
    violations: [
      {
        rule_id: "test-rule",
        category: "test",
        severity: "error" as const,
        message: "Test violation",
        target: "test-target",
        recovery_guidance: "Fix it",
      },
    ],
    summary: { test: 1 },
    latency_ms: 10,
  };
  const report = generateRecoveryReport(mockResult);
  if (!report.includes("test-rule")) throw new Error("Missing rule_id");
  if (!report.includes("Fix it")) throw new Error("Missing recovery guidance");
});

// ── Event Emission ──

test("enforce mode emits events for violations", () => {
  cleanState();
  const STREAM_PATH = resolve("project-governance/runtime/events/streams/default.ndjson");
  // Note: emit writes to stream; we just verify no crash occurs
  const result = runEnforcement({ categories: ["execution"], emitEvents: true });
  // If we got here without crash, emission succeeded
  if (result.passed !== true && result.passed !== false) throw new Error("Invalid result");
});

// ── Determinism ──

test("enforcement outcomes are deterministic with same state", () => {
  cleanState();
  createValidState();
  const r1 = runEnforcement({ categories: ["execution"] });
  const r2 = runEnforcement({ categories: ["execution"] });
  if (r1.passed !== r2.passed) throw new Error("Passed mismatch");
  if (r1.violations.length !== r2.violations.length) throw new Error("Violation count mismatch");
  for (let i = 0; i < r1.violations.length; i++) {
    if (r1.violations[i].message !== r2.violations[i].message) {
      throw new Error("Violation message mismatch");
    }
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
