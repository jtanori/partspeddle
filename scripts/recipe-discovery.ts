#!/usr/bin/env tsx
/**
 * recipe-discovery.ts
 * Recipe Registry Discovery & Index — T31.0 deliverable
 *
 * Scans, indexes, and queries the canonical recipe registry.
 */

import { writeFileSync, mkdirSync } from "fs";
import { resolve, join } from "path";
import { loadRecipes, buildIndex } from "./lib/recipe-registry.js";

const INDEX_PATH = resolve("project-governance/recipes/.index/recipe-index.json");

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0] || "list";

  console.log("Recipe Registry Discovery");
  console.log("=========================\n");

  const recipes = loadRecipes();
  const index = buildIndex(recipes);

  if (command === "list") {
    console.log(`Recipes: ${recipes.length}\n`);
    for (const { recipe } of recipes) {
      const caps = recipe.capabilities.join(", ");
      const approval = recipe.requiresApproval ? "🔒 approval" : "✅ auto";
      console.log(`  ${recipe.id} (${recipe.version}) [${recipe.category}] — ${caps} — ${approval}`);
    }
  } else if (command === "category") {
    const cat = args[1];
    if (!cat) {
      console.log("Categories:");
      for (const [c, ids] of index.byCategory) {
        console.log(`  ${c}: ${ids.length} recipe(s)`);
      }
    } else {
      const ids = index.byCategory.get(cat) ?? [];
      console.log(`${cat}: ${ids.length} recipe(s)`);
      for (const id of ids) {
        const r = index.recipes.get(id)!;
        console.log(`  ${id} — ${r.description.substring(0, 60)}...`);
      }
    }
  } else if (command === "capability") {
    const cap = args[1];
    if (!cap) {
      console.log("Capabilities:");
      for (const [c, ids] of index.byCapability) {
        console.log(`  ${c}: ${ids.length} recipe(s)`);
      }
    } else {
      const ids = index.byCapability.get(cap) ?? [];
      console.log(`${cap}: ${ids.length} recipe(s)`);
      for (const id of ids) {
        console.log(`  ${id}`);
      }
    }
  } else if (command === "show") {
    const id = args[1];
    const recipe = index.recipes.get(id);
    if (!recipe) {
      console.log(`Recipe not found: ${id}`);
      process.exit(1);
    }
    console.log(JSON.stringify(recipe, null, 2));
  } else if (command === "index") {
    const indexData = {
      generated_at: new Date().toISOString(),
      recipe_count: recipes.length,
      byCategory: Object.fromEntries(index.byCategory),
      byCapability: Object.fromEntries(index.byCapability),
      dependencyGraph: Object.fromEntries(index.dependencyGraph),
    };
    mkdirSync(join(resolve("project-governance/recipes"), ".index"), { recursive: true });
    writeFileSync(INDEX_PATH, JSON.stringify(indexData, null, 2) + "\n", "utf-8");
    console.log(`✅ Index written to ${INDEX_PATH}`);
  } else {
    console.log("Usage: tsx scripts/recipe-discovery.ts <command> [arg]");
    console.log("");
    console.log("Commands:");
    console.log("  list                List all recipes");
    console.log("  category [name]     List recipes by category");
    console.log("  capability [name]   List recipes by capability");
    console.log("  show <id>           Show full recipe JSON");
    console.log("  index               Build and persist recipe index");
    process.exit(1);
  }
}

main();
