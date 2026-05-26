#!/usr/bin/env tsx
/**
 * validate-repository-hygiene.ts
 * Repository hygiene validator — T32.4 deliverable
 *
 * Scans the repository root for test artifacts and generated files
 * that should not be committed.
 */

import { execSync } from "child_process";

const FORBIDDEN_ROOT_PATTERNS = [
  /^bench\//,
  /^direct-\d+\.json$/,
  /^adapter-\d+\.json$/,
  /\.tmp$/,
];

interface HygieneResult {
  passed: boolean;
  violations: string[];
  checked: number;
}

function getTrackedRootFiles(): string[] {
  try {
    const output = execSync("git ls-files", { encoding: "utf-8" }).trim();
    if (!output) return [];
    const lines = output.split("\n");
    const rootFiles = new Set<string>();
    for (const line of lines) {
      const parts = line.split("/");
      if (parts.length === 1) {
        rootFiles.add(parts[0]);
      } else {
        rootFiles.add(parts[0] + "/");
      }
    }
    return Array.from(rootFiles);
  } catch {
    return [];
  }
}

export function checkRootHygiene(): HygieneResult {
  const violations: string[] = [];
  const tracked = getTrackedRootFiles();

  for (const entry of tracked) {
    if (FORBIDDEN_ROOT_PATTERNS.some((pattern) => pattern.test(entry))) {
      violations.push(`Forbidden tracked file/directory in repo root: ${entry}`);
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    checked: tracked.length,
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

if (import.meta.url === `file://${process.argv[1]}`) { main(); }
