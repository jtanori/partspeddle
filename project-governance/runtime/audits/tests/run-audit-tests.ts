#!/usr/bin/env tsx
/**
 * run-audit-tests.ts
 * Integration tests for autonomous runtime audit runner.
 */
import { existsSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "fs";
import { resolve, join } from "path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

import {
  runAudit,
  saveAuditReport,
  generateMarkdownReport,
} from "../../../../scripts/audit-runtime.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e: unknown) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e instanceof Error ? e.message : String(e)}`);
    failed++;
  }
}

function cleanState(): void {
  const STATE_PATH = resolve("project-governance/runtime/execution-state.json");
  if (existsSync(STATE_PATH)) rmSync(STATE_PATH);
}

console.log("Running Audit Tests...\n");

// ── Protocol Validation ──

test("audit policy validates against protocol-definition.schema.json", () => {
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  const schema = JSON.parse(readFileSync(resolve("meta/governance/schemas/protocol-definition.schema.json"), "utf-8"));
  const data = JSON.parse(readFileSync(resolve("meta/governance/protocols/audit-policy.json"), "utf-8"));
  const validate = ajv.compile(schema);
  const valid = validate(data);
  if (!valid) throw new Error(ajv.errorsText(validate.errors));
});

test("audit policy defines 6 rules", () => {
  const data = JSON.parse(readFileSync(resolve("meta/governance/protocols/audit-policy.json"), "utf-8"));
  if (data.rules.length !== 6) throw new Error(`Expected 6 rules, got ${data.rules.length}`);
});

test("audit policy has 3 invariants", () => {
  const data = JSON.parse(readFileSync(resolve("meta/governance/protocols/audit-policy.json"), "utf-8"));
  if (data.invariants.length !== 3) throw new Error(`Expected 3 invariants, got ${data.invariants.length}`);
});

// ── Audit Structure ──

test("runAudit returns structured report", () => {
  cleanState();
  const report = runAudit();
  if (typeof report.audit_id !== "string") throw new Error("Missing audit_id");
  if (typeof report.timestamp !== "string") throw new Error("Missing timestamp");
  if (typeof report.severity_score !== "number") throw new Error("Missing severity_score");
  if (typeof report.passed !== "boolean") throw new Error("Missing passed");
  if (!Array.isArray(report.findings)) throw new Error("Missing findings");
  if (!Array.isArray(report.remediation_plan)) throw new Error("Missing remediation_plan");
  if (typeof report.duration_ms !== "number") throw new Error("Missing duration_ms");
});

test("severity score is between 0 and 100", () => {
  cleanState();
  const report = runAudit();
  if (report.severity_score < 0 || report.severity_score > 100) {
    throw new Error(`Severity score out of range: ${report.severity_score}`);
  }
});

test("summary counts match findings", () => {
  cleanState();
  const report = runAudit();
  const totalFromSummary = report.summary.critical + report.summary.error + report.summary.warn + report.summary.info;
  if (totalFromSummary !== report.summary.total) {
    throw new Error("Summary counts don't match total");
  }
  if (report.summary.total !== report.findings.length) {
    throw new Error("Summary total doesn't match findings length");
  }
});

test("passed is true when score >= 80 and no critical findings", () => {
  cleanState();
  const report = runAudit();
  const expectedPassed = report.severity_score >= 80 && report.summary.critical === 0;
  if (report.passed !== expectedPassed) {
    throw new Error(`passed=${report.passed} but expected ${expectedPassed} for score=${report.severity_score}, critical=${report.summary.critical}`);
  }
});

// ── Category Isolation ──

test("audit runs single category independently", () => {
  cleanState();
  const report = runAudit({ categories: ["event_consistency"] });
  const eventFindings = report.findings.filter(f => f.category === "event_consistency");
  const otherFindings = report.findings.filter(f => f.category !== "event_consistency");
  // Event consistency may have 0 findings if no streams exist, which is fine
  if (otherFindings.length > 0) throw new Error("Other categories should not run");
});

test("all 6 categories can run together", () => {
  cleanState();
  const report = runAudit();
  const categories = new Set(report.findings.map(f => f.category));
  // At least some categories should produce findings or run without error
  if (report.duration_ms <= 0) throw new Error("Audit did not run");
});

// ── Determinism ──

test("audit is deterministic across runs", () => {
  cleanState();
  const r1 = runAudit();
  const r2 = runAudit();
  if (r1.severity_score !== r2.severity_score) throw new Error("Severity score mismatch");
  if (r1.summary.total !== r2.summary.total) throw new Error("Finding count mismatch");
});

