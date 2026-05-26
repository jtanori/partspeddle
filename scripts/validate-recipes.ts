#!/usr/bin/env tsx
/**
 * validate-recipes.ts
 * Recipe Registry Semantic Validator — T31.0 deliverable
 *
 * Validates schema, dependencies, capabilities, approval requirements,
 * rollback completeness, and replay declarations.
 */

import { loadRecipes, validateRecipes } from "./lib/recipe-registry.js";

export function validateRecipeRegistry(): { passed: boolean; errors: string[]; warnings: string[] } {
  const recipes = loadRecipes();
  const errors = validateRecipes(recipes);
  const critical = errors.filter((e) => e.severity === "error");
  const warnings = errors.filter((e) => e.severity === "warning");
  return {
    passed: critical.length === 0,
    errors: critical.map((e) => `[${e.code}] ${e.recipe}: ${e.message}`),
    warnings: warnings.map((e) => `[${e.code}] ${e.recipe}: ${e.message}`),
  };
}

function main(): void {
  console.log("Recipe Registry Semantic Validation");
  console.log("====================================\n");

  const result = validateRecipeRegistry();
  console.log(`Loaded ${result.errors.length + result.warnings.length} total issue(s)\n`);

  if (result.errors.length === 0 && result.warnings.length === 0) {
    console.log("✅ All recipes pass semantic validation.");
    process.exit(0);
  }

  if (result.errors.length > 0) {
    console.log(`❌ ${result.errors.length} critical error(s):`);
    for (const e of result.errors) {
      console.log(`  ${e}`);
    }
    console.log("");
  }

  if (result.warnings.length > 0) {
    console.log(`⚠️  ${result.warnings.length} warning(s):`);
    for (const w of result.warnings) {
      console.log(`  ${w}`);
    }
    console.log("");
  }

  console.log(`Summary: ${result.errors.length + result.warnings.length} issues`);

  if (result.errors.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) { main(); }
