/**
 * protocol-enforcement-policy.ts
 * Validator for governance enforcement policy protocol.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const PROTOCOL_PATH = resolve("meta/governance/protocols/enforcement-policy.json");

interface Policy {
  id: string;
  version: string;
  layer: number;
  scope: string;
  canonical: boolean;
  derives_from: string[];
  purpose: string;
  status: string;
  rules: Array<{ id: string; condition: string; action: string; severity: string; description?: string }>;
  invariants: Array<{ id: string; expression: string; severity: string; description?: string }>;
}

function loadPolicy(): Policy {
  return JSON.parse(readFileSync(PROTOCOL_PATH, "utf-8")) as Policy;
}

export function validatePolicy(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const policy = loadPolicy();

  // Identity
  if (policy.id !== "enforcement-policy") {
    errors.push(`Expected id "enforcement-policy", got "${policy.id}"`);
  }

  if (!/^\d+\.\d+\.\d+$/.test(policy.version)) {
    errors.push(`Invalid version: ${policy.version}`);
  }

  if (policy.layer !== 3) {
    errors.push(`Expected layer 3, got ${policy.layer}`);
  }

  if (policy.scope !== "governance") {
    errors.push(`Expected scope "governance", got "${policy.scope}"`);
  }

  if (!policy.canonical) {
    errors.push("Policy must be canonical");
  }

  // 6 enforcement categories
  const requiredRules = [
    "schema-validation",
    "runtime-validation",
    "protocol-validation",
    "milestone-integrity",
    "dependency-integrity",
    "execution-state-integrity",
  ];

  const ruleIds = new Set(policy.rules.map(r => r.id));
  if (policy.rules.length !== 6) {
    errors.push(`Expected 6 rules, found ${policy.rules.length}`);
  }

  for (const id of requiredRules) {
    if (!ruleIds.has(id)) {
      errors.push(`Missing rule: ${id}`);
    }
  }

  // All rules have required fields
  for (const rule of policy.rules) {
    if (!rule.condition) errors.push(`Rule ${rule.id} missing condition`);
    if (!rule.action) errors.push(`Rule ${rule.id} missing action`);
    const validSeverities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
    if (!validSeverities.includes(rule.severity)) {
      errors.push(`Rule ${rule.id} has invalid severity: ${rule.severity}`);
    }
  }

  // Invariants
  const requiredInvariants = [
    "no-bypass-without-audit",
    "deterministic-enforcement",
    "violation-audit-trail",
  ];
  const invariantIds = new Set(policy.invariants.map(i => i.id));
  for (const id of requiredInvariants) {
    if (!invariantIds.has(id)) {
      errors.push(`Missing invariant: ${id}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export default validatePolicy;

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = validatePolicy();
  if (result.valid) {
    console.log("✅ Enforcement policy protocol is valid");
    process.exit(0);
  } else {
    console.error("❌ Validation failed:");
    result.errors.forEach(e => console.error(`  ${e}`));
    process.exit(1);
  }
}