// ── Report Generation ──

test("generateMarkdownReport produces markdown", () => {
  cleanState();
  const report = runAudit();
  const md = generateMarkdownReport(report);
  if (!md.includes("# Runtime Audit Report")) throw new Error("Missing header");
  if (!md.includes(`${report.severity_score}/100`)) throw new Error("Missing score");
  if (!md.includes("## Findings") && report.findings.length > 0) throw new Error("Missing findings section");
  if (!md.includes("## Remediation Plan")) throw new Error("Missing remediation plan");
});

test("generateMarkdownReport includes all findings", () => {
  const mockReport = {
    audit_id: "AUDIT-TEST",
    timestamp: new Date().toISOString(),
    severity_score: 85,
    passed: true,
    findings: [
      {
        category: "test_category",
        severity: "warn" as const,
        message: "Test finding",
        recommendation: "Fix it",
        target: "test-target",
      },
    ],
    summary: { total: 1, critical: 0, error: 0, warn: 1, info: 0 },
    remediation_plan: ["Fix the test finding"],
    duration_ms: 10,
  };
  const md = generateMarkdownReport(mockReport);
  if (!md.includes("Test finding")) throw new Error("Missing finding message");
  if (!md.includes("Fix it")) throw new Error("Missing recommendation");
  if (!md.includes("Fix the test finding")) throw new Error("Missing remediation step");
});

test("saveAuditReport writes JSON and Markdown files", () => {
  cleanState();
  const report = runAudit();
  const paths = saveAuditReport(report);
  if (!existsSync(paths.jsonPath)) throw new Error("JSON file not created");
  if (!existsSync(paths.mdPath)) throw new Error("Markdown file not created");
  const saved = JSON.parse(readFileSync(paths.jsonPath, "utf-8"));
  if (saved.audit_id !== report.audit_id) throw new Error("Saved audit_id mismatch");
});

// ── Event Consistency ──

test("event consistency detects out-of-order timestamps", () => {
  cleanState();
  const STREAMS_DIR = resolve("project-governance/runtime/events/streams");
  mkdirSync(STREAMS_DIR, { recursive: true });
  const streamPath = join(STREAMS_DIR, "test-audit-gap.ndjson");
  writeFileSync(streamPath,
    JSON.stringify({ timestamp: "2026-05-20T10:00:00Z", event_id: "e1", event_type: "test.1" }) + "\n" +
    JSON.stringify({ timestamp: "2026-05-20T09:00:00Z", event_id: "e2", event_type: "test.2" }) + "\n"
  );
  const report = runAudit({ categories: ["event_consistency"] });
  rmSync(streamPath);
  const gap = report.findings.find(f => f.message.includes("out-of-order"));
  if (!gap) throw new Error("Should detect out-of-order timestamps");
});

test("event consistency detects duplicate event_ids", () => {
  cleanState();
  const STREAMS_DIR = resolve("project-governance/runtime/events/streams");
  mkdirSync(STREAMS_DIR, { recursive: true });
  const streamPath = join(STREAMS_DIR, "test-audit-dup.ndjson");
  writeFileSync(streamPath,
    JSON.stringify({ timestamp: "2026-05-20T10:00:00Z", event_id: "dup-1", event_type: "test.1" }) + "\n" +
    JSON.stringify({ timestamp: "2026-05-20T10:01:00Z", event_id: "dup-1", event_type: "test.2" }) + "\n"
  );
  const report = runAudit({ categories: ["event_consistency"] });
  rmSync(streamPath);
  const dup = report.findings.find(f => f.message.includes("duplicate"));
  if (!dup) throw new Error("Should detect duplicate event_ids");
});

// ── Projection Validity ──

test("projection validity detects orphan projections", () => {
  cleanState();
  const REFLECTIONS_DIR = resolve("project-governance/protocols");
  mkdirSync(REFLECTIONS_DIR, { recursive: true });
  writeFileSync(join(REFLECTIONS_DIR, "audit-orphan-test.protocol.md"), "# Orphan");
  const report = runAudit({ categories: ["projection_validity"] });
  rmSync(join(REFLECTIONS_DIR, "audit-orphan-test.protocol.md"));
  const orphan = report.findings.find(f => f.message.includes("Orphan projection"));
  if (!orphan) throw new Error("Should detect orphan projection");
});

// ── Cleanup ──

cleanState();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
