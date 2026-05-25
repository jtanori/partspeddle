/**
 * control-plane/intents.ts
 * Intent persistence layer — T31.3b deliverable
 *
 * Persists operational intents and their lifecycle state transitions.
 * Each intent is immutable; state transitions create new records.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { resolve, join } from "path";
import { randomUUID } from "crypto";

const BASE_DIR = resolve("project-governance/runtime/control-actions");

export interface IntentRecord {
  action_id: string;
  timestamp: string;
  actor: string;
  recipe_id: string;
  target: string;
  parameters: Record<string, unknown>;
  reason?: string;
  state: "pending" | "approved" | "rejected" | "executing" | "completed" | "failed" | "rolled-back";
  validation?: {
    status: "pending" | "passed" | "failed";
    guards_checked: string[];
    violations: string[];
  };
  approval?: {
    mode: string;
    approved_by?: string;
    approved_at?: string;
    rejection_reason?: string;
  };
  execution?: {
    started_at?: string;
    completed_at?: string;
    error?: string;
    rollback_triggered?: boolean;
  };
  checkpoint_id?: string;
  dry_run: boolean;
}

function stateDir(state: string): string {
  return join(BASE_DIR, state);
}

export function generateActionId(): string {
  return `ACT-${new Date().toISOString().replace(/[:T]/g, "-").split(".")[0]}-${randomUUID().slice(0, 8)}`;
}

export function persistIntent(record: IntentRecord): IntentRecord {
  const dir = stateDir(record.state);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${record.action_id}.json`);
  writeFileSync(path, JSON.stringify(record, null, 2) + "\n", "utf-8");
  return record;
}

export function loadIntent(actionId: string, state?: string): IntentRecord | null {
  if (state) {
    const path = join(stateDir(state), `${actionId}.json`);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8")) as IntentRecord;
  }
  // Search all states
  const states = ["pending", "approved", "executing", "completed", "failed", "rolled-back"];
  for (const s of states) {
    const path = join(stateDir(s), `${actionId}.json`);
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf-8")) as IntentRecord;
    }
  }
  return null;
}

export function listIntentsByState(state: string): IntentRecord[] {
  const dir = stateDir(state);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf-8")) as IntentRecord)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function transitionIntent(
  actionId: string,
  newState: IntentRecord["state"],
  updates: Partial<IntentRecord> = {}
): IntentRecord | null {
  const intent = loadIntent(actionId);
  if (!intent) return null;

  const updated: IntentRecord = {
    ...intent,
    ...updates,
    action_id: actionId,
    state: newState,
    timestamp: new Date().toISOString(),
  };

  persistIntent(updated);
  return updated;
}
