#!/usr/bin/env tsx
/**
 * validate-causality.ts
 * Causality invariant validator CLI — T29.2 deliverable
 *
 * Usage: tsx scripts/validate-causality.ts
 * Exit code 0 if all invariants pass, 1 otherwise.
 */

import { validateCausality } from "./lib/causality-validator.js";

function main(): void {
  console.log("Causality Invariant Validation");
  console.log("==============================\n");

  const result = validateCausality();

  console.log(`Events inspected: ${result.stats.eventsInspected}`);
  console.log(`Checkpoints inspected: ${result.stats.checkpointsInspected}`);
  console.log(`Findings: ${result.findings.length}`);
  console.log(`Critical/High: ${result.stats.criticalCount + result.stats.highCount}\n`);

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
    console.log("✅ All causality invariants passed.");
    process.exit(0);
  } else {
    console.log("❌ Causality invariants violated.");
    process.exit(1);
  }
}

main();
