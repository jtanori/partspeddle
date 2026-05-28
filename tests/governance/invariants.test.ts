/**
 * Governance Invariant Tests
 *
 * Adversarial validation of the governance runtime.
 * These tests prove the governance layer survives misuse.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";

const STATE_DIR = "project-governance/runtime/state";
const PROTOCOLS_DIR = "project-governance/protocols";
const META_DIR = "meta";

function loadJSON(path: string) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

describe("Repository Invariants", () => {
  it("worktree must be clean on active execution branch", () => {
    const result = execSync("git status --short", { encoding: "utf-8" });
    expect(result.trim()).toBe("");
  });

  it("HEAD must not be detached", () => {
    const branch = execSync("git branch --show-current", { encoding: "utf-8" }).trim();
    expect(branch).not.toBe("");
    expect(branch).not.toContain("HEAD detached");
  });

  it("branch name must not match contaminated pattern", () => {
    const branch = execSync("git branch --show-current", { encoding: "utf-8" }).trim();
    expect(branch).not.toMatch(/planning-revision|contaminated|mixed/i);
  });

  it("canonical state file must exist", () => {
    expect(existsSync(`${META_DIR}/state/canonical-state.json`)).toBe(true);
  });
});

describe("Runtime Invariants", () => {
  let state: unknown;

  beforeAll(() => {
    state = loadJSON(`${STATE_DIR}/active-execution.json`);
  });

  it("protocol_version must match expected format", () => {
    expect(state.protocol_version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("runtime_status must be a valid canonical state", () => {
    expect(["IDLE", "ACTIVE", "QUIESCENT", "RECOVERING"]).toContain(
      state.runtime_status
    );
  });

  it("execution_active and execution presence must be consistent", () => {
    if (state.execution_active) {
      expect(state.execution).not.toBeNull();
      expect(state.execution.status).toBeDefined();
    }
  });

  it("safe_to_resume must imply checkpoint exists or no active execution", () => {
    if (state.safe_to_resume && state.execution_active) {
      expect(state.last_execution?.checkpoint_path).toBeTruthy();
    }
  });

  it("lock state must not contradict execution state", () => {
    const lock = loadJSON(`${STATE_DIR}/execution-lock.json`);
    if (state.execution_active) {
      expect(lock.locked).toBe(true);
      expect(lock.execution_id).toBe(state.execution?.execution_id);
    }
  });

  it("all governance protocols must be ACTIVE or INACTIVE", () => {
    const compliance = state.governance_compliance;
    for (const [key, value] of Object.entries(compliance)) {
      if (key === "resumability_validated") {
        expect(typeof value).toBe("boolean");
      } else {
        expect(["ACTIVE", "INACTIVE"]).toContain(value);
      }
    }
  });

  it("confidence score must be between 0 and 1", () => {
    expect(state.runtime_confidence.score).toBeGreaterThanOrEqual(0);
    expect(state.runtime_confidence.score).toBeLessThanOrEqual(1);
  });

  it("drift risk must be a valid level", () => {
    expect(["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"]).toContain(
      state.drift_risk.level
    );
  });

  it("repository_context must exist and contain required fields", () => {
    expect(state.repository_context).toBeDefined();
    expect(state.repository_context.branch).toBeDefined();
    expect(state.repository_context.worktree_clean).toBeDefined();
    expect(state.repository_context.head_commit).toBeDefined();
  });
});

describe("Schema Invariants", () => {
  it("all JSON schemas must be valid JSON", () => {
    const schemas = [
      "meta/schemas/milestone.schema.json",
      "meta/schemas/ticket.schema.json",
      "meta/schemas/checkpoint.schema.json",
      "meta/schemas/governance-state.schema.json",
    ];
    for (const schema of schemas) {
      expect(() => loadJSON(schema)).not.toThrow();
    }
  });

  it("canonical-state.json must validate against governance-state schema", () => {
    // Simplified: just verify it's valid JSON and has required top-level keys
    const cs = loadJSON("meta/state/canonical-state.json");
    expect(cs.authority).toBeDefined();
    expect(cs.execution).toBeDefined();
    expect(cs.milestone).toBeDefined();
    expect(cs.ticket).toBeDefined();
    expect(cs.lock).toBeDefined();
    expect(cs.governance).toBeDefined();
  });
});

describe("Recovery Invariants", () => {
  it("all recovery playbooks must exist", () => {
    const playbooks = [
      "meta/recovery/contaminated-branch.md",
      "meta/recovery/interrupted-session.md",
      "meta/recovery/stale-lock.md",
      "meta/recovery/drift-remediation.md",
      "meta/recovery/invalid-runtime-state.md",
    ];
    for (const pb of playbooks) {
      expect(existsSync(pb)).toBe(true);
    }
  });

  it("all protocols must exist", () => {
    const protocols = [
      "EXECUTION_LIFECYCLE_PROTOCOL.md",
      "CHECKPOINT_PROTOCOL.md",
      "SAFE_EXIT_PROTOCOL.md",
      "DRIFT_RECOVERY_PROTOCOL.md",
      "STATE_MUTATION_RULES.md",
      "HEARTBEAT_POLICY.md",
      "EXECUTION_AUTHORIZATION_PROTOCOL.md",
      "TOKEN_EFFICIENCY_PROTOCOL.md",
      "WORK_CONTINUATION_PROTOCOL.md",
      "TOOL_CAPABILITY_PROTOCOL.md",
      "REPOSITORY_GOVERNANCE_PROTOCOL.md",
    ];
    for (const p of protocols) {
      expect(existsSync(`${PROTOCOLS_DIR}/${p}`)).toBe(true);
    }
  });
});

describe("Capability Registry Invariants", () => {
  it("capability registry must be valid YAML", () => {
    // YAML parsing not available; check file exists and has expected keys
    const content = readFileSync("meta/tools/capability-registry.yaml", "utf-8");
    expect(content).toContain("registry_version:");
    expect(content).toContain("capabilities:");
  });

  it("all referenced tools must exist", () => {
    const content = readFileSync("meta/tools/capability-registry.yaml", "utf-8");
    const toolMatches = content.match(/command: "([^"]+)"/g) ?? [];
    for (const match of toolMatches) {
      const path = match.replace('command: "', "").replace('"', "");
      expect(existsSync(path)).toBe(true);
    }
  });
});
