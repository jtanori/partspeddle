/**
 * control-plane/lifecycle.ts
 * Lifecycle coordinator — T31.3b deliverable
 *
 * Orchestrates the full 10-stage execution lifecycle:
 * intent → validation → approval → execution → {completion | rollback} → checkpoint → sync
 */

import { persistIntent, generateActionId, transitionIntent } from "./intents.js";
import { validateIntent } from "./validation.js";
import { checkApproval } from "./approvals.js";
import { executeRecipe } from "./execution.js";
import { createExecutionCheckpoint } from "./checkpoints.js";
import { executeRollback } from "./rollback.js";
import { emitEvent } from "./adapters/events.js";

export interface LifecycleRequest {
  recipe_id: string;
  target: string;
  parameters?: Record<string, unknown>;
  reason?: string;
  actor?: string;
  dry_run?: boolean;
}

export interface LifecycleResult {
  action_id: string;
  final_state: string;
  success: boolean;
  events_emitted: string[];
  checkpoint_id?: string;
  error?: string;
}

export async function executeLifecycle(req: LifecycleRequest): Promise<LifecycleResult> {
  const actionId = generateActionId();
  const actor = req.actor ?? "operator";
  const dryRun = req.dry_run ?? false;
  const events: string[] = [];

  // Stage 1: intent.requested
  const intent = persistIntent({
    action_id: actionId,
    timestamp: new Date().toISOString(),
    actor,
    recipe_id: req.recipe_id,
    target: req.target,
    parameters: req.parameters ?? {},
    reason: req.reason,
    state: "pending",
    dry_run: dryRun,
  });

  emitEvent("intent.requested", actionId, { recipe_id: req.recipe_id, target: req.target, dry_run: dryRun });
  events.push("intent.requested");

  // Stage 2: intent.validated
  const validation = validateIntent(intent);
  transitionIntent(actionId, "pending", { validation });
  emitEvent("intent.validated", actionId, { passed: validation.passed, violations: validation.violations });
  events.push("intent.validated");

  if (!validation.passed) {
    transitionIntent(actionId, "rejected", {
      approval: { mode: "auto", rejection_reason: validation.violations.join("; ") },
    });
    emitEvent("intent.rejected", actionId, { reason: validation.violations.join("; ") });
    events.push("intent.rejected");
    return { action_id: actionId, final_state: "rejected", success: false, events_emitted: events };
  }

  // Stage 3: approval
  const approval = checkApproval(intent);
  if (approval.required && !approval.approved) {
    transitionIntent(actionId, "rejected", { approval });
    emitEvent("intent.rejected", actionId, { reason: approval.rejection_reason });
    events.push("intent.rejected");
    return { action_id: actionId, final_state: "rejected", success: false, events_emitted: events, error: approval.rejection_reason };
  }

  transitionIntent(actionId, "approved", { approval });
  emitEvent("intent.approved", actionId, { approved_by: approval.approved_by });
  events.push("intent.approved");

  // Stage 4: execution.started
  transitionIntent(actionId, "executing");
  emitEvent("execution.started", actionId, { recipe_id: req.recipe_id });
  events.push("execution.started");

  // Stage 5: execute
  const execResult = executeRecipe(intent);

  if (execResult.success) {
    // Stage 6a: execution.completed
    transitionIntent(actionId, "completed", {
      execution: {
        started_at: execResult.startedAt,
        completed_at: execResult.completedAt,
        rollback_triggered: false,
      },
    });
    emitEvent("execution.completed", actionId, { exit_code: execResult.exitCode });
    events.push("execution.completed");

    // Stage 7: checkpoint (conditional)
    const { checkpointId } = createExecutionCheckpoint(intent);
    if (checkpointId) {
      transitionIntent(actionId, "completed", { checkpoint_id: checkpointId });
      emitEvent("checkpoint.created", actionId, { checkpoint_id: checkpointId });
      events.push("checkpoint.created");
    }

    return {
      action_id: actionId,
      final_state: "completed",
      success: true,
      events_emitted: events,
      checkpoint_id: checkpointId ?? undefined,
    };
  } else {
    // Stage 6b: execution.failed
    transitionIntent(actionId, "failed", {
      execution: {
        started_at: execResult.startedAt,
        completed_at: execResult.completedAt,
        error: execResult.stderr || execResult.stdout,
        rollback_triggered: true,
      },
    });
    emitEvent("execution.failed", actionId, { error: execResult.stderr || execResult.stdout });
    events.push("execution.failed");

    // Stage 7: rollback
    const rollback = executeRollback(intent);
    transitionIntent(actionId, "rolled-back", {
      execution: {
        started_at: execResult.startedAt,
        completed_at: execResult.completedAt,
        error: execResult.stderr || execResult.stdout,
        rollback_triggered: true,
      },
    });
    emitEvent("execution.rolled_back", actionId, { rollback_success: rollback.success });
    events.push("execution.rolled_back");

    return {
      action_id: actionId,
      final_state: "rolled-back",
      success: false,
      events_emitted: events,
      error: execResult.stderr || execResult.stdout,
    };
  }
}
