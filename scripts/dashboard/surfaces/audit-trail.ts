import type { SurfaceRenderer, OutputFormat, SurfaceResult, FreshnessMeta } from "../types.js";
import { readStreamTail } from "../adapters/events.js";
import { readProjection } from "../adapters/projections.js";

export const auditTrailRenderer: SurfaceRenderer = {
  id: "audit_trail",
  name: "Audit Trail",

  async render(format: OutputFormat): Promise<SurfaceResult> {
    const events = readStreamTail("validation", 10);
    const runtimeState = readProjection("runtime-state.json");
    const drift = (runtimeState?.data as Record<string, unknown>)?.drift_risk as Record<string, unknown>;

    const latestEvent = events[events.length - 1];
    const latestTime = latestEvent ? new Date(latestEvent.timestamp) : new Date();

    const freshness: FreshnessMeta = {
      generatedAt: new Date().toISOString(),
      sourceTimestamp: latestTime.toISOString(),
      freshnessState: Date.now() - latestTime.getTime() < 300000 ? "fresh" : "stale",
      sourceAuthority: "derived",
      maxAgeSeconds: 300,
    };

    const lastValidation = events.find((e) => e.event_type === "invariant.validation_complete");
    const payload = lastValidation?.payload as Record<string, unknown>;

    const resultData: Record<string, unknown> = {
      lastValidationStatus: payload?.overall_status,
      totalInvariants: payload?.total_invariants,
      passedInvariants: payload?.passed,
      failedInvariants: payload?.failed,
      driftLevel: drift?.level,
      driftReason: drift?.reason,
      recentEvents: events.slice(-3).map((e) => e.event_type),
    };

    if (format === "human") {
      const lines = [
        `Last Validation: ${payload?.overall_status ?? "unknown"}`,
        `Invariants:      ${payload?.passed ?? "—"}/${payload?.total_invariants ?? "—"} passed`,
        `Drift Risk:      ${drift?.level ?? "—"}`,
        `Recent:          ${resultData.recentEvents as string[]}`,
      ];
      resultData._rendered = lines.join("\n");
    }

    return { id: this.id, name: this.name, data: resultData, freshness };
  },
};
