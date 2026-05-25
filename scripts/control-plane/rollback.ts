/**
 * control-plane/rollback.ts
 * Rollback handling — T31.3b deliverable
 *
 * Executes rollback steps when execution fails.
 */

import { execSync } from "child_process";
import { loadRecipes } from "../lib/recipe-registry.js";
import type { IntentRecord } from "./intents.js";

export interface RollbackResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

export function executeRollback(intent: IntentRecord): RollbackResult {
  if (intent.dry_run) {
    return { success: true, stdout: "[DRY-RUN] Rollback simulated", stderr: "" };
  }

  const recipes = loadRecipes();
  const recipe = recipes.find((r) => r.recipe.id === intent.recipe_id)?.recipe;

  if (!recipe || recipe.rollback.length === 0) {
    return { success: false, stdout: "", stderr: "No rollback defined for this recipe" };
  }

  const outputs: string[] = [];
  const errors: string[] = [];

  for (const step of recipe.rollback.sort((a, b) => a.order - b.order)) {
    try {
      const out = execSync(step.command, {
        encoding: "utf-8",
        timeout: 60000,
        stdio: ["pipe", "pipe", "pipe"],
      });
      outputs.push(`[${step.action}] ${out.trim()}`);
    } catch (err) {
      const e = err as { stderr?: string };
      errors.push(`[${step.action}] ${e.stderr ?? String(err)}`);
    }
  }

  return {
    success: errors.length === 0,
    stdout: outputs.join("\n"),
    stderr: errors.join("\n"),
  };
}
