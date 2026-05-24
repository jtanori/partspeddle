/**
 * replay-integrity-validator.ts
 * Replay integrity validation engine — T29.3
 *
 * Detects causal breaks, ordering ambiguity, orphaned events,
 * duplicate lineage, clock drift, and replay determinism issues.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
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

export interface ReplayFinding {
  invariant: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  message: string;
  event_id?: string;
  evidence?: Record<string, unknown>;
}

export interface ReplayResult {
  passed: boolean;
  findings: ReplayFinding[];
  summary: Record<string, number>;
  stats: {
    eventsInspected: number;
    checkpointsInspected: number;
    streamsInspected: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };
}

function loadEventStreams(eventsDir: string): {
  events: GovernanceEvent[];
  streams: number;
  perStreamDuplicates: Array<{ id: string; stream: string; count: number }>;
} {
  const allEvents: GovernanceEvent[] = [];
  const seenGlobal = new Set<string>();
  let streams = 0;
  const perStreamDuplicates: Array<{ id: string; stream: string; count: number }> = [];

  if (!existsSync(eventsDir)) return { events: allEvents, streams, perStreamDuplicates: [] };

  const files = readdirSync(eventsDir).filter((f) => f.endsWith(".ndjson"));
  streams = files.length;
  for (const file of files) {
    const perStreamCounts = new Map<string, number>();
    const text = readFileSync(resolve(eventsDir, file), "utf-8");
    const lines = text.split("\n").filter((l) => l.trim() !== "");
    for (const line of lines) {
      try {
        const evt = JSON.parse(line) as GovernanceEvent;
        perStreamCounts.set(evt.event_id, (perStreamCounts.get(evt.event_id) || 0) + 1);
        if (!seenGlobal.has(evt.event_id)) {
          seenGlobal.add(evt.event_id);
          allEvents.push(evt);
        }
      } catch {
        // skip malformed lines
      }
    }
    for (const [id, count] of perStreamCounts) {
      if (count > 1) {
        perStreamDuplicates.push({ id, stream: file, count });
      }
    }
  }

  return { events: allEvents, streams, perStreamDuplicates };
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

function findBoundaryEvent(events: GovernanceEvent[]): GovernanceEvent | null {
  return events.find((e) => e.event_type === "causality.boundary") || null;
}

function getLegacyFrontier(boundary: GovernanceEvent | null): Set<string> {
  if (!boundary || !boundary.payload?.legacy_frontier) return new Set();
  return new Set(boundary.payload.legacy_frontier as string[]);
}

function buildKnownEventSet(events: GovernanceEvent[], causalityStore: ReturnType<typeof loadCausalityStore>): Set<string> {
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

// ─── RI-001: Causal Breaks ───
// Detects events whose causality chain cannot be fully traversed from the stream
function validateCausalBreaks(events: GovernanceEvent[], knownEvents: Set<string>, legacyFrontier: Set<string>): ReplayFinding[] {
  const findings: ReplayFinding[] = [];
  const eventMap = new Map(events.map((e) => [e.event_id, e]));

  for (const event of events) {
    if (!event.causality_chain || event.causality_chain.length === 0) continue;

    // Walk the chain and verify every ancestor is reachable
    for (let i = 0; i < event.causality_chain.length; i++) {
      const ancestorId = event.causality_chain[i];

      // Legacy frontier ancestors are pre-normalization lineage — do not flag
      if (legacyFrontier.has(ancestorId)) continue;

      const ancestor = eventMap.get(ancestorId);

      if (!ancestor) {
        if (!knownEvents.has(ancestorId)) {
          findings.push({
            invariant: "RI-001",
            severity: "CRITICAL",
            message: `Causal break: ancestor ${ancestorId} in chain of ${event.event_id} is unknown (not in streams or store)`,
            event_id: event.event_id,
            evidence: { ancestor_index: i, ancestor_id: ancestorId }
          });
        }
        continue;
      }

      // Verify ancestor's chain is a proper prefix (skip if ancestor itself is on frontier)
      if (ancestor.causality_chain && !legacyFrontier.has(ancestor.event_id)) {
        const expectedPrefix = event.causality_chain.slice(0, i);
        const actualPrefix = ancestor.causality_chain;
        if (JSON.stringify(expectedPrefix) !== JSON.stringify(actualPrefix)) {
          findings.push({
            invariant: "RI-001",
            severity: "HIGH",
            message: `Causal break: ancestor ${ancestorId} prefix mismatch in chain of ${event.event_id}`,
            event_id: event.event_id,
            evidence: { expected_prefix: expectedPrefix, actual_prefix: actualPrefix }
          });
        }
      }
    }
  }

  return findings;
}

// ─── RI-002: Ordering Ambiguity ───
function validateOrderingAmbiguity(events: GovernanceEvent[]): ReplayFinding[] {
  const findings: ReplayFinding[] = [];

  // Check for duplicate global_sequence
  const seqMap = new Map<number, GovernanceEvent[]>();
  for (const event of events) {
    if (event.global_sequence === undefined) continue;
    const list = seqMap.get(event.global_sequence) || [];
    list.push(event);
    seqMap.set(event.global_sequence, list);
  }

  for (const [seq, list] of seqMap) {
    if (list.length > 1) {
      findings.push({
        invariant: "RI-002",
        severity: "CRITICAL",
        message: `Ordering ambiguity: ${list.length} events share global_sequence ${seq}`,
        evidence: { global_sequence: seq, event_ids: list.map((e) => e.event_id) }
      });
    }
  }

  // Check for timestamp ordering that contradicts sequence ordering
  const sequenced = events
    .filter((e) => e.global_sequence !== undefined)
    .sort((a, b) => a.global_sequence! - b.global_sequence!);

  for (let i = 1; i < sequenced.length; i++) {
    const prev = new Date(sequenced[i - 1].timestamp).getTime();
    const curr = new Date(sequenced[i].timestamp).getTime();
    if (curr < prev - 60000) { // Allow 60s clock jitter
      findings.push({
        invariant: "RI-002",
        severity: "HIGH",
        message: `Timestamp inversion: seq ${sequenced[i].global_sequence} has earlier timestamp than seq ${sequenced[i - 1].global_sequence}`,
        evidence: {
          earlier_seq: sequenced[i - 1].global_sequence,
          earlier_ts: sequenced[i - 1].timestamp,
          later_seq: sequenced[i].global_sequence,
          later_ts: sequenced[i].timestamp,
        }
      });
    }
  }

  return findings;
}

// ─── RI-003: Orphaned Events ───
function validateOrphanedEvents(events: GovernanceEvent[], knownEvents: Set<string>, legacyFrontier: Set<string>): ReplayFinding[] {
  const findings: ReplayFinding[] = [];

  for (const event of events) {
    if (event.parent_event_id === undefined || event.parent_event_id === null) continue;
    // Legacy frontier parents are pre-normalization lineage — do not flag
    if (legacyFrontier.has(event.parent_event_id)) continue;
    if (!knownEvents.has(event.parent_event_id)) {
      findings.push({
        invariant: "RI-003",
        severity: "HIGH",
        message: `Orphaned event: ${event.event_id} references unknown parent ${event.parent_event_id}`,
        event_id: event.event_id,
        evidence: { parent_event_id: event.parent_event_id }
      });
    }
  }

  return findings;
}

// ─── RI-004: Duplicate Lineage ───
function validateDuplicateLineage(duplicates: Array<{ id: string; stream: string; count: number }>): ReplayFinding[] {
  const findings: ReplayFinding[] = [];

  for (const dup of duplicates) {
    findings.push({
      invariant: "RI-004",
      severity: "MEDIUM",
      message: `Duplicate lineage: event ${dup.id} appears ${dup.count} times within stream ${dup.stream} (replay may double-count)`,
      event_id: dup.id,
      evidence: { occurrence_count: dup.count, stream: dup.stream }
    });
  }

  return findings;
}

// ─── RI-005: Clock Drift ───
function validateClockDrift(events: GovernanceEvent[]): ReplayFinding[] {
  const findings: ReplayFinding[] = [];
  const now = Date.now();

  for (const event of events) {
    const ts = new Date(event.timestamp).getTime();

    // Future timestamp (more than 5 minutes ahead)
    if (ts > now + 300000) {
      findings.push({
        invariant: "RI-005",
        severity: "HIGH",
        message: `Clock drift: event ${event.event_id} has future timestamp ${event.timestamp}`,
        event_id: event.event_id,
        evidence: { timestamp: event.timestamp, drift_ms: ts - now }
      });
    }

    // Very old timestamp (more than 1 year before now)
    if (ts < now - 31536000000) {
      findings.push({
        invariant: "RI-005",
        severity: "MEDIUM",
        message: `Clock drift: event ${event.event_id} has stale timestamp ${event.timestamp}`,
        event_id: event.event_id,
        evidence: { timestamp: event.timestamp, age_ms: now - ts }
      });
    }
  }

  // Check for timestamp monotonicity within each execution
  const execEvents = new Map<string, GovernanceEvent[]>();
  for (const event of events) {
    const exec = event.execution_id || "__no_execution__";
    const list = execEvents.get(exec) || [];
    list.push(event);
    execEvents.set(exec, list);
  }

  for (const [execId, list] of execEvents) {
    const sorted = [...list].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (
        prev.global_sequence !== undefined &&
        curr.global_sequence !== undefined &&
        curr.global_sequence < prev.global_sequence
      ) {
        findings.push({
          invariant: "RI-005",
          severity: "HIGH",
          message: `Clock drift within execution ${execId}: timestamp order contradicts sequence order`,
          evidence: {
            execution_id: execId,
            earlier_event: prev.event_id,
            earlier_seq: prev.global_sequence,
            later_event: curr.event_id,
            later_seq: curr.global_sequence,
          }
        });
      }
    }
  }

  return findings;
}

// ─── RI-006: Replay Determinism ───
function validateReplayDeterminism(events: GovernanceEvent[], sequenceStore: ReturnType<typeof loadSequenceStore>): ReplayFinding[] {
  const findings: ReplayFinding[] = [];

  const sequenced = events
    .filter((e) => e.global_sequence !== undefined)
    .sort((a, b) => a.global_sequence! - b.global_sequence!);

  // Check for gaps that prevent deterministic replay
  if (sequenced.length > 0 && sequenceStore) {
    const expectedMax = sequenceStore.global_sequence;
    const actualMax = sequenced[sequenced.length - 1].global_sequence!;

    // Missing sequences at the tail (newer events not in streams)
    if (actualMax < expectedMax) {
      findings.push({
        invariant: "RI-006",
        severity: "HIGH",
        message: `Replay gap: stream ends at sequence ${actualMax} but store expects ${expectedMax}`,
        evidence: { stream_max: actualMax, store_max: expectedMax, missing_count: expectedMax - actualMax }
      });
    }

    // Check for gaps in the middle
    const sequences = sequenced.map((e) => e.global_sequence!);
    for (let i = 1; i < sequences.length; i++) {
      const gap = sequences[i] - sequences[i - 1];
      if (gap > 1 && gap <= 100) {
        findings.push({
          invariant: "RI-006",
          severity: "MEDIUM",
          message: `Replay gap: missing ${gap - 1} sequence(s) between ${sequences[i - 1]} and ${sequences[i]}`,
          evidence: { from: sequences[i - 1], to: sequences[i], missing_count: gap - 1 }
        });
      }
    }
  }

  // Verify every sequenced event has deterministic reconstruction fields
  for (const event of sequenced) {
    if (event.execution_sequence === undefined) {
      findings.push({
        invariant: "RI-006",
        severity: "MEDIUM",
        message: `Replay indeterminacy: event ${event.event_id} (seq ${event.global_sequence}) missing execution_sequence`,
        event_id: event.event_id,
        evidence: { global_sequence: event.global_sequence }
      });
    }
  }

  return findings;
}

// ─── RI-007: Stream Completeness ───
function validateStreamCompleteness(events: GovernanceEvent[], checkpoints: Array<Record<string, unknown>>): ReplayFinding[] {
  const findings: ReplayFinding[] = [];
  const eventIds = new Set(events.map((e) => e.event_id));

  for (const cp of checkpoints) {
    const checkpointId = (cp.checkpoint_id as string) || "";
    const isPreCausality =
      checkpointId.startsWith("cp_T27") ||
      checkpointId.startsWith("cp_T28") ||
      checkpointId.startsWith("cp_T32") ||
      checkpointId.startsWith("cp_T29.1_pre");

    if (isPreCausality) continue;

    const anchorSeq = cp.global_sequence as number | undefined;
    if (anchorSeq === undefined) continue;

    // Find the event corresponding to this checkpoint's anchor
    const anchorEvent = events.find((e) => e.global_sequence === anchorSeq);
    if (!anchorEvent) {
      findings.push({
        invariant: "RI-007",
        severity: "HIGH",
        message: `Stream incompleteness: checkpoint ${checkpointId} anchors to sequence ${anchorSeq} but no matching event found in streams`,
        evidence: { checkpoint_id: checkpointId, anchored_sequence: anchorSeq }
      });
    }
  }

  return findings;
}

export function validateReplayIntegrity(paths: Partial<ValidationPaths> = {}): ReplayResult {
  const merged = { ...DEFAULT_PATHS, ...paths };
  const { events, streams, perStreamDuplicates } = loadEventStreams(merged.eventsDir);
  const checkpoints = loadCheckpoints(merged.checkpointsDir);
  const sequenceStore = loadSequenceStore(merged.sequenceStorePath);
  const causalityStore = loadCausalityStore(merged.causalityStorePath);
  const knownEvents = buildKnownEventSet(events, causalityStore);

  const allFindings: ReplayFinding[] = [];

  const boundary = findBoundaryEvent(events);
  const legacyFrontier = getLegacyFrontier(boundary);

  allFindings.push(...validateCausalBreaks(events, knownEvents, legacyFrontier));
  allFindings.push(...validateOrderingAmbiguity(events));
  allFindings.push(...validateOrphanedEvents(events, knownEvents, legacyFrontier));
  allFindings.push(...validateDuplicateLineage(perStreamDuplicates));
  allFindings.push(...validateClockDrift(events));
  allFindings.push(...validateReplayDeterminism(events, sequenceStore));
  allFindings.push(...validateStreamCompleteness(events, checkpoints));

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
      streamsInspected: streams,
      criticalCount: critical,
      highCount: high,
      mediumCount: medium,
      lowCount: low,
    },
  };
}
