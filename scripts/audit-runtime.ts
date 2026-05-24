#!/usr/bin/env tsx
/**
 * audit-runtime.ts
 * Autonomous Runtime Audit Runner
 *
 * 6 audit categories with deterministic severity scoring.
 * Produces JSON + Markdown reports.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync } from "fs";
import { resolve, join, basename } from "path";
import { randomUUID } from "crypto";

import { runEnforcement } from "./enforce-governance.js";
import { emit } from "./emit-governance-event.js";

// ── Paths ──
const AUDITS_DIR = resolve("project-governance/runtime/audits");
const PROTOCOLS_DIR = resolve("meta/governance/protocols");
const REFLECTIONS_DIR = resolve("project-governance/protocols");
const EVENT_STREAMS_DIR = resolve("project-governance/runtime/events/streams");
const HEARTBEATS_DIR = resolve("project-governance/runtime/heartbeats");
const GOV_REGISTRY_PATH = resolve("meta/governance/registries/governance-registry.json");
const STATE_DIR = resolve("project-governance/runtime/state");
const BOOTSTRAP_DIR = resolve("project-governance/runtime/bootstrap");

// ── Types ──
export interface AuditFinding {
  category: string;
  severity: "critical" | "error" | "warn" | "info";
  message: string;
  recommendation: string;
  target: string;
}

export interface AuditReport {
  audit_id: string;
  timestamp: string;
  severity_score: number;
  passed: boolean;
  findings: AuditFinding[];
  summary: {
    total: number;
    critical: number;
    error: number;
    warn: number;
    info: number;
  };
  remediation_plan: string[];
  duration_ms: number;
}

// ── Helpers ──
function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function safeRead(path: string): { ok: boolean; content?: string; error?: string } {
  try {
    if (!existsSync(path)) return { ok: false, error: "File not found" };
    return { ok: true, content: readFileSync(path, "utf-8") };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function safeParseJson(path: string): { ok: boolean; data?: unknown; error?: string } {
  const read = safeRead(path);
  if (!read.ok) return { ok: false, error: read.error };
  try {
    return { ok: true, data: JSON.parse(read.content!) };
  } catch (e) {
    return { ok: false, error: `JSON parse error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

function emitAuditEvent(eventType: string, severity: string, payload: Record<string, unknown>): void {
  emit({
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
    event_type: eventType as "audit.started",
    severity: severity as "info",
    category: "governance",
    actor: "system",
    payload,
  });
}

function computeSeverityScore(findings: AuditFinding[]): number {
  let score = 100;
  for (const f of findings) {
    switch (f.severity) {
      case "critical": score -= 25; break;
      case "error": score -= 15; break;
      case "warn": score -= 5; break;
      case "info": score -= 1; break;
    }
  }
  return Math.max(0, score);
}

function generateRemediationPlan(findings: AuditFinding[]): string[] {
  const plan: string[] = [];
  const bySeverity = { critical: 0, error: 0, warn: 0, info: 0 };
  for (const f of findings) {
    bySeverity[f.severity]++;
  }

  if (bySeverity.critical > 0) {
    plan.push(`Address ${bySeverity.critical} critical issue(s) immediately to restore runtime integrity.`);
  }
  if (bySeverity.error > 0) {
    plan.push(`Resolve ${bySeverity.error} error(s) before next execution transition.`);
  }
  if (bySeverity.warn > 0) {
    plan.push(`Review ${bySeverity.warn} warning(s) during next planning session.`);
  }
  if (bySeverity.info > 0) {
    plan.push(`Consider ${bySeverity.info} informational item(s) for operational improvement.`);
  }
  if (findings.length === 0) {
    plan.push("No findings. Runtime is healthy.");
  }

  // Add specific recommendations for top-severity findings
  const topFindings = findings
    .filter(f => f.severity === "critical" || f.severity === "error")
    .slice(0, 3);
  for (const f of topFindings) {
    plan.push(`[${f.category}] ${f.recommendation}`);
  }

  return plan;
}

// ── Audit Categories ──

function auditSchemaIntegrity(): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const result = runEnforcement({ categories: ["schema"] });
  for (const v of result.violations) {
    findings.push({
      category: "schema_integrity",
      severity: v.severity as "critical" | "error" | "warn" | "info",
      message: v.message,
      recommendation: v.recovery_guidance,
      target: v.target,
    });
  }
  return findings;
}

function auditDependencyIntegrity(): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const result = runEnforcement({ categories: ["dependency"] });
  for (const v of result.violations) {
    findings.push({
      category: "dependency_integrity",
      severity: v.severity as "critical" | "error" | "warn" | "info",
      message: v.message,
      recommendation: v.recovery_guidance,
      target: v.target,
    });
  }
  return findings;
}

function auditMilestoneConsistency(): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const result = runEnforcement({ categories: ["milestone"] });
  for (const v of result.violations) {
    findings.push({
      category: "milestone_consistency",
      severity: v.severity as "critical" | "error" | "warn" | "info",
      message: v.message,
      recommendation: v.recovery_guidance,
      target: v.target,
    });
  }
  return findings;
}

function auditRuntimeContinuity(): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // Run enforcement runtime + execution checks
  const result = runEnforcement({ categories: ["runtime", "execution"] });
  for (const v of result.violations) {
    findings.push({
      category: "runtime_continuity",
      severity: v.severity as "critical" | "error" | "warn" | "info",
      message: v.message,
      recommendation: v.recovery_guidance,
      target: v.target,
    });
  }

  // Check heartbeat freshness
  if (existsSync(HEARTBEATS_DIR)) {
    const files = readdirSync(HEARTBEATS_DIR).filter(f => f.endsWith(".json"));
    let latestHeartbeat: Date | null = null;
    for (const file of files) {
      const hbResult = safeParseJson(join(HEARTBEATS_DIR, file));
      if (hbResult.ok && (hbResult.data as Record<string, unknown>).timestamp) {
        const ts = new Date((hbResult.data as Record<string, unknown>).timestamp as string);
        if (!latestHeartbeat || ts > latestHeartbeat) {
          latestHeartbeat = ts;
        }
      }
    }
    if (latestHeartbeat) {
      const ageMin = (Date.now() - latestHeartbeat.getTime()) / 60000;
      if (ageMin > 30) {
        findings.push({
          category: "runtime_continuity",
          severity: "warn",
          message: `Latest heartbeat is ${ageMin.toFixed(1)} minutes old`,
          recommendation: "Verify runtime is active or investigate session interruption.",
          target: HEARTBEATS_DIR,
        });
      }
    } else if (files.length > 0) {
      findings.push({
        category: "runtime_continuity",
        severity: "error",
        message: "No valid heartbeats found",
        recommendation: "Check heartbeat file format and regenerate if necessary.",
        target: HEARTBEATS_DIR,
      });
    }
  }

  return findings;
}

function auditProjectionValidity(): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // Check registry reflections against actual files
  const regResult = safeParseJson(GOV_REGISTRY_PATH);
  if (!regResult.ok) {
    findings.push({
      category: "projection_validity",
      severity: "error",
      message: `Cannot read governance registry: ${regResult.error}`,
      recommendation: "Restore governance registry from git.",
      target: GOV_REGISTRY_PATH,
    });
    return findings;
  }

  const reg = regResult.data as Record<string, unknown>;
  const reflections = reg.reflections as Array<{ source_protocol: string; generated_path: string; last_generated_at?: string }> | undefined;

  if (reflections) {
    for (const refl of reflections) {
      const sourcePath = join(PROTOCOLS_DIR, `${refl.source_protocol}.json`);
      const generatedPath = resolve(refl.generated_path);

      if (!existsSync(generatedPath)) {
        findings.push({
          category: "projection_validity",
          severity: "warn",
          message: `Projection missing: ${refl.generated_path}`,
          recommendation: `Regenerate projection from ${refl.source_protocol}.json`,
          target: refl.generated_path,
        });
        continue;
      }

      if (!existsSync(sourcePath)) {
        findings.push({
          category: "projection_validity",
          severity: "error",
          message: `Source protocol missing for projection: ${refl.source_protocol}`,
          recommendation: `Restore ${refl.source_protocol}.json or remove reflection entry.`,
          target: sourcePath,
        });
        continue;
      }

      // Check if projection is older than source
      const sourceMtime = statSync(sourcePath).mtime;
      const generatedMtime = statSync(generatedPath).mtime;
      if (generatedMtime < sourceMtime) {
        findings.push({
          category: "projection_validity",
          severity: "warn",
          message: `Projection stale: ${refl.generated_path} is older than ${refl.source_protocol}.json`,
          recommendation: `Regenerate projection from ${refl.source_protocol}.json`,
          target: refl.generated_path,
        });
      }
    }
  }

  // Check for orphan projections (markdown without source)
  if (existsSync(REFLECTIONS_DIR)) {
    const sourceNames = new Set(
      existsSync(PROTOCOLS_DIR)
        ? readdirSync(PROTOCOLS_DIR).filter(f => f.endsWith(".json")).map(f => basename(f, ".json"))
        : []
    );
    const reflFiles = readdirSync(REFLECTIONS_DIR).filter(f => f.endsWith(".protocol.md"));
    for (const file of reflFiles) {
      const name = basename(file, ".protocol.md");
      if (!sourceNames.has(name)) {
        findings.push({
          category: "projection_validity",
          severity: "warn",
          message: `Orphan projection: ${file} has no source protocol`,
          recommendation: `Remove ${file} or create source protocol ${name}.json`,
          target: join(REFLECTIONS_DIR, file),
        });
      }
    }
  }

  return findings;
}

function auditEventConsistency(): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (!existsSync(EVENT_STREAMS_DIR)) {
    findings.push({
      category: "event_consistency",
      severity: "info",
      message: "No event streams directory found",
      recommendation: "Event streams will be created on first event emission.",
      target: EVENT_STREAMS_DIR,
    });
    return findings;
  }

  const files = readdirSync(EVENT_STREAMS_DIR).filter(f => f.endsWith(".ndjson"));
  if (files.length === 0) {
    findings.push({
      category: "event_consistency",
      severity: "info",
      message: "No event stream files found",
      recommendation: "Event streams will be created on first event emission.",
      target: EVENT_STREAMS_DIR,
    });
    return findings;
  }

  for (const file of files) {
    const path = join(EVENT_STREAMS_DIR, file);
    const read = safeRead(path);
    if (!read.ok) {
      findings.push({
        category: "event_consistency",
        severity: "error",
        message: `Cannot read event stream ${file}: ${read.error}`,
        recommendation: "Check file permissions and disk space.",
        target: path,
      });
      continue;
    }

    const events = read.content!.split("\n").filter(l => l.trim()).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean) as Array<{ timestamp: string; event_id?: string; event_type?: string }>;

    if (events.length === 0) continue;

    // Check timestamp monotonicity
    for (let i = 1; i < events.length; i++) {
      const prev = new Date(events[i - 1].timestamp).getTime();
      const curr = new Date(events[i].timestamp).getTime();
      if (curr < prev) {
        findings.push({
          category: "event_consistency",
          severity: "warn",
          message: `Event stream ${file} has out-of-order timestamps at index ${i}`,
          recommendation: "Investigate clock skew or concurrent event writers.",
          target: path,
        });
        break;
      }
    }

    // Check for duplicate event_ids
    const seenIds = new Set<string>();
    for (let i = 0; i < events.length; i++) {
      const id = events[i].event_id;
      if (id && seenIds.has(id)) {
        findings.push({
          category: "event_consistency",
          severity: "error",
          message: `Event stream ${file} has duplicate event_id: ${id}`,
          recommendation: "Investigate event deduplication mechanism.",
          target: path,
        });
        break;
      }
      if (id) seenIds.add(id);
    }
  }

  return findings;
}

function auditLockConsistency(): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const ae = safeParseJson(join(STATE_DIR, "active-execution.json"));
  const lock = safeParseJson(join(STATE_DIR, "execution-lock.json"));

  if (ae.ok && lock.ok) {
    const aeData = ae.data as Record<string, unknown>;
    const lockData = lock.data as Record<string, unknown>;

    const lockHoldersMatch =
      !lockData.locked ||
      (lockData.execution_id === (aeData.execution as Record<string, unknown>)?.execution_id) ||
      (!aeData.execution_active && !lockData.locked);

    if (!lockHoldersMatch) {
      findings.push({
        category: "lock_consistency",
        severity: "critical",
        message: `Lock held by ${lockData.execution_id} but active-execution shows execution_active=${aeData.execution_active}`,
        recommendation: "Release stale lock or reconcile execution state",
        target: join(STATE_DIR, "execution-lock.json"),
      });
    }

    if (lockData.locked && lockData.expires_at) {
      const stale = (Date.now() - new Date(lockData.expires_at as string).getTime()) > 0;
      if (stale) {
        findings.push({
          category: "lock_consistency",
          severity: "error",
          message: `Lock expired at ${lockData.expires_at}. Possible crashed session.`,
          recommendation: "Perform stale lock recovery per SAFE_EXIT_PROTOCOL.md",
          target: join(STATE_DIR, "execution-lock.json"),
        });
      }
    }
  }

  return findings;
}

function auditCrossFileConsistency(): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const ae = safeParseJson(join(STATE_DIR, "active-execution.json"));
  const ct = safeParseJson(join(STATE_DIR, "current-ticket.json"));
  const cm = safeParseJson(join(STATE_DIR, "current-milestone.json"));

  if (ae.ok && ct.ok && cm.ok) {
    const aeData = ae.data as Record<string, unknown>;
    const ctData = ct.data as Record<string, unknown>;
    const cmData = cm.data as Record<string, unknown>;

    const currentExec = aeData.execution as Record<string, unknown> | undefined;
    if (currentExec) {
      const milestoneMatch = currentExec.milestone_id === (cmData.active_milestone as Record<string, unknown>)?.id;
      if (!milestoneMatch) {
        findings.push({
          category: "cross_file_consistency",
          severity: "error",
          message: `Current execution milestone (${currentExec.milestone_id}) does not match current milestone (${(cmData.active_milestone as Record<string, unknown>)?.id})`,
          recommendation: "Reconcile milestone transitions",
          target: join(STATE_DIR, "current-milestone.json"),
        });
      }

      const ticketMatch = currentExec.task_id === (ctData.ticket as Record<string, unknown>)?.id;
      if (!ticketMatch) {
        findings.push({
          category: "cross_file_consistency",
          severity: "error",
          message: `Current execution task (${currentExec.task_id}) does not match current ticket state`,
          recommendation: "Reconcile ticket transitions",
          target: join(STATE_DIR, "current-ticket.json"),
        });
      }
    }
  }

  return findings;
}

function auditBootstrapConsistency(): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const bootstrap = safeParseJson(join(BOOTSTRAP_DIR, "runtime-bootstrap.json"));
  const cm = safeParseJson(join(STATE_DIR, "current-milestone.json"));

  if (bootstrap.ok && cm.ok) {
    const bsData = bootstrap.data as Record<string, unknown>;
    const cmData = cm.data as Record<string, unknown>;
    const bootstrapMilestoneMatch = (bsData.current_milestone as Record<string, unknown>)?.id === (cmData.active_milestone as Record<string, unknown>)?.id;
    if (!bootstrapMilestoneMatch) {
      findings.push({
        category: "bootstrap_consistency",
        severity: "warn",
        message: `Bootstrap milestone (${(bsData.current_milestone as Record<string, unknown>)?.id}) != current milestone (${(cmData.active_milestone as Record<string, unknown>)?.id})`,
        recommendation: "Regenerate runtime-bootstrap.json",
        target: join(BOOTSTRAP_DIR, "runtime-bootstrap.json"),
      });
    }
  }

  return findings;
}

// ── Main API ──

export function runAudit(options: { categories?: string[] } = {}): AuditReport {
  const start = Date.now();
  const auditId = `AUDIT-${Date.now()}`;

  emitAuditEvent("audit.started", "info", { audit_id: auditId, categories: options.categories });

  const allCategories: Record<string, () => AuditFinding[]> = {
    schema_integrity: auditSchemaIntegrity,
    dependency_integrity: auditDependencyIntegrity,
    milestone_consistency: auditMilestoneConsistency,
    runtime_continuity: auditRuntimeContinuity,
    projection_validity: auditProjectionValidity,
    event_consistency: auditEventConsistency,
    lock_consistency: auditLockConsistency,
    cross_file_consistency: auditCrossFileConsistency,
    bootstrap_consistency: auditBootstrapConsistency,
  };

  const categoriesToRun = options.categories || Object.keys(allCategories);
  const findings: AuditFinding[] = [];

  for (const cat of categoriesToRun) {
    const fn = allCategories[cat];
    if (fn) {
      findings.push(...fn());
    }
  }

  const score = computeSeverityScore(findings);
  const summary = {
    total: findings.length,
    critical: findings.filter(f => f.severity === "critical").length,
    error: findings.filter(f => f.severity === "error").length,
    warn: findings.filter(f => f.severity === "warn").length,
    info: findings.filter(f => f.severity === "info").length,
  };

  const report: AuditReport = {
    audit_id: auditId,
    timestamp: new Date().toISOString(),
    severity_score: score,
    passed: score >= 80 && summary.critical === 0,
    findings,
    summary,
    remediation_plan: generateRemediationPlan(findings),
    duration_ms: Date.now() - start,
  };

  emitAuditEvent("audit.completed", "info", {
    audit_id: auditId,
    severity_score: score,
    findings_count: findings.length,
    passed: report.passed,
    duration_ms: report.duration_ms,
  });

  return report;
}

export function saveAuditReport(report: AuditReport): { jsonPath: string; mdPath: string } {
  ensureDir(AUDITS_DIR);
  const baseName = `audit-${report.timestamp.replace(/[:.]/g, "-")}`;
  const jsonPath = join(AUDITS_DIR, `${baseName}.json`);
  const mdPath = join(AUDITS_DIR, `${baseName}.md`);

  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(mdPath, generateMarkdownReport(report));

  return { jsonPath, mdPath };
}

export function generateMarkdownReport(report: AuditReport): string {
  const lines: string[] = [];
  lines.push(`# Runtime Audit Report`);
  lines.push("");
  lines.push(`**Audit ID:** ${report.audit_id}`);
  lines.push(`**Timestamp:** ${report.timestamp}`);
  lines.push(`**Severity Score:** ${report.severity_score}/100`);
  lines.push(`**Status:** ${report.passed ? "✅ PASSED" : "❌ FAILED"}`);
  lines.push(`**Duration:** ${report.duration_ms}ms`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push(`- Total findings: ${report.summary.total}`);
  lines.push(`- Critical: ${report.summary.critical}`);
  lines.push(`- Error: ${report.summary.error}`);
  lines.push(`- Warning: ${report.summary.warn}`);
  lines.push(`- Info: ${report.summary.info}`);
  lines.push("");

  if (report.findings.length > 0) {
    lines.push("## Findings");
    lines.push("");
    for (const f of report.findings) {
      const icon = f.severity === "critical" ? "🔴" : f.severity === "error" ? "🟠" : f.severity === "warn" ? "🟡" : "🔵";
      lines.push(`### ${icon} [${f.severity.toUpperCase()}] ${f.category}`);
      lines.push(`- **Message:** ${f.message}`);
      lines.push(`- **Target:** ${f.target}`);
      lines.push(`- **Recommendation:** ${f.recommendation}`);
      lines.push("");
    }
  }

  lines.push("## Remediation Plan");
  lines.push("");
  for (const step of report.remediation_plan) {
    lines.push(`- ${step}`);
  }
  lines.push("");

  return lines.join("\n");
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const command = args[0];
  const save = args.includes("--save");
  const categories = args
    .filter(a => a.startsWith("--category="))
    .map(a => a.replace("--category=", ""));

  if (!command || command === "run") {
    const report = runAudit({ categories: categories.length > 0 ? categories : undefined });
    console.log(generateMarkdownReport(report));
    if (save) {
      const paths = saveAuditReport(report);
      console.log(`\nSaved to:`);
      console.log(`  JSON: ${paths.jsonPath}`);
      console.log(`  Markdown: ${paths.mdPath}`);
    }
    process.exit(report.passed ? 0 : 1);
  } else if (command === "json") {
    const report = runAudit({ categories: categories.length > 0 ? categories : undefined });
    console.log(JSON.stringify(report, null, 2));
    if (save) {
      const paths = saveAuditReport(report);
      console.error(`Saved to: ${paths.jsonPath}`);
    }
    process.exit(report.passed ? 0 : 1);
  } else if (command === "list") {
    if (!existsSync(AUDITS_DIR)) {
      console.log("No audits directory found.");
      process.exit(0);
    }
    const files = readdirSync(AUDITS_DIR)
      .filter(f => f.endsWith(".json"))
      .sort()
      .reverse();
    for (const file of files.slice(0, 10)) {
      const data = JSON.parse(readFileSync(join(AUDITS_DIR, file), "utf-8")) as AuditReport;
      console.log(`${data.timestamp} | Score: ${data.severity_score}/100 | ${data.passed ? "PASS" : "FAIL"} | ${data.summary.total} findings | ${file}`);
    }
  } else {
    console.error("Usage: tsx scripts/audit-runtime.ts <run|json|list> [--save] [--category=NAME]");
    process.exit(1);
  }
}
