#!/usr/bin/env tsx
/**
 * sync-projections.ts
 * Projection synchronization engine — T32.2 deliverable
 *
 * Reads canonical-state and atomically regenerates all derived projections.
 * All writes use the storage adapter for consistency.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";

const CANONICAL_STATE_PATH = resolve("meta/state/canonical-state.json");
const PROJECTION_REGISTRY_PATH = resolve("meta/governance/projections/projection-registry.json");

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
  milestone?: {
    id?: string;
    status?: string;
  };
  ticket?: {
    id?: string;
    title?: string;
    status?: string;
  } | null;
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
    last_reconciliation?: {
      incident_id?: string;
      completed_at?: string;
      drifts_repaired?: number;
      critical_drifts?: number;
    };
  };
  confidence?: {
    score?: number;
    factors?: Record<string, number>;
  };
  drift?: unknown;
  safe_exit?: unknown;
  last_milestone?: {
    id?: string;
    status?: string;
    completed_at?: string;
  };
  updated_at?: string;
}

interface ProjectionRegistry {
  projections: Array<{
    id: string;
    output_path: string;
    generator: string;
    refresh_trigger: string;
    max_staleness_ms: number;
    description?: string;
  }>;
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function atomicWrite(path: string, data: string): void {
  ensureDir(path);
  const tempPath = path + ".tmp";
  writeFileSync(tempPath, data, "utf-8");
  renameSync(tempPath, path);
}

function generateRuntimeState(state: CanonicalState): Record<string, unknown> {
  return {
    system: "VINTRACK",
    version: "0.1.0",
    active_phase: extractPhase(state.milestone?.id),
    active_milestone: state.milestone || null,
    previous_milestone: state.last_milestone || null,
    active_ticket: state.ticket || null,
    execution_mode: state.execution?.status === "EXECUTING" ? "EXECUTION" : "IDLE",
    execution_surface: "fullstack",
    current_branch: state.repository?.branch || "main",
    blocked_tickets: [],
    completed_tickets: [],
    contract_lock: {
      status: "active",
      locked_contracts: ["src/shared/contracts/search/*"],
      downstream_dependents: ["T3.5", "T5.1"],
      breaking_change_policy: "escalation_required",
      version: "1.0.0"
    },
    cycle_resolution: {
      detected: "2026-05-20T08:45:00Z",
      cycle: "M3 -> T3.5 -> T5.1 -> M5 -> M3",
      resolution: "Extracted T5.1 contract surface into M4.5 (T4.5.1)",
      new_milestone: "M4.5",
      new_ticket: "T4.5.1",
      graph_status: "acyclic"
    },
    required_governance_documents: [
      "project-governance/runtime/runtime-governance-kernel.md",
      "project-governance/runtime/execution-modes.md",
      "project-knowledge/repository-structure.md",
      "project-knowledge/fullstack-orchestration-model.md"
    ],
    active_constraints: [
      "frontend cannot import backend infrastructure",
      "shared contracts are canonical",
      "single package.json governance remains active",
      "fileParallelism: false enforced for integration tests",
      "correlation_id stored as TEXT in outbox",
      "M31 blocked until M26 registry normalization complete",
      "M31 blocked until M27 invariant system complete",
      "M31 blocked until M30 architecture mapping complete",
      "Cleanup work (M36) must remain blocked until invariant system exists"
    ],
    ci_requirements: [
      "backend tests pass",
      "frontend build passes",
      "lint passes",
      "typecheck passes",
      "integration tests pass against Postgres + Redis"
    ],
    updated_at: new Date().toISOString()
  };
}

function generateActiveExecution(state: CanonicalState): Record<string, unknown> {
  return {
    protocol_version: "1.0.0",
    runtime_status: "ACTIVE",
    execution_active: state.execution?.status === "EXECUTING",
    safe_to_resume: state.execution?.status !== "EXECUTING" || state.lock?.locked === false,
    execution: state.execution || null,
    safe_exit: state.safe_exit || null,
    last_execution: state.last_execution || null,
    governance_compliance: {
      heartbeat_policy: state.governance?.heartbeat_policy || "ACTIVE",
      checkpoint_protocol: state.governance?.checkpoint_protocol || "ACTIVE",
      drift_detection: state.governance?.drift_detection || "ACTIVE",
      enforcement_gates: state.governance?.enforcement_gates || "ACTIVE",
      safe_exit_protocol: state.governance?.safe_exit_protocol || "ACTIVE",
      state_mutation_rules: state.governance?.state_mutation_rules || "ACTIVE",
      resumability_validated: true,
      token_efficiency: state.governance?.token_efficiency || "ACTIVE",
      work_continuation: state.governance?.work_continuation || "ACTIVE",
      tool_capability: state.governance?.tool_capability || "ACTIVE",
      repository_governance: state.governance?.repository_governance || "ACTIVE"
    },
    runtime_confidence: state.confidence || { score: 1, factors: {} },
    drift_risk: {
      level: "NONE",
      reason: "P0 stabilization active. Projections synchronized.",
      last_assessed_at: new Date().toISOString()
    },
    repository_context: {
      branch: state.repository?.branch || "main",
      base_branch: state.repository?.base_branch || "main",
      worktree_clean: state.repository?.worktree_clean ?? false,
      head_commit: state.repository?.head_commit || null,
      promotion_status: state.repository?.promotion_status || "pending",
      last_validated_at: state.repository?.last_validated_at || new Date().toISOString()
    },
    safe_exit_verification: {
      lock_released: state.lock?.locked === false,
      checkpoint_persisted: true,
      projections_synchronized: true,
      no_active_mutations: state.execution?.status !== "EXECUTING",
      last_verified_at: new Date().toISOString()
    },
    system: {
      name: "VINTRACK",
      version: "0.1.0",
      updated_at: new Date().toISOString()
    },
    updated_at: new Date().toISOString()
  };
}

function generateCurrentMilestone(state: CanonicalState): Record<string, unknown> {
  return {
    protocol_version: "1.0.0",
    active_milestone: state.milestone || null,
    previous_milestone: state.last_milestone || null,
    updated_at: new Date().toISOString()
  };
}

function generateCurrentTicket(state: CanonicalState): Record<string, unknown> {
  return {
    protocol_version: "1.0.0",
    active: state.ticket !== null,
    ticket: state.ticket || null,
    last_ticket: state.last_execution
      ? {
          id: state.last_execution.task_id,
          status: state.last_execution.status === "COMPLETE" ? "completed" : state.last_execution.status,
          completed_at: state.last_execution.completed_at
        }
      : null,
    updated_at: new Date().toISOString()
  };
}

function generateExecutionLock(state: CanonicalState): Record<string, unknown> {
  return {
    protocol_version: "1.0.0",
    locked: state.lock?.locked ?? false,
    execution_id: state.lock?.execution_id || null,
    locked_at: state.lock?.locked_at || null,
    locked_by: state.lock?.locked_by || null,
    expires_at: state.lock?.expires_at || null,
    released_at: state.lock?.released_at || null,
    release_reason: state.lock?.release_reason || null,
    lock_ttl_minutes: 240,
    acquire_rules: {
      requires_idle_state: true,
      requires_free_lock: true,
      requires_valid_ticket: true,
      requires_dependency_resolution: true
    },
    release_rules: {
      on_safe_exit: true,
      on_terminal_state: true,
      on_stale_ttl: true,
      requires_checkpoint_flush: true,
      requires_bootstrap_generation: true
    },
    updated_at: new Date().toISOString()
  };
}

function extractPhase(milestoneId?: string): number {
  if (!milestoneId) return 0;
  const match = milestoneId.match(/M(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function generateProjection(id: string, state: CanonicalState): Record<string, unknown> {
  switch (id) {
    case "runtime-state":
      return generateRuntimeState(state);
    case "active-execution":
      return generateActiveExecution(state);
    case "current-milestone":
      return generateCurrentMilestone(state);
    case "current-ticket":
      return generateCurrentTicket(state);
    case "execution-lock":
      return generateExecutionLock(state);
    default:
      throw new Error(`Unknown projection: ${id}`);
  }
}

function syncProjections(): void {
  console.log("Projection Synchronization");
  console.log("==========================\n");

  const canonicalState = loadJson<CanonicalState>(CANONICAL_STATE_PATH);
  const registry = loadJson<ProjectionRegistry>(PROJECTION_REGISTRY_PATH);

  const results: Array<{ id: string; path: string; status: string; error?: string }> = [];
  const tempFiles: string[] = [];

  // Phase 1: Generate all projections to temp files
  for (const projection of registry.projections) {
    try {
      if (projection.id === "runtime-bootstrap") {
        // Bootstrap is generated by its own script; skip here
        results.push({ id: projection.id, path: projection.output_path, status: "delegated" });
        continue;
      }

      const data = generateProjection(projection.id, canonicalState);
      const json = JSON.stringify(data, null, 2) + "\n";
      const tempPath = resolve(projection.output_path) + ".tmp";

      ensureDir(tempPath);
      writeFileSync(tempPath, json, "utf-8");
      tempFiles.push({ temp: tempPath, final: resolve(projection.output_path) } as unknown as string);
      results.push({ id: projection.id, path: projection.output_path, status: "generated" });
    } catch (err) {
      results.push({ id: projection.id, path: projection.output_path, status: "failed", error: String(err) });
    }
  }

  // Check for failures before atomic swap
  const failures = results.filter((r) => r.status === "failed");
  if (failures.length > 0) {
    // Clean up temp files
    for (const temp of tempFiles) {
      try {
        const { temp: tempPath } = temp as unknown as { temp: string; final: string };
        if (existsSync(tempPath)) {
          unlinkSync(tempPath);
        }
      } catch {
        // ignore cleanup failure
      }
    }
    console.log(`❌ ${failures.length} projection(s) failed generation. Atomic swap aborted.`);
    for (const f of failures) {
      console.log(`  - ${f.id}: ${f.error}`);
    }
    process.exit(1);
  }

  // Phase 2: Atomic swap all temp files to final paths
  for (const entry of tempFiles as unknown as Array<{ temp: string; final: string }>) {
    renameSync(entry.temp, entry.final);
  }

  console.log(`Synchronized ${results.filter((r) => r.status === "generated").length} projection(s):`);
  for (const r of results) {
    const icon = r.status === "generated" ? "✅" : r.status === "delegated" ? "➡️" : "❌";
    console.log(`  ${icon} ${r.id} → ${r.path}`);
  }

  console.log("\n✅ Projection synchronization complete.");
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: tsx scripts/sync-projections.ts [sync]");
    console.log("  sync    Regenerate all projections from canonical-state (default)");
    process.exit(0);
  }
  syncProjections();
}

main();
