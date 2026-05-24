#!/usr/bin/env tsx
/**
 * validate-repository-hygiene.ts
 * Repository hygiene validator — T32.4 deliverable
 *
 * Scans the repository root for test artifacts and generated files
 * that should not be committed.
 */

import { existsSync, readdirSync, statSync } from "fs";
import { resolve } from "path";

const FORBIDDEN_ROOT_GLOBS = [
  /^bench\//,
  /^project-governance\/runtime\/storage\/tests\/fixtures\//,
];

const FORBIDDEN_ROOT_FILES = [
  /^direct-\d+\.json$/,
  /^adapter-\d+\.json$/,
  /\.tmp$/,
];

interface HygieneResult {
  passed: boolean;
  violations: string[];
  checked: number;
}

function checkRootHygiene(): HygieneResult {
  const violations: string[] = [];
  let checked = 0;

  const rootEntries = readdirSync(".");
  for (const entry of rootEntries) {
    checked++;
    const fullPath = resolve(entry);

    // Check forbidden file patterns in root
    if (FORBIDDEN_ROOT_FILES.some((pattern) => pattern.test(entry))) {
      violations.push(`Forbidden file in repo root: ${entry}`);
    }

    // Check forbidden directory patterns
    if (existsSync(fullPath) && statSync(fullPath).isDirectory()) {
      if (FORBIDDEN_ROOT_GLOBS.some((pattern) => pattern.test(entry + "/"))) {
        violations.push(`Forbidden directory in repo root: ${entry}/`);
      }
    }
  }

  // Check if bench/ exists at all
  if (existsSync("bench")) {
    violations.push("bench/ directory exists in repo root (should be .gitignored)");
  }

  return {
    passed: violations.length === 0,
    violations,
    checked,
  };
}

function main(): void {
  console.log("Repository Hygiene Validation");
  console.log("=============================\n");

  const result = checkRootHygiene();

  console.log(`Checked ${result.checked} entries in repo root`);

  if (result.violations.length > 0) {
    console.log(`\n❌ ${result.violations.length} violation(s) found:`);
    for (const v of result.violations) {
      console.log(`  - ${v}`);
    }
    process.exit(1);
  } else {
    console.log("\n✅ Repository hygiene clean.");
    process.exit(0);
  }
}

main();
