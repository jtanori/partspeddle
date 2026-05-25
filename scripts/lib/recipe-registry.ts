/**
 * recipe-registry.ts
 * Shared recipe registry library — T31.0 deliverable
 *
 * Loads, indexes, validates, and queries canonical recipes.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { resolve, join, dirname } from "path";

const RECIPE_DIR = resolve("project-governance/recipes");
const RECIPE_SCHEMA_PATH = resolve("meta/governance/schemas/recipe.schema.json");

export interface Recipe {
  id: string;
  version: string;
  category: string;
  description: string;
  capabilities: string[];
  determinism: {
    deterministic: boolean;
    idempotent: boolean;
    replaySafe: boolean;
    sideEffects?: string[];
  };
  inputs: Array<{
    name: string;
    type: string;
    required: boolean;
    default?: unknown;
    description?: string;
  }>;
  guards: Array<{
    invariant: string;
    behavior: string;
    description?: string;
  }>;
  steps: Array<{
    order: number;
    action: string;
    command: string;
    description?: string;
    timeout_seconds?: number;
  }>;
  emits: Array<{
    event_type: string;
    severity: string;
    category: string;
    payload_schema?: string;
  }>;
  rollback: Array<{
    order: number;
    action: string;
    command: string;
    description?: string;
  }>;
  requiresApproval: boolean;
  compatibility: {
    minimumRuntime: string;
    deprecated?: boolean;
    supersededBy?: string;
  };
  dependencies?: {
    invokes?: string[];
    depends_on?: string[];
    blocks?: string[];
    supersedes?: string[];
  };
  metadata?: {
    author?: string;
    created_at?: string;
    updated_at?: string;
    tags?: string[];
  };
}

export interface ValidationError {
  recipe: string;
  code: string;
  message: string;
  severity: "error" | "warning";
}

export interface RecipeIndex {
  recipes: Map<string, Recipe>;
  byCategory: Map<string, string[]>;
  byCapability: Map<string, string[]>;
  dependencyGraph: Map<string, string[]>;
  reverseDependencies: Map<string, string[]>;
}

function walkRecipes(dir: string, acc: Array<{ path: string; recipe: Recipe }> = []): Array<{ path: string; recipe: Recipe }> {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const st = statSync(fullPath);
    if (st.isDirectory()) {
      walkRecipes(fullPath, acc);
    } else if (entry.endsWith(".json")) {
      try {
        const recipe = JSON.parse(readFileSync(fullPath, "utf-8")) as Recipe;
        acc.push({ path: fullPath, recipe });
      } catch {
        // Skip invalid JSON
      }
    }
  }
  return acc;
}

export function loadRecipes(): Array<{ path: string; recipe: Recipe }> {
  if (!existsSync(RECIPE_DIR)) return [];
  return walkRecipes(RECIPE_DIR);
}

export function buildIndex(recipes: Array<{ path: string; recipe: Recipe }>): RecipeIndex {
  const index: RecipeIndex = {
    recipes: new Map(),
    byCategory: new Map(),
    byCapability: new Map(),
    dependencyGraph: new Map(),
    reverseDependencies: new Map(),
  };

  for (const { recipe } of recipes) {
    index.recipes.set(recipe.id, recipe);

    // Category index
    const catList = index.byCategory.get(recipe.category) ?? [];
    catList.push(recipe.id);
    index.byCategory.set(recipe.category, catList);

    // Capability index
    for (const cap of recipe.capabilities) {
      const capList = index.byCapability.get(cap) ?? [];
      capList.push(recipe.id);
      index.byCapability.set(cap, capList);
    }

    // Dependencies
    const deps = new Set<string>();
    const d = recipe.dependencies;
    if (d) {
      for (const dep of d.invokes ?? []) deps.add(dep);
      for (const dep of d.depends_on ?? []) deps.add(dep);
    }
    index.dependencyGraph.set(recipe.id, Array.from(deps));

    // Reverse dependencies
    for (const dep of deps) {
      const rev = index.reverseDependencies.get(dep) ?? [];
      if (!rev.includes(recipe.id)) {
        rev.push(recipe.id);
      }
      index.reverseDependencies.set(dep, rev);
    }
  }

  return index;
}

export function validateRecipes(recipes: Array<{ path: string; recipe: Recipe }>): ValidationError[] {
  const errors: ValidationError[] = [];
  const ids = new Set<string>();
  const idToPath = new Map<string, string>();

  // Load schema for basic validation
  let schema: Record<string, unknown> | null = null;
  if (existsSync(RECIPE_SCHEMA_PATH)) {
    schema = JSON.parse(readFileSync(RECIPE_SCHEMA_PATH, "utf-8")) as Record<string, unknown>;
  }

  // Pass 1: schema validation and duplicate ID detection
  for (const { path, recipe } of recipes) {
    // Duplicate ID
    if (ids.has(recipe.id)) {
      errors.push({
        recipe: recipe.id,
        code: "DUPLICATE_ID",
        message: `Duplicate recipe ID: ${recipe.id} (also at ${idToPath.get(recipe.id) ?? "unknown"})`,
        severity: "error",
      });
    } else {
      ids.add(recipe.id);
      idToPath.set(recipe.id, path);
    }

    // Required fields presence (lightweight since we have TS types)
    const required = ["id", "version", "category", "description", "capabilities", "determinism", "inputs", "guards", "steps", "emits", "rollback", "requiresApproval", "compatibility"];
    for (const field of required) {
      if (!(field in recipe)) {
        errors.push({
          recipe: recipe.id,
          code: "MISSING_FIELD",
          message: `Missing required field: ${field}`,
          severity: "error",
        });
      }
    }

    // Step ordering validation
    const orders = recipe.steps.map((s) => s.order).sort((a, b) => a - b);
    for (let i = 0; i < orders.length; i++) {
      if (orders[i] !== i + 1) {
        errors.push({
          recipe: recipe.id,
          code: "STEP_ORDER_GAP",
          message: `Step ordering gap or duplicate at position ${i + 1}`,
          severity: "error",
        });
        break;
      }
    }

    // Emit validation: mutating/destructive recipes MUST emit events
    const hasMutate = recipe.capabilities.includes("mutate") || recipe.capabilities.includes("destructive");
    if (hasMutate && recipe.emits.length === 0) {
      errors.push({
        recipe: recipe.id,
        code: "MUTATE_WITHOUT_EMIT",
        message: "Recipe with mutate/destructive capability must declare at least one emitted event",
        severity: "error",
      });
    }

    // Approval validation: destructive recipes MUST require approval
    const hasDestructive = recipe.capabilities.includes("destructive");
    if (hasDestructive && !recipe.requiresApproval) {
      errors.push({
        recipe: recipe.id,
        code: "DESTRUCTIVE_WITHOUT_APPROVAL",
        message: "Recipe with destructive capability must require approval",
        severity: "error",
      });
    }

    // Rollback completeness: mutating recipes SHOULD define rollback
    if (hasMutate && recipe.rollback.length === 0) {
      errors.push({
        recipe: recipe.id,
        code: "MISSING_ROLLBACK",
        message: "Recipe with mutate capability should define rollback steps",
        severity: "warning",
      });
    }

    // ReplaySafe consistency: warn if replaySafe without determinism
    // Non-deterministic recipes can be replaySafe if they emit sufficient events
    // to capture state during execution. Mutating non-deterministic recipes
    // should emit events to preserve replay integrity.
    if (recipe.determinism.replaySafe && !recipe.determinism.deterministic) {
      const isMutating = recipe.capabilities.includes("mutate") || recipe.capabilities.includes("destructive");
      if (isMutating && recipe.emits.length < 2) {
        errors.push({
          recipe: recipe.id,
          code: "REPLAY_WITHOUT_DETERMINISM",
          message: "Non-deterministic mutating recipe with replaySafe=true should emit at least 2 events to preserve replay integrity",
          severity: "warning",
        });
      } else {
        errors.push({
          recipe: recipe.id,
          code: "REPLAY_WITHOUT_DETERMINISM",
          message: "replaySafe=true without deterministic=true — ensure events capture execution variance",
          severity: "warning",
        });
      }
    }
  }

  // Pass 2: dependency graph validation
  for (const { recipe } of recipes) {
    const deps = recipe.dependencies;
    if (!deps) continue;

    for (const dep of deps.invokes ?? []) {
      if (!ids.has(dep)) {
        errors.push({
          recipe: recipe.id,
          code: "ORPHAN_DEPENDENCY",
          message: `Invokes unknown recipe: ${dep}`,
          severity: "error",
        });
      }
    }
    for (const dep of deps.depends_on ?? []) {
      if (!ids.has(dep)) {
        errors.push({
          recipe: recipe.id,
          code: "ORPHAN_DEPENDENCY",
          message: `Depends on unknown recipe: ${dep}`,
          severity: "error",
        });
      }
    }
    for (const dep of deps.blocks ?? []) {
      if (!ids.has(dep)) {
        errors.push({
          recipe: recipe.id,
          code: "ORPHAN_DEPENDENCY",
          message: `Blocks unknown recipe: ${dep}`,
          severity: "error",
        });
      }
    }
    for (const dep of deps.supersedes ?? []) {
      if (!ids.has(dep)) {
        errors.push({
          recipe: recipe.id,
          code: "ORPHAN_DEPENDENCY",
          message: `Supersedes unknown recipe: ${dep}`,
          severity: "error",
        });
      }
    }
  }

  // Pass 3: cycle detection
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function hasCycle(node: string, graph: Map<string, string[]>): boolean {
    visited.add(node);
    recStack.add(node);
    for (const neighbor of graph.get(node) ?? []) {
      if (!visited.has(neighbor) && hasCycle(neighbor, graph)) return true;
      if (recStack.has(neighbor)) return true;
    }
    recStack.delete(node);
    return false;
  }

  const graph = new Map<string, string[]>();
  for (const { recipe } of recipes) {
    const deps: string[] = [];
    if (recipe.dependencies) {
      deps.push(...(recipe.dependencies.invokes ?? []));
      deps.push(...(recipe.dependencies.depends_on ?? []));
    }
    graph.set(recipe.id, deps);
  }

  for (const id of ids) {
    if (!visited.has(id)) {
      if (hasCycle(id, graph)) {
        errors.push({
          recipe: id,
          code: "CYCLIC_DEPENDENCY",
          message: "Cyclic dependency detected in recipe graph",
          severity: "error",
        });
        break; // One cycle report is sufficient
      }
    }
  }

  return errors;
}

export function planDryRun(recipe: Recipe, _inputs: Record<string, unknown> = {}): {
  steps: Array<{ order: number; action: string; command: string; wouldExecute: boolean }>;
  predictedEvents: string[];
  affectedArtifacts: string[];
  requiredApprovals: boolean;
  rollbackAvailable: boolean;
  estimatedDurationSeconds: number;
} {
  const steps = recipe.steps.map((s) => ({
    ...s,
    wouldExecute: true,
  }));

  const predictedEvents = recipe.emits.map((e) => e.event_type);
  const affectedArtifacts = recipe.determinism.sideEffects ?? [];
  const requiredApprovals = recipe.requiresApproval;
  const rollbackAvailable = recipe.rollback.length > 0;
  const estimatedDurationSeconds = recipe.steps.reduce((sum, s) => sum + (s.timeout_seconds ?? 30), 0);

  return { steps, predictedEvents, affectedArtifacts, requiredApprovals, rollbackAvailable, estimatedDurationSeconds };
}
