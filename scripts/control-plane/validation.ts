/**
 * control-plane/validation.ts
 * Execution guard layer — T31.3b deliverable
 *
 * Validates intents against schemas, policies, locks, and dependencies
 * BEFORE any approval or execution.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { loadRecipes } from "../lib/recipe-registry.js";
import type { IntentRecord } from "./intents.js";

const CANONICAL_STATE = resolve("meta/state/canonical-state.json");
const LOCK_PATH = resolve("project-governance/runtime/state/execution-lock.json");

export interface ValidationResult {
  passed: boolean;
  guards_checked: string[];
  violations: string[];
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

export function validateIntent(intent: IntentRecord): ValidationResult {
  const violations: string[] = [];
  const guards: string[] = [];

  // 1. Schema validation: recipe exists
  guards.push("RECIPE_EXISTS");
  const recipes = loadRecipes();
  const recipe = recipes.find((r) => r.recipe.id === intent.recipe_id);
  if (!recipe) {
    violations.push(`Unknown recipe: ${intent.recipe_id}`);
  }

  // 2. Policy validation: action class restrictions
  guards.push("ACTION_CLASS_POLICY");
  if (recipe) {
    const actionClass = recipe.recipe.actionClass ?? recipe.recipe.category;
    const mutatingClasses = ["recovery", "destructive", "orchestration"];
    if (mutatingClasses.includes(actionClass) && !intent.dry_run) {
      // Mutating actions require clean worktree
      const canonical = readJson<Record<string, unknown>>(CANONICAL_STATE);
      const repo = canonical?.repository as Record<string, unknown>;
      if (repo && !repo.worktree_clean) {
        violations.push("Worktree must be clean for mutating actions");
      }
    }
  }

  // 3. Lock validation: execution state
  guards.push("LOCK_VALIDATION");
  if (recipe) {
    const actionClass = recipe.recipe.actionClass ?? recipe.recipe.category;
    const lock = readJson<Record<string, unknown>>(LOCK_PATH);
    const locked = lock?.locked ?? false;

    if (locked) {
      // Destructive and orchestration actions cannot run while locked
      if (["destructive", "orchestration"].includes(actionClass)) {
        violations.push("Execution lock active — destructive/orchestration actions blocked");
      }
    }
  }

  // 4. Dependency validation: required inputs
  guards.push("INPUT_VALIDATION");
  if (recipe) {
    for (const input of recipe.recipe.inputs) {
      if (input.required && !(input.name in (intent.parameters ?? {})) && input.default === undefined) {
        violations.push(`Missing required input: ${input.name}`);
      }
    }
  }

  return {
    passed: violations.length === 0,
    guards_checked: guards,
    violations,
  };
}
