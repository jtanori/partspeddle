#!/usr/bin/env tsx
/**
 * check-deployment-readiness.ts
 * Deployment Readiness Engine
 *
 * Validates operational readiness before release.
 * Checks milestones, blockers, runtime integrity, governance consistency,
 * validation health, and audit cleanliness.
 *
 * Usage: tsx scripts/check-deployment-readiness.ts [run|json|manifest] [--save]
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { resolve, join } from "path";
import { randomUUID } from "crypto";

// ── Paths ──
const RUNTIME_STATE_PATH = resolve("project-governance/runtime/runtime-state.json");
const CURRENT_MILESTONE_PATH = resolve("project-governance/runtime/state/current-milestone.json");
const CURRENT_TICKET_PATH = resolve("project-governance/runtime/state/current-ticket.json");
const EXECUTION_LOCK_PATH = resolve("project-governance/runtime/state/execution-lock.json");
const DEPENDENCY_GRAPH_PATH = resolve("project-governance/runtime/dependency-graph.json");
const CHECKPOINTS_DIR = resolve("project-governance/checkpoints");
const DEPLOYMENT_DIR = resolve("project-governance/runtime/deployment");
const PROTOCOL_PATH = resolve("meta/governance/protocols/deployment-readiness.json");

// ── Types ──
interface ReadinessCheck {
  name: string;
  category: string;
  passed: boolean;
  severity: "critical" | "error" | "warn" | "info";
  message: string;
  details?: string[];
  remediation?: string;
}

interface ReadinessReport {
  report_id: string;
  timestamp: string;
  ticket_id: string;
  milestone_id: string;
  readiness_score: number;
  ready: boolean;
  checks: ReadinessCheck[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    critical: number;
    error: number;
    warn: number;
    info: number;
  };
  blockers: string[];
  release_manifest?: ReleaseManifest;
  duration_ms: number;
}

interface ReleaseManifest {
  manifest_id: string;
  timestamp: string;
  milestone_id: string;
  ticket_id: string;
  readiness_score: number;
  artifacts: string[];
  validations: string[];
  deployed_by: string;
}

// ── Helpers ──
function loadJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

function now(): string {
  return new Date().toISOString();
}

function checkMilestoneExhaustion(): ReadinessCheck {
  const state = loadJson<any>(RUNTIME_STATE_PATH);
  const checks: string[] = [];
  let passed = true;

  if (!state) {
    return {
      name: "milestone_exhaustion",
      category: "milestones",
      passed: false,
      severity: "critical",
      message: "runtime-state.json is missing or unreadable",
      remediation: "Restore runtime-state.json from backup or regenerate",
    };
  }

  const activeMilestone = state.active_milestone;
  if (!activeMilestone || activeMilestone.status !== "in_progress") {
    passed = false;
    checks.push(`Active milestone ${activeMilestone?.id} status is '${activeMilestone?.status}', expected 'in_progress'`);
  } else {
    checks.push(`Active milestone ${activeMilestone.id} (${activeMilestone.title}) is in_progress`);
  }

  const completed = state.completed_tickets || [];
  checks.push(`${completed.length} tickets marked completed`);

  return {
    name: "milestone_exhaustion",
    category: "milestones",
    passed,
    severity: passed ? "info" : "error",
    message: passed
      ? `Milestone ${activeMilestone?.id} is active with ${completed.length} completed tickets`
      : `Milestone state invalid: ${checks.join("; ")}`,
    details: checks,
  };
}

function checkUnresolvedBlockers(): ReadinessCheck {
  const state = loadJson<any>(RUNTIME_STATE_PATH);
  const blockers = state?.blocked_tickets || [];
  const passed = blockers.length === 0;

  return {
    name: "unresolved_blockers",
    category: "blockers",
    passed,
    severity: passed ? "info" : "critical",
    message: passed
      ? "No blocked tickets"
      : `${blockers.length} ticket(s) blocked: ${blockers.join(", ")}`,
    details: blockers,
    remediation: passed ? undefined : "Resolve all blocked tickets before deployment",
  };
}

function checkRuntimeIntegrity(): ReadinessCheck {
  const state = loadJson<any>(RUNTIME_STATE_PATH);
  const milestone = loadJson<any>(CURRENT_MILESTONE_PATH);
  const ticket = loadJson<any>(CURRENT_TICKET_PATH);
  const checks: string[] = [];
  let passed = true;

  if (!state) {
    passed = false;
    checks.push("runtime-state.json missing");
  }
  if (!milestone) {
    passed = false;
    checks.push("current-milestone.json missing");
  }
  if (!ticket) {
    passed = false;
    checks.push("current-ticket.json missing");
  }

  if (state && milestone) {
    if (state.active_milestone?.id !== milestone.active_milestone?.id) {
      passed = false;
      checks.push(`Milestone mismatch: runtime-state=${state.active_milestone?.id}, current-milestone=${milestone.active_milestone?.id}`);
    } else {
      checks.push(`Milestone synced: ${state.active_milestone?.id}`);
    }
  }

  if (state && ticket) {
    const activeTicketId = ticket.active ? ticket.ticket?.id : null;
    if (state.active_ticket?.id !== activeTicketId) {
      passed = false;
      checks.push(`Ticket mismatch: runtime-state=${state.active_ticket?.id}, current-ticket=${activeTicketId}`);
    } else {
      checks.push(`Ticket synced: ${activeTicketId}`);
    }
  }

  if (state) {
    const activePhase = state.active_phase;
    const milestonePhase = milestone?.active_milestone?.phase;
    if (activePhase !== milestonePhase) {
      passed = false;
      checks.push(`Phase mismatch: runtime-state=${activePhase}, current-milestone=${milestonePhase}`);
    } else {
      checks.push(`Phase synced: ${activePhase}`);
    }
  }

  return {
    name: "runtime_integrity",
    category: "integrity",
    passed,
    severity: passed ? "info" : "critical",
    message: passed
      ? "All runtime state files are synchronized"
      : `Runtime integrity violations detected: ${checks.filter(c => c.includes("mismatch") || c.includes("missing")).join("; ")}`,
    details: checks,
    remediation: passed ? undefined : "Run governance reconciliation to resynchronize state files",
  };
}

function checkGovernanceConsistency(): ReadinessCheck {
  const graph = loadJson<any>(DEPENDENCY_GRAPH_PATH);
  const checks: string[] = [];
  let passed = true;

  if (!graph) {
    return {
      name: "governance_consistency",
      category: "governance",
      passed: false,
      severity: "critical",
      message: "dependency-graph.json is missing",
      remediation: "Regenerate dependency-graph.json",
    };
  }

  // Check for cycles in milestone graph (DFS)
  const milestones = graph.milestones || {};
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function hasCycle(node: string): boolean {
    visited.add(node);
    recStack.add(node);
    const deps = milestones[node]?.depends_on || [];
    for (const dep of deps) {
      if (!visited.has(dep)) {
        if (hasCycle(dep)) return true;
      } else if (recStack.has(dep)) {
        return true;
      }
    }
    recStack.delete(node);
    return false;
  }

  for (const m of Object.keys(milestones)) {
    if (!visited.has(m)) {
      if (hasCycle(m)) {
        passed = false;
        checks.push(`Cycle detected involving milestone ${m}`);
        break;
      }
    }
  }

  if (passed) {
    checks.push(`Milestone graph acyclic (${Object.keys(milestones).length} milestones)`);
  }

  // Check that active milestone exists in graph
  const state = loadJson<any>(RUNTIME_STATE_PATH);
  const activeMilestoneId = state?.active_milestone?.id;
  if (activeMilestoneId && !milestones[activeMilestoneId]) {
    passed = false;
    checks.push(`Active milestone ${activeMilestoneId} not found in dependency graph`);
  } else if (activeMilestoneId) {
    checks.push(`Active milestone ${activeMilestoneId} present in graph`);
  }

  // Check that active ticket exists in graph
  const activeTicketId = state?.active_ticket?.id;
  const tickets = graph.tickets || {};
  if (activeTicketId && !tickets[activeTicketId]) {
    passed = false;
    checks.push(`Active ticket ${activeTicketId} not found in dependency graph`);
  } else if (activeTicketId) {
    checks.push(`Active ticket ${activeTicketId} present in graph`);
  }

  return {
    name: "governance_consistency",
    category: "governance",
    passed,
    severity: passed ? "info" : "critical",
    message: passed
      ? `Governance graph is consistent (${Object.keys(milestones).length} milestones, ${Object.keys(tickets).length} tickets)`
      : `Governance inconsistencies detected`,
    details: checks,
    remediation: passed ? undefined : "Fix dependency graph or runtime state mismatches",
  };
}

function checkCheckpointInfrastructure(): ReadinessCheck {
  const checks: string[] = [];
  let passed = true;

  if (!existsSync(CHECKPOINTS_DIR)) {
    passed = false;
    checks.push("checkpoints/ directory missing");
  } else {
    checks.push("checkpoints/ directory exists");
  }

  const latestCheckpoint = join(CHECKPOINTS_DIR, "latest-checkpoint.json");
  if (!existsSync(latestCheckpoint)) {
    passed = false;
    checks.push("latest-checkpoint.json missing");
  } else {
    try {
      const cp = JSON.parse(readFileSync(latestCheckpoint, "utf-8"));
      checks.push(`latest-checkpoint.json valid (ticket: ${cp.ticket_id})`);
    } catch {
      passed = false;
      checks.push("latest-checkpoint.json is invalid JSON");
    }
  }

  return {
    name: "checkpoint_infrastructure",
    category: "infrastructure",
    passed,
    severity: passed ? "info" : "error",
    message: passed
      ? "Checkpoint infrastructure is operational"
      : "Checkpoint infrastructure incomplete",
    details: checks,
    remediation: passed ? undefined : "Create checkpoints/ directory and seed latest-checkpoint.json",
  };
}

function checkExecutionLock(): ReadinessCheck {
  const lock = loadJson<any>(EXECUTION_LOCK_PATH);
  const checks: string[] = [];
  let passed = true;

  if (!lock) {
    return {
      name: "execution_lock",
      category: "locks",
      passed: false,
      severity: "error",
      message: "execution-lock.json is missing",
      remediation: "Acquire execution lock before deployment",
    };
  }

  if (!lock.locked) {
    passed = false;
    checks.push("Lock is released");
  } else {
    checks.push("Lock is acquired");
  }

  if (lock.expires_at) {
    const expires = new Date(lock.expires_at).getTime();
    const nowMs = Date.now();
    if (expires < nowMs) {
      passed = false;
      checks.push(`Lock expired at ${lock.expires_at}`);
    } else {
      checks.push(`Lock valid until ${lock.expires_at}`);
    }
  }

  const state = loadJson<any>(RUNTIME_STATE_PATH);
  const activeTicket = state?.active_ticket?.id;
  if (lock.locked && activeTicket && lock.execution_id) {
    checks.push(`Lock held for execution ${lock.execution_id}`);
  }

  return {
    name: "execution_lock",
    category: "locks",
    passed,
    severity: passed ? "info" : "error",
    message: passed
      ? `Execution lock valid (expires ${lock.expires_at})`
      : "Execution lock is invalid or expired",
    details: checks,
    remediation: passed ? undefined : "Acquire a fresh execution lock",
  };
}

function checkAuditCleanliness(): ReadinessCheck {
  const checks: string[] = [];
  let passed = true;

  // Check for uncommitted changes in governance files
  try {
    const { execSync } = require("child_process");
    const status = execSync("git status --short", { encoding: "utf-8", cwd: resolve(".") });
    const lines = status.trim().split("\n").filter((l: string) => l.trim());

    if (lines.length === 0) {
      checks.push("Worktree is clean");
    } else {
      const govChanges = lines.filter((l: string) =>
        l.includes("project-governance/") ||
        l.includes("project-management/") ||
        l.includes("meta/")
      );
      if (govChanges.length > 0) {
        passed = false;
        checks.push(`${govChanges.length} uncommitted governance file(s)`);
      } else {
        checks.push(`${lines.length} uncommitted non-governance file(s) - acceptable`);
      }
    }
  } catch {
    checks.push("Unable to check git status");
  }

  return {
    name: "audit_cleanliness",
    category: "audit",
    passed,
    severity: passed ? "info" : "warn",
    message: passed
      ? "Audit cleanliness verified"
      : "Uncommitted governance changes detected",
    details: checks,
    remediation: passed ? undefined : "Commit or stash governance changes before deployment",
  };
}

function checkValidationHealth(): ReadinessCheck {
  const checks: string[] = [];
  let passed = true;

  // Validate JSON files are parseable
  const filesToValidate = [
    RUNTIME_STATE_PATH,
    CURRENT_MILESTONE_PATH,
    CURRENT_TICKET_PATH,
    EXECUTION_LOCK_PATH,
    DEPENDENCY_GRAPH_PATH,
  ];

  for (const file of filesToValidate) {
    try {
      JSON.parse(readFileSync(file, "utf-8"));
      checks.push(`${file.replace(resolve(".") + "/", "")} - valid JSON`);
    } catch {
      passed = false;
      checks.push(`${file.replace(resolve(".") + "/", "")} - INVALID JSON`);
    }
  }

  return {
    name: "validation_health",
    category: "validation",
    passed,
    severity: passed ? "info" : "critical",
    message: passed
      ? "All runtime state files are valid JSON"
      : "Some runtime state files are corrupted",
    details: checks,
    remediation: passed ? undefined : "Repair corrupted JSON files",
  };
}

// ── Core ──
function runReadinessCheck(): ReadinessReport {
  const start = Date.now();
  const checks: ReadinessCheck[] = [];

  checks.push(checkMilestoneExhaustion());
  checks.push(checkUnresolvedBlockers());
  checks.push(checkRuntimeIntegrity());
  checks.push(checkGovernanceConsistency());
  checks.push(checkCheckpointInfrastructure());
  checks.push(checkExecutionLock());
  checks.push(checkAuditCleanliness());
  checks.push(checkValidationHealth());

  const failed = checks.filter(c => !c.passed);
  const critical = checks.filter(c => c.severity === "critical" && !c.passed);
  const errors = checks.filter(c => c.severity === "error" && !c.passed);
  const warnings = checks.filter(c => c.severity === "warn" && !c.passed);

  const passedCount = checks.filter(c => c.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);
  const ready = critical.length === 0 && errors.length === 0;

  const blockers = failed
    .filter(c => c.severity === "critical" || c.severity === "error")
    .map(c => `[${c.severity.toUpperCase()}] ${c.name}: ${c.message}`);

  const state = loadJson<any>(RUNTIME_STATE_PATH);

  let manifest: ReleaseManifest | undefined;
  if (ready) {
    manifest = {
      manifest_id: randomUUID(),
      timestamp: now(),
      milestone_id: state?.active_milestone?.id || "unknown",
      ticket_id: state?.active_ticket?.id || "unknown",
      readiness_score: score,
      artifacts: [
        "scripts/check-deployment-readiness.ts",
        "meta/governance/protocols/deployment-readiness.json",
        "project-governance/runtime/deployment/",
      ],
      validations: checks.filter(c => c.passed).map(c => c.name),
      deployed_by: "agent",
    };
  }

  return {
    report_id: randomUUID(),
    timestamp: now(),
    ticket_id: state?.active_ticket?.id || "T25.1",
    milestone_id: state?.active_milestone?.id || "M25",
    readiness_score: score,
    ready,
    checks,
    summary: {
      total: checks.length,
      passed: passedCount,
      failed: failed.length,
      critical: critical.length,
      error: errors.length,
      warn: warnings.length,
      info: checks.filter(c => c.severity === "info").length,
    },
    blockers,
    release_manifest: manifest,
    duration_ms: Date.now() - start,
  };
}

// ── Report Generation ──
function generateMarkdownReport(report: ReadinessReport): string {
  const lines: string[] = [];

  lines.push(`# Deployment Readiness Report`);
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Report ID | \`${report.report_id}\` |`);
  lines.push(`| Timestamp | ${report.timestamp} |`);
  lines.push(`| Milestone | ${report.milestone_id} |`);
  lines.push(`| Ticket | ${report.ticket_id} |`);
  lines.push(`| Readiness Score | ${report.readiness_score}/100 |`);
  lines.push(`| Status | ${report.ready ? "✅ READY" : "❌ NOT READY"} |`);
  lines.push(`| Duration | ${report.duration_ms}ms |`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push(`- **Total Checks:** ${report.summary.total}`);
  lines.push(`- **Passed:** ${report.summary.passed}`);
  lines.push(`- **Failed:** ${report.summary.failed}`);
  lines.push(`- **Critical:** ${report.summary.critical}`);
  lines.push(`- **Error:** ${report.summary.error}`);
  lines.push(`- **Warn:** ${report.summary.warn}`);
  lines.push("");

  if (report.blockers.length > 0) {
    lines.push("## Blockers");
    lines.push("");
    for (const b of report.blockers) {
      lines.push(`- ${b}`);
    }
    lines.push("");
  }

  lines.push("## Checks");
  lines.push("");
  for (const check of report.checks) {
    const icon = check.passed ? "✅" : check.severity === "warn" ? "⚠️" : "❌";
    lines.push(`### ${icon} ${check.name}`);
    lines.push("");
    lines.push(`- **Category:** ${check.category}`);
    lines.push(`- **Severity:** ${check.severity}`);
    lines.push(`- **Status:** ${check.passed ? "PASS" : "FAIL"}`);
    lines.push(`- **Message:** ${check.message}`);
    if (check.remediation) {
      lines.push(`- **Remediation:** ${check.remediation}`);
    }
    if (check.details && check.details.length > 0) {
      lines.push("- **Details:**");
      for (const d of check.details) {
        lines.push(`  - ${d}`);
      }
    }
    lines.push("");
  }

  if (report.release_manifest) {
    lines.push("## Release Manifest");
    lines.push("");
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| Manifest ID | \`${report.release_manifest.manifest_id}\` |`);
    lines.push(`| Milestone | ${report.release_manifest.milestone_id} |`);
    lines.push(`| Ticket | ${report.release_manifest.ticket_id} |`);
    lines.push(`| Readiness Score | ${report.release_manifest.readiness_score}/100 |`);
    lines.push(`| Deployed By | ${report.release_manifest.deployed_by} |`);
    lines.push("");
    lines.push("### Validations");
    lines.push("");
    for (const v of report.release_manifest.validations) {
      lines.push(`- ${v}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function saveReport(report: ReadinessReport): { jsonPath: string; mdPath: string } {
  if (!existsSync(DEPLOYMENT_DIR)) {
    mkdirSync(DEPLOYMENT_DIR, { recursive: true });
  }

  const ts = report.timestamp.replace(/[:.]/g, "-");
  const jsonPath = join(DEPLOYMENT_DIR, `readiness-report-${ts}.json`);
  const mdPath = join(DEPLOYMENT_DIR, `readiness-report-${ts}.md`);

  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(mdPath, generateMarkdownReport(report));

  // Also write latest
  writeFileSync(join(DEPLOYMENT_DIR, "latest-readiness-report.json"), JSON.stringify(report, null, 2));
  writeFileSync(join(DEPLOYMENT_DIR, "latest-readiness-report.md"), generateMarkdownReport(report));

  return { jsonPath, mdPath };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const command = args[0] || "run";
  const save = args.includes("--save");

  if (command === "run" || command === "json") {
    const report = runReadinessCheck();

    if (command === "json") {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(generateMarkdownReport(report));
    }

    if (save) {
      const paths = saveReport(report);
      console.log(`\nSaved to:`);
      console.log(`  JSON: ${paths.jsonPath}`);
      console.log(`  Markdown: ${paths.mdPath}`);
    }

    process.exit(report.ready ? 0 : 1);
  } else if (command === "manifest") {
    const report = runReadinessCheck();
    if (report.release_manifest) {
      console.log(JSON.stringify(report.release_manifest, null, 2));
      process.exit(0);
    } else {
      console.error("Deployment not ready. Cannot generate release manifest.");
      console.error("Blockers:");
      for (const b of report.blockers) {
        console.error(`  - ${b}`);
      }
      process.exit(1);
    }
  } else {
    console.error("Usage: tsx scripts/check-deployment-readiness.ts [run|json|manifest] [--save]");
    process.exit(1);
  }
}
