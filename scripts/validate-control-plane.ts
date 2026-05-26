#!/usr/bin/env tsx
/**
 * validate-control-plane.ts
 * Control Plane Operational Validator
 *
 * Validates control action schemas, intent lifecycle consistency,
 * state machine integrity, and policy alignment.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, join } from "path";

const SCHEMA_PATH = resolve("meta/governance/schemas/control-action.schema.json");
const POLICY_PATH = resolve("meta/governance/protocols/control-plane-policy.json");
const INTENTS_DIR = resolve("project-governance/runtime/control-actions");
const LIFECYCLE_FOLDERS = ["pending", "approved", "executing", "completed", "failed", "rolled-back"];

interface StateMachine {
  states: Array<{ id: string; terminal?: boolean }>;
  transitions: Array<{ from: string; to: string }>;
  forbidden_transitions?: Array<{ from: string; to: string }>;
}

interface Policy {
  state_machine?: StateMachine;
  emissions?: Record<string, string>;
  metadata?: {
    action_classes?: Record<string, unknown>;
  };
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

export function validateControlPlane(): { passed: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Schema validity
  if (!existsSync(SCHEMA_PATH)) {
    errors.push("control-action.schema.json does not exist");
  } else {
    try {
      const schema = loadJson<Record<string, unknown>>(SCHEMA_PATH);
      if (!schema.properties) {
        errors.push("control-action.schema.json missing properties");
      }
      const eventTypes = (schema.properties?.event_type as Record<string, unknown>)?.enum as string[] | undefined;
      if (!eventTypes || !Array.isArray(eventTypes)) {
        errors.push("control-action.schema.json missing event_type enum");
      }
    } catch (e) {
      errors.push(`control-action.schema.json parse error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 2. Policy validity
  if (!existsSync(POLICY_PATH)) {
    errors.push("control-plane-policy.json does not exist");
  } else {
    try {
      const policy = loadJson<Policy>(POLICY_PATH);

      // State machine integrity
      if (!policy.state_machine) {
        errors.push("control-plane-policy.json missing state_machine");
      } else {
        const sm = policy.state_machine;
        const stateIds = new Set(sm.states.map((s) => s.id));

        // Check transitions reference valid states
        for (const t of sm.transitions) {
          if (!stateIds.has(t.from)) {
            errors.push(`Transition references unknown from-state: ${t.from}`);
          }
          if (!stateIds.has(t.to)) {
            errors.push(`Transition references unknown to-state: ${t.to}`);
          }
        }

        // Check terminal states have no outgoing transitions
        const terminalStates = new Set(sm.states.filter((s) => s.terminal).map((s) => s.id));
        for (const t of sm.transitions) {
          if (terminalStates.has(t.from)) {
            errors.push(`Terminal state ${t.from} has outgoing transition to ${t.to}`);
          }
        }

        // Check no duplicate transitions
        const transitionKeys = new Set<string>();
        for (const t of sm.transitions) {
          const key = `${t.from}→${t.to}`;
          if (transitionKeys.has(key)) {
            warnings.push(`Duplicate transition: ${key}`);
          }
          transitionKeys.add(key);
        }

        // Check forbidden transitions reference valid states
        if (sm.forbidden_transitions) {
          for (const ft of sm.forbidden_transitions) {
            if (ft.from !== "*" && !stateIds.has(ft.from)) {
              warnings.push(`Forbidden transition references unknown from-state: ${ft.from}`);
            }
            if (ft.to !== "*" && !stateIds.has(ft.to)) {
              warnings.push(`Forbidden transition references unknown to-state: ${ft.to}`);
            }
          }
        }
      }

      // Emissions alignment with schema event types
      const schema = loadJson<Record<string, unknown>>(SCHEMA_PATH);
      const eventTypes = new Set(
        ((schema.properties?.event_type as Record<string, unknown>)?.enum as string[]) || []
      );
      if (policy.emissions) {
        for (const [key, val] of Object.entries(policy.emissions)) {
          if (!eventTypes.has(val)) {
            errors.push(`Emission '${key}' maps to unknown event type: ${val}`);
          }
        }
      }

      // Action classes alignment
      const actionClasses = new Set([
        "observational",
        "administrative",
        "enforcement",
        "recovery",
        "destructive",
        "orchestration",
      ]);
      if (policy.metadata?.action_classes) {
        for (const cls of Object.keys(policy.metadata.action_classes)) {
          if (!actionClasses.has(cls)) {
            errors.push(`Unknown action class in policy metadata: ${cls}`);
          }
        }
      }
    } catch (e) {
      errors.push(`control-plane-policy.json parse error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 3. Intent lifecycle folder integrity
  if (!existsSync(INTENTS_DIR)) {
    errors.push("control-actions directory does not exist");
  } else {
    for (const folder of LIFECYCLE_FOLDERS) {
      const folderPath = join(INTENTS_DIR, folder);
      if (!existsSync(folderPath)) {
        warnings.push(`Missing lifecycle folder: ${folder}`);
        continue;
      }
      const files = readdirSync(folderPath).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        const filePath = join(folderPath, file);
        try {
          const intent = loadJson<Record<string, unknown>>(filePath);
          if (!intent.action_id) {
            errors.push(`${folder}/${file} missing action_id`);
          }
          if (!intent.recipe_id) {
            errors.push(`${folder}/${file} missing recipe_id`);
          }
        } catch (e) {
          errors.push(`${folder}/${file} is invalid JSON`);
        }
      }
    }
  }

  return { passed: errors.length === 0, errors, warnings };
}

function main(): void {
  console.log("Control Plane Operational Validation");
  console.log("=====================================\n");

  const result = validateControlPlane();

  if (result.errors.length > 0) {
    console.log(`❌ ${result.errors.length} error(s):`);
    for (const e of result.errors) {
      console.log(`  • ${e}`);
    }
    console.log("");
  }

  if (result.warnings.length > 0) {
    console.log(`⚠️  ${result.warnings.length} warning(s):`);
    for (const w of result.warnings) {
      console.log(`  • ${w}`);
    }
    console.log("");
  }

  if (result.passed) {
    console.log("✅ Control plane operational state valid.");
    process.exit(0);
  } else {
    console.log("❌ Control plane operational state invalid.");
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) { main(); }
