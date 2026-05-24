#!/usr/bin/env node
/**
 * Runtime Integrity Auditor
 *
 * Performs comprehensive reconciliation of all runtime state surfaces.
 * Detects stale state, missing files, projection inconsistencies, and integrity violations.
 *
 * Usage:
 *   tsx scripts/audit-runtime-integrity.ts
 *
 * Authority: SAFE_EXIT_PROTOCOL.md, STATE_MUTATION_RULES.md
 */

import fs from "fs";
import path from "path";

const RUNTIME_DIR = path.resolve("project-governance/runtime");
const STATE_DIR = path.join(RUNTIME_DIR, "state");
const PROJECTIONS_DIR = path.join(RUNTIME_DIR, "projections");
const CHECKPOINTS_DIR = path.join(RUNTIME_DIR, "checkpoints");
const HEARTBEATS_DIR = path.join(RUNTIME_DIR, "heartbeats");
const DRIFT_EVENTS_DIR = path.join(RUNTIME_DIR, "drift-events");
const COMPLETION_REPORTS_DIR = path.join(RUNTIME_DIR, "completion-reports");
const BOOTSTRAP_DIR = path.join(RUNTIME_DIR, "bootstrap");

interface IntegrityIssue {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  category: string;
  message: string;
  file?: string;
  recommendation: string;
}

interface AuditResult {
  timestamp: string;
  passed: boolean;
  issues: IntegrityIssue[];
  checks_total: number;
  checks_passed: number;
  runtime_confidence: number; // 0.0 - 1.0
  stale_surfaces: string[];
  missing_files: string[];
  projection_freshness_seconds: number;
}

const issues: IntegrityIssue[] = [];
let checksTotal = 0;
let checksPassed = 0;

function check(condition: boolean, passMsg: string, failIssue: IntegrityIssue) {
  checksTotal++;
  if (condition) {
    checksPassed++;
  } else {
    issues.push(failIssue);
  }
}

function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.resolve(relativePath));
}

function loadJsonSafe<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function minutesSince(isoTimestamp: string): number {
  const then = new Date(isoTimestamp).getTime();
  const now = Date.now();
  return (now - then) / 1000 / 60;
}

// ─── CHECK 1: Canonical state files exist ─────────────────────────────
const ae = loadJsonSafe<any>(path.join(STATE_DIR, "active-execution.json"));
check(
  ae !== null,
  "active-execution.json is valid JSON",
  {
    severity: "CRITICAL",
    category: "canonical_state",
    message: "active-execution.json is missing or corrupt",
    recommendation: "Recreate from latest checkpoint or runtime-state.json",
  }
);

const lock = loadJsonSafe<any>(path.join(STATE_DIR, "execution-lock.json"));
check(
  lock !== null,
  "execution-lock.json is valid JSON",
  {
    severity: "CRITICAL",
    category: "canonical_state",
    message: "execution-lock.json is missing or corrupt",
    recommendation: "Recreate with locked: false and default rules",
  }
);

const ct = loadJsonSafe<any>(path.join(STATE_DIR, "current-ticket.json"));
check(
  ct !== null,
  "current-ticket.json is valid JSON",
  {
    severity: "HIGH",
    category: "canonical_state",
    message: "current-ticket.json is missing or corrupt",
    recommendation: "Derive from runtime-state.json",
  }
);

const cm = loadJsonSafe<any>(path.join(STATE_DIR, "current-milestone.json"));
check(
  cm !== null,
  "current-milestone.json is valid JSON",
  {
    severity: "HIGH",
    category: "canonical_state",
    message: "current-milestone.json is missing or corrupt",
    recommendation: "Derive from runtime-state.json",
  }
);

const bootstrap = loadJsonSafe<any>(path.join(BOOTSTRAP_DIR, "runtime-bootstrap.json"));
check(
  bootstrap !== null,
  "runtime-bootstrap.json is valid JSON",
  {
    severity: "HIGH",
    category: "canonical_state",
    message: "runtime-bootstrap.json is missing or corrupt",
    recommendation: "Regenerate from active-execution.json",
  }
);

