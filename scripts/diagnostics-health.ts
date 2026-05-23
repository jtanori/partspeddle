#!/usr/bin/env tsx
/**
 * diagnostics-health.ts
 * Health check runner for governance runtime.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const CANONICAL_STATE_PATH = resolve("meta/state/canonical-state.json");
const GOV_STREAMS_DIR = resolve("project-governance/runtime/events/streams");
const TELEMETRY_DIR = resolve("project-governance/runtime/telemetry/logs");

interface HealthCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

function checkCanonicalState(): HealthCheck {
  if (!existsSync(CANONICAL_STATE_PATH)) {
    return { name: "canonical_state", status: "fail", message: "Canonical state file missing" };
  }
  try {
    const state = JSON.parse(readFileSync(CANONICAL_STATE_PATH, "utf-8"));
    if (!state.milestone || !state.milestone.id) {
      return { name: "canonical_state", status: "warn", message: "Canonical state missing milestone" };
    }
    return { name: "canonical_state", status: "pass", message: `Milestone ${state.milestone.id} (${state.milestone.status})` };
  } catch {
    return { name: "canonical_state", status: "fail", message: "Canonical state is invalid JSON" };
  }
}

function checkEventStreams(): HealthCheck {
  const required = ["default.ndjson"];
  const missing = required.filter(f => !existsSync(resolve(GOV_STREAMS_DIR, f)));
  if (missing.length > 0) {
    return { name: "event_streams", status: "warn", message: `Missing streams: ${missing.join(", ")}` };
  }
  return { name: "event_streams", status: "pass", message: "Streams available" };
}

function checkTelemetryStreams(): HealthCheck {
  const required = ["default.ndjson"];
  const missing = required.filter(f => !existsSync(resolve(TELEMETRY_DIR, f)));
  if (missing.length > 0) {
    return { name: "telemetry_streams", status: "warn", message: `Missing streams: ${missing.join(", ")}` };
  }
  return { name: "telemetry_streams", status: "pass", message: "Streams available" };
}

function checkDrift(): HealthCheck {
  const now = new Date().getTime();
  let lastEventTime: number | null = null;

  const govDefault = resolve(GOV_STREAMS_DIR, "default.ndjson");
  if (existsSync(govDefault)) {
    const lines = readFileSync(govDefault, "utf-8").split("\n").filter(l => l.trim());
    if (lines.length > 0) {
      try {
        const last = JSON.parse(lines[lines.length - 1]);
        lastEventTime = new Date(last.timestamp).getTime();
      } catch { /* ignore */ }
    }
  }

  if (lastEventTime === null) {
    return { name: "drift", status: "warn", message: "No events to measure drift" };
  }

  const ageMinutes = (now - lastEventTime) / 60000;
  if (ageMinutes > 5) {
    return { name: "drift", status: "fail", message: `Last event ${ageMinutes.toFixed(1)} min ago (threshold: 5 min)` };
  }
  return { name: "drift", status: "pass", message: `Last event ${ageMinutes.toFixed(1)} min ago` };
}

export function runHealthChecks(): HealthCheck[] {
  return [
    checkCanonicalState(),
    checkEventStreams(),
    checkTelemetryStreams(),
    checkDrift(),
  ];
}

export { checkCanonicalState, checkEventStreams, checkTelemetryStreams, checkDrift };

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const checks = runHealthChecks();
  let failCount = 0;
  let warnCount = 0;

  for (const check of checks) {
    const icon = check.status === "pass" ? "✅" : check.status === "warn" ? "⚠️" : "❌";
    console.log(`${icon} ${check.name}: ${check.message}`);
    if (check.status === "fail") failCount++;
    if (check.status === "warn") warnCount++;
  }

  console.log(`\n${checks.length} checks, ${failCount} failed, ${warnCount} warnings`);
  process.exit(failCount > 0 ? 1 : 0);
}
