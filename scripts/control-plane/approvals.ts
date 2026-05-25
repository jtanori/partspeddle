/**
 * control-plane/approvals.ts
 * Approval layer — T31.3b deliverable
 *
 * Checks approval requirements based on action class and policy.
 */

import { loadRecipes } from "../lib/recipe-registry.js";
import type { IntentRecord } from "./intents.js";

export interface ApprovalResult {
  required: boolean;
  approved: boolean;
  mode: string;
  approved_by?: string;
  rejection_reason?: string;
}

export function checkApproval(intent: IntentRecord): ApprovalResult {
  const recipes = loadRecipes();
  const recipe = recipes.find((r) => r.recipe.id === intent.recipe_id)?.recipe;

  if (!recipe) {
    return { required: false, approved: false, mode: "auto", rejection_reason: "Unknown recipe" };
  }

  const actionClass = recipe.actionClass ?? recipe.category;
  const autoApproved = ["observational", "administrative", "enforcement"];

  if (autoApproved.includes(actionClass)) {
    return { required: false, approved: true, mode: "auto" };
  }

  // Human approval required for recovery, destructive, orchestration
  if (intent.dry_run) {
    return { required: true, approved: true, mode: "dry-run-simulated", approved_by: "system" };
  }

  // In a real system, this would query an approval queue
  // For now, we simulate: if --approved flag is present in parameters, auto-approve
  const forceApproved = intent.parameters?.__approved === true;
  if (forceApproved) {
    return { required: true, approved: true, mode: "human", approved_by: "operator" };
  }

  return {
    required: true,
    approved: false,
    mode: "human",
    rejection_reason: "Human approval required for this action class. Use --approved to simulate.",
  };
}
