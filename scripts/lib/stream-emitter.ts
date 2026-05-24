/**
 * Shared Stream Emitter
 * Ticket: T26.4
 *
 * Extracted shared NDJSON stream-append logic from:
 * - emit-governance-event.ts
 * - emit-telemetry.ts
 */

import { appendFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

export interface StreamPolicy {
  format: string;
  encoding: string;
  line_ending: string;
  retention: Record<string, unknown>;
  validation: { reject_on_invalid: boolean; max_payload_size_bytes: number };
  streams: Array<{
    name: string;
    path: string;
    severity_filter: string[];
    categories: string[];
  }>;
}

export interface StreamMatch {
  name: string;
  path: string;
}

/**
 * Select matching streams for an event based on severity and category filters.
 */
export function selectStreams<T extends { severity: string; category: string }>(
  event: T,
  policy: StreamPolicy
): StreamMatch[] {
  const matched: StreamMatch[] = [];
  for (const stream of policy.streams) {
    const severityMatch = stream.severity_filter.includes("*") || stream.severity_filter.includes(event.severity);
    const categoryMatch = stream.categories.includes("*") || stream.categories.includes(event.category);
    if (severityMatch && categoryMatch) {
      matched.push({ name: stream.name, path: stream.path });
    }
  }
  if (matched.length === 0) {
    const defaultStream = policy.streams.find((s) => s.name === "default");
    if (defaultStream) {
      matched.push({ name: defaultStream.name, path: defaultStream.path });
    }
  }
  return matched;
}

/**
 * Append a JSON event to an NDJSON stream.
 */
export function appendToStream(event: Record<string, unknown>, streamPath: string, policy: StreamPolicy): void {
  const dir = dirname(streamPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const line = JSON.stringify(event) + policy.line_ending;
  appendFileSync(streamPath, line, { encoding: policy.encoding as BufferEncoding });
}

/**
 * Validate event payload size against policy limits.
 */
export function validatePayloadSize(event: Record<string, unknown>, maxBytes: number): string[] {
  const size = JSON.stringify(event).length;
  if (size > maxBytes) {
    return [`Payload size ${size} exceeds max ${maxBytes}`];
  }
  return [];
}
