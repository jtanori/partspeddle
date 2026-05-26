#!/usr/bin/env tsx
/**
 * validate-bootstrap.ts
 * Bootstrap output validator — T32.1 deliverable
 *
 * Compares runtime-bootstrap.json output against canonical-state.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const CANONICAL_STATE_PATH = resolve("meta/state/canonical-state.json");
const BOOTSTRAP_PATH = resolve("project-governance/runtime/bootstrap/runtime-bootstrap.json");

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

export function validateBootstrap(): { passed: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!existsSync(BOOTSTRAP_PATH)) {
    return { passed: false, errors: ["runtime-bootstrap.json does not exist"] };
  }

  const canonical = loadJson<Record<string, unknown>>(CANONICAL_STATE_PATH);
  const bootstrap = loadJson<Record<string, unknown>>(BOOTSTRAP_PATH);

  // Validate current_milestone matches canonical-state
  const canonicalMilestone = (canonical.milestone as Record<string, string>)?.id;
  const bootstrapMilestone = (bootstrap.current_milestone as Record<string, string>)?.id;
  if (canonicalMilestone !== bootstrapMilestone) {
    errors.push(`current_milestone mismatch: canonical-state=${canonicalMilestone}, bootstrap=${bootstrapMilestone}`);
  }

  // Validate current_ticket matches canonical-state
  const canonicalTicket = (canonical.ticket as Record<string, string>)?.id;
  const bootstrapTicket = (bootstrap.current_ticket as Record<string, string>)?.id;
  if (canonicalTicket !== bootstrapTicket) {
    errors.push(`current_ticket mismatch: canonical-state=${canonicalTicket}, bootstrap=${bootstrapTicket}`);
  }

  // Validate latest_checkpoint matches actual checkpoint file
  const checkpointPath = resolve("project-governance/runtime/checkpoints/latest-checkpoint.json");
  if (existsSync(checkpointPath)) {
    const checkpointFile = loadJson<Record<string, unknown>>(checkpointPath);
    const bootstrapCheckpoint = (bootstrap as Record<string, unknown>).latest_checkpoint;
    if (JSON.stringify(checkpointFile) !== JSON.stringify(bootstrapCheckpoint)) {
      errors.push("latest_checkpoint mismatch between checkpoint file and bootstrap");
    }
  }

  return { passed: errors.length === 0, errors };
}

function main(): void {
  console.log("Bootstrap Validation");
  console.log("====================\n");

  const result = validateBootstrap();

  if (!result.passed) {
    console.log(`❌ ${result.errors.length} validation error(s):`);
    for (const e of result.errors) {
      console.log(`  - ${e}`);
    }
    process.exit(1);
  } else {
    console.log("✅ Bootstrap output validated against canonical-state.");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) { main(); }
