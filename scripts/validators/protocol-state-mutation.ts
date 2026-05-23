// Auto-generated validator for state-mutation protocol
// Generated from meta/governance/protocols/state-mutation.json
// DO NOT EDIT MANUALLY. Run: npm run governance:generate

export const protocolId = "state-mutation";
export const protocolVersion = "1.0.0";

const invariants = [
  { id: "golden_rule", expression: "mutation_event ∈ permitted_events → lock_held ∧ execution_active", severity: "CRITICAL" },
  { id: "lock_before_mutate", expression: "mutation(active-execution.json) → lock_held_by_mutator", severity: "CRITICAL" },
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
  { id: "lock_acquisition_stale", condition: "locked === false OR expires_at < now", action: "allow_lock_acquisition", severity: "HIGH" },
  { id: "lock_acquisition_active", condition: "execution_active === false OR current_execution_is_lock_holder", action: "allow_lock_acquisition", severity: "HIGH" },
  { id: "lock_acquisition_ticket_exists", condition: "ticket_exists_in_system", action: "allow_lock_acquisition", severity: "CRITICAL" },
  { id: "lock_acquisition_dependencies", condition: "all_dependencies_in_COMPLETE_status", action: "allow_lock_acquisition", severity: "CRITICAL" },
  { id: "lock_release_terminal", condition: "status ∈ {COMPLETE, FAILED, ROLLED_BACK}", action: "release_lock_automatically", severity: "HIGH" },
  { id: "lock_release_ttl", condition: "TTL_expired AND no_heartbeat_15min", action: "release_lock_automatically", severity: "MEDIUM" },
  { id: "lock_release_override", condition: "human_operator_explicit_release", action: "release_lock_with_logging", severity: "HIGH" },
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
