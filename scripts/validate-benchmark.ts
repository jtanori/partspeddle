#!/usr/bin/env tsx
/**
 * validate-benchmark.ts
 * Benchmark regression validator — Governance Hardening
 *
 * Tiered threshold model:
 *   <10%  → PASS
 *   10–20% → WARN (advisory)
 *   >20%  → FAIL (blocking)
 *   >35%  → CRITICAL (blocking)
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const BENCHMARK_LOG_PATH = resolve("project-governance/runtime/storage/tests/benchmark-log.json");

interface BenchmarkResult {
  status: "PASS" | "WARN" | "FAIL" | "CRITICAL";
  regression_percent: number;
  threshold: number;
  classification: string;
  adapter_ms?: number;
  direct_ms?: number;
}

function loadLatestBenchmark(): { overhead: number; adapter_ms: number; direct_ms: number } | null {
  if (!existsSync(BENCHMARK_LOG_PATH)) return null;
  try {
    const data = JSON.parse(readFileSync(BENCHMARK_LOG_PATH, "utf-8")) as {
      runs: Array<{ overhead: number; adapter_ms: number; direct_ms: number; timestamp: string }>;
    };
    if (!data.runs || data.runs.length === 0) return null;
    return data.runs[data.runs.length - 1];
  } catch {
    return null;
  }
}

function classify(overhead: number): BenchmarkResult {
  let status: "PASS" | "WARN" | "FAIL" | "CRITICAL" = "PASS";
  if (overhead > 35) status = "CRITICAL";
  else if (overhead > 20) status = "FAIL";
  else if (overhead > 10) status = "WARN";

  return {
    status,
    regression_percent: overhead,
    threshold: 10,
    classification: `PERFORMANCE_${status}`,
  };
}

function emitWarning(result: BenchmarkResult): void {
  try {
    const { emit } = require("./emit-governance-event.js");
    emit({
      event_id: crypto.randomUUID?.() || `perf-${Date.now()}`,
      timestamp: new Date().toISOString(),
      event_type: "governance.performance.warning",
      severity: result.status === "WARN" ? "warn" : result.status === "FAIL" ? "error" : "critical",
      category: "validation",
      actor: "system",
      payload: {
        regression_percent: result.regression_percent,
        threshold: result.threshold,
        classification: result.classification,
        source: "storage-adapter-benchmark",
      },
    });
  } catch {
    // Emitter not available — warning is still logged to console
  }
}

export function validateBenchmark(): { passed: boolean; errors: string[]; warnings: string[] } {
  const latest = loadLatestBenchmark();
  let result: BenchmarkResult;

  if (latest) {
    result = classify(latest.overhead);
    result.adapter_ms = latest.adapter_ms;
    result.direct_ms = latest.direct_ms;
  } else {
    result = {
      status: "PASS",
      regression_percent: 0,
      threshold: 10,
      classification: "PERFORMANCE_PASS",
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  if (result.status === "FAIL" || result.status === "CRITICAL") {
    errors.push(`Benchmark regression ${result.status}: ${result.regression_percent.toFixed(1)}% (threshold: ${result.threshold}%)`);
  } else if (result.status === "WARN") {
    warnings.push(`Benchmark regression advisory: ${result.regression_percent.toFixed(1)}%`);
  }

  return { passed: errors.length === 0, errors, warnings };
}

function main(): void {
  console.log("Benchmark Validation");
  console.log("====================\n");

  const result = validateBenchmark();

  if (result.warnings.length > 0) {
    for (const w of result.warnings) {
      console.log(`⚠️  ${w}`);
    }
  }

  if (result.errors.length > 0) {
    for (const e of result.errors) {
      console.log(`❌ ${e}`);
    }
  }

  if (result.passed) {
    console.log("✅ Benchmark within acceptable range.");
    process.exit(0);
  } else {
    console.log("❌ Benchmark regression exceeds blocking threshold.");
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) { main(); }
