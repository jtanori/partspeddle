import type { SurfaceRenderer, OutputFormat, SurfaceResult, FreshnessMeta } from "../types.js";
import { readLockState } from "../adapters/locks.js";

export const lockStatusRenderer: SurfaceRenderer = {
  id: "lock_status",
  name: "Lock Status",

  async render(format: OutputFormat): Promise<SurfaceResult> {
    const lock = readLockState();
    const data = lock?.data;
    const mtime = lock?.mtime ?? new Date();

    const freshness: FreshnessMeta = {
      generatedAt: new Date().toISOString(),
      sourceTimestamp: mtime.toISOString(),
      freshnessState: Date.now() - mtime.getTime() < 5000 ? "fresh" : "stale",
      sourceAuthority: "projected",
      maxAgeSeconds: 5,
    };

    const resultData: Record<string, unknown> = {
      locked: data?.locked ?? false,
      executionId: data?.execution_id,
      lockedBy: data?.locked_by,
      lockedAt: data?.locked_at,
      expiresAt: data?.expires_at,
      releasedAt: data?.released_at,
      releaseReason: data?.release_reason,
    };

    if (format === "human") {
      const status = data?.locked ? `🔒 LOCKED by ${data.locked_by ?? "unknown"}` : "🔓 FREE";
      const lines = [status];
      if (data?.locked_at) lines.push(`Locked at:  ${data.locked_at}`);
      if (data?.expires_at) lines.push(`Expires:    ${data.expires_at}`);
      if (data?.released_at) lines.push(`Released:   ${data.released_at}`);
      resultData._rendered = lines.join("\n");
    }

    return { id: this.id, name: this.name, data: resultData, freshness };
  },
};
