/**
 * dashboard/adapters/events.ts
 * Event stream adapter — reads tail of governance event streams
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const STREAM_DIR = resolve("project-governance/runtime/events/streams");

export interface StreamEvent {
  event_id: string;
  timestamp: string;
  event_type: string;
  severity: string;
  category: string;
  global_sequence?: number;
  payload?: Record<string, unknown>;
}

export function readStreamTail(streamName: string, limit: number = 20): StreamEvent[] {
  const path = resolve(STREAM_DIR, `${streamName}.ndjson`);
  if (!existsSync(path)) return [];

  const lines = readFileSync(path, "utf-8")
    .trim()
    .split("\n")
    .filter((l) => l.trim().length > 0);

  return lines
    .slice(-limit)
    .map((line) => {
      try {
        return JSON.parse(line) as StreamEvent;
      } catch {
        return null;
      }
    })
    .filter((e): e is StreamEvent => e !== null);
}

export function listStreams(): string[] {
  // Known streams
  return ["default", "validation", "diagnostics", "execution"];
}
