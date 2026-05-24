#!/usr/bin/env tsx
/**
 * diagnostics-console.ts
 * Runtime diagnostic console. CLI-first implementation.
 * Operates using structured telemetry and governance events only.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve, join } from "path";

const GOV_STREAMS_DIR = resolve("project-governance/runtime/events/streams");
const TELEMETRY_DIR = resolve("project-governance/runtime/telemetry/logs");
const DIAGNOSTICS_DIR = resolve("project-governance/runtime/diagnostics");
const CANONICAL_STATE_PATH = resolve("meta/state/canonical-state.json");

interface DiagnosticFilters {
  severity?: string;
  category?: string;
  execution_id?: string;
  since?: string;
}

interface GovernanceEvent {
  timestamp: string;
  event_type: string;
  severity: string;
  category: string;
  execution_id?: string | null;
  payload?: Record<string, unknown>;
}

interface TelemetryEvent {
  timestamp: string;
  category: string;
  name: string;
  value: unknown;
  severity: string;
  execution_id?: string | null;
}

function readNdjson(path: string): Record<string, unknown>[] {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf-8");
  return text.split("\n").filter(l => l.trim() !== "").map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean) as Record<string, unknown>[];
}

function loadGovEvents(streamName: string): GovernanceEvent[] {
  return readNdjson(join(GOV_STREAMS_DIR, `${streamName}.ndjson`)) as GovernanceEvent[];
}

function loadTelemetry(streamName: string): TelemetryEvent[] {
  return readNdjson(join(TELEMETRY_DIR, `${streamName}.ndjson`)) as TelemetryEvent[];
}

function loadCanonicalState(): Record<string, unknown> | null {
  if (!existsSync(CANONICAL_STATE_PATH)) return null;
  return JSON.parse(readFileSync(CANONICAL_STATE_PATH, "utf-8"));
}

function formatSeverity(sev: string): string {
  const colors: Record<string, string> = {
    debug: "\x1b[90m",
    info: "\x1b[32m",
    warn: "\x1b[33m",
    error: "\x1b[31m",
    critical: "\x1b[35m",
  };
  const reset = "\x1b[0m";
  return `${colors[sev] || ""}[${sev.toUpperCase()}]${reset}`;
}

function runQuickHealthChecks(): Array<{ name: string; status: "pass" | "warn" | "fail"; message: string }> {
  const checks: Array<{ name: string; status: "pass" | "warn" | "fail"; message: string }> = [];

  // Canonical state
  if (!existsSync(CANONICAL_STATE_PATH)) {
    checks.push({ name: "canonical_state", status: "fail", message: "Canonical state file missing" });
  } else {
    try {
      const state = JSON.parse(readFileSync(CANONICAL_STATE_PATH, "utf-8"));
      if (!state.milestone || !state.milestone.id) {
        checks.push({ name: "canonical_state", status: "warn", message: "Canonical state missing milestone" });
      } else {
        checks.push({ name: "canonical_state", status: "pass", message: `Milestone ${state.milestone.id} (${state.milestone.status})` });
      }
    } catch {
      checks.push({ name: "canonical_state", status: "fail", message: "Canonical state is invalid JSON" });
    }
  }

  // Event streams
  const requiredGov = ["default.ndjson"];
  const missingGov = requiredGov.filter(f => !existsSync(resolve(GOV_STREAMS_DIR, f)));
  checks.push({ name: "event_streams", status: missingGov.length > 0 ? "warn" : "pass", message: missingGov.length > 0 ? `Missing: ${missingGov.join(", ")}` : "Streams available" });

  // Telemetry streams
  const requiredTel = ["default.ndjson"];
  const missingTel = requiredTel.filter(f => !existsSync(resolve(TELEMETRY_DIR, f)));
  checks.push({ name: "telemetry_streams", status: missingTel.length > 0 ? "warn" : "pass", message: missingTel.length > 0 ? `Missing: ${missingTel.join(", ")}` : "Streams available" });

  // Drift
  const now = new Date().getTime();
  let lastEventTime: number | null = null;
  const govDefault = resolve(GOV_STREAMS_DIR, "default.ndjson");
  if (existsSync(govDefault)) {
    const lines = readFileSync(govDefault, "utf-8").split("\n").filter(l => l.trim());
    if (lines.length > 0) {
      try { lastEventTime = new Date(JSON.parse(lines[lines.length - 1]).timestamp).getTime(); } catch { /* ignore */ }
    }
  }
  if (lastEventTime === null) {
    checks.push({ name: "drift", status: "warn", message: "No events to measure drift" });
  } else {
    const ageMinutes = (now - lastEventTime) / 60000;
    checks.push({ name: "drift", status: ageMinutes > 5 ? "fail" : "pass", message: `Last event ${ageMinutes.toFixed(1)} min ago` });
  }

  return checks;
}

