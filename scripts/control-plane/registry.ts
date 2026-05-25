/**
 * control-plane/registry.ts
 * Action registry — T31.3b deliverable
 *
 * Discovers available control plane actions from the recipe registry.
 */

import { loadRecipes } from "../lib/recipe-registry.js";

export interface ActionInfo {
  recipe_id: string;
  name: string;
  category: string;
  actionClass: string;
  requiresApproval: boolean;
  capabilities: string[];
  description: string;
}

export function listActions(): ActionInfo[] {
  return loadRecipes().map(({ recipe }) => ({
    recipe_id: recipe.id,
    name: recipe.id,
    category: recipe.category,
    actionClass: recipe.actionClass ?? recipe.category,
    requiresApproval: recipe.requiresApproval,
    capabilities: recipe.capabilities,
    description: recipe.description,
  }));
}

export function findAction(recipeId: string): ActionInfo | undefined {
  return listActions().find((a) => a.recipe_id === recipeId);
}
