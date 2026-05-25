import type { SurfaceRenderer, OutputFormat, SurfaceResult, FreshnessMeta } from "../types.js";
import { readStreamTail } from "../adapters/events.js";

export const invariantViolationsRenderer: SurfaceRenderer = {
  id: "invariant_violations",
  name: "Invariant Violations",

  async render(format: OutputFormat): Promise<SurfaceResult> {
    const events = readStreamTail("validation", 20);
    const validationEvents = events.filter((e) => e.event_type === "invariant.validation_complete");
    const latest = validationEvents[validationEvents.length - 1];
    const payload = latest?.payload as Record<string, unknown>;

    const latestTime = latest ? new Date(latest.timestamp) : new Date(0);

    const freshness: FreshnessMeta = {
      generatedAt: new Date().toISOString(),
      sourceTimestamp: latestTime.toISOString(),
      freshnessState: Date.now() - latestTime.getTime() < 300000 ? "fresh" : "stale",
      sourceAuthority: "derived",
      maxAgeSeconds: 300,
    };

    const resultData: Record<string, unknown> = {
      lastRunStatus: payload?.overall_status,
      passed: payload?.passed,
      failed: payload?.failed,
      critical: payload?.critical_findings,
      high: payload?.high_findings,
      medium: payload?.medium_findings,
      low: payload?.low_findings,
    };

    if (format === "human") {
      const status = payload?.overall_status === "PASS" ? "✅ PASS" : "❌ FAIL";
      const lines = [
        `Status:   ${status}`,
        `Passed:   ${payload?.passed ?? "—"}`,
        `Failed:   ${payload?.failed ?? "—"}`,
        `Critical: ${payload?.critical_findings ?? 0}`,
        `High:     ${payload?.high_findings ?? 0}`,
        `Medium:   ${payload?.medium_findings ?? 0}`,
        `Low:      ${payload?.low_findings ?? 0}`,
      ];
      resultData._rendered = lines.join("\n");
    }

    return { id: this.id, name: this.name, data: resultData, freshness };
  },
};
