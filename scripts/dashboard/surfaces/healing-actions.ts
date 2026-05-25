import type { SurfaceRenderer, OutputFormat, SurfaceResult, FreshnessMeta } from "../types.js";
import { loadRecipes } from "../adapters/recipes.js";

export const healingActionsRenderer: SurfaceRenderer = {
  id: "healing_actions",
  name: "Healing Actions",

  async render(format: OutputFormat): Promise<SurfaceResult> {
    const recipes = loadRecipes().filter(({ recipe }) => recipe.category === "healing");

    const freshness: FreshnessMeta = {
      generatedAt: new Date().toISOString(),
      sourceTimestamp: new Date().toISOString(),
      freshnessState: "fresh",
      sourceAuthority: "projected",
      maxAgeSeconds: 30,
    };

    const resultData: Record<string, unknown> = {
      availableRecipes: recipes.map(({ recipe }) => ({
        id: recipe.id,
        name: recipe.id,
        requiresApproval: recipe.requiresApproval,
        capabilities: recipe.capabilities,
        deterministic: recipe.determinism.deterministic,
      })),
      count: recipes.length,
    };

    if (format === "human") {
      const lines = ["Healing Recipes:"];
      for (const { recipe } of recipes) {
        const icon = recipe.requiresApproval ? "🔒" : "✅";
        lines.push(`  ${icon} ${recipe.id} — ${recipe.capabilities.join(", ")}`);
      }
      resultData._rendered = lines.join("\n");
    }

    return { id: this.id, name: this.name, data: resultData, freshness };
  },
};
