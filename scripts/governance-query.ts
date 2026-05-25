#!/usr/bin/env tsx
/**
 * governance-query.ts
 * Governance Query Layer — T30.3 deliverable
 *
 * Usage:
 *   tsx scripts/governance-query.ts <query_type> [target]
 *
 * Query types:
 *   invariants-protect <target>    — What invariants protect a state domain?
 *   depends-on <target>            — What depends on a component?
 *   impact <target>                — What breaks if a component fails?
 *   authority <target>             — Who owns a component?
 *   subsystem <id>                 — List components in a subsystem
 *   graph                          — Output full topology JSON
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { buildTopology, type GovernanceTopology, type TopologyEdge } from "./lib/governance-topology.js";

const TOPOLOGY_PATH = resolve("meta/governance/topology/governance-topology.json");

function loadTopology(): GovernanceTopology {
  if (existsSync(TOPOLOGY_PATH)) {
    return JSON.parse(readFileSync(TOPOLOGY_PATH, "utf-8")) as GovernanceTopology;
  }
  const topo = buildTopology();
  const { saveTopology } = require("./lib/governance-topology.js");
  saveTopology(topo, TOPOLOGY_PATH);
  return topo;
}

function findInvariantsProtecting(topo: GovernanceTopology, target: string): string[] {
  const targetId = target.includes(":") ? target : `state_domain:${target}`;
  return topo.edges
    .filter((e) => e.target === targetId && e.relationship === "protects")
    .map((e) => e.source);
}

function findDependents(topo: GovernanceTopology, target: string): string[] {
  const targetId = target.includes(":") ? target : `script:${target}`;
  return topo.edges
    .filter((e) => e.target === targetId && (e.relationship === "depends_on" || e.relationship === "references"))
    .map((e) => e.source);
}

function findImpact(topo: GovernanceTopology, target: string): { direct: string[]; transitive: string[] } {
  const targetId = target.includes(":") ? target : `script:${target}`;
  const direct = topo.edges
    .filter((e) => e.source === targetId && e.relationship !== "contains")
    .map((e) => e.target);

  // Transitive: walk backwards from targets that depend on this
  const transitive = new Set<string>();
  const queue = [targetId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const dependents = topo.edges
      .filter((e) => e.target === current && (e.relationship === "depends_on" || e.relationship === "references" || e.relationship === "uses"))
      .map((e) => e.source);

    for (const dep of dependents) {
      transitive.add(dep);
      queue.push(dep);
    }
  }

  return { direct, transitive: Array.from(transitive) };
}

function findAuthority(topo: GovernanceTopology, target: string): string {
  const targetId = target.includes(":") ? target : `script:${target}`;
  const node = topo.nodes.find((n) => n.id === targetId);
  return node?.authority || "unknown";
}

function findSubsystem(topo: GovernanceTopology, id: string): GovernanceTopology["subsystems"][0] | undefined {
  return topo.subsystems.find((s) => s.id === id || s.name === id);
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log("Governance Query Layer");
    console.log("======================\n");
    console.log("Usage: tsx scripts/governance-query.ts <query> [target]");
    console.log("");
    console.log("Queries:");
    console.log("  invariants-protect <domain>   — Invariants protecting a state domain");
    console.log("  depends-on <component>        — Components depending on target");
    console.log("  impact <component>            — Blast radius if target fails");
    console.log("  authority <component>         — Authority owner of component");
    console.log("  subsystem <id>                — Components in subsystem");
    console.log("  graph                         — Full topology JSON");
    process.exit(1);
  }

  const [query, target] = args;
  const topo = loadTopology();

  switch (query) {
    case "invariants-protect": {
      if (!target) {
        console.error("Usage: governance-query.ts invariants-protect <domain>");
        process.exit(1);
      }
      const protectors = findInvariantsProtecting(topo, target);
      console.log(`Invariants protecting ${target}:`);
      for (const p of protectors) {
        console.log(`  ${p}`);
      }
      if (protectors.length === 0) console.log("  (none found)");
      break;
    }

    case "depends-on": {
      if (!target) {
        console.error("Usage: governance-query.ts depends-on <component>");
        process.exit(1);
      }
      const dependents = findDependents(topo, target);
      console.log(`Components depending on ${target}:`);
      for (const d of dependents) {
        console.log(`  ${d}`);
      }
      if (dependents.length === 0) console.log("  (none found)");
      break;
    }

    case "impact": {
      if (!target) {
        console.error("Usage: governance-query.ts impact <component>");
        process.exit(1);
      }
      const impact = findImpact(topo, target);
      console.log(`Impact analysis for ${target}:`);
      console.log(`  Direct dependents: ${impact.direct.length}`);
      for (const d of impact.direct) console.log(`    ${d}`);
      console.log(`  Transitive dependents: ${impact.transitive.length}`);
      for (const t of impact.transitive) console.log(`    ${t}`);
      break;
    }

    case "authority": {
      if (!target) {
        console.error("Usage: governance-query.ts authority <component>");
        process.exit(1);
      }
      const auth = findAuthority(topo, target);
      console.log(`Authority for ${target}: ${auth}`);
      break;
    }

    case "subsystem": {
      if (!target) {
        console.error("Usage: governance-query.ts subsystem <id>");
        process.exit(1);
      }
      const sub = findSubsystem(topo, target);
      if (!sub) {
        console.log(`Subsystem ${target} not found`);
        process.exit(1);
      }
      console.log(`Subsystem: ${sub.name} (${sub.id})`);
      console.log(`Authority: ${sub.authority}`);
      console.log(`Components:`);
      for (const c of sub.components) console.log(`  ${c}`);
      break;
    }

    case "graph": {
      console.log(JSON.stringify(topo, null, 2));
      break;
    }

    default:
      console.error(`Unknown query: ${query}`);
      process.exit(1);
  }
}

main();
