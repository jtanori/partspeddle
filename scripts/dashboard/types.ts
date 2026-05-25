/**
 * dashboard/types.ts
 * Shared types for the governance runtime dashboard — T31.2 deliverable
 */

export type OutputFormat = "human" | "json" | "compact" | "verbose";
export type FreshnessState = "fresh" | "stale" | "degraded";

export interface FreshnessMeta {
  generatedAt: string;
  sourceTimestamp: string;
  freshnessState: FreshnessState;
  sourceAuthority: string;
  maxAgeSeconds: number;
}

export interface SurfaceResult {
  id: string;
  name: string;
  data: Record<string, unknown>;
  freshness: FreshnessMeta;
}

export interface SurfaceRenderer {
  id: string;
  name: string;
  render(format: OutputFormat): Promise<SurfaceResult>;
}

export interface DashboardConfig {
  format: OutputFormat;
  watch: boolean;
  intervalMs: number;
  surfaces: string[];
  verbose: boolean;
}
