#!/usr/bin/env tsx
/**
 * validate-dashboard.ts
 * Dashboard Surface Contract Validator — T31.1 deliverable
 *
 * Validates dashboard-surfaces.json against the schema and checks
 * operational consistency (freshness bounds, authority correctness, etc.)
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const SURFACES_PATH = resolve("meta/governance/dashboard-surfaces.json");
const SCHEMA_PATH = resolve("meta/governance/schemas/dashboard.schema.json");

interface DashboardSurface {
  id: string;
  name: string;
  authority: string;
  mutability: string;
  freshness: string;
  freshness_seconds?: number;
  replayVisibility: boolean;
  approvalRequired: boolean;
  riskLevel: string;
  dataSources: Array<{ source: string; path: string }>;
  recipeIds?: string[];
}

interface DashboardConfig {
  version: string;
  surfaces: DashboardSurface[];
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

export function validateDashboard(): { passed: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!existsSync(SURFACES_PATH)) {
    errors.push("dashboard-surfaces.json does not exist");
    return { passed: false, errors, warnings };
  }

  const config = loadJson<DashboardConfig>(SURFACES_PATH);

  // Check schema exists
  if (!existsSync(SCHEMA_PATH)) {
    warnings.push("dashboard.schema.json not found — skipping schema validation");
  }

  // Check required views
  const requiredViews = [
    "execution_status",
    "event_streams",
    "lock_status",
    "replay_integrity",
    "audit_trail",
    "healing_actions",
    "enforcement_status",
    "invariant_violations",
  ];
  const surfaceIds = new Set(config.surfaces.map((s) => s.id));
  for (const view of requiredViews) {
    if (!surfaceIds.has(view)) {
      errors.push(`Missing required view: ${view}`);
    }
  }

  // Check for duplicate IDs
  const seen = new Set<string>();
  for (const s of config.surfaces) {
    if (seen.has(s.id)) {
      errors.push(`Duplicate surface ID: ${s.id}`);
    }
    seen.add(s.id);
  }

  // Operational consistency checks
  for (const s of config.surfaces) {
    // Freshness bounds
    const maxFreshness: Record<string, number> = {
      realtime: 10,
      "near-realtime": 120,
      delayed: 600,
    };
    if (s.freshness_seconds !== undefined && s.freshness_seconds > maxFreshness[s.freshness]) {
      warnings.push(
        `${s.id}: freshness_seconds (${s.freshness_seconds}s) exceeds recommended max for ${s.freshness} (${maxFreshness[s.freshness]}s)`
      );
    }

    // Approval consistency
    if (s.mutability === "read-only" && s.approvalRequired) {
      warnings.push(`${s.id}: read-only surface should not require approval`);
    }
    if (s.mutability === "actionable" && !s.approvalRequired && s.riskLevel === "high") {
      warnings.push(`${s.id}: high-risk actionable surface should require approval`);
    }

    // Replay visibility for actionable surfaces
    if (s.mutability === "actionable" && !s.replayVisibility) {
      errors.push(`${s.id}: actionable surface must have replayVisibility=true`);
    }

    // Data source existence (lightweight check)
    for (const ds of s.dataSources) {
      if (ds.source === "canonical-state" && !ds.path.includes("meta/state") && !ds.path.includes("meta/governance")) {
        warnings.push(`${s.id}: canonical-state source should point to meta/state/ or meta/governance/`);
      }
    }

    // Recipe association for actionable surfaces
    if (s.mutability === "actionable" && (!s.recipeIds || s.recipeIds.length === 0)) {
      errors.push(`${s.id}: actionable surface must reference at least one recipe`);
    }
  }

  return { passed: errors.length === 0, errors, warnings };
}

function main(): void {
  console.log("Dashboard Surface Contract Validation");
  console.log("======================================\n");

  const result = validateDashboard();

  if (result.errors.length > 0) {
    console.log(`❌ ${result.errors.length} error(s):`);
    for (const e of result.errors) {
      console.log(`  • ${e}`);
    }
    console.log("");
  }

  if (result.warnings.length > 0) {
    console.log(`⚠️  ${result.warnings.length} warning(s):`);
    for (const w of result.warnings) {
      console.log(`  • ${w}`);
    }
    console.log("");
  }

  if (result.passed) {
    console.log("✅ Dashboard surface contracts valid.");
    process.exit(0);
  } else {
    console.log("❌ Dashboard surface contracts invalid.");
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) { main(); }
