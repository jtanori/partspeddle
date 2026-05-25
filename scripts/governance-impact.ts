#!/usr/bin/env tsx
/**
 * governance-impact.ts
 * Governance Impact Analysis Engine — T30.5 deliverable
 *
 * Predicts governance consequences before mutation.
 * Usage: tsx scripts/governance-impact.ts <target>
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { buildTopology, type GovernanceTopology } from "./lib/governance-topology.js";

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

interface ImpactReport {
  target: string;
  direct_dependents: string[];
  transitive_dependents: string[];
  protected_domains: string[];
  affected_invariants: string[];
  blast_radius_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

function analyzeImpact(topo: GovernanceTopology, target: string): ImpactReport {
  const targetId = target.includes(":") ? target : `script:${target}`;

  // Direct dependents: nodes that reference or depend on target
  const directEdges = topo.edges.filter((e) => e.target === targetId);
  const directDependents = directEdges.map((e) => e.source);

  // Transitive dependents: BFS backwards
  const transitive = new Set<string>();
  const queue = [targetId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const refs = topo.edges
      .filter((e) => e.target === current && (e.relationship === "depends_on" || e.relationship === "references" || e.relationship === "uses"))
      .map((e) => e.source);

    for (const ref of refs) {
      if (ref !== targetId) {
        transitive.add(ref);
      }
      queue.push(ref);
    }
  }

  // Protected domains: state domains this target protects
  const protectedDomains = topo.edges
    .filter((e) => e.source === targetId && e.relationship === "protects")
    .map((e) => e.target);

  // Affected invariants: validators that validate this target
  const affectedInvariants = topo.edges
    .filter((e) => e.target === targetId && e.relationship === "validates")
    .map((e) => e.source);

  // Blast radius score
  const totalNodes = topo.nodes.length;
  const blastRadius = directDependents.length + transitive.size;
  const score = totalNodes > 0 ? Math.round((blastRadius / totalNodes) * 100) : 0;

  let risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
  if (score > 40 || protectedDomains.length > 2) risk = "CRITICAL";
  else if (score > 20 || protectedDomains.length > 0) risk = "HIGH";
  else if (score > 5) risk = "MEDIUM";

  return {
    target: targetId,
    direct_dependents: directDependents,
    transitive_dependents: Array.from(transitive),
    protected_domains: protectedDomains,
    affected_invariants: affectedInvariants,
    blast_radius_score: score,
    risk_level: risk,
  };
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log("Governance Impact Analysis Engine");
    console.log("=================================\n");
    console.log("Usage: tsx scripts/governance-impact.ts <component>");
    console.log("");
    console.log("Analyzes the blast radius of mutating or removing a governance component.");
    process.exit(1);
  }

  const target = args[0];
  const topo = loadTopology();
  const report = analyzeImpact(topo, target);

  console.log(`Impact Analysis: ${report.target}`);
  console.log("=".repeat(50));
  console.log(`Risk Level:        ${report.risk_level}`);
  console.log(`Blast Radius:      ${report.blast_radius_score}% (${report.direct_dependents.length} direct, ${report.transitive_dependents.length} transitive)`);
  console.log("");

  if (report.direct_dependents.length > 0) {
    console.log("Direct Dependents:");
    for (const d of report.direct_dependents) console.log(`  • ${d}`);
    console.log("");
  }

  if (report.transitive_dependents.length > 0) {
    console.log("Transitive Dependents:");
    for (const t of report.transitive_dependents) console.log(`  • ${t}`);
    console.log("");
  }

  if (report.protected_domains.length > 0) {
    console.log("Protected Domains (will be unprotected):");
    for (const p of report.protected_domains) console.log(`  • ${p}`);
    console.log("");
  }

  if (report.affected_invariants.length > 0) {
    console.log("Affected Invariants:");
    for (const i of report.affected_invariants) console.log(`  • ${i}`);
    console.log("");
  }

  console.log("=".repeat(50));
  if (report.risk_level === "CRITICAL") {
    console.log("❌ CRITICAL: Mutation requires explicit governance approval.");
    process.exit(1);
  } else if (report.risk_level === "HIGH") {
    console.log("⚠️  HIGH: Review recommended before mutation.");
    process.exit(0);
  } else {
    console.log("✅ LOW/MEDIUM: Safe to proceed with standard validation.");
    process.exit(0);
  }
}

main();
