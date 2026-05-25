/**
 * dashboard/adapters/replay.ts
 * Replay integrity adapter — runs validation on demand
 */

import { execSync } from "child_process";

export interface ReplayStatus {
  passed: boolean;
  eventsInspected: number;
  streamsInspected: number;
  checkpointsInspected: number;
  findings: number;
  criticalFindings: number;
  lastRun: string;
}

export function getReplayStatus(): ReplayStatus {
  try {
    const output = execSync("npx tsx scripts/validate-replay-integrity.ts", {
      encoding: "utf-8",
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const eventsMatch = output.match(/Events inspected:\s+(\d+)/);
    const streamsMatch = output.match(/Streams inspected:\s+(\d+)/);
    const checkpointsMatch = output.match(/Checkpoints inspected:\s+(\d+)/);
    const findingsMatch = output.match(/Findings:\s+(\d+)/);
    const criticalMatch = output.match(/Critical\/High:\s+(\d+)/);
    const passed = output.includes("✅ Replay integrity verified");

    return {
      passed,
      eventsInspected: eventsMatch ? parseInt(eventsMatch[1], 10) : 0,
      streamsInspected: streamsMatch ? parseInt(streamsMatch[1], 10) : 0,
      checkpointsInspected: checkpointsMatch ? parseInt(checkpointsMatch[1], 10) : 0,
      findings: findingsMatch ? parseInt(findingsMatch[1], 10) : 0,
      criticalFindings: criticalMatch ? parseInt(criticalMatch[1], 10) : 0,
      lastRun: new Date().toISOString(),
    };
  } catch {
    return {
      passed: false,
      eventsInspected: 0,
      streamsInspected: 0,
      checkpointsInspected: 0,
      findings: 0,
      criticalFindings: 0,
      lastRun: new Date().toISOString(),
    };
  }
}
