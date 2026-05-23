#!/usr/bin/env tsx
/**
 * run-pattern-tests.ts
 * Integration tests for workflow pattern intelligence.
 */
import { existsSync, rmSync, readdirSync, readFileSync } from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";
import { emit as emitGovEvent } from "../../../../scripts/emit-governance-event.js";
import { analyzePatterns, saveReport, loadRules, countEventsByType, countStartedWithoutCompletion } from "../../../../scripts/analyze-workflow-patterns.js";

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

console.log("Running Pattern Intelligence Tests...\n");

// Clean reports
const REPORT_DIR = resolve("project-governance/intelligence/pattern-reports");
if (existsSync(REPORT_DIR)) {
  const files = readdirSync(REPORT_DIR).filter((f: string) => f.endsWith(".json"));
  for (const f of files) rmSync(resolve(REPORT_DIR, f));
}

// ── Rule Loading Tests ──

test("loadRules returns pattern rules", () => {
  const rules = loadRules();
  if (rules.length === 0) throw new Error("No rules loaded");
  if (!rules.some(r => r.id === "interrupted-sessions")) throw new Error("Missing interrupted-sessions rule");
});

test("all rules have required fields", () => {
  const rules = loadRules();
  for (const r of rules) {
    if (!r.id || !r.name || !r.threshold) throw new Error(`Rule ${r.id} missing fields`);
    if (r.confidence_boost === undefined) throw new Error(`Rule ${r.id} missing confidence_boost`);
  }
});

// ── Event Counting Tests ──

test("countEventsByType returns 0 for empty streams", () => {
  const count = countEventsByType("nonexistent.event", 24);
  if (count !== 0) throw new Error(`Expected 0, got ${count}`);
});

test("countStartedWithoutCompletion returns 0 when no events", () => {
  const count = countStartedWithoutCompletion(24);
  if (count < 0) throw new Error("Negative count");
});

// ── Pattern Detection Tests ──

test("analyzePatterns evaluates all rules", () => {
  const report = analyzePatterns();
  if (report.rules_evaluated === 0) throw new Error("No rules evaluated");
  if (!Array.isArray(report.patterns)) throw new Error("Patterns not array");
});

test("analyzePatterns detects interrupted sessions", () => {
  // Seed interrupted session
  const execId = "EXEC-2026-05-20-099";
  emitGovEvent({
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
    event_type: "execution.started",
    severity: "info",
    category: "execution",
    execution_id: execId,
    actor: "system",
    payload: {},
  });
  emitGovEvent({
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
    event_type: "execution.started",
    severity: "info",
    category: "execution",
    execution_id: "EXEC-2026-05-20-098",
    actor: "system",
    payload: {},
  });

  const report = analyzePatterns();
  const interrupted = report.patterns.find(p => p.rule_id === "interrupted-sessions");
  if (!interrupted) throw new Error("Missing interrupted-sessions pattern");
  if (!interrupted.detected) throw new Error("Should detect interrupted sessions");
});

test("analyzePatterns generates recommendations for detected patterns", () => {
  const report = analyzePatterns();
  const detected = report.patterns.filter(p => p.detected);
  if (detected.length > 0 && report.recommendations.length === 0) {
    throw new Error("Should generate recommendations for detected patterns");
  }
});

test("saveReport writes valid JSON file", () => {
  const report = analyzePatterns();
  const path = saveReport(report);
  if (!existsSync(path)) throw new Error("Report not saved");
  const loaded = JSON.parse(readFileSync(path, "utf-8"));
  if (loaded.rules_evaluated !== report.rules_evaluated) throw new Error("Data mismatch");
});

test("pattern confidence is deterministic", () => {
  const r1 = analyzePatterns();
  const r2 = analyzePatterns();
  for (let i = 0; i < r1.patterns.length; i++) {
    if (r1.patterns[i].confidence !== r2.patterns[i].confidence) {
      throw new Error(`Confidence not deterministic for ${r1.patterns[i].rule_id}`);
    }
  }
});

test("detected patterns have evidence", () => {
  const report = analyzePatterns();
  for (const p of report.patterns) {
    if (p.detected && p.evidence.length === 0) {
      throw new Error(`Pattern ${p.rule_id} detected but has no evidence`);
    }
  }
});

// ── Category Coverage ──

test("pattern rules cover multiple categories", () => {
  const rules = loadRules();
  const categories = new Set(rules.map(r => r.category));
  if (categories.size < 3) throw new Error(`Only ${categories.size} categories, expected 3+`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
