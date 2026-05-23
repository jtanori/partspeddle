/**
 * protocol-execution-state-machine.ts
 * Validator for execution state machine protocol.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const PROTOCOL_PATH = resolve("meta/governance/protocols/execution-state-machine.json");

interface Protocol {
  state_machine: {
    states: Array<{ id: string; terminal: boolean }>;
    transitions: Array<{ from: string; to: string; guard: string }>;
    failure_transitions: Array<{ from: string; to: string; trigger: string }>;
    recovery_transitions: Array<{ from: string; to: string; trigger: string }>;
  };
}

function loadProtocol(): Protocol {
  return JSON.parse(readFileSync(PROTOCOL_PATH, "utf-8")) as Protocol;
}

export function validateProtocol(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const protocol = loadProtocol();
  const sm = protocol.state_machine;

  // Check 9 states
  if (sm.states.length !== 9) {
    errors.push(`Expected 9 states, found ${sm.states.length}`);
  }

  const stateIds = new Set(sm.states.map(s => s.id));
  const requiredStates = ["idle", "planning", "validating", "executing", "blocked", "recovering", "consolidating", "deploying", "archived"];
  for (const s of requiredStates) {
    if (!stateIds.has(s)) errors.push(`Missing state: ${s}`);
  }

  // Check archived is terminal
  const archived = sm.states.find(s => s.id === "archived");
  if (!archived?.terminal) errors.push("archived must be terminal");

  // Check no transitions FROM archived (except forced)
  const fromArchived = sm.transitions.filter(t => t.from === "archived");
  if (fromArchived.length > 0) errors.push(`Terminal state archived has ${fromArchived.length} outgoing transition(s)`);

  // Check work states have failure transitions
  const workStates = ["planning", "validating", "executing", "consolidating", "deploying"];
  for (const s of workStates) {
    const hasFailure = sm.failure_transitions.some(t => t.from === s);
    if (!hasFailure) errors.push(`Work state ${s} missing failure transition`);
  }

  // Check blocked and recovering have recovery transitions
  const blockedRecoveries = sm.recovery_transitions.filter(t => t.from === "blocked");
  if (blockedRecoveries.length === 0) errors.push("blocked missing recovery transitions");

  const recoveringRecoveries = sm.recovery_transitions.filter(t => t.from === "recovering");
  if (recoveringRecoveries.length === 0) errors.push("recovering missing recovery transitions");

  // Check all transition targets are valid states
  const allTransitions = [...sm.transitions, ...sm.failure_transitions, ...sm.recovery_transitions];
  for (const t of allTransitions) {
    if (!stateIds.has(t.from)) errors.push(`Transition from invalid state: ${t.from}`);
    if (!stateIds.has(t.to)) errors.push(`Transition to invalid state: ${t.to}`);
  }

  // Check emissions defined
  if (!protocol.emissions) errors.push("Missing emissions configuration");

  return { valid: errors.length === 0, errors };
}

export default validateProtocol;

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = validateProtocol();
  if (result.valid) {
    console.log("✅ Execution state machine protocol is valid");
    process.exit(0);
  } else {
    console.error("❌ Validation failed:");
    result.errors.forEach(e => console.error(`  ${e}`));
    process.exit(1);
  }
}
