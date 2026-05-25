/**
 * control-plane/checkpoints.ts
 * Checkpoint integration — T31.3b deliverable
 *
 * Creates checkpoints after successful execution.
 */

import { createCheckpoint } from "../create-checkpoint.js";
import type { IntentRecord } from "./intents.js";

export function createExecutionCheckpoint(intent: IntentRecord): { checkpointId: string | null } {
  if (intent.dry_run) {
    return { checkpointId: null };
  }

  try {
    const manifest = createCheckpoint({
      milestoneId: intent.target,
      ticketId: intent.recipe_id,
      closureReason: `control-plane execution: ${intent.recipe_id}`,
    });
    return { checkpointId: manifest.checkpoint_id };
  } catch {
    return { checkpointId: null };
  }
}
