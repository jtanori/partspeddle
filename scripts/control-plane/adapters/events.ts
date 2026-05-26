/**
 * control-plane/adapters/events.ts
 * Event emission adapter — T31.3b deliverable
 *
 * Emits governance events for control plane lifecycle transitions.
 */

import { spawn } from "child_process";

export function emitEvent(
  eventType: string,
  actionId: string,
  payload: Record<string, unknown>
): void {
  try {
    const payloadJson = JSON.stringify({ ...payload, action_id: actionId });
    const child = spawn("npx", ["tsx", "scripts/emit-governance-event.ts", eventType, "info", "governance", payloadJson, "--execution-id", actionId], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch {
    // Event emission failure is non-blocking for control plane
    console.error(`[control-plane] Failed to emit event: ${eventType} for ${actionId}`);
  }
}