// ─── CHECK 2: active-execution.json schema completeness ───────────────
if (ae) {
  check(
    ae.protocol_version !== undefined,
    "active-execution.json has protocol_version",
    {
      severity: "CRITICAL",
      category: "schema",
      message: "active-execution.json missing protocol_version",
      recommendation: "Add protocol_version field",
    }
  );
  check(
    ae.runtime_status !== undefined,
    "active-execution.json has runtime_status",
    {
      severity: "CRITICAL",
      category: "schema",
      message: "active-execution.json missing runtime_status",
      recommendation: "Add runtime_status field (IDLE | ACTIVE | QUIESCENT)",
    }
  );
  check(
    typeof ae.execution_active === "boolean",
    "active-execution.json has execution_active boolean",
    {
      severity: "CRITICAL",
      category: "schema",
      message: "active-execution.json missing or invalid execution_active",
      recommendation: "Add execution_active: boolean",
    }
  );
  check(
    typeof ae.safe_to_resume === "boolean",
    "active-execution.json has safe_to_resume boolean",
    {
      severity: "HIGH",
      category: "schema",
      message: "active-execution.json missing safe_to_resume",
      recommendation: "Add safe_to_resume: boolean",
    }
  );
  check(
    "safe_exit" in ae,
    "active-execution.json has safe_exit field",
    {
      severity: "MEDIUM",
      category: "schema",
      message: "active-execution.json missing safe_exit field",
      recommendation: "Add safe_exit object for exit tracking",
    }
  );
  check(
    ae.system?.updated_at !== undefined,
    "active-execution.json has system.updated_at",
    {
      severity: "MEDIUM",
      category: "schema",
      message: "active-execution.json missing system.updated_at",
      recommendation: "Add system.updated_at timestamp",
    }
  );
}

// ─── CHECK 3: Lock consistency ────────────────────────────────────────
if (ae && lock) {
  const lockHoldersMatch =
    !lock.locked ||
    (lock.execution_id === ae.execution?.execution_id) ||
    (!ae.execution_active && !lock.locked);

  check(
    lockHoldersMatch,
    "Lock holder matches active execution",
    {
      severity: "CRITICAL",
      category: "lock_consistency",
      message: `Lock held by ${lock.execution_id} but active-execution shows execution_active=${ae.execution_active}`,
      recommendation: "Release stale lock or reconcile execution state",
    }
  );

  if (lock.locked && lock.expires_at) {
    const stale = minutesSince(lock.expires_at) > 0;
    check(
      !stale,
      "Lock has not expired",
      {
        severity: "HIGH",
        category: "lock_consistency",
        message: `Lock expired at ${lock.expires_at}. Possible crashed session.`,
        recommendation: "Perform stale lock recovery per SAFE_EXIT_PROTOCOL.md",
      }
    );
  }
}

// ─── CHECK 4: Ticket / Milestone consistency ─────────────────────────
if (ae && ct && cm) {
  const milestoneMatch =
    !ae.last_execution ||
    ae.last_execution.milestone_id === cm.active_milestone?.id;
  check(
    milestoneMatch,
    "Last execution milestone matches current-milestone",
    {
      severity: "MEDIUM",
      category: "consistency",
      message: `Last execution milestone (${ae.last_execution?.milestone_id}) does not match current milestone (${cm.active_milestone?.id})`,
      recommendation: "Reconcile milestone transitions",
    }
  );

  const ticketMatch =
    !ae.last_execution ||
    ae.last_execution.task_id === ct.last_ticket?.id ||
    ae.last_execution.task_id === ct.ticket?.id;
  check(
    ticketMatch,
    "Last execution task matches current-ticket",
    {
      severity: "MEDIUM",
      category: "consistency",
      message: `Last execution task (${ae.last_execution?.task_id}) does not match current ticket state`,
      recommendation: "Reconcile ticket transitions",
    }
  );
}

// ─── CHECK 5: Referenced artifacts exist ──────────────────────────────
if (ae?.last_execution?.checkpoint_path) {
  check(
    fileExists(ae.last_execution.checkpoint_path),
    `Checkpoint exists: ${ae.last_execution.checkpoint_path}`,
    {
      severity: "HIGH",
      category: "artifact_integrity",
      message: `Referenced checkpoint missing: ${ae.last_execution.checkpoint_path}`,
      recommendation: "Regenerate checkpoint or update active-execution.json reference",
    }
  );
}

if (ae?.last_execution?.completion_report_path) {
  check(
    fileExists(ae.last_execution.completion_report_path),
    `Completion report exists: ${ae.last_execution.completion_report_path}`,
    {
      severity: "HIGH",
      category: "artifact_integrity",
      message: `Referenced completion report missing: ${ae.last_execution.completion_report_path}`,
      recommendation: "Generate completion report or update active-execution.json reference",
    }
  );
}

if (ae?.safe_exit?.exit_checkpoint_path) {
  check(
    fileExists(ae.safe_exit.exit_checkpoint_path),
    `Safe exit checkpoint exists: ${ae.safe_exit.exit_checkpoint_path}`,
    {
      severity: "HIGH",
      category: "artifact_integrity",
      message: `Safe exit checkpoint missing: ${ae.safe_exit.exit_checkpoint_path}`,
      recommendation: "Regenerate safe exit checkpoint",
    }
  );
}

