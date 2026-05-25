#!/usr/bin/env tsx
/**
 * control-plane.ts
 * Governance Control Plane — T31.3b deliverable
 *
 * Operational authority surface for executing governance actions.
 * Separated from dashboard to maintain observational/authority boundary.
 */

import { listActions, findAction } from "./control-plane/registry.js";
import { routeRequest } from "./control-plane/router.js";
import { listIntentsByState } from "./control-plane/intents.js";

function printUsage(): void {
  console.log("Governance Control Plane");
  console.log("========================\n");
  console.log("Usage: npm run control-plane <command> [options]\n");
  console.log("Commands:");
  console.log("  execute <recipe_id>     Execute a recipe through the full lifecycle");
  console.log("  request <recipe_id>     Same as execute (intent-first semantics)");
  console.log("  dry-run <recipe_id>     Simulate execution without mutation");
  console.log("  list                    List available actions");
  console.log("  show <recipe_id>        Show action details");
  console.log("  status                  Show pending/executing/completed actions");
  console.log("\nOptions:");
  console.log("  --target <value>        Target for the action");
  console.log("  --reason <text>         Reason for the action");
  console.log("  --approved              Simulate human approval (for recovery/destructive/orchestration)");
  console.log("  --param <key>=<value>   Pass parameters to recipe");
  console.log("\nExamples:");
  console.log("  npm run control-plane execute enforcement_validate_all");
  console.log("  npm run control-plane dry-run healing_sync_projections");
  console.log("  npm run control-plane execute orchestration_milestone_close --target M31 --approved");
}

function parseArgs(): { command: string; recipeId: string; options: Record<string, unknown> } {
  const args = process.argv.slice(2);
  const command = args[0];
  const recipeId = args[1];

  const options: Record<string, unknown> = {};
  const params: Record<string, unknown> = {};

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--target") {
      options.target = args[++i];
    } else if (arg === "--reason") {
      options.reason = args[++i];
    } else if (arg === "--approved") {
      options.approved = true;
    } else if (arg.startsWith("--param")) {
      const paramArg = args[++i];
      const [key, value] = paramArg.split("=");
      params[key] = value;
    }
  }

  if (Object.keys(params).length > 0) {
    options.parameters = params;
  }

  return { command, recipeId, options };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  const { command, recipeId, options } = parseArgs();

  switch (command) {
    case "list": {
      const actions = listActions();
      console.log(`Available Actions: ${actions.length}\n`);
      for (const action of actions) {
        const icon = action.requiresApproval ? "🔒" : "✅";
        console.log(`  ${icon} ${action.recipe_id} [${action.actionClass}]`);
        console.log(`     ${action.description.substring(0, 70)}${action.description.length > 70 ? "..." : ""}`);
      }
      break;
    }

    case "show": {
      if (!recipeId) {
        console.log("Usage: control-plane show <recipe_id>");
        process.exit(1);
      }
      const action = findAction(recipeId);
      if (!action) {
        console.log(`Action not found: ${recipeId}`);
        process.exit(1);
      }
      console.log(`Action:       ${action.recipe_id}`);
      console.log(`Category:     ${action.category}`);
      console.log(`Class:        ${action.actionClass}`);
      console.log(`Approval:     ${action.requiresApproval ? "🔒 required" : "✅ auto"}`);
      console.log(`Capabilities: ${action.capabilities.join(", ")}`);
      console.log(`Description:  ${action.description}`);
      break;
    }

    case "status": {
      const states = ["pending", "approved", "executing", "completed", "failed", "rolled-back"];
      for (const state of states) {
        const intents = listIntentsByState(state);
        if (intents.length > 0) {
          console.log(`\n${state.toUpperCase()} (${intents.length}):`);
          for (const intent of intents.slice(0, 5)) {
            console.log(`  ${intent.action_id} — ${intent.recipe_id} — ${intent.timestamp}`);
          }
          if (intents.length > 5) {
            console.log(`  ... and ${intents.length - 5} more`);
          }
        }
      }
      break;
    }

    case "execute":
    case "request":
    case "dry-run": {
      if (!recipeId) {
        console.log("Usage: control-plane <execute|request|dry-run> <recipe_id>");
        process.exit(1);
      }

      const action = findAction(recipeId);
      if (!action) {
        console.log(`❌ Action not found: ${recipeId}`);
        process.exit(1);
      }

      const isDryRun = command === "dry-run";
      const params = (options.parameters as Record<string, unknown>) ?? {};
      if (options.approved) {
        params.__approved = true;
      }

      console.log(`${isDryRun ? "[DRY-RUN]" : "Executing"}: ${recipeId}`);
      console.log("=".repeat(50));

      const result = await routeRequest({
        command: "execute",
        recipe_id: recipeId,
        target: (options.target as string) ?? recipeId,
        reason: (options.reason as string) ?? "control-plane execution",
        actor: "operator",
        dry_run: isDryRun,
        parameters: params,
      });

      console.log(`\nAction ID:   ${result.action_id}`);
      console.log(`Final State: ${result.final_state}`);
      console.log(`Success:     ${result.success ? "✅" : "❌"}`);
      console.log(`Events:      ${result.events_emitted.join(", ")}`);
      if (result.checkpoint_id) {
        console.log(`Checkpoint:  ${result.checkpoint_id}`);
      }
      if (result.error) {
        console.log(`Error:       ${result.error}`);
      }

      process.exit(result.success ? 0 : 1);
    }

    default: {
      console.log(`Unknown command: ${command}\n`);
      printUsage();
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error("Control plane error:", err);
  process.exit(1);
});
