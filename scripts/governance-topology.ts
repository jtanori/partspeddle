#!/usr/bin/env tsx
/**
 * governance-topology.ts
 * Governance Topology Builder — T30.1/T30.3 deliverable
 *
 * Builds and persists the canonical governance topology JSON.
 */

import { resolve } from "path";
import { buildTopology, saveTopology } from "./lib/governance-topology.js";

const TOPOLOGY_PATH = resolve("meta/governance/topology/governance-topology.json");

function main(): void {
  console.log("Governance Topology Builder");
  console.log("===========================\n");

  const topo = buildTopology();
  saveTopology(topo, TOPOLOGY_PATH);

  console.log(`Nodes:    ${topo.nodes.length}`);
  console.log(`Edges:    ${topo.edges.length}`);
  console.log(`Subsystems: ${topo.subsystems.length}`);
  console.log(`\n✅ Topology written to: ${TOPOLOGY_PATH}`);
}

main();
