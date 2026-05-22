/**
 * Resolve Continuation — Operational Work Continuation Protocol
 *
 * Reads canonical runtime state and emits a deterministic continuation decision.
 * This script is the operational core of WORK_CONTINUATION_PROTOCOL.md.
 *
 * Usage: npx tsx scripts/resolve-continuation.ts [--json]
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const GOVERNANCE_DIR = "project-management/data";
const RUNTIME_DIR = "project-governance/runtime/state";
const CHECKPOINT_DIR = "project-governance/runtime/checkpoints";

interface Ticket {
  id: string;
  milestone_id: string;
  title: string;
  status: string;
  dependencies: string[];
}

interface Milestone {
  id: string;
  status: string;
  tickets: string[];
}

interface ContinuationDecision {
  protocol_version: string;
  resolved_at: string;
  reason: string;
  reason_detail: string;
  selected_ticket: {
    id: string;
    milestone_id: string;
    title: string;
    priority: number;
  } | null;
  rejected_candidates: Array<{
    id: string;
    reason: string;
  }>;
  dependency_basis: {
    all_dependencies_resolved: boolean;
    blocker_count: number;
  };
  governance_basis: {
    runtime_confidence: number;
    drift_risk: string;
    checkpoint_system: string;
  };
  state_inconsistencies: string[];
  authorization_required: boolean;
  next_action: string;
}

function loadJSON<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function loadTickets(): Ticket[] {
  // Try governance-tickets.json first, then fall back to individual tickets
  const governanceTickets = loadJSON<Ticket[]>(
    join(GOVERNANCE_DIR, "governance-tickets.json")
  );
  if (governanceTickets) return governanceTickets;

  // Fallback: scan individual ticket files
  // Not implemented — governance-tickets.json is canonical for M11+
  return [];
}

function loadMilestones(): Milestone[] {
  const governanceMilestones = loadJSON<Milestone[]>(
    join(GOVERNANCE_DIR, "governance-milestones.json")
  );
  if (governanceMilestones) return governanceMilestones;

  const mainMilestones = loadJSON<Milestone[]>(
    join(GOVERNANCE_DIR, "milestones.json")
  );
  if (mainMilestones) return mainMilestones;

  return [];
}

function findInterruptedExecution(): string | null {
  const activeExecution = loadJSON<{
    execution_active: boolean;
    safe_to_resume: boolean;
    execution: { task_id: string; status: string } | null;
  }>(join(RUNTIME_DIR, "active-execution.json"));

  if (!activeExecution) return null;

  // Check for interrupted state
  if (
    activeExecution.execution &&
    (activeExecution.execution.status === "INTERRUPTED" ||
      activeExecution.execution.status === "BLOCKED")
  ) {
    return activeExecution.execution.task_id;
  }

  // Check for stale lock / unsafe exit
  const lock = loadJSON<{ locked: boolean; execution_id: string | null }>(
    join(RUNTIME_DIR, "execution-lock.json")
  );
  if (lock?.locked && lock.execution_id) {
    // Stale lock detection would go here
    return null;
  }

  return null;
}

function findLatestCheckpoint(taskId: string): string | null {
  if (!existsSync(CHECKPOINT_DIR)) return null;
  const fs = require("fs");
  const files = fs
    .readdirSync(CHECKPOINT_DIR)
    .filter((f: string) => f.includes(taskId) && f.endsWith(".json"))
    .sort();
  return files.length > 0 ? join(CHECKPOINT_DIR, files[files.length - 1]) : null;
}

function resolveDependencies(
  ticket: Ticket,
  allTickets: Ticket[]
): { resolved: boolean; blockers: string[] } {
  const blockers: string[] = [];
  for (const depId of ticket.dependencies || []) {
    const dep = allTickets.find((t) => t.id === depId);
    if (!dep || dep.status !== "completed") {
      blockers.push(depId);
    }
  }
  return { resolved: blockers.length === 0, blockers };
}

function resolveContinuation(): ContinuationDecision {
  const now = new Date().toISOString();
  const rejected: Array<{ id: string; reason: string }> = [];
  const inconsistencies: string[] = [];

  // Load canonical state
  const activeExecution = loadJSON<{
    runtime_confidence: { score: number };
    drift_risk: { level: string };
  }>(join(RUNTIME_DIR, "active-execution.json"));

  const currentMilestone = loadJSON<{
    active_milestone: { id: string; status: string } | null;
    previous_milestone: { id: string; status: string } | null;
  }>(join(RUNTIME_DIR, "current-milestone.json"));

  const tickets = loadTickets();
  const milestones = loadMilestones();

  const confidence = activeExecution?.runtime_confidence?.score ?? 0;
  const driftRisk = activeExecution?.drift_risk?.level ?? "UNKNOWN";

  // === PRIORITY 1: Interrupted Execution Recovery ===
  const interrupted = findInterruptedExecution();
  if (interrupted) {
    const checkpoint = findLatestCheckpoint(interrupted);
    if (checkpoint) {
      return {
        protocol_version: "1.0.0",
        resolved_at: now,
        reason: "INTERRUPTED_RECOVERY",
        reason_detail: `Execution ${interrupted} was interrupted. Checkpoint found at ${checkpoint}.`,
        selected_ticket: { id: interrupted, milestone_id: "", title: "", priority: 1 },
        rejected_candidates: [],
        dependency_basis: { all_dependencies_resolved: true, blocker_count: 0 },
        governance_basis: {
          runtime_confidence: confidence,
          drift_risk: driftRisk,
          checkpoint_system: checkpoint ? "ACTIVE" : "DEGRADED",
        },
        state_inconsistencies: [],
        authorization_required: true,
        next_action: `Resume ${interrupted} from checkpoint.`,
      };
    }
  }

  // === PRIORITY 2: Active Milestone Completion ===
  const activeMilestoneId = currentMilestone?.active_milestone?.id;
  if (activeMilestoneId) {
    const milestone = milestones.find((m) => m.id === activeMilestoneId);
    const milestoneTickets = tickets.filter(
      (t) => t.milestone_id === activeMilestoneId
    );

    const incompleteTickets = milestoneTickets.filter(
      (t) => t.status !== "completed" && t.status !== "cancelled"
    );

    if (incompleteTickets.length > 0) {
      // Find first unblocked ticket
      for (const ticket of incompleteTickets) {
        const deps = resolveDependencies(ticket, tickets);
        if (deps.resolved) {
          // Build rejected list from other candidates
          for (const other of incompleteTickets) {
            if (other.id !== ticket.id) {
              rejected.push({ id: other.id, reason: "Lower priority / later in sequence." });
            }
          }

          return {
            protocol_version: "1.0.0",
            resolved_at: now,
            reason: "MILESTONE_BACKLOG",
            reason_detail: `${activeMilestoneId} has ${incompleteTickets.length} unresolved ticket(s).`,
            selected_ticket: {
              id: ticket.id,
              milestone_id: ticket.milestone_id,
              title: ticket.title,
              priority: 2,
            },
            rejected_candidates: rejected,
            dependency_basis: {
              all_dependencies_resolved: true,
              blocker_count: 0,
            },
            governance_basis: {
              runtime_confidence: confidence,
              drift_risk: driftRisk,
              checkpoint_system: "ACTIVE",
            },
            state_inconsistencies: inconsistencies,
            authorization_required: true,
            next_action: `Execute ${ticket.id} — ${ticket.title}`,
          };
        }
      }
    }

    // Milestone complete but still active — flag inconsistency
    if (milestone && incompleteTickets.length === 0) {
      inconsistencies.push(
        `${activeMilestoneId} has no incomplete tickets but status is still '${milestone.status}'.`
      );
    }
  }

  // === PRIORITY 3: Governance Stabilization ===
  if (confidence < 0.8 || driftRisk === "HIGH" || driftRisk === "CRITICAL") {
    rejected.push({ id: "M3+", reason: "Governance stabilization required first." });
    return {
      protocol_version: "1.0.0",
      resolved_at: now,
      reason: "GOVERNANCE_STABILIZATION",
      reason_detail: `Runtime confidence ${confidence}, drift ${driftRisk}. Governance work required.`,
      selected_ticket: null,
      rejected_candidates: rejected,
      dependency_basis: { all_dependencies_resolved: false, blocker_count: 1 },
      governance_basis: {
        runtime_confidence: confidence,
        drift_risk: driftRisk,
        checkpoint_system: "ACTIVE",
      },
      state_inconsistencies: inconsistencies,
      authorization_required: true,
      next_action: "Address governance stabilization before feature work.",
    };
  }

  // === PRIORITY 4: Dependency Unlocking ===
  // TODO: Implement dependency graph traversal for blocked milestones

  // === PRIORITY 5: Milestone Transition ===
  // TODO: Implement milestone transition logic

  // === NO VALID TICKET ===
  return {
    protocol_version: "1.0.0",
    resolved_at: now,
    reason: "NO_VALID_TICKET",
    reason_detail: "No executable ticket found across all priorities.",
    selected_ticket: null,
    rejected_candidates: rejected,
    dependency_basis: { all_dependencies_resolved: true, blocker_count: 0 },
    governance_basis: {
      runtime_confidence: confidence,
      drift_risk: driftRisk,
      checkpoint_system: "ACTIVE",
    },
    state_inconsistencies: inconsistencies,
    authorization_required: false,
    next_action: "Manual intervention required — no deterministic continuation available.",
  };
}

// === MAIN ===
const decision = resolveContinuation();
const isJson = process.argv.includes("--json");

if (isJson) {
  console.log(JSON.stringify(decision, null, 2));
} else {
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("CONTINUATION_DECISION");
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log(`resolved_at:      ${decision.resolved_at}`);
  console.log(`reason:           ${decision.reason}`);
  console.log(`reason_detail:    ${decision.reason_detail}`);
  console.log("");
  if (decision.selected_ticket) {
    console.log("selected_ticket:");
    console.log(`  id:             ${decision.selected_ticket.id}`);
    console.log(`  milestone_id:   ${decision.selected_ticket.milestone_id}`);
    console.log(`  title:          ${decision.selected_ticket.title}`);
    console.log(`  priority:       ${decision.selected_ticket.priority}`);
  } else {
    console.log("selected_ticket:  null");
  }
  console.log("");
  if (decision.rejected_candidates.length > 0) {
    console.log("rejected_candidates:");
    for (const r of decision.rejected_candidates) {
      console.log(`  - ${r.id}: ${r.reason}`);
    }
  }
  console.log("");
  console.log("dependency_basis:");
  console.log(`  all_resolved:   ${decision.dependency_basis.all_dependencies_resolved}`);
  console.log(`  blockers:       ${decision.dependency_basis.blocker_count}`);
  console.log("");
  console.log("governance_basis:");
  console.log(`  confidence:     ${decision.governance_basis.runtime_confidence}`);
  console.log(`  drift_risk:     ${decision.governance_basis.drift_risk}`);
  console.log(`  checkpoint:     ${decision.governance_basis.checkpoint_system}`);
  console.log("");
  if (decision.state_inconsistencies.length > 0) {
    console.log("state_inconsistencies:");
    for (const i of decision.state_inconsistencies) {
      console.log(`  - ${i}`);
    }
    console.log("");
  }
  console.log(`authorization:    ${decision.authorization_required ? "REQUIRED" : "NOT_REQUIRED"}`);
  console.log(`next_action:      ${decision.next_action}`);
  console.log("═══════════════════════════════════════════════════════════════════");
}

process.exit(decision.selected_ticket ? 0 : 1);
