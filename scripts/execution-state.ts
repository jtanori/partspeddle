#!/usr/bin/env tsx
/**
 * execution-state.ts
 * Deterministic execution state machine runtime.
 * All state mutations go through canonical transitions only.
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";
import { emit as emitGovEvent } from "./emit-governance-event.js";

const PROTOCOL_PATH = resolve("meta/governance/protocols/execution-state-machine.json");
const STATE_PATH = resolve("project-governance/runtime/execution-state.json");

type State = "idle" | "planning" | "validating" | "executing" | "blocked" | "recovering" | "consolidating" | "deploying" | "archived";

interface Protocol {
  state_machine: {
    states: Array<{ id: string; terminal: boolean }>;
    transitions: Array<{ from: string; to: string; guard: string }>;
    failure_transitions: Array<{ from: string; to: string; trigger: string }>;
    recovery_transitions: Array<{ from: string; to: string; trigger: string }>;
  };
  emissions: Record<string, string>;
}

interface StateRecord {
  current_state: State;
  history: Array<{ from: State; to: State; timestamp: string; guard: string; execution_id: string }>;
  updated_at: string;
}

function loadProtocol(): Protocol {
  return JSON.parse(readFileSync(PROTOCOL_PATH, "utf-8")) as Protocol;
}

function loadState(): StateRecord {
  if (!existsSync(STATE_PATH)) {
    return {
      current_state: "idle",
      history: [],
      updated_at: new Date().toISOString(),
    };
  }
  return JSON.parse(readFileSync(STATE_PATH, "utf-8")) as StateRecord;
}

function saveState(state: StateRecord): void {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function emitEvent(eventType: string, payload: Record<string, unknown>): void {
  emitGovEvent({
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
    event_type: eventType as "execution.started",
    severity: "info",
    category: "execution",
    actor: "system",
    payload,
  });
}

function isValidTransition(protocol: Protocol, from: State, to: State): { valid: boolean; guard: string } {
  const transition = protocol.state_machine.transitions.find(t => t.from === from && t.to === to);
  if (transition) return { valid: true, guard: transition.guard };
  const failure = protocol.state_machine.failure_transitions.find(t => t.from === from && t.to === to);
  if (failure) return { valid: true, guard: `failure:${failure.trigger}` };
  const recovery = protocol.state_machine.recovery_transitions.find(t => t.from === from && t.to === to);
  if (recovery) return { valid: true, guard: `recovery:${recovery.trigger}` };
  return { valid: false, guard: "" };
}

function isTerminal(protocol: Protocol, state: State): boolean {
  const s = protocol.state_machine.states.find(st => st.id === state);
  return s?.terminal || false;
}

export function transition(to: State, executionId: string = "EXEC-0000-00-00-000", force: boolean = false): {
  success: boolean;
  from: State;
  to: State;
  guard: string;
  error?: string;
} {
  const protocol = loadProtocol();
  const state = loadState();
  const from = state.current_state;

  if (from === to) {
    return { success: true, from, to, guard: "noop" };
  }

  const { valid, guard } = isValidTransition(protocol, from, to);

  if (!valid && !force) {
    emitEvent("execution.transition_blocked", {
      from,
      to,
      execution_id: executionId,
      reason: "invalid_transition",
    });
    return { success: false, from, to, guard: "", error: `Invalid transition: ${from} → ${to}` };
  }

  if (isTerminal(protocol, from) && !force) {
    emitEvent("execution.transition_blocked", {
      from,
      to,
      execution_id: executionId,
      reason: "terminal_state",
    });
    return { success: false, from, to, guard: "", error: `Cannot exit terminal state: ${from}` };
  }

  // Perform transition
  state.current_state = to;
  state.history.push({
    from,
    to,
    timestamp: new Date().toISOString(),
    guard: guard || (force ? "forced" : "unknown"),
    execution_id: executionId,
  });
  state.updated_at = new Date().toISOString();
  saveState(state);

  // Emit events
  const eventType = guard?.startsWith("failure:")
    ? "execution.failed"
    : guard?.startsWith("recovery:")
      ? "recovery.initiated"
      : "execution.transitioned";

  emitEvent(eventType, {
    from,
    to,
    execution_id: executionId,
    guard: guard || "forced",
  });

  emitEvent("execution.state_entered", {
    state: to,
    execution_id: executionId,
  });

  return { success: true, from, to, guard: guard || "forced" };
}

export function getCurrentState(): State {
  return loadState().current_state;
}

export function getHistory(): StateRecord["history"] {
  return loadState().history;
}

export function resetState(): void {
  saveState({
    current_state: "idle",
    history: [],
    updated_at: new Date().toISOString(),
  });
}

export { loadProtocol, loadState, isValidTransition, isTerminal };

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: tsx scripts/execution-state.ts <command> [args]");
    console.error("Commands:");
    console.error("  transition <to_state> [execution_id] [--force]");
    console.error("  current");
    console.error("  history");
    console.error("  reset");
    process.exit(1);
  }

  const command = args[0];

  if (command === "transition") {
    const to = args[1] as State;
    const execId = args[2] || "EXEC-0000-00-00-000";
    const force = args.includes("--force");
    const result = transition(to, execId, force);
    if (result.success) {
      console.log(`Transitioned: ${result.from} → ${result.to} (guard: ${result.guard})`);
    } else {
      console.error(`Blocked: ${result.error}`);
      process.exit(1);
    }
  } else if (command === "current") {
    console.log(getCurrentState());
  } else if (command === "history") {
    const history = getHistory();
    for (const h of history) {
      console.log(`${h.timestamp} | ${h.from} → ${h.to} | ${h.guard} | ${h.execution_id}`);
    }
  } else if (command === "reset") {
    resetState();
    console.log("State reset to idle");
  }
}
