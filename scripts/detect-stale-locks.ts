#!/usr/bin/env tsx
/**
 * detect-stale-locks.ts
 * Stale lock detector. Identifies locks past their TTL
 * and optionally recovers them.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { getLockState, recoverLock } from "./execution-lock.js";

const STALE_THRESHOLD_MS = 60 * 1000; // 1 minute past expiry
const LOCKS_LOG = resolve("project-governance/runtime/locks/locks.ndjson");

interface LockEvent {
  timestamp: string;
  action: string;
  execution_id: string;
  expires_at: string;
}

interface StaleLockReport {
  detected_at: string;
  stale: boolean;
  lock_state: ReturnType<typeof getLockState>;
  age_ms: number;
  recommendation: string;
}

function readLockEvents(): LockEvent[] {
  if (!existsSync(LOCKS_LOG)) return [];
  const text = readFileSync(LOCKS_LOG, "utf-8");
  return text.split("\n").filter(l => l.trim() !== "").map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean) as LockEvent[];
}

function findLastAcquisition(): LockEvent | null {
  const events = readLockEvents();
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].action === "acquired") return events[i];
  }
  return null;
}

function wasReleased(acquisition: LockEvent): boolean {
  const events = readLockEvents();
  const idx = events.findIndex(e => e.event_id === acquisition.event_id);
  const after = events.slice(idx + 1);
  return after.some(e => e.action === "released" || e.action === "recovered" || e.action === "expired");
}

export function detectStaleLocks(): StaleLockReport {
  const state = getLockState();
  const now = new Date();

  if (!state.locked || !state.expires_at) {
    return {
      detected_at: now.toISOString(),
      stale: false,
      lock_state: state,
      age_ms: 0,
      recommendation: "No active lock",
    };
  }

  const expiresAt = new Date(state.expires_at);
  const ageMs = now.getTime() - expiresAt.getTime();
  const stale = ageMs > STALE_THRESHOLD_MS;

  return {
    detected_at: now.toISOString(),
    stale,
    lock_state: state,
    age_ms: ageMs,
    recommendation: stale
      ? `Lock for ${state.execution_id} is stale (${(ageMs / 1000).toFixed(0)}s past expiry). Recommend recovery.`
      : `Lock expires in ${Math.abs(ageMs / 1000).toFixed(0)}s`,
  };
}

export function autoRecoverStaleLock(): { recovered: boolean; report: StaleLockReport; error?: string } {
  const report = detectStaleLocks();
  if (!report.stale) {
    return { recovered: false, report, error: "Lock not stale" };
  }

  if (!report.lock_state.execution_id) {
    return { recovered: false, report, error: "No execution_id for stale lock" };
  }

  const result = recoverLock(report.lock_state.execution_id, "stale_lock_auto_recovery");
  return { recovered: result.recovered, report, error: result.error };
}

export { STALE_THRESHOLD_MS };

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const autoRecover = args.includes("--recover");

  if (autoRecover) {
    const result = autoRecoverStaleLock();
    console.log(result.recovered ? "✅ Recovered stale lock" : "❌ Recovery failed", result.error || "");
    console.log(result.report.recommendation);
  } else {
    const report = detectStaleLocks();
    console.log(`Stale: ${report.stale}`);
    console.log(`Age past expiry: ${(report.age_ms / 1000).toFixed(0)}s`);
    console.log(`Recommendation: ${report.recommendation}`);
    process.exit(report.stale ? 1 : 0);
  }
}