if (ae?.safe_exit?.bootstrap_path) {
  check(
    fileExists(ae.safe_exit.bootstrap_path),
    `Safe exit bootstrap exists: ${ae.safe_exit.bootstrap_path}`,
    {
      severity: "MEDIUM",
      category: "artifact_integrity",
      message: `Safe exit bootstrap missing: ${ae.safe_exit.bootstrap_path}`,
      recommendation: "Regenerate runtime-bootstrap.json",
    }
  );
}

if (ae?.safe_exit?.resume_instruction_path) {
  check(
    fileExists(ae.safe_exit.resume_instruction_path),
    `Safe exit resume instruction exists: ${ae.safe_exit.resume_instruction_path}`,
    {
      severity: "MEDIUM",
      category: "artifact_integrity",
      message: `Safe exit resume instruction missing: ${ae.safe_exit.resume_instruction_path}`,
      recommendation: "Regenerate resume-instruction.md",
    }
  );
}

// ─── CHECK 6: Projection freshness ────────────────────────────────────
const projectionFiles = ["latest-status.md", "latest-heartbeat.md", "current-context.md", "resume-instruction.md"];
let maxProjectionAgeMinutes = 0;
for (const proj of projectionFiles) {
  const projPath = path.join(PROJECTIONS_DIR, proj);
  if (fs.existsSync(projPath)) {
    const content = fs.readFileSync(projPath, "utf-8");
    const match = content.match(/Generated at:[*\s]*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[\d\.]*Z)/);
    if (match) {
      const age = minutesSince(match[1]);
      maxProjectionAgeMinutes = Math.max(maxProjectionAgeMinutes, age);
      check(
        age < 60,
        `Projection ${proj} is fresh (${Math.round(age)} min old)`,
        {
          severity: "MEDIUM",
          category: "projection_freshness",
          message: `Projection ${proj} is stale (${Math.round(age)} min old)`,
          recommendation: "Regenerate projections with scripts/generate-runtime-projections.ts",
        }
      );
    } else {
      issues.push({
        severity: "LOW",
        category: "projection_freshness",
        message: `Projection ${proj} missing timestamp header`,
        recommendation: "Regenerate projections",
      });
    }
  } else {
    issues.push({
      severity: "MEDIUM",
      category: "projection_freshness",
      message: `Projection ${proj} missing`,
      recommendation: "Regenerate projections",
    });
  }
}

// ─── CHECK 7: Stale state detection ───────────────────────────────────
if (ae?.system?.updated_at) {
  const stateAge = minutesSince(ae.system.updated_at);
  check(
    stateAge < 1440,
    `active-execution.json updated within last 24h (${Math.round(stateAge)} min ago)`,
    {
      severity: "MEDIUM",
      category: "staleness",
      message: `active-execution.json is stale (${Math.round(stateAge)} min since last update)`,
      recommendation: "Verify execution state is current; update timestamp if accurate",
    }
  );
}

// ─── CHECK 8: Heartbeat continuity ────────────────────────────────────
const heartbeatFiles = fs.existsSync(HEARTBEATS_DIR)
  ? fs.readdirSync(HEARTBEATS_DIR).filter((f) => f.endsWith(".json")).sort()
  : [];

if (ae?.execution_active && heartbeatFiles.length === 0) {
  issues.push({
    severity: "HIGH",
    category: "heartbeat_continuity",
    message: "Execution is active but no heartbeats found",
    recommendation: "Emit heartbeat immediately per HEARTBEAT_POLICY.md",
  });
}

if (ae?.execution_active && heartbeatFiles.length > 0) {
  const latestHb = loadJsonSafe<any>(path.join(HEARTBEATS_DIR, heartbeatFiles[heartbeatFiles.length - 1]));
  if (latestHb?.HEARTBEAT?.metadata?.timestamp) {
    const hbAge = minutesSince(latestHb.HEARTBEAT.metadata.timestamp);
    check(
      hbAge < 30,
      `Latest heartbeat is recent (${Math.round(hbAge)} min ago)`,
      {
        severity: "HIGH",
        category: "heartbeat_continuity",
        message: `Latest heartbeat is stale (${Math.round(hbAge)} min ago)`,
        recommendation: "Emit heartbeat or detect unsafe exit",
      }
    );
  }
}

