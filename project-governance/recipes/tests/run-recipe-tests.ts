#!/usr/bin/env tsx
/**
 * run-recipe-tests.ts
 * Integration tests for recipe execution framework.
 */
import { existsSync, readFileSync, rmSync, readdirSync } from "fs";
import { resolve } from "path";
import { executeRecipe, loadRecipe, validateRecipeAgainstSchema, checkPrerequisites } from "../../../scripts/execute-recipe.js";
import { generateAllReflections, loadRecipes, generateMarkdown } from "../../../scripts/generate-recipe-md.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e: unknown) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e instanceof Error ? e.message : String(e)}`);
    failed++;
  }
}

console.log("Running Recipe Framework Tests...\n");

// Clean reflections
const REFL_DIR = resolve("project-governance/recipes");
if (existsSync(REFL_DIR)) {
  const files = readdirSync(REFL_DIR).filter((f: string) => f.endsWith(".md"));
  for (const f of files) rmSync(resolve(REFL_DIR, f));
}

// ── Schema Tests ──

test("recipe.schema.json exists and is valid JSON", () => {
  const schema = JSON.parse(readFileSync(resolve("meta/governance/recipes/schema/recipe.schema.json"), "utf-8"));
  if (typeof schema !== "object" || schema === null) throw new Error("Invalid schema");
});

// ── Recipe Loading Tests ──

test("loadRecipes returns recipes from all 7 categories", () => {
  const recipes = loadRecipes();
  const categories = new Set(recipes.map(r => r.category));
  const required = ["planning", "implementation", "recovery", "investigations", "runtime-health", "governance-repair", "deployment-readiness"];
  for (const c of required) {
    if (!categories.has(c)) throw new Error(`Missing category: ${c}`);
  }
});

test("each recipe validates against schema", () => {
  const recipes = loadRecipes();
  if (recipes.length === 0) throw new Error("No recipes loaded");
  for (const r of recipes) {
    const result = validateRecipeAgainstSchema(r);
    if (!result.valid) throw new Error(`${r.id}: ${result.errors.join(", ")}`);
  }
});

test("each recipe has prerequisites", () => {
  const recipes = loadRecipes();
  for (const r of recipes) {
    if (!Array.isArray(r.prerequisites) || r.prerequisites.length === 0) {
      throw new Error(`${r.id}: missing prerequisites`);
    }
  }
});

test("each recipe has steps", () => {
  const recipes = loadRecipes();
  for (const r of recipes) {
    if (!Array.isArray(r.steps) || r.steps.length === 0) {
      throw new Error(`${r.id}: missing steps`);
    }
  }
});

test("state-mutating recipes have rollback guidance", () => {
  const recipes = loadRecipes();
  const mutating = ["planning", "implementation", "deployment-readiness"];
  for (const r of recipes) {
    if (mutating.includes(r.category) && (!r.rollback || !r.rollback.required)) {
      throw new Error(`${r.id}: state-mutating recipe missing rollback`);
    }
  }
});

test("non-trivial recipes have recovery paths", () => {
  const recipes = loadRecipes();
  for (const r of recipes) {
    if (r.steps.length > 2 && (!r.recovery || !r.recovery.steps || r.recovery.steps.length === 0)) {
      throw new Error(`${r.id}: non-trivial recipe missing recovery path`);
    }
  }
});

// ── Execution Tests ──

test("executeRecipe validates prerequisites before execution", () => {
  const result = executeRecipe("validate-governance-health");
  if (!result.prerequisites_passed) throw new Error("Prerequisites should pass");
});

test("executeRecipe fails for missing recipe", () => {
  const result = executeRecipe("nonexistent-recipe");
  if (result.success) throw new Error("Should fail for missing recipe");
});

test("executeRecipe counts steps correctly", () => {
  const result = executeRecipe("check-runtime-health");
  if (result.steps_total === 0) throw new Error("Expected steps");
  if (result.steps_executed !== result.steps_total) throw new Error("Not all steps executed");
});

// ── Markdown Reflection Tests ──

test("generateMarkdown produces valid markdown", () => {
  const recipes = loadRecipes();
  const md = generateMarkdown(recipes[0]);
  if (!md.includes("# ")) throw new Error("Missing header");
  if (!md.includes("Generated from canonical JSON")) throw new Error("Missing footer");
});

test("generateAllReflections creates files for all recipes", () => {
  const result = generateAllReflections();
  const recipes = loadRecipes();
  if (result.count !== recipes.length) throw new Error(`Expected ${recipes.length}, got ${result.count}`);
  for (const path of result.generated) {
    if (!existsSync(path)) throw new Error(`Missing: ${path}`);
  }
});

test("markdown reflections are deterministic", () => {
  const recipes = loadRecipes();
  const md1 = generateMarkdown(recipes[0]);
  const md2 = generateMarkdown(recipes[0]);
  if (md1 !== md2) throw new Error("Markdown not deterministic");
});

// ── Category Coverage ──

test("7 recipe categories are defined", () => {
  const recipes = loadRecipes();
  const categories = new Set(recipes.map(r => r.category));
  if (categories.size < 7) throw new Error(`Only ${categories.size} categories, expected 7`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
