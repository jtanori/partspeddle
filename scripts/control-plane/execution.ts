/**
 * control-plane/execution.ts
 * Execution orchestration — T31.3b deliverable
 *
 * Invokes recipes, captures output, and manages execution state.
 */

import { execSync } from "child_process";
import type { IntentRecord } from "./intents.js";

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  startedAt: string;
  completedAt: string;
}

export function executeRecipe(intent: IntentRecord): ExecutionResult {
  const startedAt = new Date().toISOString();

  if (intent.dry_run) {
    return {
      success: true,
      stdout: `[DRY-RUN] Would execute: ${intent.recipe_id}`,
      stderr: "",
      exitCode: 0,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  // Map recipe IDs to npm commands
  const commandMap: Record<string, string> = {
    enforcement_validate_all: "npm run enforce:run",
    healing_sync_projections: "npm run heal:run",
    healing_self_heal_run: "npm run heal:run",
    diagnostics_health_check: "npm run diagnostics:health",
    diagnostics_suggest_next_actions: "npm run suggestions:generate",
    orchestration_milestone_close: "echo 'milestone-close requires manual orchestration'",
  };

  const cmd = commandMap[intent.recipe_id];
  if (!cmd) {
    return {
      success: false,
      stdout: "",
      stderr: `No command mapping for recipe: ${intent.recipe_id}`,
      exitCode: 1,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  try {
    const stdout = execSync(cmd, {
      encoding: "utf-8",
      timeout: 180000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return {
      success: true,
      stdout,
      stderr: "",
      exitCode: 0,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      success: false,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? String(err),
      exitCode: e.status ?? 1,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }
}
