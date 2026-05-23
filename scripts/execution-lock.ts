#!/usr/bin/env tsx
/**
 * execution-lock.ts
 * Deterministic execution locking infrastructure.
 * First-requester-wins, append-only events, configurable TTL.
 */
import { readFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";

const LOCKS_DIR = resolve("project-governance/runtime/locks");
const LOCKS_LOG = resolve("project-governance/runtime/locks/locks.ndjson");
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface LockEvent {
  event_id: string;
  timestamp: string;
  action: "acquired" | "released" | "expired" | "recovered";
  execution_id: string;
  locked_by: string;
  ttl_ms: number;
  expires_at: string;
  reason?: string;
}

interface LockState {
  locked: boolean;
  execution_id: string | null;
  locked_by: string | null;
  acquired_at: string | null;
  expires_at: string | null;
  ttl_ms: number;
}

function ensureDir(): void {
  if (!existsSync(LOCKS_DIR)) mkdirSync(LOCKS_DIR, { recursive: true });
}

function readLockEvents(): LockEvent[] {
  if (!existsSync(LOCKS_LOG)) return [];
  const text = readFileSync(LOCKS_LOG, "utf-8");
  return text.split("\n").filter(l => l.trim() !== "").map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean) as LockEvent[];
}

function appendLockEvent(event: LockEvent): void {
  ensureDir();
  appendFileSync(LOCKS_LOG, JSON.stringify(event) + "\n", "utf-8");
}

function computeCurrentState(): LockState {
  const events = readLockEvents();
  let state: LockState = {
    locked: false,
    execution_id: null,
    locked_by: null,
    acquired_at: null,
    expires_at: null,
    ttl_ms: DEFAULT_TTL_MS,
  };

  for (const e of events) {
    switch (e.action) {
      case "acquired":
        state = {
          locked: true,
          execution_id: e.execution_id,
          locked_by: e.locked_by,
          acquired_at: e.timestamp,
          expires_at: e.expires_at,
          ttl_ms: e.ttl_ms,
        };
        break;
      case "released":
      case "expired":
      case "recovered":
        state = {
          locked: false,
          execution_id: null,
          locked_by: null,
          acquired_at: null,
          expires_at: null,
          ttl_ms: DEFAULT_TTL_MS,
        };
        break;
    }
  }

  // Check if current lock has expired
  if (state.locked && state.expires_at && new Date(state.expires_at) < new Date()) {
    // Auto-expire
    appendLockEvent({
      event_id: randomUUID(),
      timestamp: new Date().toISOString(),
      action: "expired",
      execution_id: state.execution_id || "",
      locked_by: state.locked_by || "",
      ttl_ms: state.ttl_ms,
      expires_at: state.expires_at,
      reason: "ttl_expired",
    });
    state.locked = false;
    state.execution_id = null;
    state.locked_by = null;
  }

  return state;
}

export function acquireLock(
  executionId: string,
  lockedBy: string = "agent",
  ttlMs: number = DEFAULT_TTL_MS
): { acquired: boolean; state: LockState; error?: string } {
  const current = computeCurrentState();

  if (current.locked) {
    return {
      acquired: false,
      state: current,
      error: `Lock held by ${current.locked_by} for ${current.execution_id}`,
    };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  const event: LockEvent = {
    event_id: randomUUID(),
    timestamp: now.toISOString(),
    action: "acquired",
    execution_id: executionId,
    locked_by: lockedBy,
    ttl_ms: ttlMs,
    expires_at: expiresAt.toISOString(),
  };

  appendLockEvent(event);
  const newState = computeCurrentState();

  return { acquired: true, state: newState };
}

export function releaseLock(executionId: string, reason: string = "completed"): { released: boolean; state: LockState; error?: string } {
  const current = computeCurrentState();

  if (!current.locked) {
    return { released: false, state: current, error: "No active lock" };
  }

  if (current.execution_id !== executionId) {
    return {
      released: false,
      state: current,
      error: `Lock owned by ${current.execution_id}, not ${executionId}`,
    };
  }

  const event: LockEvent = {
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
    action: "released",
    execution_id: executionId,
    locked_by: current.locked_by || "",
    ttl_ms: current.ttl_ms,
    expires_at: current.expires_at || "",
    reason,
  };

  appendLockEvent(event);
  return { released: true, state: computeCurrentState() };
}

export function recoverLock(executionId: string, reason: string = "interrupted_session"): { recovered: boolean; state: LockState; error?: string } {
  const current = computeCurrentState();

  if (!current.locked) {
    return { recovered: false, state: current, error: "No active lock to recover" };
  }

  if (current.execution_id !== executionId) {
    return {
      recovered: false,
      state: current,
      error: `Lock owned by ${current.execution_id}, not ${executionId}`,
    };
  }

  const event: LockEvent = {
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
    action: "recovered",
    execution_id: executionId,
    locked_by: current.locked_by || "",
    ttl_ms: current.ttl_ms,
    expires_at: current.expires_at || "",
    reason,
  };

  appendLockEvent(event);
  return { recovered: true, state: computeCurrentState() };
}

export function getLockState(): LockState {
  return computeCurrentState();
}

export function getLockHistory(): LockEvent[] {
  return readLockEvents();
}

export { computeCurrentState, DEFAULT_TTL_MS };

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: tsx scripts/execution-lock.ts <command> [args]");
    console.error("Commands:");
    console.error("  acquire <execution_id> [ttl_seconds]");
    console.error("  release <execution_id> [reason]");
    console.error("  recover <execution_id> [reason]");
    console.error("  state");
    console.error("  history");
    process.exit(1);
  }

  const command = args[0];

  if (command === "acquire") {
    const execId = args[1];
    const ttl = args[2] ? parseInt(args[2], 10) * 1000 : DEFAULT_TTL_MS;
    const result = acquireLock(execId, "cli", ttl);
    console.log(result.acquired ? "✅ Lock acquired" : "❌ Lock denied", result.error || "");
    console.log(`State: ${result.state.locked ? "locked" : "unlocked"}`);
  } else if (command === "release") {
    const execId = args[1];
    const reason = args[2] || "completed";
    const result = releaseLock(execId, reason);
    console.log(result.released ? "✅ Lock released" : "❌ Release failed", result.error || "");
  } else if (command === "recover") {
    const execId = args[1];
    const reason = args[2] || "interrupted_session";
    const result = recoverLock(execId, reason);
    console.log(result.recovered ? "✅ Lock recovered" : "❌ Recovery failed", result.error || "");
  } else if (command === "state") {
    const state = getLockState();
    console.log(`Locked: ${state.locked}`);
    if (state.locked) {
      console.log(`Execution: ${state.execution_id}`);
      console.log(`By: ${state.locked_by}`);
      console.log(`Expires: ${state.expires_at}`);
    }
  } else if (command === "history") {
    const history = getLockHistory();
    for (const h of history) {
      console.log(`${h.timestamp} | ${h.action} | ${h.execution_id} | ${h.locked_by}`);
    }
  }
}
