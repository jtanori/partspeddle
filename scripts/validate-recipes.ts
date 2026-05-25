#!/usr/bin/env tsx
/**
 * validate-recipes.ts
 * Recipe Registry Semantic Validator — T31.0 deliverable
 *
 * Validates schema, dependencies, capabilities, approval requirements,
 * rollback completeness, and replay declarations.
 */

import { loadRecipes, validateRecipes } from "./lib/recipe-registry.js";

function main(): void {
  console.log("Recipe Registry Semantic Validation");
  console.log("====================================\n");

  const recipes = loadRecipes();
  console.log(`Loaded ${recipes.length} recipe(s)\n`);

  const errors = validateRecipes(recipes);

  const critical = errors.filter((e) => e.severity === "error");
  const warnings = errors.filter((e) => e.severity === "warning");

  if (errors.length === 0) {
    console.log("✅ All recipes pass semantic validation.");
    process.exit(0);
  }

  if (critical.length > 0) {
    console.log(`❌ ${critical.length} critical error(s):`);
    for (const e of critical) {
      console.log(`  [${e.code}] ${e.recipe}: ${e.message}`);
    }
    console.log("");
  }

  if (warnings.length > 0) {
    console.log(`⚠️  ${warnings.length} warning(s):`);
    for (const e of warnings) {
      console.log(`  [${e.code}] ${e.recipe}: ${e.message}`);
    }
    console.log("");
  }

  console.log(`Summary: ${recipes.length} recipes, ${critical.length} errors, ${warnings.length} warnings`);

  if (critical.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main();
