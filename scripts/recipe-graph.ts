#!/usr/bin/env tsx
/**
 * recipe-graph.ts
 * Recipe Dependency Graph Builder — T31.0 deliverable
 *
 * Generates machine-readable dependency graphs for recipe orchestration.
 */

import { writeFileSync, mkdirSync } from "fs";
import { resolve, join } from "path";
import { loadRecipes, buildIndex } from "./lib/recipe-registry.js";

const GRAPH_PATH = resolve("project-governance/recipes/.index/recipe-dependency-graph.json");

function main(): void {
  const args = process.argv.slice(2);
  const format = args[0] || "json";

  console.log("Recipe Dependency Graph");
  console.log("=======================\n");

  const recipes = loadRecipes();
  const index = buildIndex(recipes);

  const nodes = Array.from(index.recipes.values()).map((r) => ({
    id: r.id,
    label: r.id,
    category: r.category,
    capabilities: r.capabilities,
    requiresApproval: r.requiresApproval,
    deterministic: r.determinism.deterministic,
    replaySafe: r.determinism.replaySafe,
  }));

  const edges: Array<{ source: string; target: string; type: string }> = [];
  for (const [id, deps] of index.dependencyGraph) {
    for (const dep of deps) {
      edges.push({ source: id, target: dep, type: "depends_on" });
    }
  }

  // Add blocks relationships
  for (const { recipe } of recipes) {
    if (recipe.dependencies?.blocks) {
      for (const blocked of recipe.dependencies.blocks) {
        edges.push({ source: recipe.id, target: blocked, type: "blocks" });
      }
    }
  }

  if (format === "json") {
    const graph = {
      directed: true,
      generated_at: new Date().toISOString(),
      nodes,
      edges,
    };
    mkdirSync(join(resolve("project-governance/recipes"), ".index"), { recursive: true });
    writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2) + "\n", "utf-8");
    console.log(`✅ Graph written to ${GRAPH_PATH}`);
    console.log(`   Nodes: ${nodes.length}`);
    console.log(`   Edges: ${edges.length}`);
  } else if (format === "mermaid") {
    const lines = ["graph TD;"];
    for (const node of nodes) {
      const safeId = node.id.replace(/[^a-zA-Z0-9_]/g, "_");
      lines.push(`  ${safeId}["${node.label}"]`);
    }
    for (const edge of edges) {
      const safeSrc = edge.source.replace(/[^a-zA-Z0-9_]/g, "_");
      const safeTgt = edge.target.replace(/[^a-zA-Z0-9_]/g, "_");
      lines.push(`  ${safeSrc} -->|${edge.type}| ${safeTgt}`);
    }
    console.log(lines.join("\n"));
  } else {
    console.log("Usage: tsx scripts/recipe-graph.ts [json|mermaid]");
    process.exit(1);
  }
}

main();
