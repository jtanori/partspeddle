#!/usr/bin/env tsx
/**
 * validate-projections.ts
 * Projection drift validator — T32.2 deliverable
 *
 * Compares all derived projections against canonical-state and reports drift.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

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
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

export function validateProjectionConsistency(): { passed: boolean; drifts: Array<{ projection: string; field: string; expected: unknown; actual: unknown }> } {
  const drifts: Array<{ projection: string; field: string; expected: unknown; actual: unknown }> = [];
  const state = loadJson<CanonicalState>(CANONICAL_STATE_PATH);

  // Validate runtime-state.json
  const runtimeStatePath = resolve("project-governance/runtime/runtime-state.json");
  if (existsSync(runtimeStatePath)) {
    const runtimeState = loadJson<Record<string, unknown>>(runtimeStatePath);
    const expectedMilestone = state.milestone?.id;
    const actualMilestone = (runtimeState.active_milestone as Record<string, unknown>)?.id;
    if (expectedMilestone !== actualMilestone) {
      drifts.push({ projection: "runtime-state", field: "active_milestone.id", expected: expectedMilestone, actual: actualMilestone });
    }

    const expectedTicket = state.ticket?.id;
    const actualTicket = (runtimeState.active_ticket as Record<string, unknown>)?.id;
    if (expectedTicket !== actualTicket) {
      drifts.push({ projection: "runtime-state", field: "active_ticket.id", expected: expectedTicket, actual: actualTicket });
    }
  }

  // Validate active-execution.json
  const activeExecPath = resolve("project-governance/runtime/state/active-execution.json");
  if (existsSync(activeExecPath)) {
    const activeExec = loadJson<Record<string, unknown>>(activeExecPath);
    const expectedExecId = state.execution?.execution_id;
    const actualExecId = (activeExec.execution as Record<string, unknown>)?.execution_id;
    if (expectedExecId !== actualExecId) {
      drifts.push({ projection: "active-execution", field: "execution.execution_id", expected: expectedExecId, actual: actualExecId });
    }

    const expectedStatus = state.execution?.status;
    const actualStatus = (activeExec.execution as Record<string, unknown>)?.status;
    if (expectedStatus !== actualStatus) {
      drifts.push({ projection: "active-execution", field: "execution.status", expected: expectedStatus, actual: actualStatus });
    }
  }

  // Validate current-milestone.json
  const currentMilestonePath = resolve("project-governance/runtime/state/current-milestone.json");
  if (existsSync(currentMilestonePath)) {
    const currentMilestone = loadJson<Record<string, unknown>>(currentMilestonePath);
    const expectedId = state.milestone?.id;
    const actualId = (currentMilestone.active_milestone as Record<string, unknown>)?.id;
    if (expectedId !== actualId) {
      drifts.push({ projection: "current-milestone", field: "active_milestone.id", expected: expectedId, actual: actualId });
    }

    const expectedStatus = state.milestone?.status;
    const actualStatus = (currentMilestone.active_milestone as Record<string, unknown>)?.status;
    if (expectedStatus !== actualStatus) {
      drifts.push({ projection: "current-milestone", field: "active_milestone.status", expected: expectedStatus, actual: actualStatus });
    }
  }

  // Validate current-ticket.json
  const currentTicketPath = resolve("project-governance/runtime/state/current-ticket.json");
  if (existsSync(currentTicketPath)) {
    const currentTicket = loadJson<Record<string, unknown>>(currentTicketPath);
    const expectedId = state.ticket?.id;
    const actualId = (currentTicket.ticket as Record<string, unknown>)?.id;
    if (expectedId !== actualId) {
      drifts.push({ projection: "current-ticket", field: "ticket.id", expected: expectedId, actual: actualId });
    }

    const expectedStatus = state.ticket?.status;
    const actualStatus = (currentTicket.ticket as Record<string, unknown>)?.status;
    if (expectedStatus !== actualStatus) {
      drifts.push({ projection: "current-ticket", field: "ticket.status", expected: expectedStatus, actual: actualStatus });
    }
  }

  // Validate execution-lock.json
  const executionLockPath = resolve("project-governance/runtime/state/execution-lock.json");
  if (existsSync(executionLockPath)) {
    const executionLock = loadJson<Record<string, unknown>>(executionLockPath);
    const expectedLocked = state.lock?.locked;
    const actualLocked = executionLock.locked;
    if (expectedLocked !== actualLocked) {
      drifts.push({ projection: "execution-lock", field: "locked", expected: expectedLocked, actual: actualLocked });
    }

    const expectedExecId = state.lock?.execution_id;
    const actualExecId = executionLock.execution_id;
    if (expectedExecId !== actualExecId) {
      drifts.push({ projection: "execution-lock", field: "execution_id", expected: expectedExecId, actual: actualExecId });
    }
  }

  return { passed: drifts.length === 0, drifts };
}

function main(): void {
  console.log("Projection Drift Validation");
  console.log("===========================\n");

  const result = validateProjectionConsistency();

  if (!result.passed) {
    console.log(`❌ ${result.drifts.length} drift(s) detected:\n`);
    for (const drift of result.drifts) {
      console.log(`  [${drift.projection}] ${drift.field}`);
      console.log(`    Expected: ${JSON.stringify(drift.expected)}`);
      console.log(`    Actual:   ${JSON.stringify(drift.actual)}`);
    }
    process.exit(1);
  } else {
    console.log("✅ All projections consistent with canonical-state.");
    process.exit(0);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) { main(); }