export function runDiagnostics(filters: DiagnosticFilters = {}, quick = false): {
  summary: string;
  details: string;
  failures: Array<{ source: string; event: GovernanceEvent | TelemetryEvent }>;
  reportPath: string;
} {
  const lines: string[] = [];
  const failures: Array<{ source: string; event: GovernanceEvent | TelemetryEvent }> = [];

  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║           VINTRACK RUNTIME DIAGNOSTIC CONSOLE                ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");

  if (quick) {
    lines.push("─── Quick Health Checks ───");
    const checks = runQuickHealthChecks();
    let failCount = 0;
    let warnCount = 0;
    for (const check of checks) {
      const icon = check.status === "pass" ? "✅" : check.status === "warn" ? "⚠️" : "❌";
      lines.push(`${icon} ${check.name}: ${check.message}`);
      if (check.status === "fail") failCount++;
      if (check.status === "warn") warnCount++;
    }
    lines.push(`\n${checks.length} checks, ${failCount} failed, ${warnCount} warnings`);
    lines.push("");
    lines.push("──────────────────────────────────────────────────────────────");

    const summary = lines.join("\n");
    ensureDir(DIAGNOSTICS_DIR);
    const reportPath = join(DIAGNOSTICS_DIR, `quick-diagnostic-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
    writeFileSync(reportPath, summary);
    return { summary, details: summary, failures, reportPath };
  }

  // ── Canonical State ──
  const state = loadCanonicalState();
  lines.push("─── Canonical State ───");
  if (state) {
    const exec = state.execution as Record<string, unknown> | null;
    if (exec) {
      lines.push(`Active Execution: ${exec.execution_id} (${exec.status})`);
      lines.push(`Task: ${exec.task_id} | Milestone: ${exec.milestone_id}`);
    } else {
      lines.push("No active execution");
    }
    const drift = state.drift as Record<string, unknown>;
    lines.push(`Drift Level: ${drift.level} — ${drift.reason}`);
  } else {
    lines.push("Canonical state not found");
  }
  lines.push("");

  // ── Governance Events ──
  lines.push("─── Governance Events ───");
  const govStreams = ["default", "errors", "validation"];
  let govTotal = 0;
  for (const stream of govStreams) {
    const events = loadGovEvents(stream);
    const filtered = events.filter(e => {
      if (filters.severity && e.severity !== filters.severity) return false;
      if (filters.category && e.category !== filters.category) return false;
      if (filters.execution_id && e.execution_id !== filters.execution_id) return false;
      if (filters.since && e.timestamp < filters.since) return false;
      return true;
    });
    govTotal += filtered.length;
    for (const e of filtered.slice(-5)) {
      const sev = formatSeverity(e.severity);
      const execId = e.execution_id ? ` | ${e.execution_id}` : "";
      lines.push(`  ${sev} ${e.timestamp} | ${e.event_type} | ${e.category}${execId}`);
      if (e.severity === "error" || e.severity === "critical") {
        failures.push({ source: `governance:${stream}`, event: e });
      }
    }
  }
  lines.push(`  Total events (filtered): ${govTotal}`);
  lines.push("");

  // ── Telemetry ──
  lines.push("─── Telemetry ───");
  const telStreams = ["default", "traces"];
  let telTotal = 0;
  for (const stream of telStreams) {
    const events = loadTelemetry(stream);
    const filtered = events.filter(e => {
      if (filters.severity && e.severity !== filters.severity) return false;
      if (filters.category && e.category !== filters.category) return false;
      if (filters.execution_id && e.execution_id !== filters.execution_id) return false;
      if (filters.since && e.timestamp < filters.since) return false;
      return true;
    });
    telTotal += filtered.length;
    for (const e of filtered.slice(-5)) {
      const sev = formatSeverity(e.severity);
      const execId = e.execution_id ? ` | ${e.execution_id}` : "";
      lines.push(`  ${sev} ${e.timestamp} | ${e.name}=${e.value} | ${e.category}${execId}`);
      if (e.severity === "error" || e.severity === "critical") {
        failures.push({ source: `telemetry:${stream}`, event: e });
      }
    }
  }
  lines.push(`  Total events (filtered): ${telTotal}`);
  lines.push("");

  // ── Drift Detection ──
  lines.push("─── Drift Detection ───");
  const now = new Date().toISOString();
  const lastEventTime = [...loadGovEvents("default"), ...loadTelemetry("default")]
    .map(e => e.timestamp)
    .sort()
    .pop();
  if (lastEventTime) {
    const ageMinutes = (new Date(now).getTime() - new Date(lastEventTime).getTime()) / 60000;
    if (ageMinutes > 5) {
      lines.push(`⚠️  DRIFT: Last event ${ageMinutes.toFixed(1)} minutes ago (threshold: 5 min)`);
      failures.push({ source: "drift", event: { timestamp: now, event_type: "drift.detected", severity: "warn", category: "diagnostics" } });
    } else {
      lines.push(`✅ Last event ${ageMinutes.toFixed(1)} minutes ago`);
    }
  } else {
    lines.push("ℹ️  No events in streams");
  }
  lines.push("");

  // ── Failure Summary ──
  lines.push("─── Failure Summary ───");
  if (failures.length === 0) {
    lines.push("✅ No failures detected");
  } else {
    const bySeverity: Record<string, number> = {};
    for (const f of failures) {
      bySeverity[f.event.severity] = (bySeverity[f.event.severity] || 0) + 1;
    }
    for (const [sev, count] of Object.entries(bySeverity)) {
      lines.push(`  ${formatSeverity(sev)} ${count} occurrence(s)`);
    }
  }
  lines.push("");
  lines.push("──────────────────────────────────────────────────────────────");

  const summary = lines.join("\n");
  const details = summary;

  ensureDir(DIAGNOSTICS_DIR);
  const reportPath = join(DIAGNOSTICS_DIR, `diagnostic-report-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
  writeFileSync(reportPath, summary);

  return { summary, details, failures, reportPath };
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export { loadGovEvents, loadTelemetry, loadCanonicalState };

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const quick = args.includes("--quick");
  const filters: DiagnosticFilters = {};
  for (let i = 0; i < args.length; i += 2) {
    switch (args[i]) {
      case "--severity": filters.severity = args[i + 1]; break;
      case "--category": filters.category = args[i + 1]; break;
      case "--execution": filters.execution_id = args[i + 1]; break;
      case "--since": filters.since = args[i + 1]; break;
    }
  }
  const result = runDiagnostics(filters, quick);
  console.log(result.summary);
  console.log(`\nReport saved: ${result.reportPath}`);
  process.exit(result.failures.length > 0 ? 1 : 0);
}
