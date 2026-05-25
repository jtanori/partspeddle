import type { SurfaceRenderer, OutputFormat, SurfaceResult, FreshnessMeta } from "../types.js";
import { getReplayStatus } from "../adapters/replay.js";

export const replayIntegrityRenderer: SurfaceRenderer = {
  id: "replay_integrity",
  name: "Replay Integrity",

  async render(format: OutputFormat): Promise<SurfaceResult> {
    const status = getReplayStatus();

    const freshness: FreshnessMeta = {
      generatedAt: new Date().toISOString(),
      sourceTimestamp: status.lastRun,
      freshnessState: status.passed ? "fresh" : "degraded",
      sourceAuthority: "derived",
      maxAgeSeconds: 300,
    };

    const resultData: Record<string, unknown> = {
      passed: status.passed,
      eventsInspected: status.eventsInspected,
      streamsInspected: status.streamsInspected,
      checkpointsInspected: status.checkpointsInspected,
      findings: status.findings,
      criticalFindings: status.criticalFindings,
      lastRun: status.lastRun,
    };

    if (format === "human") {
      const icon = status.passed ? "✅" : "❌";
      const lines = [
        `${icon} Replay Integrity`,
        `Events:      ${status.eventsInspected}`,
        `Streams:     ${status.streamsInspected}`,
        `Checkpoints: ${status.checkpointsInspected}`,
        `Findings:    ${status.findings} (${status.criticalFindings} critical/high)`,
      ];
      resultData._rendered = lines.join("\n");
    }

    return { id: this.id, name: this.name, data: resultData, freshness };
  },
};
