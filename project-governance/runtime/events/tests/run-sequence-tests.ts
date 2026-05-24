#!/usr/bin/env tsx
/**
 * run-sequence-tests.ts
 * Sequence assignment validation — T29.1 deliverable
 *
 * Validates global_sequence, execution_sequence, parent_event_id,
 * and causality_chain assignment for governance events.
 */

import { randomUUID } from "crypto";
import { assignSequences, readSequences, resetSequences } from "../../../../scripts/sequence-tracker.ts";
import { buildEvent, emit } from "../../../../scripts/emit-governance-event.ts";

interface TestResult {
  name: string;
  passed: boolean;
  error: string | null;
}

const results: TestResult[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    results.push({ name, passed: true, error: null });
    console.log(`  ✅ ${name}`);
  } catch (err) {
    results.push({ name, passed: false, error: String(err) });
    console.log(`  ❌ ${name}: ${err}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, msg?: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(msg ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(value: boolean, msg?: string): void {
  if (!value) throw new Error(msg ?? "Expected true");
}

function assertGreaterThan(actual: number, expected: number, msg?: string): void {
  if (!(actual > expected)) throw new Error(msg ?? `Expected ${actual} > ${expected}`);
}

console.log("Sequence Assignment Tests");
console.log("=========================\n");

// Reset before tests
resetSequences();

// ─── Test 1: Global sequence monotonicity ───
test("Global sequence starts at 1 and increments monotonically", () => {
  const seq1 = assignSequences("EXEC-2026-05-24-010", randomUUID());
  const seq2 = assignSequences("EXEC-2026-05-24-010", randomUUID());
  const seq3 = assignSequences("EXEC-2026-05-24-010", randomUUID());

  assertEqual(seq1.global_sequence, 1, "First global sequence should be 1");
  assertEqual(seq2.global_sequence, 2, "Second global sequence should be 2");
  assertEqual(seq3.global_sequence, 3, "Third global sequence should be 3");
});

// ─── Test 2: Execution sequence monotonicity ───
test("Execution sequence is monotonic within execution", () => {
  resetSequences();
  const execId = "EXEC-TEST-001";

  const seq1 = assignSequences(execId, randomUUID());
  const seq2 = assignSequences(execId, randomUUID());
  const seq3 = assignSequences(execId, randomUUID());

  assertEqual(seq1.execution_sequence, 1, "First exec sequence should be 1");
  assertEqual(seq2.execution_sequence, 2, "Second exec sequence should be 2");
  assertEqual(seq3.execution_sequence, 3, "Third exec sequence should be 3");
});

// ─── Test 3: Isolated execution sequences ───
test("Execution sequences are isolated per execution", () => {
  resetSequences();

  const seqA1 = assignSequences("EXEC-A", randomUUID());
  const seqB1 = assignSequences("EXEC-B", randomUUID());
  const seqA2 = assignSequences("EXEC-A", randomUUID());
  const seqB2 = assignSequences("EXEC-B", randomUUID());

  assertEqual(seqA1.execution_sequence, 1, "Exec A first should be 1");
  assertEqual(seqB1.execution_sequence, 1, "Exec B first should be 1");
  assertEqual(seqA2.execution_sequence, 2, "Exec A second should be 2");
  assertEqual(seqB2.execution_sequence, 2, "Exec B second should be 2");
});

// ─── Test 4: Parent event tracking ───
test("Parent event ID tracks causally preceding event", () => {
  resetSequences();
  const execId = "EXEC-PARENT-001";

  const eventId1 = randomUUID();
  const seq1 = assignSequences(execId, eventId1);
  assertEqual(seq1.parent_event_id, null, "First event has no parent");

  const eventId2 = randomUUID();
  const seq2 = assignSequences(execId, eventId2);
  assertEqual(seq2.parent_event_id, eventId1, "Second event parent is first event");

  const eventId3 = randomUUID();
  const seq3 = assignSequences(execId, eventId3);
  assertEqual(seq3.parent_event_id, eventId2, "Third event parent is second event");
});

// ─── Test 5: Causality chain construction ───
test("Causality chain accumulates ancestor event IDs", () => {
  resetSequences();
  const execId = "EXEC-CHAIN-001";

  const id1 = randomUUID();
  const seq1 = assignSequences(execId, id1);
  assertEqual(seq1.causality_chain, [], "First event has empty chain");

  const id2 = randomUUID();
  const seq2 = assignSequences(execId, id2);
  assertEqual(seq2.causality_chain, [id1], "Second event chain has first ID");

  const id3 = randomUUID();
  const seq3 = assignSequences(execId, id3);
  assertEqual(seq3.causality_chain, [id1, id2], "Third event chain has first two IDs");
});

// ─── Test 6: buildEvent assigns sequences ───
test("buildEvent automatically assigns sequence fields", () => {
  resetSequences();

  const event = buildEvent("test.event", "info", "runtime", { test: true }, {
    execution_id: "EXEC-BUILD-001",
    actor: "system"
  });

  assertTrue(event.global_sequence !== undefined && event.global_sequence > 0, "global_sequence should be assigned");
  assertTrue(event.execution_sequence !== undefined && event.execution_sequence > 0, "execution_sequence should be assigned");
  assertTrue(event.parent_event_id !== undefined, "parent_event_id should be assigned");
  assertTrue(event.causality_chain !== undefined, "causality_chain should be assigned");
});

// ─── Test 7: Sequence persistence ───
test("Sequences persist across tracker reloads", () => {
  resetSequences();

  assignSequences("EXEC-PERSIST-001", randomUUID());
  assignSequences("EXEC-PERSIST-001", randomUUID());

  const sequences = readSequences();
  assertEqual(sequences.global_sequence, 2, "Global sequence should persist as 2");
  assertEqual(sequences.execution_sequences["EXEC-PERSIST-001"], 2, "Exec sequence should persist as 2");
});

// ─── Test 8: No execution context ───
test("Events without execution_id get isolated sequence scope", () => {
  resetSequences();

  const seq1 = assignSequences(null, randomUUID());
  const seq2 = assignSequences(null, randomUUID());

  assertEqual(seq1.execution_sequence, 1, "No-exec first should be 1");
  assertEqual(seq2.execution_sequence, 2, "No-exec second should be 2");
  assertEqual(seq1.global_sequence, 1, "Global should still be 1");
  assertEqual(seq2.global_sequence, 2, "Global should still be 2");
});

// ─── Summary ───
console.log("\n" + "=".repeat(50));
const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(50));

if (failed > 0) {
  console.log("\nFailures:");
  for (const r of results.filter((r) => !r.passed)) {
    console.log(`  ${r.name}: ${r.error}`);
  }
  process.exit(1);
}