// ─── CHECK 9: Safe exit verification ──────────────────────────────────
if (ae?.runtime_status === "QUIESCENT") {
  check(
    ae.safe_exit !== null,
    "QUIESCENT state has safe_exit record",
    {
      severity: "HIGH",
      category: "safe_exit",
      message: "runtime_status is QUIESCENT but safe_exit is null",
      recommendation: "Perform safe exit sequence or transition to IDLE",
    }
  );
  if (ae.safe_exit) {
    check(
      ae.safe_exit.lock_released === true,
      "Safe exit released lock",
      {
        severity: "HIGH",
        category: "safe_exit",
        message: "safe_exit.lock_released is false",
        recommendation: "Release execution lock",
      }
    );
    check(
      ae.safe_exit.projections_regenerated === true,
      "Safe exit regenerated projections",
      {
        severity: "MEDIUM",
        category: "safe_exit",
        message: "safe_exit.projections_regenerated is false",
        recommendation: "Regenerate projections",
      }
    );
  }
}

// ─── CHECK 10: Bootstrap consistency ──────────────────────────────────
if (bootstrap && ae) {
  const bootstrapMilestoneMatch =
    bootstrap.current_milestone?.id === cm?.active_milestone?.id;
  check(
    bootstrapMilestoneMatch,
    "Bootstrap milestone matches current milestone",
    {
      severity: "MEDIUM",
      category: "bootstrap_consistency",
      message: `Bootstrap milestone (${bootstrap.current_milestone?.id}) != current milestone (${cm?.active_milestone?.id})`,
      recommendation: "Regenerate runtime-bootstrap.json",
    }
  );
}

// ─── CALCULATE RUNTIME CONFIDENCE ─────────────────────────────────────
const criticalIssues = issues.filter((i) => i.severity === "CRITICAL").length;
const highIssues = issues.filter((i) => i.severity === "HIGH").length;
const mediumIssues = issues.filter((i) => i.severity === "MEDIUM").length;
const lowIssues = issues.filter((i) => i.severity === "LOW").length;

let confidence = 1.0;
confidence -= criticalIssues * 0.25;
confidence -= highIssues * 0.15;
confidence -= mediumIssues * 0.05;
confidence -= lowIssues * 0.01;
confidence = Math.max(0.0, confidence);

// Projection freshness penalty
if (maxProjectionAgeMinutes > 60) {
  confidence -= 0.05;
}

// Stale state penalty
if (ae?.system?.updated_at && minutesSince(ae.system.updated_at) > 1440) {
  confidence -= 0.1;
}

confidence = Math.max(0.0, Math.min(1.0, confidence));

// ─── REPORT ───────────────────────────────────────────────────────────
const result: AuditResult = {
  timestamp: new Date().toISOString(),
  passed: issues.filter((i) => i.severity === "CRITICAL" || i.severity === "HIGH").length === 0,
  issues,
  checks_total: checksTotal,
  checks_passed: checksPassed,
  runtime_confidence: Math.round(confidence * 100) / 100,
  stale_surfaces: issues.filter((i) => i.category === "staleness" || i.category === "projection_freshness").map((i) => i.message),
  missing_files: issues.filter((i) => i.category === "artifact_integrity").map((i) => i.message),
  projection_freshness_seconds: Math.round(maxProjectionAgeMinutes * 60),
};

// Write report
const reportDir = path.join(RUNTIME_DIR, "audits");
if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
const reportPath = path.join(reportDir, `integrity-audit-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));

// Console output
console.log("══════════════════════════════════════════════════════════");
console.log("     VINTRACK RUNTIME INTEGRITY AUDIT");
console.log("══════════════════════════════════════════════════════════");
console.log("");
console.log(`Timestamp:         ${result.timestamp}`);
console.log(`Checks Run:        ${result.checks_total}`);
console.log(`Checks Passed:     ${result.checks_passed}`);
console.log(`Checks Failed:     ${result.checks_total - result.checks_passed}`);
console.log(`Runtime Confidence: ${(result.runtime_confidence * 100).toFixed(0)}%`);
console.log(`Overall Status:    ${result.passed ? "✅ PASSED" : "❌ FAILED"}`);
console.log("");

if (result.issues.length > 0) {
  const bySeverity = { CRITICAL: [] as IntegrityIssue[], HIGH: [] as IntegrityIssue[], MEDIUM: [] as IntegrityIssue[], LOW: [] as IntegrityIssue[], INFO: [] as IntegrityIssue[] };
  for (const issue of result.issues) {
    bySeverity[issue.severity].push(issue);
  }

  for (const sev of ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const) {
    const list = bySeverity[sev];
    if (list.length === 0) continue;
    console.log(`${sev} (${list.length}):`);
    for (const issue of list) {
      console.log(`  [${issue.category}] ${issue.message}`);
      console.log(`    → ${issue.recommendation}`);
    }
    console.log("");
  }
} else {
  console.log("No issues detected. Runtime integrity is clean.");
}

console.log(`Report written to: ${reportPath}`);
console.log("══════════════════════════════════════════════════════════");

process.exit(result.passed ? 0 : 1);
