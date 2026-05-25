#!/usr/bin/env tsx
/**
 * governance-visualize.ts
 * Governance Visualization Layer — T30.4 deliverable
 *
 * Generates architecture diagrams in Mermaid, Graphviz DOT, and JSON graph formats.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { resolve, join, dirname } from "path";
import { buildTopology, type GovernanceTopology } from "./lib/governance-topology.js";

const TOPOLOGY_PATH = resolve("meta/governance/topology/governance-topology.json");
const OUTPUT_DIR = resolve("project-governance/maps");

function loadTopology(): GovernanceTopology {
  if (existsSync(TOPOLOGY_PATH)) {
    return JSON.parse(readFileSync(TOPOLOGY_PATH, "utf-8")) as GovernanceTopology;
  }
  const topo = buildTopology();
  const { saveTopology } = require("./lib/governance-topology.js");
  saveTopology(topo, TOPOLOGY_PATH);
  return topo;
}

function generateMermaid(topo: GovernanceTopology): string {
  const lines = ["graph TD;"];
  const nodeStyles: string[] = [];

  for (const node of topo.nodes) {
    const safeId = node.id.replace(/[^a-zA-Z0-9_]/g, "_");
    const label = node.name.length > 30 ? node.name.substring(0, 27) + "..." : node.name;
    lines.push(`  ${safeId}["${label}"]`);

    let style = "fill:#f9f,stroke:#333";
    if (node.type === "validator") style = "fill:#bbf,stroke:#333";
    else if (node.type === "emitter") style = "fill:#bfb,stroke:#333";
    else if (node.type === "journal") style = "fill:#fbb,stroke:#333";
    else if (node.type === "checkpoint") style = "fill:#ffb,stroke:#333";
    else if (node.type === "policy") style = "fill:#bff,stroke:#333";

    nodeStyles.push(`  style ${safeId} ${style}`);
  }

  for (const edge of topo.edges) {
    const safeSrc = edge.source.replace(/[^a-zA-Z0-9_]/g, "_");
    const safeTgt = edge.target.replace(/[^a-zA-Z0-9_]/g, "_");
    const label = edge.relationship;
    lines.push(`  ${safeSrc} -->|${label}| ${safeTgt}`);
  }

  lines.push(...nodeStyles);
  return lines.join("\n");
}

function generateDOT(topo: GovernanceTopology): string {
  const lines = ["digraph Governance {", '  rankdir="TB";', '  node [shape=box, style="rounded,filled", fontname="Helvetica"];'];

  for (const node of topo.nodes) {
    const safeId = `"${node.id.replace(/"/g, '\\"')}"`;
    const label = node.name.replace(/"/g, '\\"');
    let color = "lightgrey";
    if (node.type === "validator") color = "lightblue";
    else if (node.type === "emitter") color = "lightgreen";
    else if (node.type === "journal") color = "lightcoral";
    else if (node.type === "checkpoint") color = "lightyellow";
    else if (node.type === "policy") color = "lightcyan";

    lines.push(`  ${safeId} [label="${label}", fillcolor="${color}"];`);
  }

  for (const edge of topo.edges) {
    const safeSrc = `"${edge.source.replace(/"/g, '\\"')}"`;
    const safeTgt = `"${edge.target.replace(/"/g, '\\"')}"`;
    lines.push(`  ${safeSrc} -> ${safeTgt} [label="${edge.relationship}"];`);
  }

  lines.push("}");
  return lines.join("\n");
}

function generateJSONGraph(topo: GovernanceTopology): Record<string, unknown> {
  return {
    directed: true,
    multigraph: false,
    graph: {
      name: "governance_topology",
      version: topo.version,
      generated_at: topo.generated_at,
    },
    nodes: topo.nodes.map((n) => ({
      id: n.id,
      label: n.name,
      type: n.type,
      authority: n.authority,
      metadata: n.metadata,
    })),
    edges: topo.edges.map((e) => ({
      source: e.source,
      target: e.target,
      relation: e.relationship,
      metadata: e.metadata,
    })),
  };
}

function generateSubsystemMap(topo: GovernanceTopology): string {
  const lines = ["# Governance Subsystem Map", "", "```mermaid", "graph TD;"];

  for (const sub of topo.subsystems) {
    const safeId = sub.id.replace(/[^a-zA-Z0-9_]/g, "_");
    lines.push(`  ${safeId}["${sub.name}"]`);
  }

  // Add inter-subsystem edges based on component cross-references
  const subMap = new Map<string, string[]>();
  for (const sub of topo.subsystems) {
    subMap.set(sub.id, sub.components);
  }

  for (const edge of topo.edges) {
    const srcSub = topo.subsystems.find((s) => s.components.includes(edge.source));
    const tgtSub = topo.subsystems.find((s) => s.components.includes(edge.target));
    if (srcSub && tgtSub && srcSub.id !== tgtSub.id) {
      const safeSrc = srcSub.id.replace(/[^a-zA-Z0-9_]/g, "_");
      const safeTgt = tgtSub.id.replace(/[^a-zA-Z0-9_]/g, "_");
      lines.push(`  ${safeSrc} --> ${safeTgt}`);
    }
  }

  lines.push("```");
  return lines.join("\n");
}

function main(): void {
  const args = process.argv.slice(2);
  const format = args[0] || "all";

  console.log("Governance Visualization Layer");
  console.log("==============================\n");

  const topo = loadTopology();

  mkdirSync(join(OUTPUT_DIR, "diagrams"), { recursive: true });
  mkdirSync(join(OUTPUT_DIR, "graphs"), { recursive: true });

  if (format === "all" || format === "mermaid") {
    const mermaid = generateMermaid(topo);
    writeFileSync(join(OUTPUT_DIR, "diagrams", "governance-topology.mmd"), mermaid + "\n", "utf-8");
    console.log("✅ Mermaid diagram: project-governance/maps/diagrams/governance-topology.mmd");
  }

  if (format === "all" || format === "dot") {
    const dot = generateDOT(topo);
    writeFileSync(join(OUTPUT_DIR, "diagrams", "governance-topology.dot"), dot + "\n", "utf-8");
    console.log("✅ DOT diagram: project-governance/maps/diagrams/governance-topology.dot");
  }

  if (format === "all" || format === "json") {
    const jsonGraph = generateJSONGraph(topo);
    writeFileSync(join(OUTPUT_DIR, "graphs", "governance-graph.json"), JSON.stringify(jsonGraph, null, 2) + "\n", "utf-8");
    console.log("✅ JSON graph: project-governance/maps/graphs/governance-graph.json");
  }

  if (format === "all" || format === "subsystem") {
    const md = generateSubsystemMap(topo);
    writeFileSync(join(OUTPUT_DIR, "subsystem-map.md"), md + "\n", "utf-8");
    console.log("✅ Subsystem map: project-governance/maps/subsystem-map.md");
  }

  console.log("\nVisualization complete.");
}

main();
