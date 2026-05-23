#!/usr/bin/env tsx
/**
 * run-state-machine-tests.ts
 * Integration tests for execution state machine.
 */
import { existsSync, rmSync, readFileSync } from "fs";
import { resolve } from "path";
import {
  transition,
  getCurrentState,
  getHistory,
  resetState,
  loadProtocol,
  isValidTransition,
  isTerminal,
} from "../../../../scripts/execution-state.js";
import { validateProtocol } from "../../../../scripts/validators/protocol-execution-state-machine.js";

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

console.log("Running State Machine Tests...\n");

// Clean state
const STATE_PATH = resolve("project-governance/runtime/execution-state.json");
if (existsSync(STATE_PATH)) rmSync(STATE_PATH);

// ── Protocol Validation ──

test("protocol validates successfully", () => {
  const result = validateProtocol();
  if (!result.valid) throw new Error(result.errors.join(", "));
});

test("protocol defines 9 states", () => {
  const protocol = loadProtocol();
  if (protocol.state_machine.states.length !== 9) throw new Error(`Expected 9 states, got ${protocol.state_machine.states.length}`);
});

test("archived is terminal", () => {
  if (!isTerminal(loadProtocol(), "archived")) throw new Error("archived should be terminal");
});

test("work states have failure transitions", () => {
  const protocol = loadProtocol();
  const workStates = ["planning", "validating", "executing", "consolidating", "deploying"];
  for (const s of workStates) {
    const hasFailure = protocol.state_machine.failure_transitions.some(t => t.from === s);
    if (!hasFailure) throw new Error(`Missing failure transition for ${s}`);
  }
});

test("blocked and recovering have recovery transitions", () => {
  const protocol = loadProtocol();
  const blocked = protocol.state_machine.recovery_transitions.some(t => t.from === "blocked");
  const recovering = protocol.state_machine.recovery_transitions.some(t => t.from === "recovering");
  if (!blocked) throw new Error("blocked missing recovery transitions");
  if (!recovering) throw new Error("recovering missing recovery transitions");
});

// ── Transition Tests ──

test("valid transition succeeds", () => {
  resetState();
  const result = transition("planning", "EXEC-TEST-001");
  if (!result.success) throw new Error(result.error);
  if (getCurrentState() !== "planning") throw new Error("State not updated");
});

test("invalid transition is blocked", () => {
  resetState();
  const result = transition("executing", "EXEC-TEST-002");
  if (result.success) throw new Error("Should have blocked invalid transition");
});

test("terminal state blocks exit", () => {
  resetState();
  // Force to archived
  transition("planning", "EXEC-TEST-003", true);
  transition("validating", "EXEC-TEST-003", true);
  transition("executing", "EXEC-TEST-003", true);
  transition("consolidating", "EXEC-TEST-003", true);
  transition("archived", "EXEC-TEST-003", true);

  const result = transition("idle", "EXEC-TEST-003");
  if (result.success) throw new Error("Should block exit from terminal state");
});

test("forced transition bypasses guards", () => {
  resetState();
  const result = transition("archived", "EXEC-TEST-004", true);
  if (!result.success) throw new Error("Forced transition should succeed");
});

test("transition records history", () => {
  resetState();
  transition("planning", "EXEC-TEST-005");
  transition("validating", "EXEC-TEST-005");
  const history = getHistory();
  if (history.length !== 2) throw new Error(`Expected 2 history entries, got ${history.length}`);
});

test("history includes guard and execution_id", () => {
  resetState();
  transition("planning", "EXEC-TEST-006");
  const history = getHistory();
  if (!history[0].guard) throw new Error("Missing guard in history");
  if (!history[0].execution_id) throw new Error("Missing execution_id in history");
});

test("transition emits governance events", () => {
  resetState();
  // Events are appended to governance event stream
  transition("planning", "EXEC-TEST-007");
  const govStream = resolve("project-governance/runtime/events/streams/default.ndjson");
  if (existsSync(govStream)) {
    const lines = readFileSync(govStream, "utf-8").split("\n").filter(l => l.trim());
    const events = lines.map(l => JSON.parse(l));
    const transitionEvents = events.filter((e: Record<string, unknown>) => e.event_type === "execution.transitioned");
    if (transitionEvents.length === 0) throw new Error("No transition events emitted");
  }
});

// ── State Mutation Guard ──

test("resetState returns to idle", () => {
  transition("planning", "EXEC-TEST-008");
  resetState();
  if (getCurrentState() !== "idle") throw new Error("Reset failed");
});

test("isValidTransition returns correct guard for valid transition", () => {
  const protocol = loadProtocol();
  const result = isValidTransition(protocol, "idle", "planning");
  if (!result.valid) throw new Error("Should be valid");
  if (!result.guard) throw new Error("Should have guard");
});

test("isValidTransition returns invalid for disallowed transition", () => {
  const protocol = loadProtocol();
  const result = isValidTransition(protocol, "idle", "archived");
  if (result.valid) throw new Error("Should be invalid");
});

// ── Determinism ──

test("state machine behavior is deterministic", () => {
  resetState();
  transition("planning", "EXEC-TEST-009");
  transition("idle", "EXEC-TEST-009");
  const h1 = getHistory();
  resetState();
  transition("planning", "EXEC-TEST-009");
  transition("idle", "EXEC-TEST-009");
  const h2 = getHistory();
  if (h1.length !== h2.length) throw new Error("History length mismatch");
  for (let i = 0; i < h1.length; i++) {
    if (h1[i].from !== h2[i].from || h1[i].to !== h2[i].to) {
      throw new Error("History mismatch");
    }
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
