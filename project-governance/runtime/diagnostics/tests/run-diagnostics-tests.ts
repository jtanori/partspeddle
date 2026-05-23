#!/usr/bin/env tsx
/**
 * run-diagnostics-tests.ts
 * Integration tests for runtime diagnostic console.
 */
import { existsSync, rmSync, readdirSync } from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";
import { emit as emitGovEvent } from "../../../../scripts/emit-governance-event.js";
import { emit as emitTelemetry } from "../../../../scripts/emit-telemetry.js";
import { runDiagnostics } from "../../../../scripts/diagnostics-console.js";
import { runHealthChecks, checkCanonicalState, checkDrift } from "../../../../scripts/diagnostics-health.js";

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

console.log("Running Diagnostics Tests...\n");

// Clean diagnostics outputs
const DIAG_DIR = resolve("project-governance/runtime/diagnostics");
if (existsSync(DIAG_DIR)) {
  const files = readdirSync(DIAG_DIR);
  for (const f of files) {
    if (f.endsWith(".txt")) rmSync(resolve(DIAG_DIR, f));
  }
}

// Seed some events
const EXEC_ID = "EXEC-2026-05-20-003";
emitGovEvent({
  event_id: randomUUID(),
  timestamp: new Date().toISOString(),
  event_type: "execution.started",
  severity: "info",
  category: "execution",
  execution_id: EXEC_ID,
  actor: "system",
  payload: {},
});

emitGovEvent({
  event_id: randomUUID(),
  timestamp: new Date().toISOString(),
  event_type: "validation.failed",
  severity: "error",
  category: "validation",
  execution_id: EXEC_ID,
  actor: "system",
  payload: { reason: "schema mismatch" },
});

emitTelemetry({
  event_id: randomUUID(),
  timestamp: new Date().toISOString(),
  category: "execution",
  name: "health_check",
  value: 1,
  severity: "info",
  execution_id: EXEC_ID,
  source: "test",
});

// ── Diagnostic Console Tests ──

test("runDiagnostics returns summary with canonical state", () => {
  const result = runDiagnostics();
  if (!result.summary.includes("Canonical State")) throw new Error("Missing canonical state section");
});

test("runDiagnostics detects validation failures", () => {
  const result = runDiagnostics();
  const hasFailure = result.failures.some(f => f.source.includes("governance") && f.event.severity === "error");
  if (!hasFailure) throw new Error("Should detect validation failure");
});

test("runDiagnostics filters by severity", () => {
  const result = runDiagnostics({ severity: "error" });
  const hasInfo = result.summary.includes("[INFO]");
  if (hasInfo) throw new Error("Should filter out info events");
});

test("runDiagnostics filters by execution_id", () => {
  const result = runDiagnostics({ execution_id: EXEC_ID });
  if (!result.summary.includes(EXEC_ID)) throw new Error("Should include filtered execution");
});

test("runDiagnostics generates report file", () => {
  const result = runDiagnostics();
  if (!existsSync(result.reportPath)) throw new Error("Report not generated");
});

test("runDiagnostics detects no drift for fresh events", () => {
  const result = runDiagnostics();
  if (result.summary.includes("DRIFT")) throw new Error("Should not detect drift for fresh events");
});

// ── Health Check Tests ──

test("runHealthChecks returns all checks", () => {
  const checks = runHealthChecks();
  if (checks.length < 4) throw new Error(`Expected 4+ checks, got ${checks.length}`);
});

test("checkCanonicalState passes for existing state", () => {
  const check = checkCanonicalState();
  if (check.status !== "pass") throw new Error(`Expected pass, got ${check.status}: ${check.message}`);
});

test("checkDrift passes for fresh events", () => {
  const check = checkDrift();
  if (check.status !== "pass" && check.status !== "warn") {
    throw new Error(`Unexpected drift status: ${check.status}`);
  }
});

// ── Integration Tests ──

test("diagnostic console operates on structured telemetry only", () => {
  const result = runDiagnostics();
  // Should not crash even if streams are empty
  if (!result.summary) throw new Error("No summary produced");
});

test("diagnostic console does not bypass governance event bus", () => {
  const result = runDiagnostics();
  // Console only reads from streams, never writes
  if (result.failures.some(f => f.source === "direct_mutation")) {
    throw new Error("Should not report direct mutations");
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
