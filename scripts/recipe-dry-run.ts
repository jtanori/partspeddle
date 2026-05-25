#!/usr/bin/env tsx
/**
 * recipe-dry-run.ts
 * Recipe Dry-Run Planner — T31.0 deliverable
 *
 * Produces execution plans without mutating runtime state.
 */

import { loadRecipes, buildIndex, planDryRun } from "./lib/recipe-registry.js";

function main(): void {
  const args = process.argv.slice(2);
  const recipeId = args[0];

  console.log("Recipe Dry-Run Planner");
  console.log("======================\n");

  if (!recipeId) {
    console.log("Usage: tsx scripts/recipe-dry-run.ts <recipe_id> [inputs_json]");
    console.log("");
    console.log("Examples:");
    console.log("  tsx scripts/recipe-dry-run.ts diagnostics_health_check");
    console.log("  tsx scripts/recipe-dry-run.ts orchestration_milestone_close '{\"milestone_id\":\"M31\"}'");
    process.exit(1);
  }

  const recipes = loadRecipes();
  const index = buildIndex(recipes);
  const recipe = index.recipes.get(recipeId);

  if (!recipe) {
    console.log(`❌ Recipe not found: ${recipeId}`);
    console.log("Available recipes:");
    for (const id of index.recipes.keys()) {
      console.log(`  ${id}`);
    }
    process.exit(1);
  }

  const inputsRaw = args[1];
  const inputs = inputsRaw ? JSON.parse(inputsRaw) : {};
  const plan = planDryRun(recipe, inputs);

  console.log(`Recipe:     ${recipe.id} (${recipe.version})`);
  console.log(`Category:   ${recipe.category}`);
  console.log(`Approval:   ${plan.requiredApprovals ? "🔒 REQUIRED" : "✅ Auto-approved"}`);
  console.log(`Rollback:   ${plan.rollbackAvailable ? "✅ Available" : "❌ None"}`);
  console.log(`Duration:   ~${plan.estimatedDurationSeconds}s`);
  console.log(`Capabilities: ${recipe.capabilities.join(", ")}`);
  console.log(`Side effects: ${recipe.determinism.sideEffects?.join(", ") || "none"}`);
  console.log("");

  console.log("Predicted Events:");
  for (const evt of plan.predictedEvents) {
    console.log(`  • ${evt}`);
  }
  console.log("");

  if (plan.affectedArtifacts.length > 0) {
    console.log("Affected Artifacts:");
    for (const art of plan.affectedArtifacts) {
      console.log(`  • ${art}`);
    }
    console.log("");
  }

  console.log("Execution Steps:");
  for (const step of plan.steps) {
    console.log(`  ${step.order}. [${step.action}] ${step.command}`);
    if (step.description) {
      console.log(`     ${step.description}`);
    }
  }
  console.log("");

  if (recipe.rollback.length > 0) {
    console.log("Rollback Steps:");
    for (const step of recipe.rollback) {
      console.log(`  ${step.order}. [${step.action}] ${step.command}`);
      if (step.description) {
        console.log(`     ${step.description}`);
      }
    }
    console.log("");
  }

  if (plan.requiredApprovals) {
    console.log("⚠️  This recipe requires explicit approval before execution.");
  }
}

main();
