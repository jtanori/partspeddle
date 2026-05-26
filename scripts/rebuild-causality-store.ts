#!/usr/bin/env tsx
/**
 * rebuild-causality-store.ts
 * Causality Store Rebuilder — P0 remediation
 *
 * Rebuilds causality-store.json from event streams using event-local lineage.
 * Execution-level chains are derived projections, not reconstruction sources.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { resolve } from "path";

const EVENTS_DIR = resolve("project-governance/runtime/events/streams");
const CAUSALITY_STORE_PATH = resolve("project-governance/runtime/execution-logs/causality-store.json");
const SEQUENCE_STORE_PATH = resolve("project-governance/runtime/execution-logs/sequence-store.json");

interface GovernanceEvent {
  event_id: string;
  execution_id?: string | null;
  parent_event_id?: string | null;
  causality_chain?: string[];
  global_sequence?: number;
}

interface RebuildResult {
  eventChains: Map<string, string[]>;
  executionHeads: Map<string, string>;
  executionChains: Map<string, string[]>;
  orphanParents: Array<{ event_id: string; parent_id: string; sequence?: number }>;
  chainMonotonicityViolations: Array<{ event_id: string; expected_min_length: number; actual_length: number }>;
  crossExecutionLeaks: Array<{ event_id: string; parent_exec: string; child_exec: string; parent_id: string }>;
  chainParentMismatches: Array<{ event_id: string; chain_tail: string | null; parent_id: string }>;
}

function loadEvents(): GovernanceEvent[] {
  const events: GovernanceEvent[] = [];
  if (!existsSync(EVENTS_DIR)) return events;
  const files = readdirSync(EVENTS_DIR).filter((f) => f.endsWith(".ndjson"));
  const seen = new Set<string>();
  for (const file of files) {
    const text = readFileSync(resolve(EVENTS_DIR, file), "utf-8");
    const lines = text.split("\n").filter((l) => l.trim() !== "");
    for (const line of lines) {
      try {
        const evt = JSON.parse(line) as GovernanceEvent;
        if (seen.has(evt.event_id)) continue;
        seen.add(evt.event_id);
        events.push(evt);
      } catch {}
    }
  }
  events.sort((a, b) => (a.global_sequence ?? 0) - (b.global_sequence ?? 0));
  return events;
}

function rebuildLineage(events: GovernanceEvent[]): RebuildResult {
  const eventMap = new Map(events.map((e) => [e.event_id, e]));
  const eventChains = new Map<string, string[]>();
  const executionHeads = new Map<string, string>();
  const executionChains = new Map<string, string[]>();

  const orphanParents: RebuildResult["orphanParents"] = [];
  const chainMonotonicityViolations: RebuildResult["chainMonotonicityViolations"] = [];
  const crossExecutionLeaks: RebuildResult["crossExecutionLeaks"] = [];
  const chainParentMismatches: RebuildResult["chainParentMismatches"] = [];

  for (const event of events) {
    const execKey = event.execution_id || "__no_execution__";

    if (!event.parent_event_id) {
      eventChains.set(event.event_id, []);
    } else {
      const parent = eventMap.get(event.parent_event_id);
      if (parent) {
        const parentChain = eventChains.get(parent.event_id) || [];
        eventChains.set(event.event_id, [...parentChain, parent.event_id]);

        // Cross-execution leak detection
        const parentExec = parent.execution_id || "__no_execution__";
        if (parentExec !== execKey) {
          const linkageType = (event.payload?.linkage_type as string) || (event.metadata?.linkage_type as string);
          if (!linkageType) {
            crossExecutionLeaks.push({
              event_id: event.event_id,
              parent_exec: parentExec,
              child_exec: execKey,
              parent_id: parent.event_id,
            });
          }
        }
      } else if (event.causality_chain && event.causality_chain.length > 0) {
        // Phantom parent — use stored chain as boundary
        eventChains.set(event.event_id, event.causality_chain);
      } else {
        eventChains.set(event.event_id, [event.parent_event_id]);
        orphanParents.push({
          event_id: event.event_id,
          parent_id: event.parent_event_id,
          sequence: event.global_sequence,
        });
      }
    }

    // Chain/event parity: chain tail must match parent
    const chain = eventChains.get(event.event_id) || [];
    if (event.parent_event_id) {
      const chainTail = chain.length > 0 ? chain[chain.length - 1] : null;
      if (chainTail !== event.parent_event_id) {
        chainParentMismatches.push({
          event_id: event.event_id,
          chain_tail: chainTail,
          parent_id: event.parent_event_id,
        });
      }
    }

    // Chain monotonicity: each event's chain should be >= its parent's chain length + 1
    if (event.parent_event_id) {
      const parentChain = eventChains.get(event.parent_event_id);
      if (parentChain !== undefined) {
        const expectedMin = parentChain.length + 1;
        if (chain.length < expectedMin) {
          chainMonotonicityViolations.push({
            event_id: event.event_id,
            expected_min_length: expectedMin,
            actual_length: chain.length,
          });
        }
      }
    }

    // Update execution projections
    executionHeads.set(execKey, event.event_id);
    executionChains.set(execKey, eventChains.get(event.event_id) || []);
  }

  return {
    eventChains,
    executionHeads,
    executionChains,
    orphanParents,
    chainMonotonicityViolations,
    crossExecutionLeaks,
    chainParentMismatches,
  };
}

function validateRebuild(result: RebuildResult): { passed: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (result.orphanParents.length > 0) {
    errors.push(`${result.orphanParents.length} orphan parent(s): ${result.orphanParents.map((o) => o.parent_id.slice(0, 8)).join(", ")}`);
  }

  if (result.chainMonotonicityViolations.length > 0) {
    errors.push(`${result.chainMonotonicityViolations.length} chain monotonicity violation(s)`);
    for (const v of result.chainMonotonicityViolations) {
      errors.push(`  ${v.event_id.slice(0, 8)}: expected >=${v.expected_min_length}, got ${v.actual_length}`);
    }
  }

  if (result.crossExecutionLeaks.length > 0) {
    warnings.push(`${result.crossExecutionLeaks.length} cross-execution linkage(s) without linkage_type`);
    for (const leak of result.crossExecutionLeaks) {
      warnings.push(`  ${leak.event_id.slice(0, 8)}: parent_exec=${leak.parent_exec} child_exec=${leak.child_exec}`);
    }
  }

  if (result.chainParentMismatches.length > 0) {
    errors.push(`${result.chainParentMismatches.length} chain/parent mismatch(es)`);
    for (const m of result.chainParentMismatches) {
      errors.push(`  ${m.event_id.slice(0, 8)}: chain_tail=${m.chain_tail?.slice(0, 8) || "null"} parent=${m.parent_id.slice(0, 8)}`);
    }
  }

  return { passed: errors.length === 0, errors, warnings };
}

function main(): void {
  console.log("Causality Store Rebuilder");
  console.log("=========================\n");

  const events = loadEvents();
  console.log(`Loaded ${events.length} unique events from streams`);

  const result = rebuildLineage(events);
  const validation = validateRebuild(result);

  console.log(`\nRebuilt lineage:`);
  console.log(`  Event chains: ${result.eventChains.size}`);
  console.log(`  Execution heads: ${result.executionHeads.size}`);
  for (const [key, chain] of result.executionChains) {
    console.log(`  - ${key}: ${chain.length} events`);
  }

  console.log(`\nIntegrity checks:`);
  console.log(`  Orphan parents: ${result.orphanParents.length}`);
  console.log(`  Monotonicity violations: ${result.chainMonotonicityViolations.length}`);
  console.log(`  Cross-execution leaks: ${result.crossExecutionLeaks.length}`);
  console.log(`  Chain/parent mismatches: ${result.chainParentMismatches.length}`);

  if (validation.errors.length > 0) {
    console.log(`\n❌ Rebuild validation FAILED:`);
    for (const e of validation.errors) {
      console.log(`  • ${e}`);
    }
  }

  if (validation.warnings.length > 0) {
    console.log(`\n⚠️  Warnings:`);
    for (const w of validation.warnings) {
      console.log(`  • ${w}`);
    }
  }

  if (!validation.passed) {
    console.log("\n❌ Rebuild rejected — store NOT persisted.");
    process.exit(1);
  }

  // Persist only after in-memory validation passes
  const store = {
    execution_parents: Object.fromEntries(result.executionHeads),
    execution_chains: Object.fromEntries(result.executionChains),
    updated_at: new Date().toISOString(),
  };

  writeFileSync(CAUSALITY_STORE_PATH, JSON.stringify(store, null, 2) + "\n", "utf-8");
  console.log(`\n✅ Rebuilt causality store written`);

  if (existsSync(SEQUENCE_STORE_PATH)) {
    const seqStore = JSON.parse(readFileSync(SEQUENCE_STORE_PATH, "utf-8")) as {
      global_sequence: number;
      execution_sequences: Record<string, number>;
      updated_at: string;
    };
    const execSeqs: Record<string, number> = {};
    for (const [key, chain] of result.executionChains) {
      execSeqs[key] = chain.length + 1;
    }
    seqStore.execution_sequences = execSeqs;
    seqStore.updated_at = new Date().toISOString();
    writeFileSync(SEQUENCE_STORE_PATH, JSON.stringify(seqStore, null, 2) + "\n", "utf-8");
    console.log(`✅ Updated sequence store`);
  }
}

main();
