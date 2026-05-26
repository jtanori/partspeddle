#!/usr/bin/env tsx
/**
 * run-validators.ts
 * Warm-Process Validator Runner — P2 deliverable
 *
 * Runs all governance validators in a single warm Node.js process,
 * eliminating TSX cold-start overhead while preserving semantic isolation.
 *
 * Usage:
 *   tsx scripts/run-validators.ts [--profile]
 */

import { performance } from "perf_hooks";

interface ValidatorResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

interface ValidatorEntry {
  name: string;
  run: () => Promise<ValidatorResult>;
}

const PROFILE = process.argv.includes("--profile");

// ── Validator Registry ──────────────────────────────────────────────
// Each validator is dynamically imported and executed in isolation.
// No shared mutable state between validators.

async function loadValidators(): Promise<ValidatorEntry[]> {
  const validators: ValidatorEntry[] = [];

  // Causality — lib export
  validators.push({
    name: "causality",
    run: async () => {
      const mod = await import("./lib/causality-validator.js");
      const r = mod.validateCausality();
      return { passed: r.passed, errors: [], warnings: [] };
    },
  });

  // Replay integrity — lib export
  validators.push({
    name: "replay",
    run: async () => {
      const mod = await import("./lib/replay-integrity-validator.js");
      const r = mod.validateReplayIntegrity();
      return { passed: r.passed, errors: [], warnings: [] };
    },
  });

  // Dashboard — direct export
  validators.push({
    name: "dashboard",
    run: async () => {
      const mod = await import("./validate-dashboard.js");
      return mod.validateDashboard();
    },
  });

  // Control plane — direct export
  validators.push({
    name: "control-plane",
    run: async () => {
      const mod = await import("./validate-control-plane.js");
      return mod.validateControlPlane();
    },
  });

  // Recipes — direct export
  validators.push({
    name: "recipes",
    run: async () => {
      const mod = await import("./validate-recipes.js");
      return mod.validateRecipeRegistry();
    },
  });

  // Invariants — direct export
  validators.push({
    name: "invariants",
    run: async () => {
      const mod = await import("./validate-invariants.js");
      const r = mod.runValidation({ emitEvents: false });
      return { passed: r.overall_status === "PASS", errors: [], warnings: [] };
    },
  });

  // Bootstrap — direct export
  validators.push({
    name: "bootstrap",
    run: async () => {
      const mod = await import("./validate-bootstrap.js");
      const r = mod.validateBootstrap();
      return { passed: r.passed, errors: r.errors, warnings: [] };
    },
  });

  // Repository hygiene — direct export
  validators.push({
    name: "hygiene",
    run: async () => {
      const mod = await import("./validate-repository-hygiene.js");
      const r = mod.checkRootHygiene();
      return { passed: r.passed, errors: r.violations, warnings: [] };
    },
  });

  // Benchmark — direct export
  validators.push({
    name: "benchmark",
    run: async () => {
      const mod = await import("./validate-benchmark.js");
      return mod.validateBenchmark();
    },
  });

  // Projections — direct export
  validators.push({
    name: "projections",
    run: async () => {
      const mod = await import("./validate-projections.js");
      const r = mod.validateProjectionConsistency();
      const errors = r.drifts.map(
        (d: { projection: string; field: string; expected: unknown; actual: unknown }) =>
          `Drift in ${d.projection}.${d.field}: expected=${JSON.stringify(d.expected)}, actual=${JSON.stringify(d.actual)}`
      );
      return { passed: r.passed, errors, warnings: [] };
    },
  });

  return validators;
}

// ── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("Warm-Process Validator Runner");
  console.log("=============================\n");

  if (PROFILE) {
    console.log("📊 Profile mode enabled\n");
  }

  const validators = await loadValidators();
  const timings: Array<{ name: string; duration_ms: number }> = [];
  let allPassed = true;
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  for (const v of validators) {
    const start = performance.now();
    let result: ValidatorResult;
    try {
      result = await v.run();
    } catch (err) {
      result = {
        passed: false,
        errors: [`Exception: ${err instanceof Error ? err.message : String(err)}`],
        warnings: [],
      };
    }
    const duration = performance.now() - start;
    timings.push({ name: v.name, duration_ms: Math.round(duration) });

    if (!result.passed) {
      allPassed = false;
      console.log(`❌ ${v.name}: FAILED (${duration.toFixed(0)}ms)`);
    } else {
      console.log(`✅ ${v.name}: PASSED (${duration.toFixed(0)}ms)`);
    }

    if (result.errors.length > 0) {
      for (const e of result.errors) {
        console.log(`   • ${e}`);
        allErrors.push(`${v.name}: ${e}`);
      }
    }
    if (result.warnings.length > 0) {
      for (const w of result.warnings) {
        console.log(`   ⚠️  ${w}`);
        allWarnings.push(`${v.name}: ${w}`);
      }
    }
  }

  console.log("");

  if (PROFILE) {
    console.log("Profile Summary");
    console.log("---------------");
    const total = timings.reduce((s, t) => s + t.duration_ms, 0);
    for (const t of timings) {
      const pct = total > 0 ? ((t.duration_ms / total) * 100).toFixed(1) : "0.0";
      console.log(`  ${t.name.padEnd(20)} ${t.duration_ms.toString().padStart(4)}ms  (${pct}%)`);
    }
    console.log(`  ${"TOTAL".padEnd(20)} ${total.toString().padStart(4)}ms`);
    console.log("");
  }

  console.log(`Errors: ${allErrors.length}, Warnings: ${allWarnings.length}`);
  console.log(`Result: ${allPassed ? "✅ ALL PASSED" : "❌ FAILURES DETECTED"}`);

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("Runner failed:", err);
  process.exit(1);
});
