#!/usr/bin/env tsx
/**
 * VINTRACK Bootstrap Script — T32.1 deliverable
 *
 * Reads canonical-state as the sole authoritative source and generates
 * runtime-bootstrap.json for session initialization.
 *
 * NEVER reads deprecated project-management/data/milestones.json.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

const CANONICAL_STATE_PATH = resolve("meta/state/canonical-state.json");
const MILESTONES_REGISTRY_PATH = resolve("project-management/data/milestones.registry.json");
const GOVERNANCE_MILESTONES_PATH = resolve("project-management/milestones/governance.json");
const CORE_MILESTONES_PATH = resolve("project-management/milestones/core.json");
const LATEST_CHECKPOINT_PATH = resolve("project-governance/runtime/checkpoints/latest-checkpoint.json");
const BOOTSTRAP_OUTPUT_PATH = resolve("project-governance/runtime/bootstrap/runtime-bootstrap.json");

interface CanonicalState {
  execution?: {
    execution_id?: string;
    task_id?: string;
    milestone_id?: string;
    status?: string;
    started_at?: string;
    completed_at?: string | null;
  } | null;
  last_execution?: {
    execution_id?: string;
    task_id?: string;
    milestone_id?: string;
    status?: string;
    started_at?: string;
    completed_at?: string;
  };
  milestone?: { id?: string; status?: string };
  ticket?: { id?: string; title?: string; status?: string } | null;
  lock?: {
    locked?: boolean;
    execution_id?: string;
    locked_at?: string;
    locked_by?: string;
    expires_at?: string;
    released_at?: string | null;
    release_reason?: string | null;
  };
  repository?: {
    branch?: string;
    base_branch?: string;
    worktree_clean?: boolean;
    head_commit?: string | null;
    promotion_status?: string;
  };
  governance?: {
    heartbeat_policy?: string;
    checkpoint_protocol?: string;
    drift_detection?: string;
    enforcement_gates?: string;
    safe_exit_protocol?: string;
    state_mutation_rules?: string;
    token_efficiency?: string;
    work_continuation?: string;
    tool_capability?: string;
    repository_governance?: string;
  };
  last_milestone?: { id?: string; status?: string; completed_at?: string };
  updated_at?: string;
}

interface MilestoneRegistry {
  files: string[];
  active_collections: string[];
}

interface Milestone {
  id: string;
  phase: number;
  title: string;
  status: string;
  tickets: string[];
}

function loadJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function getGitBranch(): string {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

function loadMilestones(): Milestone[] {
  const governance = loadJson<Milestone[]>(GOVERNANCE_MILESTONES_PATH) || [];
  const core = loadJson<Milestone[]>(CORE_MILESTONES_PATH) || [];
  return [...governance, ...core];
}

function findMilestone(id: string): Milestone | null {
  return loadMilestones().find((m) => m.id === id) || null;
}

function findPreviousMilestone(currentId: string): Milestone | null {
  const milestones = loadMilestones();
  const current = milestones.find((m) => m.id === currentId);
  if (!current) return null;
  return milestones
    .filter((m) => m.phase < current.phase && m.status === "completed")
    .sort((a, b) => b.phase - a.phase)[0] || null;
}

function loadLatestCheckpoint(): Record<string, unknown> | null {
  return loadJson<Record<string, unknown>>(LATEST_CHECKPOINT_PATH);
}

function gatherCompletedTickets(): string[] {
  const completed: string[] = [];
  for (const m of loadMilestones()) {
    if (m.status === "completed" && Array.isArray(m.tickets)) {
      completed.push(...m.tickets);
    }
  }
  return completed;
}

function inferTicketFromBranch(branch: string): string | null {
  const match = branch.match(/\b(T\d+\.\d+[A-Z]?)\b/);
  return match?.[1] ?? null;
}

function generateBootstrap(): Record<string, unknown> {
  const canonical = loadJson<CanonicalState>(CANONICAL_STATE_PATH);
  if (!canonical) {
    throw new Error("Canonical state not found. Cannot bootstrap.");
  }

  const registry = loadJson<MilestoneRegistry>(MILESTONES_REGISTRY_PATH);
  const milestones = loadMilestones();
  const latestCheckpoint = loadLatestCheckpoint();
  const branch = getGitBranch();
  const branchTicket = inferTicketFromBranch(branch);

  const currentMilestoneId = canonical.milestone?.id;
  const currentMilestone = currentMilestoneId ? findMilestone(currentMilestoneId) : null;
  const previousMilestone = currentMilestoneId ? findPreviousMilestone(currentMilestoneId) : null;

  const currentTicketId = canonical.ticket?.id || branchTicket;
  const completedTickets = gatherCompletedTickets();

  return {
    protocol_version: "1.0.0",
    bootstrap_type: "CANONICAL_STATE_FIRST",
    generated_at: new Date().toISOString(),
    authority: "meta/state/canonical-state.json",
    latest_checkpoint: latestCheckpoint,
    current_milestone: currentMilestone
      ? {
          id: currentMilestone.id,
          title: currentMilestone.title,
          status: canonical.milestone?.status || currentMilestone.status,
          phase: currentMilestone.phase
        }
      : null,
    previous_milestone: previousMilestone
      ? {
          id: previousMilestone.id,
          title: previousMilestone.title,
          status: previousMilestone.status
        }
      : null,
    current_ticket: currentTicketId
      ? {
          id: currentTicketId,
          status: canonical.ticket?.status || "unknown"
        }
      : null,
    current_branch: branch,
    execution: canonical.execution || null,
    lock: canonical.lock || null,
    completed_tickets_count: completedTickets.length,
    completed_tickets: completedTickets,
    milestone_registry: registry?.files || [],
    safe_resume_point: canonical.execution?.status === "EXECUTING" ? "execution-continuation" : "idle",
    resume_phase: canonical.execution?.status === "EXECUTING" ? "ticket-execution" : "awaiting-ticket",
    active_constraints: [
      "frontend cannot import backend infrastructure",
      "shared contracts are canonical",
      "single package.json governance remains active",
      "fileParallelism: false enforced for integration tests",
      "correlation_id stored as TEXT in outbox"
    ],
    required_governance_documents: [
      "project-governance/runtime/runtime-governance-kernel.md",
      "project-governance/runtime/execution-modes.md",
      "project-knowledge/repository-structure.md",
      "project-knowledge/runtime-operations-architecture.md"
    ],
    ci_requirements: [
      "backend tests pass",
      "frontend build passes",
      "lint passes",
      "typecheck passes",
      "integration tests pass against Postgres + Redis"
    ]
  };
}

function saveBootstrap(data: Record<string, unknown>): void {
  writeFileSync(BOOTSTRAP_OUTPUT_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function main(): void {
  console.log("VINTRACK Bootstrap");
  console.log("==================\n");
  console.log("Authority: meta/state/canonical-state.json");
  console.log("Output:    project-governance/runtime/bootstrap/runtime-bootstrap.json\n");

  try {
    const bootstrap = generateBootstrap();
    saveBootstrap(bootstrap);

    console.log(`Current Milestone: ${(bootstrap.current_milestone as Record<string, string>)?.id || "—"}`);
    console.log(`Current Ticket:    ${(bootstrap.current_ticket as Record<string, string>)?.id || "—"}`);
    console.log(`Execution Status:  ${(bootstrap.execution as Record<string, string>)?.status || "—"}`);
    console.log(`Lock Status:       ${(bootstrap.lock as Record<string, boolean>)?.locked ? "LOCKED" : "FREE"}`);
    console.log(`Completed Tickets: ${bootstrap.completed_tickets_count}`);
    console.log(`\n✅ Bootstrap complete.`);
  } catch (err) {
    console.error(`\n❌ Bootstrap failed: ${err}`);
    process.exit(1);
  }
}

main();
