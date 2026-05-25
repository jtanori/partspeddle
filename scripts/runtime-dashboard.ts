#!/usr/bin/env tsx
/**
 * runtime-dashboard.ts
 * Unified Runtime Dashboard — T31.2 deliverable
 *
 * CLI-first governance runtime dashboard. Read-only projection surface.
 * Supports: human, json, compact, verbose output modes.
 * Supports: --watch polling refresh.
 */

import { getAllSurfaces, getSurface, listSurfaceIds } from "./dashboard/registry.js";
import type { OutputFormat, SurfaceResult } from "./dashboard/types.js";

interface DashboardOptions {
  format: OutputFormat;
  watch: boolean;
  intervalMs: number;
  surfaces: string[];
  verbose: boolean;
}

function parseArgs(): DashboardOptions {
  const args = process.argv.slice(2);
  const opts: DashboardOptions = {
    format: "human",
    watch: false,
    intervalMs: 5000,
    surfaces: listSurfaceIds(),
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--format" || arg === "-f") {
      opts.format = (args[++i] as OutputFormat) ?? "human";
    } else if (arg === "--watch" || arg === "-w") {
      opts.watch = true;
    } else if (arg === "--interval") {
      opts.intervalMs = parseInt(args[++i], 10) || 5000;
    } else if (arg === "--surface" || arg === "-s") {
      const ids = args[++i]?.split(",") ?? [];
      opts.surfaces = ids.filter((id) => listSurfaceIds().includes(id));
      if (opts.surfaces.length === 0) {
        console.error("No valid surface IDs provided");
        process.exit(1);
      }
    } else if (arg === "--verbose" || arg === "-v") {
      opts.verbose = true;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
  }

  return opts;
}

function printUsage(): void {
  console.log("Runtime Dashboard — Governance Operational Surface");
  console.log("===================================================\n");
  console.log("Usage: npm run dashboard [options]\n");
  console.log("Options:");
  console.log("  -f, --format <mode>    Output: human | json | compact | verbose (default: human)");
  console.log("  -w, --watch            Poll refresh mode");
  console.log("  --interval <ms>        Poll interval in ms (default: 5000)");
  console.log("  -s, --surface <ids>    Comma-separated surface IDs");
  console.log("  -v, --verbose          Include freshness metadata");
  console.log("  -h, --help             Show this help\n");
  console.log("Surfaces:");
  for (const id of listSurfaceIds()) {
    const s = getSurface(id)!;
    console.log(`  ${id} — ${s.name}`);
  }
}

function renderCompact(results: SurfaceResult[]): string {
  const lines: string[] = [];
  for (const r of results) {
    const icon = r.freshness.freshnessState === "fresh" ? "✅" : r.freshness.freshnessState === "stale" ? "⚠️" : "❌";
    lines.push(`${icon} ${r.id}: ${JSON.stringify(r.data).substring(0, 80)}`);
  }
  return lines.join("\n");
}

function renderHuman(results: SurfaceResult[], verbose: boolean): string {
  const lines: string[] = [];
  lines.push("Governance Runtime Dashboard");
  lines.push("=".repeat(50));
  lines.push("");

  for (const r of results) {
    lines.push(`─ ${r.name} ─`.padEnd(50, "─"));

    if (r.data._rendered) {
      lines.push(r.data._rendered as string);
    } else {
      lines.push(JSON.stringify(r.data, null, 2));
    }

    if (verbose) {
      lines.push("");
      lines.push(`  [freshness] ${r.freshness.freshnessState} | source: ${r.freshness.sourceAuthority} | maxAge: ${r.freshness.maxAgeSeconds}s`);
      lines.push(`  [generated] ${r.freshness.generatedAt}`);
      lines.push(`  [source]    ${r.freshness.sourceTimestamp}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

function renderJson(results: SurfaceResult[], verbose: boolean): string {
  const output = verbose
    ? { surfaces: results, generatedAt: new Date().toISOString() }
    : { surfaces: results.map((r) => ({ id: r.id, name: r.name, data: r.data })) };
  return JSON.stringify(output, null, 2);
}

async function renderDashboard(opts: DashboardOptions): Promise<string> {
  const surfaces = opts.surfaces.map((id) => getSurface(id)!).filter(Boolean);
  const results: SurfaceResult[] = [];

  for (const surface of surfaces) {
    try {
      const result = await surface.render(opts.format);
      results.push(result);
    } catch (err) {
      results.push({
        id: surface.id,
        name: surface.name,
        data: { error: (err as Error).message },
        freshness: {
          generatedAt: new Date().toISOString(),
          sourceTimestamp: new Date().toISOString(),
          freshnessState: "degraded",
          sourceAuthority: "unknown",
          maxAgeSeconds: 0,
        },
      });
    }
  }

  switch (opts.format) {
    case "compact":
      return renderCompact(results);
    case "json":
      return renderJson(results, opts.verbose);
    case "verbose":
      return renderHuman(results, true);
    case "human":
    default:
      return renderHuman(results, opts.verbose);
  }
}

async function main(): Promise<void> {
  const opts = parseArgs();

  if (opts.watch) {
    console.log(`Dashboard watch mode — interval: ${opts.intervalMs}ms\n`);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      console.clear();
      const output = await renderDashboard(opts);
      console.log(output);
      console.log(`\n[Next refresh in ${opts.intervalMs}ms — Ctrl+C to exit]`);
      await new Promise((resolve) => setTimeout(resolve, opts.intervalMs));
    }
  } else {
    const output = await renderDashboard(opts);
    console.log(output);
  }
}

main().catch((err) => {
  console.error("Dashboard error:", err);
  process.exit(1);
});
