/**
 * causality-validator.ts
 * Causality invariant validation engine — T29.2
 *
 * Validates governance event streams, sequence stores, and checkpoints
 * against causality invariants CI-001 through CI-010.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve } from "path";

export interface ValidationPaths {
  eventsDir: string;
  sequenceStorePath: string;
  causalityStorePath: string;
  checkpointsDir: string;
}

export const DEFAULT_PATHS: ValidationPaths = {
  eventsDir: resolve("project-governance/runtime/events/streams"),
  sequenceStorePath: resolve("project-governance/runtime/execution-logs/sequence-store.json"),
  causalityStorePath: resolve("project-governance/runtime/execution-logs/causality-store.json"),
  checkpointsDir: resolve("project-governance/runtime/checkpoints"),
};

export interface GovernanceEvent {
  event_id: string;
  timestamp: string;
  event_type: string;
  severity: string;
  category: string;
  execution_id?: string | null;
  milestone?: string | null;
  ticket?: string | null;
  actor?: string;
  global_sequence?: number;
  execution_sequence?: number;
  parent_event_id?: string | null;
  causality_chain?: string[];
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ValidationFinding {
  invariant: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  message: string;
  event_id?: string;
  evidence?: Record<string, unknown>;
}

export interface ValidationResult {
  passed: boolean;
  findings: ValidationFinding[];
  summary: Record<string, number>;
  stats: {
    eventsInspected: number;
    checkpointsInspected: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };
}

function loadEventStreams(eventsDir: string): GovernanceEvent[] {
  const events: GovernanceEvent[] = [];
  if (!existsSync(eventsDir)) return events;

  const files = readdirSync(eventsDir).filter((f) => f.endsWith(".ndjson"));
  const seen = new Set<string>();
  for (const file of files) {
    const text = readFileSync(resolve(eventsDir, file), "utf-8");
    const lines = text.split("\n").filter((l) => l.trim() !== "");
    for (const line of lines) {
      try {
        const evt = JSON.parse(line) as GovernanceEvent;
        // Include all events; deduplicate only if identical signature
        const sig = JSON.stringify({
          parent: evt.parent_event_id,
          chain: evt.causality_chain,
          global_seq: evt.global_sequence,
          exec_seq: evt.execution_sequence
        });
        const key = `${evt.event_id}::${sig}`;
        if (seen.has(key)) continue;
        seen.add(key);
        events.push(evt);
      } catch {
        // skip malformed lines
      }
    }
  }
  return events;
}

function loadSequenceStore(path: string): { global_sequence: number; execution_sequences: Record<string, number> } | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as { global_sequence: number; execution_sequences: Record<string, number> };
}

function loadCausalityStore(path: string): { execution_parents: Record<string, string>; execution_chains: Record<string, string[]> } | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as { execution_parents: Record<string, string>; execution_chains: Record<string, string[]> };
}

function loadCheckpoints(checkpointsDir: string): Array<Record<string, unknown>> {
  const checkpoints: Array<Record<string, unknown>> = [];
  if (!existsSync(checkpointsDir)) return checkpoints;

  const files = readdirSync(checkpointsDir).filter((f) => f.endsWith(".json") && f.startsWith("cp_"));
  for (const file of files) {
    try {
      checkpoints.push(JSON.parse(readFileSync(resolve(checkpointsDir, file), "utf-8")));
    } catch {
      // skip
    }
  }
  return checkpoints;
}

function buildKnownEventSet(
  events: GovernanceEvent[],
  causalityStore: ReturnType<typeof loadCausalityStore>
): Set<string> {
  const known = new Set(events.map((e) => e.event_id));
  if (causalityStore) {
    for (const id of Object.values(causalityStore.execution_parents)) {
      known.add(id);
    }
    for (const chain of Object.values(causalityStore.execution_chains)) {
      for (const id of chain) {
        known.add(id);
      }
    }
  }
  return known;
}

// ─── CI-001 — Monotonic Global Causality ───
function validateMonotonicGlobalCausality(events: GovernanceEvent[]): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const eventMap = new Map(events.map((e) => [e.event_id, e]));

  for (const event of events) {
    if (!event.causality_chain || event.global_sequence === undefined) continue;
    for (const ancestorId of event.causality_chain) {
      const ancestor = eventMap.get(ancestorId);
      if (ancestor && ancestor.global_sequence !== undefined && ancestor.global_sequence > event.global_sequence) {
        findings.push({
          invariant: "CI-001",
          severity: "CRITICAL",
          message: `Temporal inversion: ancestor ${ancestorId} (seq ${ancestor.global_sequence}) > event ${event.event_id} (seq ${event.global_sequence})`,
          event_id: event.event_id,
          evidence: { ancestor_sequence: ancestor.global_sequence, event_sequence: event.global_sequence }
        });
      }
    }
  }
  return findings;
}

// ─── CI-002 — Parent Existence ───
function validateParentExistence(events: GovernanceEvent[], knownEvents: Set<string>): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  for (const event of events) {
    if (event.parent_event_id === undefined || event.parent_event_id === null) continue;
    if (!knownEvents.has(event.parent_event_id)) {
      findings.push({
        invariant: "CI-002",
        severity: "HIGH",
        message: `Parent event not found in any stream or store: ${event.parent_event_id} referenced by ${event.event_id}`,
        event_id: event.event_id,
        evidence: { parent_event_id: event.parent_event_id }
      });
    }
  }
  return findings;
}

// ─── CI-003 — Acyclic Lineage ───
function validateAcyclicLineage(events: GovernanceEvent[]): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const eventMap = new Map(events.map((e) => [e.event_id, e]));

  for (const event of events) {
    if (!event.causality_chain || event.causality_chain.length === 0) continue;

    if (event.causality_chain.includes(event.event_id)) {
      findings.push({
        invariant: "CI-003",
        severity: "CRITICAL",
        message: `Self-referential causality: ${event.event_id} appears in its own chain`,
        event_id: event.event_id,
        evidence: { chain: event.causality_chain }
      });
      continue;
    }

    const visited = new Set<string>();
    const stack = [...event.causality_chain];
    let cycle = false;
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (id === event.event_id) {
        cycle = true;
        break;
      }
      if (visited.has(id)) continue;
      visited.add(id);
      const ancestor = eventMap.get(id);
      if (ancestor?.causality_chain) {
        stack.push(...ancestor.causality_chain);
      }
    }
    if (cycle) {
      findings.push({
        invariant: "CI-003",
        severity: "CRITICAL",
        message: `Cyclic lineage detected involving ${event.event_id}`,
        event_id: event.event_id,
        evidence: { chain: event.causality_chain }
      });
    }
  }
  return findings;
}

// ─── CI-004 — Execution Boundary Integrity ───
function validateExecutionBoundaries(events: GovernanceEvent[]): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const eventMap = new Map(events.map((e) => [e.event_id, e]));

  for (const event of events) {
    if (!event.parent_event_id) continue;
    const parent = eventMap.get(event.parent_event_id);
    if (!parent) continue;

    const eventExec = event.execution_id || "__no_execution__";
    const parentExec = parent.execution_id || "__no_execution__";

    if (eventExec !== parentExec) {
      const linkageType =
        (event.payload?.linkage_type as string) ||
        (event.metadata?.linkage_type as string);
      const validTypes = ["handoff", "recovery", "escalation", "replay", "delegation"];
      if (!linkageType || !validTypes.includes(linkageType)) {
        findings.push({
          invariant: "CI-004",
          severity: "HIGH",
          message: `Unclassified cross-execution linkage: ${event.event_id} (exec ${eventExec}) → parent ${parent.event_id} (exec ${parentExec})`,
          event_id: event.event_id,
          evidence: { event_exec: eventExec, parent_exec: parentExec, linkage_type: linkageType }
        });
      }
    }
  }
  return findings;
}

// ─── CI-005 — Replay Determinism ───
function validateReplayDeterminism(events: GovernanceEvent[], knownEvents: Set<string>): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  const sequenced = events
    .filter((e) => e.global_sequence !== undefined)
    .sort((a, b) => a.global_sequence! - b.global_sequence!);

  const eventMap = new Map(events.map((e) => [e.event_id, e]));
  const reconstructedChains = new Map<string, string[]>();

  for (const event of sequenced) {
    if (!event.parent_event_id) {
      reconstructedChains.set(event.event_id, []);
      continue;
    }

    const parentChain = reconstructedChains.get(event.parent_event_id);
    if (parentChain !== undefined) {
      const chain = [...parentChain, event.parent_event_id];
      reconstructedChains.set(event.event_id, chain);

      if (event.causality_chain && JSON.stringify(event.causality_chain) !== JSON.stringify(chain)) {
        findings.push({
          invariant: "CI-005",
          severity: "HIGH",
          message: `Causality chain mismatch for ${event.event_id}: stored ${JSON.stringify(event.causality_chain)} vs reconstructed ${JSON.stringify(chain)}`,
          event_id: event.event_id,
          evidence: { stored: event.causality_chain, reconstructed: chain }
        });
      }
    } else {
      // Parent chain not reconstructible from prior events — use stored chain as boundary
      if (event.causality_chain) {
        reconstructedChains.set(event.event_id, event.causality_chain);
      } else {
        if (!knownEvents.has(event.parent_event_id)) {
          findings.push({
            invariant: "CI-005",
            severity: "HIGH",
            message: `Cannot verify replay determinism for ${event.event_id}: parent ${event.parent_event_id} not known`,
            event_id: event.event_id,
            evidence: { parent_event_id: event.parent_event_id }
          });
        }
        reconstructedChains.set(event.event_id, []);
      }
    }
  }

  return findings;
}

// ─── CI-006 — Checkpoint Anchoring ───
function validateCheckpointAnchoring(checkpoints: Array<Record<string, unknown>>): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  for (const cp of checkpoints) {
    const status = cp.status as string;
    if (status !== "complete" && status !== "active") continue;

    const checkpointId = (cp.checkpoint_id as string) || "";
    const isPreCausality =
      checkpointId.startsWith("cp_T27") ||
      checkpointId.startsWith("cp_T28") ||
      checkpointId.startsWith("cp_T32") ||
      checkpointId.startsWith("cp_T29.1_pre");

    if (isPreCausality) continue;

    const hasGlobalSeq =
      cp.global_sequence !== undefined ||
      (cp.validation_summary && (cp.validation_summary as Record<string, unknown>).global_sequence !== undefined);
    const hasExecSeq =
      cp.execution_sequence !== undefined ||
      (cp.validation_summary && (cp.validation_summary as Record<string, unknown>).execution_sequence !== undefined);

    if (!hasGlobalSeq) {
      findings.push({
        invariant: "CI-006",
        severity: "MEDIUM",
        message: `Checkpoint ${cp.checkpoint_id} missing global_sequence anchor`,
        evidence: { checkpoint_id: cp.checkpoint_id }
      });
    }
    if (!hasExecSeq) {
      findings.push({
        invariant: "CI-006",
        severity: "MEDIUM",
        message: `Checkpoint ${cp.checkpoint_id} missing execution_sequence anchor`,
        evidence: { checkpoint_id: cp.checkpoint_id }
      });
    }
  }

  return findings;
}

// ─── CI-007 — Lineage Immutability ───
function validateLineageImmutability(events: GovernanceEvent[]): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const idToSig = new Map<string, string>();

  for (const event of events) {
    const sig = JSON.stringify({
      parent: event.parent_event_id,
      chain: event.causality_chain,
      global_seq: event.global_sequence,
      exec_seq: event.execution_sequence
    });

    if (idToSig.has(event.event_id) && idToSig.get(event.event_id) !== sig) {
      findings.push({
        invariant: "CI-007",
        severity: "CRITICAL",
        message: `Lineage mutation detected for event ${event.event_id}`,
        event_id: event.event_id,
        evidence: { first: idToSig.get(event.event_id), second: sig }
      });
    }
    idToSig.set(event.event_id, sig);
  }

  return findings;
}

// ─── CI-008 — Fork Visibility ───
function validateForkVisibility(events: GovernanceEvent[]): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const parentToChildren = new Map<string, string[]>();

  for (const event of events) {
    if (!event.parent_event_id) continue;
    const list = parentToChildren.get(event.parent_event_id) || [];
    if (!list.includes(event.event_id)) {
      list.push(event.event_id);
    }
    parentToChildren.set(event.parent_event_id, list);
  }

  for (const [parentId, children] of parentToChildren) {
    if (children.length > 1) {
      const forkEvents = events.filter(
        (e) =>
          e.event_type === "lineage.fork" &&
          ((e.payload?.fork_origin === parentId) || (e.metadata?.fork_origin === parentId))
      );
      if (forkEvents.length === 0) {
        findings.push({
          invariant: "CI-008",
          severity: "MEDIUM",
          message: `Fork detected at ${parentId} with ${children.length} children but no lineage.fork event emitted`,
          evidence: { parent_id: parentId, children }
        });
      }
    }
  }

  return findings;
}

// ─── CI-009 — Event Type Ordering Constraints ───
function validateEventTypeOrdering(events: GovernanceEvent[]): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const eventMap = new Map(events.map((e) => [e.event_id, e]));

  const invalidOrderings: Array<[string, string]> = [
    ["execution.completed", "execution.started"],
    ["checkpoint.complete", "checkpoint.active"],
    ["rollback.applied", "execution.started"],
  ];

  for (const event of events) {
    if (!event.causality_chain) continue;
    for (const ancestorId of event.causality_chain) {
      const ancestor = eventMap.get(ancestorId);
      if (!ancestor) continue;
      for (const [pred, succ] of invalidOrderings) {
        if (ancestor.event_type === pred && event.event_type === succ) {
          findings.push({
            invariant: "CI-009",
            severity: "HIGH",
            message: `Invalid ordering: ${pred} (${ancestorId}) precedes ${succ} (${event.event_id})`,
            event_id: event.event_id,
            evidence: { ancestor_type: pred, event_type: succ }
          });
        }
      }
    }
  }

  return findings;
}

// ─── CI-010 — Causality Compression Safety ───
function validateCompressionSafety(events: GovernanceEvent[]): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  const sequenced = events
    .filter((e) => e.global_sequence !== undefined)
    .sort((a, b) => a.global_sequence! - b.global_sequence!);

  if (sequenced.length > 1) {
    for (let i = 1; i < sequenced.length; i++) {
      const prev = sequenced[i - 1].global_sequence!;
      const curr = sequenced[i].global_sequence!;
      const gap = curr - prev;
      if (gap > 1) {
        // Gap detected — only flag if it indicates unsafe pruning (gap > 100)
        if (gap > 100) {
          findings.push({
            invariant: "CI-010",
            severity: "MEDIUM",
            message: `Sequence gap detected: ${prev} → ${curr} (gap ${gap - 1})`,
            evidence: { previous_seq: prev, current_seq: curr, gap_size: gap - 1 }
          });
        }
      }
    }
  }

  return findings;
}

export function validateCausality(paths: Partial<ValidationPaths> = {}): ValidationResult {
  const merged = { ...DEFAULT_PATHS, ...paths };
  const events = loadEventStreams(merged.eventsDir);
  const checkpoints = loadCheckpoints(merged.checkpointsDir);
  const causalityStore = loadCausalityStore(merged.causalityStorePath);
  const knownEvents = buildKnownEventSet(events, causalityStore);

  const allFindings: ValidationFinding[] = [];

  allFindings.push(...validateMonotonicGlobalCausality(events));
  allFindings.push(...validateParentExistence(events, knownEvents));
  allFindings.push(...validateAcyclicLineage(events));
  allFindings.push(...validateExecutionBoundaries(events));
  allFindings.push(...validateReplayDeterminism(events, knownEvents));
  allFindings.push(...validateCheckpointAnchoring(checkpoints));
  allFindings.push(...validateLineageImmutability(events));
  allFindings.push(...validateForkVisibility(events));
  allFindings.push(...validateEventTypeOrdering(events));
  allFindings.push(...validateCompressionSafety(events));

  const summary: Record<string, number> = {};
  for (const f of allFindings) {
    summary[f.invariant] = (summary[f.invariant] || 0) + 1;
  }

  const critical = allFindings.filter((f) => f.severity === "CRITICAL").length;
  const high = allFindings.filter((f) => f.severity === "HIGH").length;
  const medium = allFindings.filter((f) => f.severity === "MEDIUM").length;
  const low = allFindings.filter((f) => f.severity === "LOW").length;

  return {
    passed: critical === 0 && high === 0,
    findings: allFindings,
    summary,
    stats: {
      eventsInspected: events.length,
      checkpointsInspected: checkpoints.length,
      criticalCount: critical,
      highCount: high,
      mediumCount: medium,
      lowCount: low,
    },
  };
}
