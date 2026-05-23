// Auto-generated validator for execution-lifecycle protocol
// Generated from meta/governance/protocols/execution-lifecycle.json
// DO NOT EDIT MANUALLY. Run: npm run governance:generate

export const protocolId = "execution-lifecycle";
export const protocolVersion = "1.0.0";

const allowedTransitions = new Set([
  "PLANNED→READY",
  "READY→EXECUTING",
  "EXECUTING→CHECKPOINT_PENDING",
  "CHECKPOINT_PENDING→EXECUTING",
  "EXECUTING→BLOCKED",
  "BLOCKED→EXECUTING",
  "EXECUTING→FAILED",
  "EXECUTING→INTERRUPTED",
  "EXECUTING→COMPLETE",
  "FAILED→ROLLED_BACK",
  "INTERRUPTED→EXECUTING",
  "INTERRUPTED→READY",
  "ROLLED_BACK→PLANNED",
]);

const forbiddenTransitions = [
  { from: "PLANNED", to: "EXECUTING", reason: "Must pass through READY." },
  { from: "COMPLETE", to: "*", reason: "Terminal state. No exit." },
  { from: "FAILED", to: "COMPLETE", reason: "Must roll back first." },
  { from: "BLOCKED", to: "COMPLETE", reason: "Must resume executing first." },
];

/**
 * Validate a state transition.
 * @returns { valid: boolean, violation: string | null }
 */
export function validateTransition(from: string, to: string): { valid: boolean; violation: string | null } {
  const key = `${from}→${to}`;
  if (!allowedTransitions.has(key)) {
    const forbidden = forbiddenTransitions.find(ft => ft.from === from && (ft.to === to || ft.to === "*"));
    if (forbidden) {
      return { valid: false, violation: `Forbidden transition: ${from} → ${to}. ${forbidden.reason}` };
    }
    return { valid: false, violation: `Unknown transition: ${from} → ${to}` };
  }
  return { valid: true, violation: null };
}

/**
 * Check if a state is terminal.
 */
export function isTerminal(state: string): boolean {
  return ["FAILED", "COMPLETE", "ROLLED_BACK"].includes(state);
}

const invariants = [
  { id: "no_idle_after_validation", expression: "validation_passed → state ≠ IDLE", severity: "CRITICAL" },
  { id: "terminal_state_immutable", expression: "state ∈ {COMPLETE, FAILED, ROLLED_BACK} → historical_state_immutable", severity: "HIGH" },
  { id: "header_required", expression: "state = EXECUTING → execution_header_present", severity: "CRITICAL" },
  { id: "footer_required", expression: "state ∈ terminal → execution_footer_present", severity: "CRITICAL" },
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
  { id: "continuation_resolution_required", condition: "state = PLANNED", action: "run scripts/resolve-continuation.ts before execution", severity: "CRITICAL" },
  { id: "no_conversational_memory_start", condition: "state = PLANNED", action: "reject execution from conversational memory or improvised selection", severity: "HIGH" },
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
