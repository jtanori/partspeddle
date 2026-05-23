#!/usr/bin/env tsx
/**
 * enforce-governance.ts
 * Governance Enforcement Engine
 *
 * Active enforcement preventing invalid execution behavior.
 * 6 enforcement categories: schema, runtime, protocol, milestone, dependency, execution state.
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, join } from "path";
import { randomUUID } from "crypto";
import Ajv from "ajv";
import addFormats from "ajv-formats";

import { isValidTransition as isValidStateTransition, loadProtocol as loadStateMachineProtocol } from "./execution-state.js";
import { getLockState } from "./execution-lock.js";
import { emit } from "./emit-governance-event.js";

// ── Paths ──
const GOVERNANCE_DIR = resolve("meta/governance");
const PROTOCOLS_DIR = join(GOVERNANCE_DIR, "protocols");
const SCHEMAS_DIR = join(GOVERNANCE_DIR, "schemas");
const REGISTRY_PATH = join(GOVERNANCE_DIR, "registries/governance-registry.json");
const MILESTONES_PATH = resolve("project-management/milestones/governance.json");
const DEPENDENCY_GRAPH_PATH = resolve("project-management/data/dependency-graph.json");
const TICKETS_DIR = resolve("project-management/data/tickets");
const STATE_PATH = resolve("project-governance/runtime/execution-state.json");
const LOCK_PATH = resolve("project-governance/runtime/locks/execution-lock.json");
const HEARTBEATS_DIR = resolve("project-governance/runtime/heartbeats");

// ── Types ──
type State = "idle" | "planning" | "validating" | "executing" | "blocked" | "recovering" | "consolidating" | "deploying" | "archived";

export interface Violation {
  rule_id: string;
  category: string;
  severity: "warn" | "error" | "critical";
  message: string;
  target: string;
  recovery_guidance: string;
}

export interface EnforcementResult {
  passed: boolean;
  violations: Violation[];
  summary: Record<string, number>;
  latency_ms: number;
}

// ── Helpers ──
function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function safeLoadJson(path: string): { ok: boolean; data?: unknown; error?: string } {
  try {
    if (!existsSync(path)) return { ok: false, error: `File not found: ${path}` };
    return { ok: true, data: loadJson(path) };
  } catch (e) {
    return { ok: false, error: `Parse error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

function createAjv(): Ajv {
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  return ajv;
}

function emitViolation(violation: Violation): void {
  emit({
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
    event_type: "governance.violation_detected",
    severity: violation.severity === "critical" ? "critical" : violation.severity === "error" ? "error" : "warn",
    category: "governance",
    actor: "system",
    payload: {
      rule_id: violation.rule_id,
      category: violation.category,
      message: violation.message,
      target: violation.target,
      recovery_guidance: violation.recovery_guidance,
    },
  });
}

// ── Enforcement Checks ──

function checkSchemaValidation(): Violation[] {
  const violations: Violation[] = [];
  const ajv = createAjv();

  // governance-registry.json
  const regResult = safeLoadJson(REGISTRY_PATH);
  if (!regResult.ok) {
    violations.push({
      rule_id: "schema-validation",
      category: "schema",
      severity: "critical",
      message: `Governance registry unreadable: ${regResult.error}`,
      target: REGISTRY_PATH,
      recovery_guidance: "Restore governance-registry.json from git or re-run governance:generate.",
    });
  } else {
    const schemaPath = join(SCHEMAS_DIR, "governance-registry.schema.json");
    const schema = loadJson(schemaPath) as object;
    const validate = ajv.compile(schema);
    const valid = validate(regResult.data);
    if (!valid) {
      violations.push({
        rule_id: "schema-validation",
        category: "schema",
        severity: "critical",
        message: `Governance registry schema violation: ${ajv.errorsText(validate.errors)}`,
        target: REGISTRY_PATH,
        recovery_guidance: "Fix JSON structure to conform to governance-registry.schema.json.",
      });
    }
  }

  // event catalog
  const catalogPath = join(GOVERNANCE_DIR, "events/event-catalog.json");
  const catResult = safeLoadJson(catalogPath);
  if (!catResult.ok) {
    violations.push({
      rule_id: "schema-validation",
      category: "schema",
      severity: "critical",
      message: `Event catalog unreadable: ${catResult.error}`,
      target: catalogPath,
      recovery_guidance: "Restore event-catalog.json from git.",
    });
  } else {
    const cat = catResult.data as Record<string, unknown>;
    if (!Array.isArray(cat.events)) {
      violations.push({
        rule_id: "schema-validation",
        category: "schema",
        severity: "error",
        message: "Event catalog missing 'events' array",
        target: catalogPath,
        recovery_guidance: "Add events array to event-catalog.json.",
      });
    }
  }

  // event stream policy
  const policyPath = join(GOVERNANCE_DIR, "events/event-stream-policy.json");
  const polResult = safeLoadJson(policyPath);
  if (!polResult.ok) {
    violations.push({
      rule_id: "schema-validation",
      category: "schema",
      severity: "critical",
      message: `Event stream policy unreadable: ${polResult.error}`,
      target: policyPath,
      recovery_guidance: "Restore event-stream-policy.json from git.",
    });
  } else {
    const pol = polResult.data as Record<string, unknown>;
    if (!Array.isArray(pol.streams)) {
      violations.push({
        rule_id: "schema-validation",
        category: "schema",
        severity: "error",
        message: "Event stream policy missing 'streams' array",
        target: policyPath,
        recovery_guidance: "Add streams array to event-stream-policy.json.",
      });
    }
  }

  // enforcement policy protocol
  const enfPolicyPath = join(PROTOCOLS_DIR, "enforcement-policy.json");
  const enfResult = safeLoadJson(enfPolicyPath);
  if (!enfResult.ok) {
    violations.push({
      rule_id: "schema-validation",
      category: "schema",
      severity: "critical",
      message: `Enforcement policy unreadable: ${enfResult.error}`,
      target: enfPolicyPath,
      recovery_guidance: "Restore enforcement-policy.json from git.",
    });
  } else {
    const schemaPath2 = join(SCHEMAS_DIR, "protocol-definition.schema.json");
    const schema2 = loadJson(schemaPath2) as object;
    const validate2 = ajv.compile(schema2);
    const valid2 = validate2(enfResult.data);
    if (!valid2) {
      violations.push({
        rule_id: "schema-validation",
        category: "schema",
        severity: "critical",
        message: `Enforcement policy schema violation: ${ajv.errorsText(validate2.errors)}`,
        target: enfPolicyPath,
        recovery_guidance: "Fix enforcement-policy.json to conform to protocol-definition.schema.json.",
      });
    }
  }

  return violations;
}

function checkRuntimeValidation(): Violation[] {
  const violations: Violation[] = [];

  // execution state (missing is OK — state machine auto-initializes)
  if (existsSync(STATE_PATH)) {
    const stateResult = safeLoadJson(STATE_PATH);
    if (!stateResult.ok) {
      violations.push({
        rule_id: "runtime-validation",
        category: "runtime",
        severity: "critical",
        message: `Execution state unreadable: ${stateResult.error}`,
        target: STATE_PATH,
        recovery_guidance: "Run 'npm run state:reset' to re-initialize execution state.",
      });
    } else {
      const state = stateResult.data as Record<string, unknown>;
      if (typeof state.current_state !== "string") {
        violations.push({
          rule_id: "runtime-validation",
          category: "runtime",
          severity: "critical",
          message: "Execution state missing 'current_state'",
          target: STATE_PATH,
          recovery_guidance: "Run 'npm run state:reset' to re-initialize execution state.",
        });
      }
      if (!Array.isArray(state.history)) {
        violations.push({
          rule_id: "runtime-validation",
          category: "runtime",
          severity: "error",
          message: "Execution state missing 'history' array",
          target: STATE_PATH,
          recovery_guidance: "Run 'npm run state:reset' to re-initialize execution state.",
        });
      }
    }
  }

  // lock state (missing is OK — lock manager auto-initializes)
  if (existsSync(LOCK_PATH)) {
    const lockResult = safeLoadJson(LOCK_PATH);
    if (!lockResult.ok) {
      violations.push({
        rule_id: "runtime-validation",
        category: "runtime",
        severity: "critical",
        message: `Lock state unreadable: ${lockResult.error}`,
        target: LOCK_PATH,
        recovery_guidance: "Remove corrupted lock file and re-acquire lock if needed.",
      });
    } else {
      const lock = lockResult.data as Record<string, unknown>;
      if (typeof lock.locked !== "boolean") {
        violations.push({
          rule_id: "runtime-validation",
          category: "runtime",
          severity: "error",
          message: "Lock state missing 'locked' boolean",
          target: LOCK_PATH,
          recovery_guidance: "Remove corrupted lock file and re-acquire lock if needed.",
        });
      }
    }
  }

  // heartbeats
  if (existsSync(HEARTBEATS_DIR)) {
    const files = readdirSync(HEARTBEATS_DIR).filter(f => f.endsWith(".json"));
    for (const file of files) {
      const hbResult = safeLoadJson(join(HEARTBEATS_DIR, file));
      if (!hbResult.ok) {
        violations.push({
          rule_id: "runtime-validation",
          category: "runtime",
          severity: "warn",
          message: `Heartbeat unreadable: ${hbResult.error}`,
          target: join(HEARTBEATS_DIR, file),
          recovery_guidance: "Remove corrupted heartbeat file.",
        });
      }
    }
  }

  return violations;
}

function checkProtocolValidation(): Violation[] {
  const violations: Violation[] = [];
  const ajv = createAjv();
  const schemaPath = join(SCHEMAS_DIR, "protocol-definition.schema.json");
  const schema = loadJson(schemaPath) as object;
  const validate = ajv.compile(schema);

  const files = readdirSync(PROTOCOLS_DIR).filter(f => f.endsWith(".json"));
  for (const file of files) {
    const filePath = join(PROTOCOLS_DIR, file);
    const result = safeLoadJson(filePath);
    if (!result.ok) {
      violations.push({
        rule_id: "protocol-validation",
        category: "protocol",
        severity: "critical",
        message: `Protocol unreadable: ${result.error}`,
        target: filePath,
        recovery_guidance: `Restore ${file} from git or fix JSON syntax errors.`,
      });
      continue;
    }
    const valid = validate(result.data);
    if (!valid) {
      violations.push({
        rule_id: "protocol-validation",
        category: "protocol",
        severity: "high",
        message: `Protocol ${file} violates schema: ${ajv.errorsText(validate.errors)}`,
        target: filePath,
        recovery_guidance: `Update ${file} to conform to protocol-definition.schema.json.`,
      });
    }
  }

  return violations;
}

function checkMilestoneIntegrity(): Violation[] {
  const violations: Violation[] = [];
  const result = safeLoadJson(MILESTONES_PATH);
  if (!result.ok) {
    violations.push({
      rule_id: "milestone-integrity",
      category: "milestone",
      severity: "critical",
      message: `Milestones file unreadable: ${result.error}`,
      target: MILESTONES_PATH,
      recovery_guidance: "Restore governance.json from git.",
    });
    return violations;
  }

  const milestones = result.data as Array<Record<string, unknown>>;
  if (!Array.isArray(milestones)) {
    violations.push({
      rule_id: "milestone-integrity",
      category: "milestone",
      severity: "critical",
      message: "Milestones file is not an array",
      target: MILESTONES_PATH,
      recovery_guidance: "Restore governance.json from git.",
    });
    return violations;
  }

  const validStatuses = ["planned", "in_progress", "completed", "archived"];
  const seenIds = new Set<string>();

  for (const ms of milestones) {
    const id = ms.id as string;
    if (!id) {
      violations.push({
        rule_id: "milestone-integrity",
        category: "milestone",
        severity: "error",
        message: "Milestone missing 'id'",
        target: MILESTONES_PATH,
        recovery_guidance: "Add id field to all milestones in governance.json.",
      });
      continue;
    }

    if (seenIds.has(id)) {
      violations.push({
        rule_id: "milestone-integrity",
        category: "milestone",
        severity: "error",
        message: `Duplicate milestone id: ${id}`,
        target: MILESTONES_PATH,
        recovery_guidance: "Remove duplicate milestone entry in governance.json.",
      });
    }
    seenIds.add(id);

    const status = ms.status as string;
    if (!validStatuses.includes(status)) {
      violations.push({
        rule_id: "milestone-integrity",
        category: "milestone",
        severity: "error",
        message: `Milestone ${id} has invalid status: ${status}`,
        target: MILESTONES_PATH,
        recovery_guidance: `Set status to one of: ${validStatuses.join(", ")}.`,
      });
    }

    // Check ticket paths exist
    const ticketPaths = ms.ticket_paths as Record<string, { path: string; exists?: boolean }> | undefined;
    if (ticketPaths) {
      for (const [ticketId, tp] of Object.entries(ticketPaths)) {
        if (!tp.path) {
          violations.push({
            rule_id: "milestone-integrity",
            category: "milestone",
            severity: "error",
            message: `Milestone ${id} ticket ${ticketId} missing path`,
            target: MILESTONES_PATH,
            recovery_guidance: `Add path for ticket ${ticketId} in milestone ${id}.`,
          });
          continue;
        }
        const fullPath = resolve(tp.path);
        if (!existsSync(fullPath)) {
          violations.push({
            rule_id: "milestone-integrity",
            category: "milestone",
            severity: "error",
            message: `Milestone ${id} ticket ${ticketId} path does not exist: ${tp.path}`,
            target: MILESTONES_PATH,
            recovery_guidance: `Create ticket file at ${tp.path} or update path in governance.json.`,
          });
        }
      }
    }
  }

  return violations;
}

function checkDependencyIntegrity(): Violation[] {
  const violations: Violation[] = [];

  // Load dependency graph
  const dgResult = safeLoadJson(DEPENDENCY_GRAPH_PATH);
  if (!dgResult.ok) {
    violations.push({
      rule_id: "dependency-integrity",
      category: "dependency",
      severity: "critical",
      message: `Dependency graph unreadable: ${dgResult.error}`,
      target: DEPENDENCY_GRAPH_PATH,
      recovery_guidance: "Restore dependency-graph.json from git.",
    });
    return violations;
  }

  const dg = dgResult.data as Record<string, unknown>;

  // Check ticket dependencies
  const ticketDeps = dg.ticket_dependencies as Array<{ ticket_id: string; depends_on: string[] }> | undefined;
  if (ticketDeps) {
    const allTicketIds = new Set<string>();
    if (existsSync(TICKETS_DIR)) {
      const files = readdirSync(TICKETS_DIR).filter(f => f.endsWith(".json"));
      for (const f of files) {
        allTicketIds.add(f.replace(".json", ""));
      }
    }

    // Build adjacency list for cycle detection
    const adj = new Map<string, string[]>();
    for (const td of ticketDeps) {
      if (!allTicketIds.has(td.ticket_id)) {
        violations.push({
          rule_id: "dependency-integrity",
          category: "dependency",
          severity: "error",
          message: `Ticket dependency entry references non-existent ticket: ${td.ticket_id}`,
          target: DEPENDENCY_GRAPH_PATH,
          recovery_guidance: `Create ticket ${td.ticket_id} or remove from dependency graph.`,
        });
      }
      adj.set(td.ticket_id, td.depends_on || []);
      for (const dep of td.depends_on || []) {
        if (!allTicketIds.has(dep)) {
          violations.push({
            rule_id: "dependency-integrity",
            category: "dependency",
            severity: "error",
            message: `Ticket ${td.ticket_id} depends on non-existent ticket: ${dep}`,
            target: DEPENDENCY_GRAPH_PATH,
            recovery_guidance: `Create ticket ${dep} or remove dependency from ${td.ticket_id}.`,
          });
        }
      }
    }

    // Cycle detection (DFS)
    const visited = new Set<string>();
    const recStack = new Set<string>();
    function hasCycle(node: string): boolean {
      visited.add(node);
      recStack.add(node);
      for (const neighbor of adj.get(node) || []) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor)) return true;
        } else if (recStack.has(neighbor)) {
          return true;
        }
      }
      recStack.delete(node);
      return false;
    }
    for (const node of adj.keys()) {
      if (!visited.has(node)) {
        if (hasCycle(node)) {
          violations.push({
            rule_id: "dependency-integrity",
            category: "dependency",
            severity: "critical",
            message: `Circular dependency detected involving ticket: ${node}`,
            target: DEPENDENCY_GRAPH_PATH,
            recovery_guidance: "Break the cycle by removing one dependency edge.",
          });
          break;
        }
      }
    }
  }

  // Check milestone dependencies exist
  const msDeps = dg.milestone_dependencies as Array<{ id: string; depends_on: string[] }> | undefined;
  if (msDeps) {
    const msIds = new Set<string>();
    const coreResult = safeLoadJson(resolve("project-management/milestones/core.json"));
    if (coreResult.ok && Array.isArray(coreResult.data)) {
      for (const ms of coreResult.data as Array<Record<string, unknown>>) {
        if (ms.id) msIds.add(ms.id as string);
      }
    }
    const govResult = safeLoadJson(MILESTONES_PATH);
    if (govResult.ok && Array.isArray(govResult.data)) {
      for (const ms of govResult.data as Array<Record<string, unknown>>) {
        if (ms.id) msIds.add(ms.id as string);
      }
    }
    for (const md of msDeps) {
      for (const dep of md.depends_on || []) {
        if (!msIds.has(dep)) {
          violations.push({
            rule_id: "dependency-integrity",
            category: "dependency",
            severity: "error",
            message: `Milestone ${md.id} depends on non-existent milestone: ${dep}`,
            target: DEPENDENCY_GRAPH_PATH,
            recovery_guidance: `Create milestone ${dep} or remove dependency from ${md.id}.`,
          });
        }
      }
    }
  }

  return violations;
}

function checkExecutionStateIntegrity(): Violation[] {
  const violations: Violation[] = [];
  if (!existsSync(STATE_PATH)) {
    // Missing state file is OK — state machine auto-initializes
    return violations;
  }
  const stateResult = safeLoadJson(STATE_PATH);
  if (!stateResult.ok) {
    violations.push({
      rule_id: "execution-state-integrity",
      category: "execution",
      severity: "critical",
      message: `Execution state unreadable: ${stateResult.error}`,
      target: STATE_PATH,
      recovery_guidance: "Run 'npm run state:reset' to re-initialize execution state.",
    });
    return violations;
  }

  const state = stateResult.data as { current_state: string; history: Array<{ from: string; to: string }> };
  const protocol = loadStateMachineProtocol();
  const validStates = new Set(protocol.state_machine.states.map(s => s.id));

  // Check current state is valid
  if (!validStates.has(state.current_state)) {
    violations.push({
      rule_id: "execution-state-integrity",
      category: "execution",
      severity: "critical",
      message: `Execution state has invalid current_state: ${state.current_state}`,
      target: STATE_PATH,
      recovery_guidance: "Run 'npm run state:reset' to return to idle state.",
    });
  }

  // Check history transitions are valid
  if (Array.isArray(state.history)) {
    const terminalStates = new Set(protocol.state_machine.states.filter(s => s.terminal).map(s => s.id));
    for (let i = 0; i < state.history.length; i++) {
      const h = state.history[i];
      if (!validStates.has(h.from)) {
        violations.push({
          rule_id: "execution-state-integrity",
          category: "execution",
          severity: "critical",
          message: `History entry ${i} has invalid from state: ${h.from}`,
          target: STATE_PATH,
          recovery_guidance: "Run 'npm run state:reset' to clear corrupted history.",
        });
        continue;
      }
      if (!validStates.has(h.to)) {
        violations.push({
          rule_id: "execution-state-integrity",
          category: "execution",
          severity: "critical",
          message: `History entry ${i} has invalid to state: ${h.to}`,
          target: STATE_PATH,
          recovery_guidance: "Run 'npm run state:reset' to clear corrupted history.",
        });
        continue;
      }

      const { valid } = isValidStateTransition(protocol, h.from as State, h.to as State);
      if (!valid) {
        violations.push({
          rule_id: "execution-state-integrity",
          category: "execution",
          severity: "critical",
          message: `History entry ${i} contains invalid transition: ${h.from} → ${h.to}`,
          target: STATE_PATH,
          recovery_guidance: "Run 'npm run state:reset' to clear corrupted history.",
        });
      }

      // Check no exit from terminal state (except as the last step where from is terminal)
      if (terminalStates.has(h.from) && i > 0) {
        violations.push({
          rule_id: "execution-state-integrity",
          category: "execution",
          severity: "critical",
          message: `History entry ${i} exits terminal state: ${h.from}`,
          target: STATE_PATH,
          recovery_guidance: "Run 'npm run state:reset' to clear corrupted history.",
        });
      }
    }
  }

  return violations;
}

// ── Main API ──

export function runEnforcement(options: { categories?: string[]; emitEvents?: boolean } = {}): EnforcementResult {
  const start = Date.now();
  const allCategories = ["schema", "runtime", "protocol", "milestone", "dependency", "execution"];
  const categories = options.categories || allCategories;
  const violations: Violation[] = [];

  const checks: Record<string, () => Violation[]> = {
    schema: checkSchemaValidation,
    runtime: checkRuntimeValidation,
    protocol: checkProtocolValidation,
    milestone: checkMilestoneIntegrity,
    dependency: checkDependencyIntegrity,
    execution: checkExecutionStateIntegrity,
  };

  for (const cat of categories) {
    const checkFn = checks[cat];
    if (checkFn) {
      violations.push(...checkFn());
    }
  }

  if (options.emitEvents) {
    for (const v of violations) {
      emitViolation(v);
    }
  }

  const summary: Record<string, number> = {};
  for (const cat of allCategories) {
    summary[cat] = violations.filter(v => v.category === cat).length;
  }

  return {
    passed: violations.length === 0,
    violations,
    summary,
    latency_ms: Date.now() - start,
  };
}

export function enforceTransition(from: State, to: State, executionId: string = "EXEC-0000-00-00-000"): {
  allowed: boolean;
  violations: Violation[];
} {
  const violations: Violation[] = [];
  const protocol = loadStateMachineProtocol();

  // Check transition validity
  const { valid } = isValidStateTransition(protocol, from, to);
  if (!valid) {
    violations.push({
      rule_id: "execution-state-integrity",
      category: "execution",
      severity: "critical",
      message: `Blocked invalid transition: ${from} → ${to}`,
      target: STATE_PATH,
      recovery_guidance: `Use a valid transition path per execution-state-machine protocol. Current state: ${from}`,
    });
  }

  // Check terminal state
  const terminalStates = new Set(protocol.state_machine.states.filter(s => s.terminal).map(s => s.id));
  if (terminalStates.has(from)) {
    violations.push({
      rule_id: "execution-state-integrity",
      category: "execution",
      severity: "critical",
      message: `Blocked exit from terminal state: ${from}`,
      target: STATE_PATH,
      recovery_guidance: "Terminal states cannot be exited. Start a new execution.",
    });
  }

  // Check lock state
  const lock = getLockState();
  if (lock.locked && lock.execution_id && lock.execution_id !== executionId) {
    // Recovery transitions are allowed even with different execution_id
    const isRecovery = protocol.state_machine.recovery_transitions.some(t => t.from === from && t.to === to);
    if (!isRecovery) {
      violations.push({
        rule_id: "execution-state-integrity",
        category: "execution",
        severity: "critical",
        message: `Blocked transition due to active lock held by ${lock.execution_id}`,
        target: LOCK_PATH,
        recovery_guidance: `Release lock for ${lock.execution_id} or use recovery transition path.`,
      });
    }
  }

  return {
    allowed: violations.length === 0,
    violations,
  };
}

export function generateRecoveryReport(result: EnforcementResult): string {
  const lines: string[] = [];
  lines.push("# Governance Enforcement Report");
  lines.push("");
  lines.push(`**Result:** ${result.passed ? "✅ PASSED" : "❌ FAILED"}`);
  lines.push(`**Latency:** ${result.latency_ms}ms`);
  lines.push(`**Violations:** ${result.violations.length}`);
  lines.push("");

  if (result.violations.length === 0) {
    lines.push("No violations detected.");
    return lines.join("\n");
  }

  lines.push("## Violations");
  lines.push("");
  for (const v of result.violations) {
    lines.push(`### ${v.rule_id} (${v.severity})`);
    lines.push(`- **Message:** ${v.message}`);
    lines.push(`- **Target:** ${v.target}`);
    lines.push(`- **Recovery:** ${v.recovery_guidance}`);
    lines.push("");
  }

  lines.push("## Summary by Category");
  lines.push("");
  for (const [cat, count] of Object.entries(result.summary)) {
    lines.push(`- ${cat}: ${count}`);
  }

  return lines.join("\n");
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "check") {
    const result = runEnforcement();
    console.log(generateRecoveryReport(result));
    process.exit(result.passed ? 0 : 1);
  } else if (command === "enforce") {
    const result = runEnforcement({ emitEvents: true });
    console.log(generateRecoveryReport(result));
    process.exit(result.passed ? 0 : 1);
  } else if (command === "report") {
    const result = runEnforcement();
    console.log(generateRecoveryReport(result));
    process.exit(0);
  } else if (command === "transition") {
    const from = args[1] as State;
    const to = args[2] as State;
    const execId = args[3] || "EXEC-0000-00-00-000";
    if (!from || !to) {
      console.error("Usage: tsx scripts/enforce-governance.ts transition <from> <to> [execution_id]");
      process.exit(1);
    }
    const check = enforceTransition(from, to, execId);
    if (check.allowed) {
      console.log(`✅ Transition ${from} → ${to} is ALLOWED`);
      process.exit(0);
    } else {
      console.error(`❌ Transition ${from} → ${to} is BLOCKED`);
      for (const v of check.violations) {
        console.error(`  [${v.severity}] ${v.message}`);
        console.error(`    Recovery: ${v.recovery_guidance}`);
      }
      process.exit(1);
    }
  } else {
    console.error("Usage: tsx scripts/enforce-governance.ts <check|enforce|report|transition>");
    process.exit(1);
  }
}
