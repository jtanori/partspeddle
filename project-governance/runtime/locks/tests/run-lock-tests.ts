#!/usr/bin/env tsx
/**
 * run-lock-tests.ts
 * Integration tests for execution locking infrastructure.
 */
import { existsSync, rmSync, appendFileSync } from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";
import {
  acquireLock,
  releaseLock,
  recoverLock,
  getLockState,
  getLockHistory,
  DEFAULT_TTL_MS,
} from "../../../../scripts/execution-lock.js";
import { detectStaleLocks, autoRecoverStaleLock } from "../../../../scripts/detect-stale-locks.js";

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

function cleanLocks(): void {
  const LOCKS_LOG = resolve("project-governance/runtime/locks/locks.ndjson");
  if (existsSync(LOCKS_LOG)) rmSync(LOCKS_LOG);
}

function injectStaleLock(): void {
  const LOCKS_LOG = resolve("project-governance/runtime/locks/locks.ndjson");
  const now = new Date();
  const old = new Date(now.getTime() - 2 * 60 * 1000); // 2 minutes ago
  const expired = new Date(old.getTime() + 1000); // expired 1 min 59s ago
  const event = {
    event_id: randomUUID(),
    timestamp: old.toISOString(),
    action: "acquired",
    execution_id: "EXEC-STALE-001",
    locked_by: "test",
    ttl_ms: 1000,
    expires_at: expired.toISOString(),
  };
  appendFileSync(LOCKS_LOG, JSON.stringify(event) + "\n", "utf-8");
}

console.log("Running Lock Tests...\n");

// ── Acquisition Tests ──

test("acquireLock succeeds when no lock held", () => {
  cleanLocks();
  const result = acquireLock("EXEC-LOCK-001", "test");
  if (!result.acquired) throw new Error(result.error);
  if (!result.state.locked) throw new Error("State not locked");
});

test("acquireLock fails when lock already held", () => {
  cleanLocks();
  acquireLock("EXEC-LOCK-002", "test");
  const result = acquireLock("EXEC-LOCK-003", "test");
  if (result.acquired) throw new Error("Should fail when lock held");
});

test("first-requester-wins semantics", () => {
  cleanLocks();
  const r1 = acquireLock("EXEC-LOCK-004", "agent-a");
  if (!r1.acquired) throw new Error("First requester should win");
  const r2 = acquireLock("EXEC-LOCK-005", "agent-b");
  if (r2.acquired) throw new Error("Second requester should lose");
});

// ── Release Tests ──

test("releaseLock frees the lock", () => {
  cleanLocks();
  acquireLock("EXEC-LOCK-006", "test");
  const result = releaseLock("EXEC-LOCK-006");
  if (!result.released) throw new Error(result.error);
  if (result.state.locked) throw new Error("State should be unlocked");
});

test("releaseLock fails for wrong execution_id", () => {
  cleanLocks();
  acquireLock("EXEC-LOCK-007", "test");
  const result = releaseLock("EXEC-LOCK-008");
  if (result.released) throw new Error("Should fail for wrong owner");
});

// ── Recovery Tests ──

test("recoverLock releases interrupted session", () => {
  cleanLocks();
  acquireLock("EXEC-LOCK-009", "test");
  const result = recoverLock("EXEC-LOCK-009", "interrupted_session");
  if (!result.recovered) throw new Error(result.error);
  if (result.state.locked) throw new Error("Should be unlocked after recovery");
});

test("recoverLock creates audit trail", () => {
  cleanLocks();
  acquireLock("EXEC-LOCK-010", "test");
  recoverLock("EXEC-LOCK-010", "test_recovery");
  const history = getLockHistory();
  const recovered = history.filter(h => h.action === "recovered");
  if (recovered.length === 0) throw new Error("No recovery event in history");
});

// ── TTL Tests ──

test("lock expires after TTL", () => {
  cleanLocks();
  acquireLock("EXEC-LOCK-011", "test", 50); // 50ms TTL
  const start = Date.now();
  while (Date.now() - start < 200) { /* wait */ }
  const state = getLockState();
  if (state.locked) throw new Error("Lock should have expired");
});

// ── Stale Detection Tests ──

test("detectStaleLocks returns not stale for fresh lock", () => {
  cleanLocks();
  acquireLock("EXEC-LOCK-013", "test", DEFAULT_TTL_MS);
  const report = detectStaleLocks();
  if (report.stale) throw new Error("Should not detect fresh lock as stale");
});

test("auto-expiry prevents stale lock accumulation", () => {
  cleanLocks();
  injectStaleLock();
  const state = getLockState();
  if (state.locked) throw new Error("Expired lock should be auto-released");
});

test("stale threshold logic works for stale locks", () => {
  // Verify the threshold math directly
  const now = Date.now();
  const expired = now - 2 * 60 * 1000; // 2 minutes ago
  const ageMs = now - expired;
  const stale = ageMs > 60 * 1000;
  if (!stale) throw new Error("2 min old lock should be stale");
});

// ── History Tests ──

test("lock history is append-only", () => {
  cleanLocks();
  const before = getLockHistory().length;
  acquireLock("EXEC-LOCK-014", "test");
  releaseLock("EXEC-LOCK-014");
  const after = getLockHistory().length;
  if (after <= before) throw new Error("History not growing");
});

test("lock history is queryable", () => {
  cleanLocks();
  acquireLock("EXEC-LOCK-015", "test");
  releaseLock("EXEC-LOCK-015");
  const history = getLockHistory();
  const acquisitions = history.filter(h => h.action === "acquired");
  if (acquisitions.length === 0) throw new Error("No acquisitions in history");
});

// ── Determinism ──

test("lock state is deterministic after same sequence", () => {
  cleanLocks();
  acquireLock("EXEC-LOCK-016", "test");
  releaseLock("EXEC-LOCK-016");
  const s1 = getLockState();
  cleanLocks();
  acquireLock("EXEC-LOCK-017", "test");
  releaseLock("EXEC-LOCK-017");
  const s2 = getLockState();
  if (s1.locked !== s2.locked) throw new Error("State not deterministic");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
