/**
 * dashboard/adapters/locks.ts
 * Lock state adapter — reads execution lock projection
 */

import { readFileSync, existsSync, statSync } from "fs";
import { resolve } from "path";

const LOCK_PATH = resolve("project-governance/runtime/state/execution-lock.json");

export interface LockState {
  locked: boolean;
  execution_id?: string;
  locked_by?: string;
  locked_at?: string;
  expires_at?: string;
  released_at?: string;
  release_reason?: string;
}

export function readLockState(): { data: LockState; mtime: Date } | null {
  if (!existsSync(LOCK_PATH)) return null;
  const data = JSON.parse(readFileSync(LOCK_PATH, "utf-8")) as LockState;
  const mtime = statSync(LOCK_PATH).mtime;
  return { data, mtime };
}
