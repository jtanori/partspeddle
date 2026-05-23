// Auto-generated validator for checkpoint protocol
// Generated from meta/governance/protocols/checkpoint.json
// DO NOT EDIT MANUALLY. Run: npm run governance:generate

export const protocolId = "checkpoint";
export const protocolVersion = "1.0.0";

const invariants = [
  { id: "checkpoint_supersedes_memory", expression: "checkpoint_exists → resume_from_checkpoint", severity: "CRITICAL" },
  { id: "interrupted_always_checkpoints", expression: "state = INTERRUPTED → checkpoint_emitted_immediately", severity: "CRITICAL" },
];

/**
 * Evaluate all invariants against a context object.
 * @returns Array of violated invariant IDs.
 */
export function evaluateInvariants(context: Record<string, unknown>): string[] {
  const violations: string[] = [];
  // TODO: Implement expression evaluator for invariant expressions
  // Expressions like "validation_passed → state ≠ IDLE" require a predicate engine.
  // For now, return empty array — expressions are documentation-only.
  return violations;
}

const rules = [
  { id: "throttle_min_interval", condition: "time_since_last_checkpoint < 5 minutes", action: "skip non-mandatory checkpoint", severity: "MEDIUM" },
  { id: "throttle_max_files", condition: "files_modified_since_last_checkpoint > 10", action: "MUST pause and write checkpoint", severity: "HIGH" },
  { id: "throttle_max_time", condition: "execution_time_since_last_checkpoint > 30 minutes", action: "MUST pause and write checkpoint", severity: "HIGH" },
];

/**
 * Get all rules for a given condition prefix.
 */
export function getRules(conditionPrefix: string) {
  return rules.filter(r => r.condition.startsWith(conditionPrefix));
}

/**
 * Full protocol validation entrypoint.
 */
export function validate(protocol: unknown): { valid: boolean; errors: string[] } {
  // TODO: AJV validation against protocol-definition schema
  return { valid: true, errors: [] };
}
