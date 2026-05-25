/**
 * dashboard/registry.ts
 * Surface registry — discovers and routes all dashboard surfaces
 */

import type { SurfaceRenderer } from "./types.js";
import { executionStatusRenderer } from "./surfaces/execution-status.js";
import { eventStreamsRenderer } from "./surfaces/event-streams.js";
import { lockStatusRenderer } from "./surfaces/lock-status.js";
import { replayIntegrityRenderer } from "./surfaces/replay-integrity.js";
import { auditTrailRenderer } from "./surfaces/audit-trail.js";
import { healingActionsRenderer } from "./surfaces/healing-actions.js";
import { enforcementStatusRenderer } from "./surfaces/enforcement-status.js";
import { invariantViolationsRenderer } from "./surfaces/invariant-violations.js";

const SURFACES: SurfaceRenderer[] = [
  executionStatusRenderer,
  eventStreamsRenderer,
  lockStatusRenderer,
  replayIntegrityRenderer,
  auditTrailRenderer,
  healingActionsRenderer,
  enforcementStatusRenderer,
  invariantViolationsRenderer,
];

export function getAllSurfaces(): SurfaceRenderer[] {
  return SURFACES;
}

export function getSurface(id: string): SurfaceRenderer | undefined {
  return SURFACES.find((s) => s.id === id);
}

export function listSurfaceIds(): string[] {
  return SURFACES.map((s) => s.id);
}
