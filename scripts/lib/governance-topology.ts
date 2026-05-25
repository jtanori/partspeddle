/**
 * governance-topology.ts
 * Governance topology scanner and registry builder — T30.1/T30.2 deliverable
 *
 * Discovers subsystems, authorities, validators, emitters, journals,
 * checkpoints, policies, and state domains from the runtime filesystem.
 * Builds a machine-readable graph representation for querying and visualization.
 */

import { readFileSync, existsSync, readdirSync, statSync, mkdirSync, writeFileSync } from "fs";
import { resolve, join, relative, dirname } from "path";

export interface TopologyNode {
  id: string;
  type: string;
  name: string;
  path?: string;
  authority?: string;
  version?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface TopologyEdge {
  source: string;
  target: string;
  relationship:
    | "uses"
    | "validates"
    | "emits_to"
    | "projects_from"
    | "depends_on"
    | "protects"
    | "references"
    | "contains";
  metadata?: Record<string, unknown>;
}

export interface GovernanceTopology {
  version: string;
  generated_at: string;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  subsystems: Array<{
    id: string;
    name: string;
    components: string[];
    authority: string;
  }>;
}

const PROJECT_ROOT = resolve(".");

function scanDirectory(dir: string, pattern: RegExp, type: string, authority = "agent"): TopologyNode[] {
  const nodes: TopologyNode[] = [];
  if (!existsSync(dir)) return nodes;

  function walk(current: string) {
    const entries = readdirSync(current);
    for (const entry of entries) {
      const full = join(current, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (pattern.test(entry)) {
        const rel = relative(PROJECT_ROOT, full);
        nodes.push({
          id: `${type}:${rel}`,
          type,
          name: entry,
          path: rel,
          authority,
        });
      }
    }
  }

  walk(dir);
  return nodes;
}

function scanValidators(): TopologyNode[] {
  return scanDirectory("scripts", /^validate-.*\.ts$/, "validator");
}

function scanEmitters(): TopologyNode[] {
  return scanDirectory("scripts", /^emit-.*\.ts$/, "emitter");
}

function scanScripts(): TopologyNode[] {
  return scanDirectory("scripts", /.*\.ts$/, "script");
}

function scanPolicies(): TopologyNode[] {
  const dir = resolve("meta/governance/protocols");
  return scanDirectory(dir, /.*\.json$/, "policy");
}

function scanSchemas(): TopologyNode[] {
  const dir = resolve("meta/governance/schemas");
  return scanDirectory(dir, /.*\.schema\.json$/, "schema");
}

function scanEventStreams(): TopologyNode[] {
  const dir = resolve("project-governance/runtime/events/streams");
  return scanDirectory(dir, /.*\.ndjson$/, "journal");
}

function scanCheckpoints(): TopologyNode[] {
  const dir = resolve("project-governance/runtime/checkpoints");
  const nodes: TopologyNode[] = [];
  if (!existsSync(dir)) return nodes;
  const files = readdirSync(dir).filter((f) => f.startsWith("cp_") && f.endsWith(".json"));
  for (const file of files) {
    nodes.push({
      id: `checkpoint:${file}`,
      type: "checkpoint",
      name: file,
      path: relative(PROJECT_ROOT, join(dir, file)),
      authority: "agent",
    });
  }
  return nodes;
}

function scanProjections(): TopologyNode[] {
  const nodes: TopologyNode[] = [];
  const stateDir = resolve("project-governance/runtime/state");
  const projectionDir = resolve("project-governance/runtime/projections");

  for (const dir of [stateDir, projectionDir]) {
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      nodes.push({
        id: `projection:${file}`,
        type: "projection",
        name: file,
        path: relative(PROJECT_ROOT, join(dir, file)),
        authority: "agent",
      });
    }
  }
  return nodes;
}

function scanStateDomains(): TopologyNode[] {
  const canonicalPath = resolve("meta/state/canonical-state.json");
  if (!existsSync(canonicalPath)) return [];

  const canonical = JSON.parse(readFileSync(canonicalPath, "utf-8")) as Record<string, unknown>;
  const nodes: TopologyNode[] = [];

  for (const key of Object.keys(canonical)) {
    nodes.push({
      id: `state_domain:${key}`,
      type: "state_domain",
      name: key,
      path: "meta/state/canonical-state.json",
      authority: "agent",
      description: `Canonical state domain: ${key}`,
    });
  }

  return nodes;
}

function scanSubsystems(): Array<{ id: string; name: string; components: string[]; authority: string }> {
  const subsystems = [
    { id: "governance_events", name: "Governance Event Bus", components: [] as string[], authority: "agent" },
    { id: "governance_invariants", name: "Invariant Engine", components: [] as string[], authority: "agent" },
    { id: "governance_projections", name: "Projection System", components: [] as string[], authority: "agent" },
    { id: "governance_replay", name: "Replay System", components: [] as string[], authority: "agent" },
    { id: "governance_telemetry", name: "Telemetry System", components: [] as string[], authority: "agent" },
    { id: "governance_storage", name: "Storage Adapter", components: [] as string[], authority: "agent" },
    { id: "governance_diagnostics", name: "Diagnostics Console", components: [] as string[], authority: "agent" },
    { id: "governance_authority", name: "Authority System", components: [] as string[], authority: "agent" },
  ];

  // Classify components into subsystems based on naming
  const allNodes = [
    ...scanValidators(),
    ...scanEmitters(),
    ...scanScripts(),
    ...scanPolicies(),
    ...scanSchemas(),
    ...scanEventStreams(),
    ...scanCheckpoints(),
    ...scanProjections(),
    ...scanStateDomains(),
  ];

  for (const node of allNodes) {
    if (node.name.includes("causality") || node.name.includes("replay") || node.name.includes("sequence")) {
      subsystems.find((s) => s.id === "governance_replay")?.components.push(node.id);
    } else if (node.name.includes("invariant") || node.name.includes("validate")) {
      subsystems.find((s) => s.id === "governance_invariants")?.components.push(node.id);
    } else if (node.name.includes("projection") || node.name.includes("sync") || node.name.includes("bootstrap")) {
      subsystems.find((s) => s.id === "governance_projections")?.components.push(node.id);
    } else if (node.name.includes("telemetry") || node.name.includes("emit-telemetry")) {
      subsystems.find((s) => s.id === "governance_telemetry")?.components.push(node.id);
    } else if (node.name.includes("storage") || node.name.includes("adapter")) {
      subsystems.find((s) => s.id === "governance_storage")?.components.push(node.id);
    } else if (node.name.includes("diagnostic") || node.name.includes("audit")) {
      subsystems.find((s) => s.id === "governance_diagnostics")?.components.push(node.id);
    } else if (node.name.includes("authority") || node.name.includes("policy")) {
      subsystems.find((s) => s.id === "governance_authority")?.components.push(node.id);
    } else if (node.name.includes("event") || node.name.includes("emit") || node.path?.includes("events/streams")) {
      subsystems.find((s) => s.id === "governance_events")?.components.push(node.id);
    }
  }

  return subsystems;
}

function buildEdges(nodes: TopologyNode[]): TopologyEdge[] {
  const edges: TopologyEdge[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Validators protect state domains they reference
  for (const node of nodes) {
    if (node.type === "validator" && node.path) {
      try {
        const content = readFileSync(resolve(node.path), "utf-8");
        for (const target of nodes) {
          if (target.type === "state_domain" && content.includes(target.name)) {
            edges.push({ source: node.id, target: target.id, relationship: "protects" });
          }
          if (target.type === "journal" && content.includes("events/streams")) {
            edges.push({ source: node.id, target: target.id, relationship: "validates" });
          }
          if (target.type === "checkpoint" && content.includes("checkpoints")) {
            edges.push({ source: node.id, target: target.id, relationship: "validates" });
          }
        }
      } catch {
        // skip unreadable files
      }
    }

    // Emitters emit to journals
    if (node.type === "emitter" && node.path) {
      edges.push({ source: node.id, target: "journal:default.ndjson", relationship: "emits_to" });
    }

    // Scripts depend on state domains they reference
    if ((node.type === "script" || node.type === "validator") && node.path) {
      try {
        const content = readFileSync(resolve(node.path), "utf-8");
        for (const target of nodes) {
          if (target.type === "projection" && content.includes(target.name.replace(".json", ""))) {
            edges.push({ source: node.id, target: target.id, relationship: "references" });
          }
          if (target.type === "policy" && content.includes(target.name.replace(".json", ""))) {
            edges.push({ source: node.id, target: target.id, relationship: "references" });
          }
        }
      } catch {
        // skip
      }
    }

    // Projections project from canonical state
    if (node.type === "projection") {
      edges.push({ source: node.id, target: "state_domain:canonical-state", relationship: "projects_from" });
    }

    // Checkpoints depend on state domains
    if (node.type === "checkpoint") {
      edges.push({ source: node.id, target: "state_domain:execution", relationship: "depends_on" });
    }

    // State domains contain each other conceptually
    if (node.type === "state_domain") {
      edges.push({ source: "state_domain:canonical-state", target: node.id, relationship: "contains" });
    }
  }

  return edges;
}

export function buildTopology(): GovernanceTopology {
  const nodes = [
    ...scanValidators(),
    ...scanEmitters(),
    ...scanScripts(),
    ...scanPolicies(),
    ...scanSchemas(),
    ...scanEventStreams(),
    ...scanCheckpoints(),
    ...scanProjections(),
    ...scanStateDomains(),
  ];

  const subsystems = scanSubsystems();
  const edges = buildEdges(nodes);

  return {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    nodes,
    edges,
    subsystems,
  };
}

export function saveTopology(topology: GovernanceTopology, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(topology, null, 2) + "\n", "utf-8");
}
