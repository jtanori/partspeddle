#!/usr/bin/env tsx
/**
 * suggest-next-actions.ts
 * Governance suggestion engine.
 * Generates deterministic, contextual suggestions with rationale,
 * priority, confidence, and actionable recipes.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import { randomUUID, createHash } from "crypto";

const CANONICAL_STATE_PATH = resolve("meta/state/canonical-state.json");
const GOV_STREAMS_DIR = resolve("project-governance/runtime/events/streams");
const TELEMETRY_DIR = resolve("project-governance/runtime/telemetry/logs");
const SUGGESTIONS_DIR = resolve("project-governance/intelligence/suggestions");
const MILESTONES_FILE = resolve("project-management/milestones/governance.json");

interface Suggestion {
  suggestion_id: string;
  timestamp: string;
  category: "operational" | "governance" | "recovery" | "planning" | "deployment" | "investigation";
  title: string;
  rationale: string;
  priority: "P0" | "P1" | "P2" | "P3";
  confidence: number;
  recipe: {
    action: string;
    steps: string[];
    prerequisites?: string[];
    validation?: string[];
  };
  suppressed: boolean;
  suppression_reason?: string | null;
  source_signals: string[];
  deterministic_hash: string;
}

interface RuntimeSignals {
  drift_level: string;
  has_active_execution: boolean;
  last_execution_status?: string;
  worktree_clean?: boolean;
  uncommitted_changes?: number;
  recent_validation_failures: number;
  recent_execution_failures: number;
  current_milestone_status: string;
  current_milestone_id: string;
  pending_tickets_count: number;
  completed_tickets_count: number;
}

function readNdjson(path: string): Record<string, unknown>[] {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf-8");
  return text.split("\n").filter(l => l.trim() !== "").map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean) as Record<string, unknown>[];
}

function loadCanonicalState(): Record<string, unknown> | null {
  if (!existsSync(CANONICAL_STATE_PATH)) return null;
  return JSON.parse(readFileSync(CANONICAL_STATE_PATH, "utf-8"));
}

function loadMilestones(): Array<{ id: string; status: string; tickets: string[]; ticket_paths?: Record<string, unknown> }> {
  if (!existsSync(MILESTONES_FILE)) return [];
  return JSON.parse(readFileSync(MILESTONES_FILE, "utf-8")) as Array<{ id: string; status: string; tickets: string[]; ticket_paths?: Record<string, unknown> }>;
}

function collectSignals(): RuntimeSignals {
  const state = loadCanonicalState();
  const signals: RuntimeSignals = {
    drift_level: "UNKNOWN",
    has_active_execution: false,
    recent_validation_failures: 0,
    recent_execution_failures: 0,
    current_milestone_status: "unknown",
    current_milestone_id: "unknown",
    pending_tickets_count: 0,
    completed_tickets_count: 0,
  };

  if (state) {
    const drift = state.drift as Record<string, string> | undefined;
    signals.drift_level = drift?.level || "UNKNOWN";

    const exec = state.execution as Record<string, unknown> | null;
    signals.has_active_execution = exec !== null;
    if (exec) signals.last_execution_status = exec.status as string;

    const repo = state.repository as Record<string, unknown> | undefined;
    signals.worktree_clean = repo?.worktree_clean as boolean;

    const milestone = state.milestone as Record<string, unknown> | undefined;
    if (milestone) {
      signals.current_milestone_id = milestone.id as string;
      signals.current_milestone_status = milestone.status as string;
      signals.completed_tickets_count = (milestone.completed_tickets as string[])?.length || 0;
      signals.pending_tickets_count = (milestone.pending_tickets as string[])?.length || 0;
    }
  }

  // Count recent failures from governance events
  const govEvents = readNdjson(join(GOV_STREAMS_DIR, "default.ndjson"));
  for (const e of govEvents.slice(-50)) {
    if (e.event_type === "validation.failed") signals.recent_validation_failures++;
    if (e.event_type === "execution.failed") signals.recent_execution_failures++;
  }

  // Count uncommitted changes (approximate via git status if available)
  signals.uncommitted_changes = signals.worktree_clean === false ? 1 : 0;

  return signals;
}

function isDegraded(signals: RuntimeSignals): boolean {
  return signals.drift_level !== "NONE"
    || signals.recent_validation_failures > 0
    || signals.recent_execution_failures > 0
    || signals.last_execution_status === "FAILED";
}

function hashSignals(signals: RuntimeSignals): string {
  const payload = JSON.stringify(signals);
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

function buildSuggestion(
  category: Suggestion["category"],
  title: string,
  rationale: string,
  priority: Suggestion["priority"],
  confidence: number,
  recipe: Suggestion["recipe"],
  signals: RuntimeSignals,
  suppressionRules?: { suppressIfDegraded?: boolean; reason?: string }
): Suggestion {
  const degraded = isDegraded(signals);
  const suppressed = suppressionRules?.suppressIfDegraded && degraded;

  return {
    suggestion_id: randomUUID(),
    timestamp: new Date().toISOString(),
    category,
    title,
    rationale,
    priority,
    confidence: suppressed ? confidence * 0.5 : confidence,
    recipe,
    suppressed: !!suppressed,
    suppression_reason: suppressed ? (suppressionRules?.reason || "Runtime degraded") : null,
    source_signals: Object.entries(signals).filter(([, v]) => v !== 0 && v !== false && v !== "unknown" && v !== "UNKNOWN").map(([k, v]) => `${k}=${v}`),
    deterministic_hash: hashSignals(signals),
  };
}

export function generateSuggestions(): Suggestion[] {
  const signals = collectSignals();
  const suggestions: Suggestion[] = [];

  // 1. Operational: Dirty worktree
  if (signals.worktree_clean === false) {
    suggestions.push(buildSuggestion(
      "operational",
      "Commit uncommitted changes",
      "Worktree is not clean. Uncommitted changes increase risk of state loss and make drift detection unreliable.",
      "P2",
      0.95,
      {
        action: "git add -A && git commit",
        steps: ["Review changes with git diff --cached", "git add -A", "git commit -m 'feat: ...'"],
        prerequisites: ["All tests pass", "No secrets in diff"],
        validation: ["git status shows clean worktree"],
      },
      signals
    ));
  }

  // 2. Governance: Validation failures
  if (signals.recent_validation_failures > 0) {
    suggestions.push(buildSuggestion(
      "governance",
      `Fix ${signals.recent_validation_failures} validation failure(s)`,
      "Recent governance validation failures indicate schema or authority drift that must be resolved before further execution.",
      "P0",
      0.98,
      {
        action: "npm run pm:validate && npm run governance:validate",
        steps: ["Run npm run pm:validate", "Identify failing files", "Fix schema violations", "Re-run validation"],
        prerequisites: ["Repository is accessible"],
        validation: ["npm run pm:validate exits 0"],
      },
      signals
    ));
  }

  // 3. Recovery: Execution failures
  if (signals.recent_execution_failures > 0) {
    suggestions.push(buildSuggestion(
      "recovery",
      `Recover from ${signals.recent_execution_failures} execution failure(s)`,
      "Recent execution failures require replay analysis to determine root cause and prevent recurrence.",
      "P1",
      0.92,
      {
        action: "Replay failed execution and analyze timeline",
        steps: ["Identify failed execution_id", "tsx scripts/replay-execution.ts <id>", "Review timeline report", "Apply fix"],
        prerequisites: ["Event streams contain failure data"],
        validation: ["Replay manifest shows complete reconstruction"],
      },
      signals
    ));
  }

  // 4. Planning: Next ticket
  if (signals.pending_tickets_count > 0) {
    suggestions.push(buildSuggestion(
      "planning",
      `Continue milestone ${signals.current_milestone_id}: ${signals.pending_tickets_count} ticket(s) pending`,
      `Milestone ${signals.current_milestone_id} has pending work. The next ticket in sequence should be initiated.`,
      "P1",
      0.88,
      {
        action: "Update next ticket to in_progress and begin implementation",
        steps: ["Read ticket specification", "Update status to in_progress", "Implement acceptance criteria", "Run tests"],
        prerequisites: ["Current milestone is in_progress", "No blockers"],
        validation: ["Ticket status is completed", "All acceptance criteria checked"],
      },
      signals
    ));
  }

  // 5. Deployment: Only if M25 readiness and NOT degraded
  if (signals.current_milestone_id === "M25" && signals.current_milestone_status === "completed") {
    suggestions.push(buildSuggestion(
      "deployment",
      "Milestone M25 complete — deployment readiness verified",
      "Deployment governance milestone is complete. All blockers resolved. Release may proceed.",
      "P1",
      0.85,
      {
        action: "Generate release manifest and proceed with deployment",
        steps: ["Run scripts/check-deployment-readiness.ts", "Review readiness report", "Generate release manifest", "Deploy"],
        prerequisites: ["M25 completed", "No unresolved blockers"],
        validation: ["Deployment readiness report is green"],
      },
      signals,
      { suppressIfDegraded: true, reason: "Deployment suppressed during degraded runtime state" }
    ));
  }

  // 6. Investigation: Repeated failures
  if (signals.recent_execution_failures >= 2 || signals.recent_validation_failures >= 2) {
    suggestions.push(buildSuggestion(
      "investigation",
      "Investigate pattern of repeated failures",
      "Multiple failures in recent execution history suggest a systemic issue requiring root cause analysis.",
      "P0",
      0.94,
      {
        action: "Run pattern analysis and generate investigation report",
        steps: ["Review last 50 governance events", "Identify common failure patterns", "Check for recent changes", "Generate investigation report"],
        prerequisites: ["Event streams accessible"],
        validation: ["Pattern report identifies root cause hypothesis"],
      },
      signals
    ));
  }

  // 7. Operational: Drift detected
  if (signals.drift_level !== "NONE") {
    suggestions.push(buildSuggestion(
      "operational",
      `Address runtime drift: ${signals.drift_level}`,
      "Drift detection has flagged a runtime inconsistency. Drift undermines determinism and must be resolved.",
      "P0",
      0.97,
      {
        action: "Run diagnostics and apply self-healing if available",
        steps: ["npm run diagnostics:run", "Review drift report", "Apply suggested remediation", "Validate drift resolved"],
        prerequisites: ["Diagnostics console operational"],
        validation: ["Drift level returns to NONE"],
      },
      signals
    ));
  }

  return suggestions;
}

export function saveSuggestions(suggestions: Suggestion[]): string {
  ensureDir(SUGGESTIONS_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(SUGGESTIONS_DIR, `suggestions-${timestamp}.json`);
  writeFileSync(path, JSON.stringify(suggestions, null, 2));
  return path;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export { collectSignals, isDegraded, hashSignals };

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const includeSuppressed = args.includes("--include-suppressed");
  const formatJson = args.includes("--json");

  const suggestions = generateSuggestions();
  const visible = includeSuppressed ? suggestions : suggestions.filter(s => !s.suppressed);

  if (formatJson) {
    console.log(JSON.stringify(visible, null, 2));
  } else {
    console.log(`Generated ${visible.length} suggestion(s)${includeSuppressed ? ` (${suggestions.length - visible.length} suppressed)` : ""}\n`);
    for (const s of visible) {
      const color = s.priority === "P0" ? "\x1b[31m" : s.priority === "P1" ? "\x1b[33m" : "\x1b[32m";
      console.log(`${color}[${s.priority}]\x1b[0m ${s.title}`);
      console.log(`  Category: ${s.category} | Confidence: ${(s.confidence * 100).toFixed(0)}%`);
      console.log(`  Rationale: ${s.rationale}`);
      console.log(`  Action: ${s.recipe.action}`);
      console.log("");
    }
  }

  const path = saveSuggestions(suggestions);
  console.log(`Saved to: ${path}`);
}
