import type { SurfaceRenderer, OutputFormat, SurfaceResult, FreshnessMeta } from "../types.js";
import { readProjection } from "../adapters/projections.js";

export const executionStatusRenderer: SurfaceRenderer = {
  id: "execution_status",
  name: "Execution Status",

  async render(format: OutputFormat): Promise<SurfaceResult> {
    const projection = readProjection("active-execution.json");
    const data = (projection?.data as Record<string, unknown>) ?? {};
    const mtime = projection?.mtime ?? new Date();

    const exec = (data.execution as Record<string, unknown>) ?? {};
    const milestone = (data.milestone as Record<string, unknown>) ?? {};
    const ticket = (data.ticket as Record<string, unknown>) ?? {};
    const confidence = (data.runtime_confidence as Record<string, unknown>) ?? {};

    const freshness: FreshnessMeta = {
      generatedAt: new Date().toISOString(),
      sourceTimestamp: mtime.toISOString(),
      freshnessState: Date.now() - mtime.getTime() < 5000 ? "fresh" : "stale",
      sourceAuthority: "projected",
      maxAgeSeconds: 5,
    };

    const resultData: Record<string, unknown> = {
      executionId: exec.execution_id,
      status: exec.status,
      milestone: milestone.id,
      milestoneStatus: milestone.status,
      ticket: ticket.id,
      ticketStatus: ticket.status,
      confidenceScore: confidence.score,
      branch: (data.repository_context as Record<string, unknown>)?.branch,
      worktreeClean: (data.repository_context as Record<string, unknown>)?.worktree_clean,
    };

    if (format === "human") {
      resultData._rendered = [
        `Execution: ${exec.execution_id ?? "—"}`,
        `Status:    ${exec.status ?? "—"}`,
        `Milestone: ${milestone.id ?? "—"} (${milestone.status ?? "—"})`,
        `Ticket:    ${ticket.id ?? "—"} (${ticket.status ?? "—"})`,
        `Confidence: ${confidence.score ?? "—"}`,
        `Branch:    ${(data.repository_context as Record<string, unknown>)?.branch ?? "—"}`,
        `Worktree:  ${(data.repository_context as Record<string, unknown>)?.worktree_clean ? "clean" : "dirty"}`,
      ].join("\n");
    }

    return { id: this.id, name: this.name, data: resultData, freshness };
  },
};
