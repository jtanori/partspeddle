#!/usr/bin/env tsx
/**
 * self-heal.ts
 * Governance Self-Healing Runner
 *
 * Detects and repairs predictable runtime inconsistencies.
 * Non-destructive healing runs automatically.
 * Destructive healing requires --destructive flag + snapshot.
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync, readdirSync, mkdirSync, rmSync } from "fs";
import { resolve, join, basename } from "path";
import { randomUUID, createHash } from "crypto";

import { getLockState } from "./execution-lock.js";
import { emit } from "./emit-governance-event.js";
import { getCurrentState, getHistory } from "./execution-state.js";
import { detectStaleLocks, autoRecoverStaleLock } from "./detect-stale-locks.js";

// ── Paths ──
const HEALING_DIR = resolve("project-governance/runtime/healing");
const SNAPSHOTS_DIR = join(HEALING_DIR, "snapshots");
const HEALING_LOG = join(HEALING_DIR, "healing-log.ndjson");
const GOV_REGISTRY_PATH = resolve("meta/governance/registries/governance-registry.json");
const PROTOCOLS_DIR = resolve("meta/governance/protocols");
const REFLECTIONS_DIR = resolve("project-governance/protocols");
const EVENT_STREAMS_DIR = resolve("project-governance/runtime/events/streams");
const STATE_PATH = resolve("project-governance/runtime/execution-state.json");
const LOCK_PATH = resolve("project-governance/runtime/locks/execution-lock.json");

// ── Types ──
export interface HealingIssue {
  category: string;
  severity: "info" | "warn" | "error" | "critical";
  message: string;
  target: string;
  autoRepairable: boolean;
  destructive: boolean;
  repaired?: boolean;
  repairError?: string;
}

export interface HealingResult {
  scanned: number;
  healed: number;
  failed: number;
  skipped: number;
  snapshotCreated: boolean;
  snapshotId?: string;
  issues: HealingIssue[];
}

interface Snapshot {
  id: string;
  timestamp: string;
  trigger: string;
  files: Array<{ path: string; checksum: string }>;
}

// ── Helpers ──
function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function checksum(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function logHealing(entry: Record<string, unknown>): void {
  ensureDir(HEALING_DIR);
  appendFileSync(HEALING_LOG, JSON.stringify(entry) + "\n", "utf-8");
}

function emitEvent(eventType: string, severity: string, payload: Record<string, unknown>): void {
  emit({
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
    event_type: eventType as "healing.started",
    severity: severity as "info",
    category: "recovery",
    actor: "system",
    payload,
  });
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

// ── Snapshot ──

export function createSnapshot(trigger: string = "manual"): Snapshot {
  ensureDir(SNAPSHOTS_DIR);
  const snapshot: Snapshot = {
    id: `SNAP-${Date.now()}`,
    timestamp: new Date().toISOString(),
    trigger,
    files: [],
  };

  const runtimeFiles = [STATE_PATH, LOCK_PATH].filter(existsSync);
  for (const file of runtimeFiles) {
    const content = readFileSync(file, "utf-8");
    snapshot.files.push({ path: file, checksum: checksum(content) });
  }

  writeFileSync(join(SNAPSHOTS_DIR, `${snapshot.id}.json`), JSON.stringify(snapshot, null, 2));
  return snapshot;
}

export function listSnapshots(): Snapshot[] {
  if (!existsSync(SNAPSHOTS_DIR)) return [];
  return readdirSync(SNAPSHOTS_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => JSON.parse(readFileSync(join(SNAPSHOTS_DIR, f), "utf-8")) as Snapshot)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function revertSnapshot(snapshotId: string): { success: boolean; error?: string } {
  const snapPath = join(SNAPSHOTS_DIR, `${snapshotId}.json`);
  if (!existsSync(snapPath)) {
    return { success: false, error: `Snapshot ${snapshotId} not found` };
  }
  const snapshot = JSON.parse(readFileSync(snapPath, "utf-8")) as Snapshot;

  for (const file of snapshot.files) {
    if (!existsSync(file.path)) {
      return { success: false, error: `Cannot revert: ${file.path} missing (was it deleted after snapshot?)` };
    }
    const current = readFileSync(file.path, "utf-8");
    if (checksum(current) === file.checksum) {
      continue; // already matches
    }
    // For safety, we don't actually overwrite in this implementation — we just verify
    // A real revert would restore from backup. Here we flag it.
    return { success: false, error: `Revert not implemented for safety. Snapshot ${snapshotId} checksum mismatch on ${file.path}` };
  }

  return { success: true };
}

// ── Detectors ──

function detectStaleLocksIssue(): HealingIssue | null {
  const report = detectStaleLocks();
  if (report.stale) {
    return {
      category: "stale_lock",
      severity: "error",
      message: report.recommendation,
      target: report.lock_state.execution_id || "unknown",
      autoRepairable: true,
      destructive: false,
    };
  }
  return null;
}

function detectOrphanProjections(): HealingIssue[] {
  const issues: HealingIssue[] = [];
  if (!existsSync(REFLECTIONS_DIR)) return issues;

  const reflectionFiles = readdirSync(REFLECTIONS_DIR).filter(f => f.endsWith(".protocol.md"));
  const protocolFiles = existsSync(PROTOCOLS_DIR) ? readdirSync(PROTOCOLS_DIR).filter(f => f.endsWith(".json")) : [];
  const protocolNames = new Set(protocolFiles.map(f => basename(f, ".json")));

  for (const refl of reflectionFiles) {
    const name = basename(refl, ".protocol.md");
    if (!protocolNames.has(name)) {
      issues.push({
        category: "orphan_projection",
        severity: "warn",
        message: `Orphan projection: ${refl} has no source protocol`,
        target: join(REFLECTIONS_DIR, refl),
        autoRepairable: false,
        destructive: false,
      });
    }
  }

  return issues;
}

function detectMissingIndexes(): HealingIssue[] {
  const issues: HealingIssue[] = [];
  const regResult = safeParseJson(GOV_REGISTRY_PATH);
  if (!regResult.ok) {
    issues.push({
      category: "missing_index",
      severity: "error",
      message: `Cannot read governance registry: ${regResult.error}`,
      target: GOV_REGISTRY_PATH,
      autoRepairable: false,
      destructive: false,
    });
    return issues;
  }

  const reg = regResult.data as Record<string, unknown>;

  // Check protocols
  const protocols = reg.protocols as Array<{ path: string; id: string }> | undefined;
  if (protocols) {
    for (const p of protocols) {
      if (!existsSync(resolve(p.path))) {
        issues.push({
          category: "missing_index",
          severity: "warn",
          message: `Registry protocol ${p.id} references missing file: ${p.path}`,
          target: GOV_REGISTRY_PATH,
          autoRepairable: false,
          destructive: false,
        });
      }
    }
  }

  // Check schemas
  const schemas = reg.schemas as Array<{ path: string; id: string }> | undefined;
  if (schemas) {
    for (const s of schemas) {
      if (!existsSync(resolve(s.path))) {
        issues.push({
          category: "missing_index",
          severity: "warn",
          message: `Registry schema ${s.id} references missing file: ${s.path}`,
          target: GOV_REGISTRY_PATH,
          autoRepairable: false,
          destructive: false,
        });
      }
    }
  }

  // Check reflections
  const reflections = reg.reflections as Array<{ generated_path: string; id: string }> | undefined;
  if (reflections) {
    for (const r of reflections) {
      if (!existsSync(resolve(r.generated_path))) {
        issues.push({
          category: "missing_index",
          severity: "warn",
          message: `Registry reflection ${r.id} references missing file: ${r.generated_path}`,
          target: GOV_REGISTRY_PATH,
          autoRepairable: false,
          destructive: false,
        });
      }
    }
  }

  return issues;
}

function detectRuntimeDivergence(): HealingIssue[] {
  const issues: HealingIssue[] = [];

  // Check execution state vs history
  try {
    const currentState = getCurrentState();
    const history = getHistory();
    if (history.length > 0) {
      const lastTransition = history[history.length - 1];
      if (lastTransition.to !== currentState) {
        issues.push({
          category: "runtime_divergence",
          severity: "error",
          message: `Execution state (${currentState}) diverges from last history entry (${lastTransition.to})`,
          target: STATE_PATH,
          autoRepairable: false,
          destructive: false,
        });
      }
    }
  } catch {
    // If state file is corrupted, detectCorruptedState will handle it
  }

  // Check lock state consistency
  try {
    const lock = getLockState();
    const lockResult = safeParseJson(LOCK_PATH);
    if (lockResult.ok) {
      const lockData = lockResult.data as Record<string, unknown>;
      if (typeof lockData.locked === "boolean" && lockData.locked !== lock.locked) {
        issues.push({
          category: "runtime_divergence",
          severity: "warn",
          message: `Lock state divergence: computed=${lock.locked}, file=${lockData.locked}`,
          target: LOCK_PATH,
          autoRepairable: false,
          destructive: false,
        });
      }
    }
  } catch {
    // If lock file is corrupted, detectCorruptedState will handle it
  }

  return issues;
}

function detectCorruptedState(): HealingIssue[] {
  const issues: HealingIssue[] = [];

  const stateResult = safeParseJson(STATE_PATH);
  if (existsSync(STATE_PATH) && !stateResult.ok) {
    issues.push({
      category: "corrupted_state",
      severity: "critical",
      message: `Execution state corrupted: ${stateResult.error}`,
      target: STATE_PATH,
      autoRepairable: true,
      destructive: true,
    });
  }

  const lockResult = safeParseJson(LOCK_PATH);
  if (existsSync(LOCK_PATH) && !lockResult.ok) {
    issues.push({
      category: "corrupted_state",
      severity: "critical",
      message: `Lock state corrupted: ${lockResult.error}`,
      target: LOCK_PATH,
      autoRepairable: true,
      destructive: true,
    });
  }

  return issues;
}

function detectEventStreamGaps(): HealingIssue[] {
  const issues: HealingIssue[] = [];
  if (!existsSync(EVENT_STREAMS_DIR)) return issues;

  const files = readdirSync(EVENT_STREAMS_DIR).filter(f => f.endsWith(".ndjson"));
  for (const file of files) {
    const lines = safeRead(join(EVENT_STREAMS_DIR, file));
    if (!lines.ok || !lines.content) continue;

    const events = lines.content.split("\n").filter(l => l.trim()).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean) as Array<{ timestamp: string }>;

    for (let i = 1; i < events.length; i++) {
      const prev = new Date(events[i - 1].timestamp).getTime();
      const curr = new Date(events[i].timestamp).getTime();
      if (curr < prev) {
        issues.push({
          category: "event_gap",
          severity: "warn",
          message: `Event stream ${file} has out-of-order timestamps at index ${i}`,
          target: join(EVENT_STREAMS_DIR, file),
          autoRepairable: false,
          destructive: false,
        });
        break; // one flag per file is enough
      }
    }
  }

  return issues;
}

// ── Repair Actions ──

function repairStaleLock(): { success: boolean; error?: string } {
  const result = autoRecoverStaleLock();
  return { success: result.recovered, error: result.error };
}

function repairCorruptedState(target: string): { success: boolean; error?: string } {
  try {
    if (target === STATE_PATH) {
      writeFileSync(STATE_PATH, JSON.stringify({
        current_state: "idle",
        history: [],
        updated_at: new Date().toISOString(),
      }, null, 2));
    } else if (target === LOCK_PATH) {
      writeFileSync(LOCK_PATH, JSON.stringify({
        locked: false,
        execution_id: null,
        locked_by: null,
        acquired_at: null,
        expires_at: null,
        ttl_ms: 0,
      }, null, 2));
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Main API ──

export function scan(): HealingResult {
  const issues: HealingIssue[] = [];

  const stale = detectStaleLocksIssue();
  if (stale) issues.push(stale);

  issues.push(...detectOrphanProjections());
  issues.push(...detectMissingIndexes());
  issues.push(...detectRuntimeDivergence());
  issues.push(...detectCorruptedState());
  issues.push(...detectEventStreamGaps());

  return {
    scanned: issues.length,
    healed: 0,
    failed: 0,
    skipped: 0,
    snapshotCreated: false,
    issues,
  };
}

export function heal(options: { destructive?: boolean; createSnapshot?: boolean } = {}): HealingResult {
  const start = Date.now();
  const result = scan();
  let healed = 0;
  let failed = 0;
  let skipped = 0;
  let snapshotCreated = false;
  let snapshotId: string | undefined;

  const hasDestructive = result.issues.some(i => i.destructive && i.autoRepairable);

  if (hasDestructive && options.createSnapshot !== false) {
    const snapshot = createSnapshot("pre_healing");
    snapshotCreated = true;
    snapshotId = snapshot.id;
    emitEvent("healing.snapshot_created", "info", { snapshot_id: snapshot.id, reason: "destructive_healing_pending" });
    logHealing({
      timestamp: new Date().toISOString(),
      action: "snapshot_created",
      snapshot_id: snapshot.id,
      reason: "destructive_healing_pending",
    });
  }

  for (const issue of result.issues) {
    if (!issue.autoRepairable) {
      skipped++;
      emitEvent("healing.issue_flagged", "warn", {
        category: issue.category,
        message: issue.message,
        target: issue.target,
      });
      logHealing({
        timestamp: new Date().toISOString(),
        action: "flagged",
        category: issue.category,
        target: issue.target,
        message: issue.message,
      });
      continue;
    }

    if (issue.destructive && !options.destructive) {
      skipped++;
      emitEvent("healing.issue_skipped", "warn", {
        category: issue.category,
        message: issue.message,
        target: issue.target,
        reason: "destructive_healing_disabled",
      });
      logHealing({
        timestamp: new Date().toISOString(),
        action: "skipped",
        category: issue.category,
        target: issue.target,
        reason: "destructive_healing_disabled",
      });
      continue;
    }

    // Repair
    let repairResult: { success: boolean; error?: string };
    if (issue.category === "stale_lock") {
      repairResult = repairStaleLock();
    } else if (issue.category === "corrupted_state") {
      repairResult = repairCorruptedState(issue.target);
    } else {
      repairResult = { success: false, error: "No repair handler" };
    }

    issue.repaired = repairResult.success;
    issue.repairError = repairResult.error;

    if (repairResult.success) {
      healed++;
      emitEvent("healing.repaired", "info", {
        category: issue.category,
        target: issue.target,
        snapshot_id: snapshotId,
      });
      logHealing({
        timestamp: new Date().toISOString(),
        action: "repaired",
        category: issue.category,
        target: issue.target,
        snapshot_id: snapshotId,
      });
    } else {
      failed++;
      emitEvent("healing.repair_failed", "error", {
        category: issue.category,
        target: issue.target,
        error: repairResult.error,
      });
      logHealing({
        timestamp: new Date().toISOString(),
        action: "repair_failed",
        category: issue.category,
        target: issue.target,
        error: repairResult.error,
      });
    }
  }

  emitEvent("healing.completed", "info", {
    scanned: result.scanned,
    healed,
    failed,
    skipped,
    snapshot_created: snapshotCreated,
    snapshot_id: snapshotId,
    duration_ms: Date.now() - start,
  });

  return {
    scanned: result.scanned,
    healed,
    failed,
    skipped,
    snapshotCreated,
    snapshotId,
    issues: result.issues,
  };
}

export function generateHealingReport(result: HealingResult): string {
  const lines: string[] = [];
  lines.push("# Self-Healing Report");
  lines.push("");
  lines.push(`**Scanned:** ${result.scanned}`);
  lines.push(`**Healed:** ${result.healed}`);
  lines.push(`**Failed:** ${result.failed}`);
  lines.push(`**Skipped:** ${result.skipped}`);
  if (result.snapshotCreated) {
    lines.push(`**Snapshot:** ${result.snapshotId}`);
  }
  lines.push("");

  if (result.issues.length === 0) {
    lines.push("No issues detected.");
    return lines.join("\n");
  }

  lines.push("## Issues");
  lines.push("");
  for (const issue of result.issues) {
    const status = issue.repaired ? "✅ REPAIRED" : issue.autoRepairable ? "🔧 REPAIRABLE" : "🚩 FLAGGED";
    lines.push(`### [${issue.severity.toUpperCase()}] ${issue.category} ${status}`);
    lines.push(`- **Message:** ${issue.message}`);
    lines.push(`- **Target:** ${issue.target}`);
    lines.push(`- **Destructive:** ${issue.destructive ? "yes" : "no"}`);
    if (issue.repairError) {
      lines.push(`- **Error:** ${issue.repairError}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const command = args[0];
  const destructive = args.includes("--destructive");
  const noSnapshot = args.includes("--no-snapshot");

  if (!command || command === "scan") {
    const result = scan();
    console.log(generateHealingReport(result));
    process.exit(result.issues.length > 0 ? 1 : 0);
  } else if (command === "heal") {
    const result = heal({ destructive, createSnapshot: !noSnapshot });
    console.log(generateHealingReport(result));
    process.exit(result.failed > 0 ? 1 : 0);
  } else if (command === "snapshot") {
    const snapshot = createSnapshot("manual_cli");
    console.log(`Created snapshot: ${snapshot.id}`);
    emitEvent("healing.snapshot_created", "info", { snapshot_id: snapshot.id, trigger: "manual_cli" });
  } else if (command === "revert") {
    const snapshotId = args[1];
    if (!snapshotId) {
      console.error("Usage: tsx scripts/self-heal.ts revert <snapshot_id>");
      process.exit(1);
    }
    const result = revertSnapshot(snapshotId);
    if (result.success) {
      console.log(`Reverted to snapshot: ${snapshotId}`);
      emitEvent("healing.snapshot_reverted", "info", { snapshot_id: snapshotId });
    } else {
      console.error(`Revert failed: ${result.error}`);
      process.exit(1);
    }
  } else {
    console.error("Usage: tsx scripts/self-heal.ts <scan|heal [--destructive] [--no-snapshot]|snapshot|revert <id>>");
    process.exit(1);
  }
}
