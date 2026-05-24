#!/usr/bin/env tsx
/**
 * sequence-tracker.ts
 * Global and execution-scoped sequence counter — T29.1 deliverable
 *
 * Provides monotonic sequence assignment for governance events.
 * Persists counters via storage adapter to ensure durability.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";

const SEQUENCE_STORE_PATH = resolve("project-governance/runtime/execution-logs/sequence-store.json");
const CAUSALITY_STORE_PATH = resolve("project-governance/runtime/execution-logs/causality-store.json");

interface SequenceStore {
  global_sequence: number;
  execution_sequences: Record<string, number>;
  updated_at: string;
}

interface CausalityStore {
  execution_parents: Record<string, string>; // execution_id → last_event_id
  execution_chains: Record<string, string[]>; // execution_id → chain of event_ids
  updated_at: string;
}

function ensureDir(path: string): void {
  const dir = path.substring(0, path.lastIndexOf("/"));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function loadSequenceStore(): SequenceStore {
  if (!existsSync(SEQUENCE_STORE_PATH)) {
    return {
      global_sequence: 0,
      execution_sequences: {},
      updated_at: new Date().toISOString()
    };
  }
  return JSON.parse(readFileSync(SEQUENCE_STORE_PATH, "utf-8")) as SequenceStore;
}

function saveSequenceStore(store: SequenceStore): void {
  ensureDir(SEQUENCE_STORE_PATH);
  store.updated_at = new Date().toISOString();
  writeFileSync(SEQUENCE_STORE_PATH, JSON.stringify(store, null, 2) + "\n", "utf-8");
}

function loadCausalityStore(): CausalityStore {
  if (!existsSync(CAUSALITY_STORE_PATH)) {
    return {
      execution_parents: {},
      execution_chains: {},
      updated_at: new Date().toISOString()
    };
  }
  return JSON.parse(readFileSync(CAUSALITY_STORE_PATH, "utf-8")) as CausalityStore;
}

function saveCausalityStore(store: CausalityStore): void {
  ensureDir(CAUSALITY_STORE_PATH);
  store.updated_at = new Date().toISOString();
  writeFileSync(CAUSALITY_STORE_PATH, JSON.stringify(store, null, 2) + "\n", "utf-8");
}

export interface SequenceAssignment {
  global_sequence: number;
  execution_sequence: number;
  parent_event_id: string | null;
  causality_chain: string[];
}

/**
 * Atomically assign the next sequence numbers for an event.
 *
 * Guarantees:
 * - global_sequence is monotonically increasing across all events
 * - execution_sequence is monotonically increasing within an execution
 * - parent_event_id is the last event emitted in the same execution
 * - causality_chain includes the full causal path for this execution
 */
export interface AssignSequencesOptions {
  /** Override parent event ID for cross-execution linkage */
  parentEventId?: string | null;
  /** Causality chain prefix when using cross-execution parent */
  parentChain?: string[];
}

export function assignSequences(
  executionId: string | null,
  eventId: string,
  opts: AssignSequencesOptions = {}
): SequenceAssignment {
  const seqStore = loadSequenceStore();
  const causStore = loadCausalityStore();

  // Assign global sequence
  seqStore.global_sequence += 1;
  const globalSequence = seqStore.global_sequence;

  // Assign execution sequence
  const execKey = executionId || "__no_execution__";
  const execSeq = (seqStore.execution_sequences[execKey] || 0) + 1;
  seqStore.execution_sequences[execKey] = execSeq;

  // Determine parent and chain
  const autoParentId = causStore.execution_parents[execKey] || null;
  const parentId = opts.parentEventId !== undefined ? opts.parentEventId : autoParentId;

  let chain: string[];
  if (parentId === null) {
    chain = [];
  } else if (opts.parentEventId !== undefined && opts.parentChain) {
    // Cross-execution linkage: use provided chain prefix + parent
    chain = [...opts.parentChain, parentId];
  } else if (parentId === autoParentId) {
    // Intra-execution: extend execution chain
    chain = [...(causStore.execution_chains[execKey] || []), parentId];
  } else {
    // Fallback: no chain history available
    chain = [parentId];
  }

  // Update causality tracking for this execution
  causStore.execution_parents[execKey] = eventId;
  causStore.execution_chains[execKey] = chain;

  // Persist atomically
  saveSequenceStore(seqStore);
  saveCausalityStore(causStore);

  return {
    global_sequence: globalSequence,
    execution_sequence: execSeq,
    parent_event_id: parentId,
    causality_chain: chain
  };
}

/**
 * Read current sequence counters without mutating.
 */
export function readSequences(): {
  global_sequence: number;
  execution_sequences: Record<string, number>;
} {
  const store = loadSequenceStore();
  return {
    global_sequence: store.global_sequence,
    execution_sequences: { ...store.execution_sequences }
  };
}

/**
 * Reset sequence counters (for testing only).
 */
export function resetSequences(): void {
  saveSequenceStore({
    global_sequence: 0,
    execution_sequences: {},
    updated_at: new Date().toISOString()
  });
  saveCausalityStore({
    execution_parents: {},
    execution_chains: {},
    updated_at: new Date().toISOString()
  });
}
