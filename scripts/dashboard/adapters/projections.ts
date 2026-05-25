/**
 * dashboard/adapters/projections.ts
 * Projection file adapter — reads runtime state projections
 */

import { readFileSync, existsSync, statSync } from "fs";
import { resolve } from "path";

const PROJECTION_DIR = resolve("project-governance/runtime/state");

export function readProjection(filename: string): { data: unknown; mtime: Date } | null {
  const path = resolve(PROJECTION_DIR, filename);
  if (!existsSync(path)) return null;
  const data = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  const mtime = statSync(path).mtime;
  return { data, mtime };
}

export function readRuntimeState(): { data: unknown; mtime: Date } | null {
  const path = resolve("project-governance/runtime/runtime-state.json");
  if (!existsSync(path)) return null;
  const data = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  const mtime = statSync(path).mtime;
  return { data, mtime };
}

export function readCanonicalState(): { data: unknown; mtime: Date } | null {
  const path = resolve("meta/state/canonical-state.json");
  if (!existsSync(path)) return null;
  const data = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  const mtime = statSync(path).mtime;
  return { data, mtime };
}
