#!/usr/bin/env tsx
/**
 * analyze-workflow-patterns.ts
 * Workflow pattern recognition system.
 * Deterministic rules and heuristics — no ML.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve, join } from "path";

const RULES_PATH = resolve("meta/governance/intelligence/pattern-rules.json");
const GOV_STREAMS_DIR = resolve("project-governance/runtime/events/streams");
const REPORTS_DIR = resolve("project-governance/intelligence/pattern-reports");
const MILESTONES_FILE = resolve("project-management/milestones/governance.json");

interface PatternRule {
  id: string;
  name: string;
  description: string;
  category: string;
  threshold: Record<string, number>;
  severity: string;
  confidence_boost: number;
  suggestion_category: string;
}

interface DetectedPattern {
  rule_id: string;
  name: string;
  description: string;
  detected: boolean;
  occurrences: number;
  confidence: number;
  severity: string;
  suggestion_category: string;
  evidence: string[];
}

interface PatternReport {
  generated_at: string;
  rules_evaluated: number;
  patterns_detected: number;
  patterns: DetectedPattern[];
  recommendations: string[];
}

function loadRules(): PatternRule[] {
  if (!existsSync(RULES_PATH)) return [];
  const data = JSON.parse(readFileSync(RULES_PATH, "utf-8")) as { rules: PatternRule[] };
  return data.rules || [];
}

function readNdjson(path: string): Record<string, unknown>[] {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf-8");
  return text.split("\n").filter(l => l.trim() !== "").map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean) as Record<string, unknown>[];
}

function countEventsByType(eventType: string, hours: number): number {
  const cutoff = new Date(Date.now() - hours * 3600000).toISOString();
  let count = 0;
  const streams = ["default", "execution", "errors"];
  for (const s of streams) {
    const events = readNdjson(join(GOV_STREAMS_DIR, `${s}.ndjson`));
    for (const e of events) {
      if (e.event_type === eventType && (e.timestamp as string) >= cutoff) {
        count++;
      }
    }
  }
  return count;
}

function countStartedWithoutCompletion(hours: number): number {
  const cutoff = new Date(Date.now() - hours * 3600000).toISOString();
  const starts: string[] = [];
  const completes: string[] = [];
  const streams = ["default", "execution"];
  for (const s of streams) {
    const events = readNdjson(join(GOV_STREAMS_DIR, `${s}.ndjson`));
    for (const e of events) {
      if ((e.timestamp as string) < cutoff) continue;
      if (e.event_type === "execution.started") starts.push(e.execution_id as string);
      if (e.event_type === "execution.completed") completes.push(e.execution_id as string);
    }
  }
  const incomplete = starts.filter(id => !completes.includes(id));
  return new Set(incomplete).size;
}

function countRecentFailures(hours: number): number {
  return countEventsByType("execution.failed", hours);
}

function countRecentDrift(hours: number): number {
  return countEventsByType("diagnostics.drift_detected", hours);
}

function loadMilestoneProgress(): Array<{ id: string; completed: number; pending: number }> {
  if (!existsSync(MILESTONES_FILE)) return [];
  const milestones = JSON.parse(readFileSync(MILESTONES_FILE, "utf-8")) as Array<{
    id: string;
    status: string;
    ticket_paths?: Record<string, { exists: boolean }>;
  }>;
  return milestones.map(m => {
    const paths = m.ticket_paths || {};
    const tickets = Object.values(paths);
    const completed = tickets.filter(t => t.exists).length; // Simplified
    return { id: m.id, completed, pending: tickets.length - completed };
  });
}

export function analyzePatterns(): PatternReport {
  const rules = loadRules();
  const patterns: DetectedPattern[] = [];

  for (const rule of rules) {
    let detected = false;
    let occurrences = 0;
    const evidence: string[] = [];

    switch (rule.id) {
      case "interrupted-sessions": {
        const window = rule.threshold.window_hours || 24;
        occurrences = countStartedWithoutCompletion(window);
        detected = occurrences >= (rule.threshold.min_occurrences || 2);
        if (detected) evidence.push(`${occurrences} interrupted session(s) in last ${window}h`);
        break;
      }
      case "repeated-drift": {
        const window = rule.threshold.window_hours || 48;
        occurrences = countRecentDrift(window);
        detected = occurrences >= (rule.threshold.min_occurrences || 2);
        if (detected) evidence.push(`${occurrences} drift event(s) in last ${window}h`);
        break;
      }
      case "failed-consolidations": {
        const window = rule.threshold.window_hours || 72;
        occurrences = countRecentFailures(window);
        detected = occurrences >= (rule.threshold.min_occurrences || 2);
        if (detected) evidence.push(`${occurrences} failure(s) in last ${window}h`);
        break;
      }
      case "milestone-exhaustion": {
        const progress = loadMilestoneProgress();
        for (const m of progress) {
          if (m.pending >= (rule.threshold.min_pending || 5)) {
            detected = true;
            occurrences++;
            evidence.push(`${m.id}: ${m.pending} pending tickets`);
          }
        }
        break;
      }
      case "validation-degradation": {
        const window = rule.threshold.window_hours || 24;
        occurrences = countEventsByType("validation.failed", window);
        detected = occurrences >= (rule.threshold.min_failures || 3);
        if (detected) evidence.push(`${occurrences} validation failure(s) in last ${window}h`);
        break;
      }
      case "stale-locks": {
        // Simplified: check canonical state for stale locks
        const statePath = resolve("meta/state/canonical-state.json");
        if (existsSync(statePath)) {
          const state = JSON.parse(readFileSync(statePath, "utf-8"));
          const lock = state.lock as Record<string, unknown> | undefined;
          if (lock && lock.locked) {
            const lockedAt = lock.locked_at as string;
            const ageMin = (Date.now() - new Date(lockedAt).getTime()) / 60000;
            if (ageMin > (rule.threshold.max_age_minutes || 10)) {
              detected = true;
              occurrences = 1;
              evidence.push(`Lock age: ${ageMin.toFixed(1)} minutes`);
            }
          }
        }
        break;
      }
    }

    const confidence = detected ? Math.min(0.5 + rule.confidence_boost, 0.99) : 0.0;

    patterns.push({
      rule_id: rule.id,
      name: rule.name,
      description: rule.description,
      detected,
      occurrences,
      confidence,
      severity: rule.severity,
      suggestion_category: rule.suggestion_category,
      evidence,
    });
  }

  const detectedPatterns = patterns.filter(p => p.detected);
  const recommendations = detectedPatterns.map(p =>
    `[${p.severity.toUpperCase()}] ${p.name}: ${p.evidence.join("; ")}`
  );

  return {
    generated_at: new Date().toISOString(),
    rules_evaluated: rules.length,
    patterns_detected: detectedPatterns.length,
    patterns,
    recommendations,
  };
}

export function saveReport(report: PatternReport): string {
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(REPORTS_DIR, `pattern-report-${timestamp}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  return path;
}

export { loadRules, countEventsByType, countStartedWithoutCompletion };

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const report = analyzePatterns();
  console.log(`Pattern Analysis Report`);
  console.log(`Generated: ${report.generated_at}`);
  console.log(`Rules evaluated: ${report.rules_evaluated}`);
  console.log(`Patterns detected: ${report.patterns_detected}`);
  console.log("");

  for (const p of report.patterns) {
    const icon = p.detected ? "⚠️" : "✅";
    console.log(`${icon} ${p.name} — ${p.detected ? `DETECTED (${p.occurrences})` : "clear"}`);
    if (p.detected) {
      console.log(`   Confidence: ${(p.confidence * 100).toFixed(0)}%`);
      console.log(`   Evidence: ${p.evidence.join("; ")}`);
    }
  }

  if (report.recommendations.length > 0) {
    console.log("\nRecommendations:");
    report.recommendations.forEach(r => console.log(`  ${r}`));
  }

  const path = saveReport(report);
  console.log(`\nSaved to: ${path}`);
}
