import type { SurfaceRenderer, OutputFormat, SurfaceResult, FreshnessMeta } from "../types.js";
import { readStreamTail, listStreams } from "../adapters/events.js";

export const eventStreamsRenderer: SurfaceRenderer = {
  id: "event_streams",
  name: "Event Streams",

  async render(format: OutputFormat): Promise<SurfaceResult> {
    const streams = listStreams();
    const streamData: Record<string, unknown[]> = {};
    let latestTimestamp = new Date(0);

    for (const stream of streams) {
      const events = readStreamTail(stream, 5);
      streamData[stream] = events.map((e) => ({
        type: e.event_type,
        severity: e.severity,
        seq: e.global_sequence,
        time: e.timestamp,
      }));
      for (const e of events) {
        const t = new Date(e.timestamp);
        if (t > latestTimestamp) latestTimestamp = t;
      }
    }

    const freshness: FreshnessMeta = {
      generatedAt: new Date().toISOString(),
      sourceTimestamp: latestTimestamp.toISOString(),
      freshnessState: Date.now() - latestTimestamp.getTime() < 10000 ? "fresh" : "stale",
      sourceAuthority: "canonical",
      maxAgeSeconds: 10,
    };

    const resultData: Record<string, unknown> = { streams: streamData };

    if (format === "human") {
      const lines: string[] = [];
      for (const [name, events] of Object.entries(streamData)) {
        lines.push(`${name}:`);
        for (const e of events) {
          const ev = e as Record<string, unknown>;
          lines.push(`  [${ev.severity}] ${ev.type} (seq:${ev.seq})`);
        }
      }
      resultData._rendered = lines.join("\n");
    }

    return { id: this.id, name: this.name, data: resultData, freshness };
  },
};
