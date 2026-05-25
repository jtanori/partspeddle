#!/usr/bin/env tsx
/**
 * recipe-cli.ts
 * Unified Recipe CLI — T31.0 deliverable
 *
 * Single entry point for recipe registry operations.
 */

import { loadRecipes, buildIndex, validateRecipes, planDryRun } from "./lib/recipe-registry.js";

function printUsage(): void {
  console.log("Recipe CLI — Unified Recipe Registry Interface");
  console.log("===============================================\n");
  console.log("Usage: npm run recipe <command> [args...]\n");
  console.log("Commands:");
  console.log("  validate              Run semantic validation on all recipes");
  console.log("  list                  List all recipes with capabilities");
  console.log("  show <id>             Display full recipe JSON");
  console.log("  category [name]       List recipes by category");
  console.log("  capability [name]     List recipes by capability class");
  console.log("  graph [json|mermaid]  Generate dependency graph");
  console.log("  dry-run <id> [inputs] Plan execution without mutating state");
  console.log("  index                 Build and persist recipe index");
  console.log("  inspect <id>          Show recipe summary + dry-run plan");
  console.log("");
  console.log("Examples:");
  console.log("  npm run recipe validate");
  console.log("  npm run recipe list");
  console.log("  npm run recipe show diagnostics_health_check");
  console.log("  npm run recipe dry-run enforcement_validate_all");
  console.log("  npm run recipe inspect orchestration_milestone_close");
}

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    printUsage();
    process.exit(1);
  }

  const recipes = loadRecipes();
  const index = buildIndex(recipes);

  switch (command) {
    case "validate": {
      const errors = validateRecipes(recipes);
      const critical = errors.filter((e) => e.severity === "error");
      const warnings = errors.filter((e) => e.severity === "warning");

      console.log(`Recipe Registry Validation: ${recipes.length} recipes`);
      console.log("=".repeat(50));

      if (errors.length === 0) {
        console.log("✅ All recipes pass semantic validation.");
        process.exit(0);
      }

      if (critical.length > 0) {
        console.log(`\n❌ ${critical.length} critical error(s):`);
        for (const e of critical) {
          console.log(`  [${e.code}] ${e.recipe}: ${e.message}`);
        }
      }

      if (warnings.length > 0) {
        console.log(`\n⚠️  ${warnings.length} warning(s):`);
        for (const e of warnings) {
          console.log(`  [${e.code}] ${e.recipe}: ${e.message}`);
        }
      }

      console.log(`\nSummary: ${critical.length} errors, ${warnings.length} warnings`);
      process.exit(critical.length > 0 ? 1 : 0);
    }

    case "list": {
      console.log(`Recipes: ${recipes.length}\n`);
      for (const { recipe } of recipes) {
        const caps = recipe.capabilities.join(", ");
        const approval = recipe.requiresApproval ? "🔒" : "✅";
        const det = recipe.determinism.deterministic ? "det" : "non-det";
        const idem = recipe.determinism.idempotent ? "idempotent" : "stateful";
        console.log(`  ${approval} ${recipe.id} [${recipe.category}] — ${caps} — ${det}, ${idem}`);
      }
      break;
    }

    case "show": {
      const id = args[1];
      const recipe = index.recipes.get(id);
      if (!recipe) {
        console.log(`❌ Recipe not found: ${id}`);
        process.exit(1);
      }
      console.log(JSON.stringify(recipe, null, 2));
      break;
    }

    case "category": {
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
          console.log(`  ${id} — ${r.description.substring(0, 60)}${r.description.length > 60 ? "..." : ""}`);
        }
      }
      break;
    }

    case "capability": {
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
      break;
    }

    case "graph": {
      const fmt = args[1] || "json";
      if (fmt === "json") {
        const nodes = Array.from(index.recipes.values()).map((r) => ({
          id: r.id,
          category: r.category,
          capabilities: r.capabilities,
          requiresApproval: r.requiresApproval,
        }));
        const edges: Array<{ source: string; target: string; type: string }> = [];
        for (const [id, deps] of index.dependencyGraph) {
          for (const dep of deps) edges.push({ source: id, target: dep, type: "depends_on" });
        }
        for (const { recipe } of recipes) {
          if (recipe.dependencies?.blocks) {
            for (const b of recipe.dependencies.blocks) edges.push({ source: recipe.id, target: b, type: "blocks" });
          }
        }
        console.log(JSON.stringify({ directed: true, nodes, edges }, null, 2));
      } else if (fmt === "mermaid") {
        console.log("graph TD;");
        for (const id of index.recipes.keys()) {
          const safe = id.replace(/[^a-zA-Z0-9_]/g, "_");
          console.log(`  ${safe}["${id}"]`);
        }
        for (const [id, deps] of index.dependencyGraph) {
          const safeSrc = id.replace(/[^a-zA-Z0-9_]/g, "_");
          for (const dep of deps) {
            const safeTgt = dep.replace(/[^a-zA-Z0-9_]/g, "_");
            console.log(`  ${safeSrc} --> ${safeTgt}`);
          }
        }
      } else {
        console.log("Usage: recipe graph [json|mermaid]");
        process.exit(1);
      }
      break;
    }

    case "dry-run": {
      const id = args[1];
      const inputsRaw = args[2];
      const recipe = index.recipes.get(id);
      if (!recipe) {
        console.log(`❌ Recipe not found: ${id}`);
        process.exit(1);
      }
      const inputs = inputsRaw ? JSON.parse(inputsRaw) : {};
      const plan = planDryRun(recipe, inputs);

      console.log(`Dry-Run: ${recipe.id}`);
      console.log("=".repeat(40));
      console.log(`Approval: ${plan.requiredApprovals ? "🔒 REQUIRED" : "✅ auto"}`);
      console.log(`Rollback: ${plan.rollbackAvailable ? "✅ available" : "❌ none"}`);
      console.log(`Duration: ~${plan.estimatedDurationSeconds}s`);
      console.log(`Events:   ${plan.predictedEvents.join(", ") || "none"}`);
      console.log(`Artifacts:${plan.affectedArtifacts.join(", ") || " none"}`);
      console.log("");
      console.log("Steps:");
      for (const s of plan.steps) {
        console.log(`  ${s.order}. [${s.action}] ${s.command}`);
      }
      break;
    }

    case "inspect": {
      const id = args[1];
      const recipe = index.recipes.get(id);
      if (!recipe) {
        console.log(`❌ Recipe not found: ${id}`);
        process.exit(1);
      }
      const plan = planDryRun(recipe, {});

      console.log(`Recipe:       ${recipe.id} (${recipe.version})`);
      console.log(`Category:     ${recipe.category}`);
      console.log(`Description:  ${recipe.description}`);
      console.log(`Capabilities: ${recipe.capabilities.join(", ")}`);
      console.log(`Determinism:  deterministic=${recipe.determinism.deterministic}, idempotent=${recipe.determinism.idempotent}, replaySafe=${recipe.determinism.replaySafe}`);
      console.log(`Side Effects: ${recipe.determinism.sideEffects?.join(", ") || "none"}`);
      console.log(`Approval:     ${recipe.requiresApproval ? "🔒 REQUIRED" : "✅ auto"}`);
      console.log(`Steps:        ${recipe.steps.length}`);
      console.log(`Rollback:     ${recipe.rollback.length > 0 ? "✅ defined" : "❌ none"}`);
      console.log(`Emits:        ${recipe.emits.length} event type(s)`);
      console.log(`Duration:     ~${plan.estimatedDurationSeconds}s`);

      if (recipe.dependencies) {
        const d = recipe.dependencies;
        if (d.invokes?.length) console.log(`Invokes:      ${d.invokes.join(", ")}`);
        if (d.depends_on?.length) console.log(`Depends on:   ${d.depends_on.join(", ")}`);
        if (d.blocks?.length) console.log(`Blocks:       ${d.blocks.join(", ")}`);
      }

      if (recipe.guards.length > 0) {
        console.log("\nGuards:");
        for (const g of recipe.guards) {
          console.log(`  [${g.behavior.toUpperCase()}] ${g.invariant}: ${g.description || ""}`);
        }
      }
      break;
    }

    default: {
      console.log(`Unknown command: ${command}\n`);
      printUsage();
      process.exit(1);
    }
  }
}

main();
