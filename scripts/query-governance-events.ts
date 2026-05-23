#!/usr/bin/env tsx
/**
 * query-governance-events.ts
 * Query and replay governance event streams.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

interface QueryFilters {
  stream?: string;
  event_type?: string;
  severity?: string;
  category?: string;
  execution_id?: string;
  milestone?: string;
  ticket?: string;
  actor?: string;
  since?: string;
  until?: string;
  correlation_id?: string;
  limit?: number;
}

interface GovernanceEvent {
  event_id: string;
  timestamp: string;
  event_type: string;
  severity: string;
  category: string;
  execution_id?: string | null;
  milestone?: string | null;
  ticket?: string | null;
  actor?: string;
  session_id?: string | null;
  correlation_id?: string | null;
  causation_id?: string | null;
  payload?: Record<string, unknown>;
}

const STREAM_BASE = resolve("project-governance/runtime/events/streams");

function getStreamPath(streamName: string): string {
  return resolve(`${STREAM_BASE}/${streamName}.ndjson`);
}

function readStream(streamPath: string): GovernanceEvent[] {
  if (!existsSync(streamPath)) return [];
  const text = readFileSync(streamPath, "utf-8");
  const lines = text.split("\n").filter(l => l.trim() !== "");
  return lines.map(line => {
    try {
      return JSON.parse(line) as GovernanceEvent;
    } catch {
      return null;
    }
  }).filter(Boolean) as GovernanceEvent[];
}

function filterEvents(events: GovernanceEvent[], filters: QueryFilters): GovernanceEvent[] {
  return events.filter(e => {
    if (filters.event_type && e.event_type !== filters.event_type) return false;
    if (filters.severity && e.severity !== filters.severity) return false;
    if (filters.category && e.category !== filters.category) return false;
    if (filters.execution_id && e.execution_id !== filters.execution_id) return false;
    if (filters.milestone && e.milestone !== filters.milestone) return false;
    if (filters.ticket && e.ticket !== filters.ticket) return false;
    if (filters.actor && e.actor !== filters.actor) return false;
    if (filters.correlation_id && e.correlation_id !== filters.correlation_id) return false;
    if (filters.since && e.timestamp < filters.since) return false;
    if (filters.until && e.timestamp > filters.until) return false;
    return true;
  });
}

export function query(filters: QueryFilters): GovernanceEvent[] {
  const streamName = filters.stream ?? "default";
  const streamPath = getStreamPath(streamName);
  let events = readStream(streamPath);
  events = filterEvents(events, filters);
  if (filters.limit) events = events.slice(-filters.limit);
  return events;
}

export function replay(
  streamName: string,
  handler: (event: GovernanceEvent) => void,
  filters?: QueryFilters
): number {
  let events = readStream(getStreamPath(streamName));
  if (filters) events = filterEvents(events, filters);
  events.forEach(handler);
  return events.length;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: tsx scripts/query-governance-events.ts <stream> [--since ISO] [--until ISO] [--type type] [--severity sev] [--category cat] [--limit N]");
    process.exit(1);
  }
  const filters: QueryFilters = { stream: args[0] };
  for (let i = 1; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    switch (flag) {
      case "--since": filters.since = value; break;
      case "--until": filters.until = value; break;
      case "--type": filters.event_type = value; break;
      case "--severity": filters.severity = value; break;
      case "--category": filters.category = value; break;
      case "--limit": filters.limit = parseInt(value, 10); break;
      case "--execution": filters.execution_id = value; break;
      case "--ticket": filters.ticket = value; break;
      case "--actor": filters.actor = value; break;
    }
  }
  const results = query(filters);
  console.log(JSON.stringify(results, null, 2));
}
