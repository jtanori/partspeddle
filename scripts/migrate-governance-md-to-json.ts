#!/usr/bin/env tsx
/**
 * Governance Markdown-to-JSON Migration Utility
 *
 * Scans governance markdown documents and reports which ones
 * lack corresponding JSON protocol definitions.
 *
 * Usage:
 *   ./node_modules/.bin/tsx scripts/migrate-governance-md-to-json.ts
 */

import { readdirSync, existsSync } from "fs";
import { join } from "path";

const PROTOCOLS_DIR = "project-governance/protocols";
const JSON_PROTOCOLS_DIR = "meta/governance/protocols";

function main() {
  const mdFiles = readdirSync(PROTOCOLS_DIR)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .map((f) => f.replace(".md", ""));

  const jsonFiles = existsSync(JSON_PROTOCOLS_DIR)
    ? readdirSync(JSON_PROTOCOLS_DIR)
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(".json", ""))
    : [];

  const migrated = mdFiles.filter((f) => jsonFiles.includes(f));
  const pending = mdFiles.filter((f) => !jsonFiles.includes(f));

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  GOVERNANCE MIGRATION STATUS");
  console.log("═══════════════════════════════════════════════════════════════\n");
  console.log(`  Markdown protocols: ${mdFiles.length}`);
  console.log(`  JSON protocols:     ${jsonFiles.length}`);
  console.log(`  Migrated:           ${migrated.length}/${mdFiles.length}`);
  console.log(`  Pending:            ${pending.length}\n`);

  if (migrated.length > 0) {
    console.log("  ✅ Migrated:");
    for (const f of migrated) {
      console.log(`     ${f}`);
    }
    console.log();
  }

  if (pending.length > 0) {
    console.log("  ⏳ Pending migration:");
    for (const f of pending) {
      console.log(`     ${f}`);
    }
    console.log();
  }

  const coverage = Math.round((migrated.length / mdFiles.length) * 100);
  console.log(`  Migration coverage: ${coverage}%`);

  if (pending.length === 0) {
    console.log("\n  ✅ All markdown protocols have JSON definitions.");
  } else {
    console.log(`\n  ⚠️  ${pending.length} protocol(s) still markdown-only.`);
  }
}

main();
