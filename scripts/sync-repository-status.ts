#!/usr/bin/env tsx
/**
 * sync-repository-status.ts
 * Repository governance synchronization — T32.3 deliverable
 *
 * Reads git state and synchronizes repository metadata in canonical-state.
 */

import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { resolve } from "path";
import { getRuntimeStorage } from "./runtime-storage.ts";

const CANONICAL_STATE_PATH = resolve("meta/state/canonical-state.json");

interface CanonicalState {
  repository: {
    branch: string;
    base_branch: string;
    worktree_clean: boolean;
    head_commit: string | null;
    promotion_status: string;
    last_validated_at?: string;
  };
  updated_at: string;
}

function getGitBranch(): string {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

function getGitHeadCommit(): string | null {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

function isWorktreeClean(): boolean {
  try {
    // Exclude canonical-state.json from worktree check since it's mutated
    // by the governance runtime and committed separately
    const status = execSync("git status --short -- ':!meta/state/canonical-state.json'", { encoding: "utf-8" }).trim();
    return status === "";
  } catch {
    return false;
  }
}

function getBaseBranch(): string {
  try {
    return execSync("git rev-parse --abbrev-ref @{u}", { encoding: "utf-8" }).trim();
  } catch {
    return "main";
  }
}

function loadCanonicalState(): CanonicalState {
  const raw = readFileSync(CANONICAL_STATE_PATH, "utf-8");
  return JSON.parse(raw) as CanonicalState;
}

function saveCanonicalState(state: CanonicalState): void {
  const updated = {
    ...state,
    updated_at: new Date().toISOString(),
  };
  writeFileSync(CANONICAL_STATE_PATH, JSON.stringify(updated, null, 2) + "\n", "utf-8");
}

function syncRepositoryStatus(): void {
  console.log("Repository Governance Synchronization");
  console.log("=====================================\n");

  const state = loadCanonicalState();
  const before = { ...state.repository };

  const branch = getGitBranch();
  const headCommit = getGitHeadCommit();
  const worktreeClean = isWorktreeClean();
  const baseBranch = getBaseBranch();
  const now = new Date().toISOString();

  state.repository = {
    ...state.repository,
    branch,
    base_branch: baseBranch,
    worktree_clean: worktreeClean,
    head_commit: headCommit,
    last_validated_at: now,
  };

  saveCanonicalState(state);

  console.log(`  Branch:         ${branch}`);
  console.log(`  Base Branch:    ${baseBranch}`);
  console.log(`  HEAD Commit:    ${headCommit}`);
  console.log(`  Worktree Clean: ${worktreeClean ? "✅" : "❌"}`);
  console.log(`  Validated At:   ${now}`);

  if (before.head_commit !== headCommit) {
    console.log(`\n  📝 HEAD commit updated: ${before.head_commit} → ${headCommit}`);
  }
  if (before.worktree_clean !== worktreeClean) {
    console.log(`\n  📝 Worktree clean updated: ${before.worktree_clean} → ${worktreeClean}`);
  }

  console.log("\n✅ Repository status synchronized.");
}

function validateRepositoryStatus(): void {
  console.log("\nRepository Status Validation");
  console.log("============================\n");

  const state = loadCanonicalState();
  const errors: string[] = [];

  const expectedHead = getGitHeadCommit();
  if (state.repository.head_commit !== expectedHead) {
    errors.push(`head_commit mismatch: canonical-state has ${state.repository.head_commit}, git has ${expectedHead}`);
  }

  const expectedClean = isWorktreeClean();
  if (state.repository.worktree_clean !== expectedClean) {
    errors.push(`worktree_clean mismatch: canonical-state has ${state.repository.worktree_clean}, git has ${expectedClean}`);
  }

  const expectedBranch = getGitBranch();
  if (state.repository.branch !== expectedBranch) {
    errors.push(`branch mismatch: canonical-state has ${state.repository.branch}, git has ${expectedBranch}`);
  }

  if (errors.length > 0) {
    console.log(`❌ ${errors.length} validation error(s):`);
    for (const e of errors) {
      console.log(`  - ${e}`);
    }
    process.exit(1);
  } else {
    console.log("✅ Repository status validated.");
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const mode = args[0] || "sync";

  if (mode === "sync") {
    syncRepositoryStatus();
  } else if (mode === "validate" || mode === "--validate") {
    validateRepositoryStatus();
  } else {
    console.error(`Unknown mode: ${mode}. Use 'sync' or 'validate'.`);
    process.exit(1);
  }
}

main();
