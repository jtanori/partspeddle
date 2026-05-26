#!/usr/bin/env tsx
/**
 * validate-replay-integrity.ts
 * Replay integrity validator CLI — T29.3 deliverable
 *
 * Usage: tsx scripts/validate-replay-integrity.ts
 * Exit code 0 if all checks pass, 1 otherwise.
 */

import { validateReplayIntegrity } from "./lib/replay-integrity-validator.js";

function main(): void {
  console.log("Replay Integrity Validation");
  console.log("===========================\n");

  const result = validateReplayIntegrity();

  console.log(`Events inspected:     ${result.stats.eventsInspected}`);
  console.log(`Streams inspected:    ${result.stats.streamsInspected}`);
  console.log(`Checkpoints inspected: ${result.stats.checkpointsInspected}`);
  console.log(`Findings:             ${result.findings.length}`);
  console.log(`Critical/High:        ${result.stats.criticalCount + result.stats.highCount}\n`);

  if (result.findings.length > 0) {
    console.log("Findings by Invariant:");
    for (const [inv, count] of Object.entries(result.summary)) {
      console.log(`  ${inv}: ${count}`);
    }
    console.log("");

    for (const f of result.findings) {
      const icon = f.severity === "CRITICAL" ? "🔴" : f.severity === "HIGH" ? "🟡" : "🟢";
      console.log(`${icon} [${f.invariant}] ${f.severity}: ${f.message}`);
    }
  }

  console.log("\n" + "=".repeat(50));
  if (result.passed) {
    console.log("✅ Replay integrity verified.");
    process.exit(0);
  } else {
    console.log("❌ Replay integrity violations detected.");
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) { main(); }
