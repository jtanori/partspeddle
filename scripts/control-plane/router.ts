/**
 * control-plane/router.ts
 * Request router — T31.3b deliverable
 *
 * Routes control plane requests to the lifecycle coordinator.
 */

import { executeLifecycle, type LifecycleRequest, type LifecycleResult } from "./lifecycle.js";

export interface RouteRequest {
  command: string;
  recipe_id: string;
  target?: string;
  parameters?: Record<string, unknown>;
  reason?: string;
  actor?: string;
  dry_run?: boolean;
}

export async function routeRequest(req: RouteRequest): Promise<LifecycleResult> {
  switch (req.command) {
    case "execute":
    case "request":
      return executeLifecycle({
        recipe_id: req.recipe_id,
        target: req.target ?? req.recipe_id,
        parameters: req.parameters,
        reason: req.reason,
        actor: req.actor,
        dry_run: req.dry_run,
      });

    default:
      return {
        action_id: "",
        final_state: "rejected",
        success: false,
        events_emitted: [],
        error: `Unknown command: ${req.command}`,
      };
  }
}
