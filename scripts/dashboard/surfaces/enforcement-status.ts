import type { SurfaceRenderer, OutputFormat, SurfaceResult, FreshnessMeta } from "../types.js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

export const enforcementStatusRenderer: SurfaceRenderer = {
  id: "enforcement_status",
  name: "Enforcement Status",

  async render(format: OutputFormat): Promise<SurfaceResult> {
    const invPath = resolve("meta/governance/invariants/invariants.json");
    const invariants = existsSync(invPath)
      ? (JSON.parse(readFileSync(invPath, "utf-8")) as Record<string, unknown[]>).invariants ?? []
      : [];

    const freshness: FreshnessMeta = {
      generatedAt: new Date().toISOString(),
      sourceTimestamp: existsSync(invPath) ? new Date().toISOString() : new Date(0).toISOString(),
      freshnessState: "fresh",
      sourceAuthority: "canonical",
      maxAgeSeconds: 60,
    };

    const bySeverity: Record<string, number> = {};
    for (const inv of invariants) {
      const sev = (inv as Record<string, string>).severity ?? "unknown";
      bySeverity[sev] = (bySeverity[sev] ?? 0) + 1;
    }

    const resultData: Record<string, unknown> = {
      totalInvariants: invariants.length,
      bySeverity,
      categories: [...new Set(invariants.map((i) => (i as Record<string, string>).category))],
    };

    if (format === "human") {
      const lines = [`Invariants: ${invariants.length}`];
      for (const [sev, count] of Object.entries(bySeverity)) {
        lines.push(`  ${sev}: ${count}`);
      }
      resultData._rendered = lines.join("\n");
    }

    return { id: this.id, name: this.name, data: resultData, freshness };
  },
};
