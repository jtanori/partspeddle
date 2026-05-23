#!/usr/bin/env tsx
/**
 * validate-replay.ts
 * Replay integrity validation.
 */
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { computeIntegrityHash, collectEventsForExecution } from "./replay-execution.js";

const MANIFESTS_DIR = resolve("project-governance/runtime/replay/manifests");

interface ValidationResult {
  execution_id: string;
  valid: boolean;
  errors: string[];
  manifest_events: number;
  actual_events: number;
  integrity_match: boolean;
}

function validateReplay(executionId: string): ValidationResult {
  const errors: string[] = [];
  const manifestPath = join(MANIFESTS_DIR, `${executionId}.json`);

  if (!existsSync(manifestPath)) {
    return { execution_id: executionId, valid: false, errors: ["Manifest not found"], manifest_events: 0, actual_events: 0, integrity_match: false };
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
    event_count: number;
    integrity_hash: string;
    timeline_start: string;
    timeline_end: string;
  };

  const actualEvents = collectEventsForExecution(executionId);
  const actualHash = computeIntegrityHash(actualEvents);

  if (manifest.event_count !== actualEvents.length) {
    errors.push(`Event count mismatch: manifest=${manifest.event_count}, actual=${actualEvents.length}`);
  }

  if (manifest.integrity_hash !== actualHash) {
    errors.push(`Integrity hash mismatch: manifest=${manifest.integrity_hash}, actual=${actualHash}`);
  }

  if (actualEvents.length > 0) {
    if (manifest.timeline_start && manifest.timeline_start !== actualEvents[0].timestamp) {
      errors.push(`Timeline start mismatch`);
    }
    if (manifest.timeline_end && manifest.timeline_end !== actualEvents[actualEvents.length - 1].timestamp) {
      errors.push(`Timeline end mismatch`);
    }
  }

  return {
    execution_id: executionId,
    valid: errors.length === 0,
    errors,
    manifest_events: manifest.event_count,
    actual_events: actualEvents.length,
    integrity_match: manifest.integrity_hash === actualHash,
  };
}

export { validateReplay };

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: tsx scripts/validate-replay.ts <execution_id>");
    process.exit(1);
  }
  const result = validateReplay(args[0]);
  console.log(`Execution: ${result.execution_id}`);
  console.log(`Valid: ${result.valid}`);
  console.log(`Manifest events: ${result.manifest_events}`);
  console.log(`Actual events: ${result.actual_events}`);
  console.log(`Integrity match: ${result.integrity_match}`);
  if (!result.valid) {
    console.log("Errors:");
    result.errors.forEach(e => console.log(`  ${e}`));
    process.exit(1);
  }
}
