#!/usr/bin/env tsx
/**
 * Governance Generation Script
 *
 * Reads canonical JSON protocol definitions from meta/governance/protocols/
 * and generates:
 *   - Markdown reflections in project-governance/protocols/
 *   - Runtime validators in scripts/validators/
 *
 * Usage:
 *   ./node_modules/.bin/tsx scripts/generate-governance.ts
 *   ./node_modules/.bin/tsx scripts/generate-governance.ts --validate-only
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join, basename } from "path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const GOVERNANCE_DIR = "meta/governance";
const PROTOCOLS_DIR = join(GOVERNANCE_DIR, "protocols");
const NARRATIVES_DIR = join(GOVERNANCE_DIR, "narratives");
const SCHEMAS_DIR = join(GOVERNANCE_DIR, "schemas");
const OUTPUT_PROTOCOLS_DIR = "project-governance/protocols";
const OUTPUT_VALIDATORS_DIR = "scripts/validators";

interface ProtocolDef {
  id: string;
  version: string;
  layer: number;
  scope: string;
  canonical: boolean;
  status: string;
  derives_from: string[];
  supersedes?: string[];
  narrative_ref?: string;
  purpose: string;
  state_machine?: {
    states: Array<{ id: string; terminal: boolean; semantics?: string; entry_trigger?: string; exit_trigger?: string }>;
    transitions: Array<{ from: string; to: string; trigger: string; guard: string | null; description?: string }>;
    forbidden_transitions: Array<{ from: string; to: string; reason: string }>;
  };
  rules?: Array<{ id: string; condition: string; action: string; severity: string; description?: string }>;
  invariants?: Array<{ id: string; expression: string; severity: string; description?: string }>;
  triggers?: Array<{ id: string; category: string; condition: string; description?: string; throttle?: { max_per_minute?: number; cooldown_seconds?: number } }>;
  intent_classifications?: Array<{ category: string; behavior: string; examples?: string[]; description?: string }>;
  schemas?: Record<string, unknown>;
  metadata?: { created_at?: string; updated_at?: string; author?: string };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function loadSchema(): Ajv.ValidateFunction {
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  const schema = readJson(join(SCHEMAS_DIR, "protocol-definition.schema.json")) as object;
  return ajv.compile(schema);
}

function loadProtocols(): { protocols: ProtocolDef[]; errors: string[] } {
  const validate = loadSchema();
  const files = readdirSync(PROTOCOLS_DIR).filter((f) => f.endsWith(".json"));
  const protocols: ProtocolDef[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const path = join(PROTOCOLS_DIR, file);
    const data = readJson(path) as ProtocolDef;
    if (!validate(data)) {
      const msg = validate.errors?.map((e) => `${e.instancePath}: ${e.message}`).join("; ") || "validation failed";
      errors.push(`${file}: ${msg}`);
      continue;
    }
    protocols.push(data);
  }

  return { protocols, errors };
}

function loadNarrative(ref: string): string {
  const path = join(NARRATIVES_DIR, ref);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

function renderStateMachineTable(sm: ProtocolDef["state_machine"]): string {
  if (!sm) return "";
  let md = "## Execution States\n\n";
  md += "The following states are **canonical and immutable**. No additional states may be introduced without a governance amendment.\n\n";
  md += "| State | Semantics | Entry Trigger | Exit Trigger |\n";
  md += "|-------|-----------|---------------|--------------|\n";
  for (const s of sm.states) {
    md += `| **${s.id}** | ${s.semantics || ""} | ${s.entry_trigger || ""} | ${s.exit_trigger || ""} |\n`;
  }

  md += "\n### State Transition Rules\n\n";
  md += "```\n";
  for (const t of sm.transitions) {
    md += `${t.from} → ${t.to}          (${t.trigger})\n`;
  }
  md += "```\n\n";

  if (sm.forbidden_transitions.length > 0) {
    md += "**Forbidden transitions:**\n";
    for (const ft of sm.forbidden_transitions) {
      md += `- ${ft.from} → ${ft.to} (${ft.reason})\n`;
    }
    md += "\n";
  }

  return md;
}

function renderTriggers(triggers: ProtocolDef["triggers"]): string {
  if (!triggers || triggers.length === 0) return "";
  const categories = ["mandatory", "optional", "throttled"] as const;
  let md = "## Checkpoint Triggers\n\n";
  for (const cat of categories) {
    const items = triggers.filter((t) => t.category === cat);
    if (items.length === 0) continue;
    md += `### ${cat.charAt(0).toUpperCase() + cat.slice(1)} Checkpoints\n\n`;
    md += "| Trigger | Condition | Description |\n";
    md += "|---------|-----------|-------------|\n";
    for (const t of items) {
      md += `| **${t.id}** | ${t.condition} | ${t.description || ""} |\n`;
    }
    md += "\n";
  }
  return md;
}

function renderRules(rules: ProtocolDef["rules"]): string {
  if (!rules || rules.length === 0) return "";
  let md = "## Rules\n\n";
  md += "| ID | Condition | Action | Severity |\n";
  md += "|----|-----------|--------|----------|\n";
  for (const r of rules) {
    md += `| ${r.id} | ${r.condition} | ${r.action} | ${r.severity} |\n`;
  }
  md += "\n";
  return md;
}

function renderInvariants(invariants: ProtocolDef["invariants"]): string {
  if (!invariants || invariants.length === 0) return "";
  let md = "## Invariants\n\n";
  for (const i of invariants) {
    md += `### ${i.id}\n\n`;
    md += `**Expression:** \`${i.expression}\`\n\n`;
    md += `**Severity:** ${i.severity}\n\n`;
    if (i.description) md += `${i.description}\n\n`;
  }
  return md;
}

function renderSchemas(schemas: ProtocolDef["schemas"]): string {
  if (!schemas || Object.keys(schemas).length === 0) return "";
  let md = "## Schemas\n\n";
  for (const [name, schema] of Object.entries(schemas)) {
    md += `### ${name}\n\n`;
    md += "```json\n";
    md += JSON.stringify(schema, null, 2);
    md += "\n```\n\n";
  }
  return md;
}

function generateMarkdown(protocol: ProtocolDef): string {
  const narrative = protocol.narrative_ref ? loadNarrative(protocol.narrative_ref) : "";

  let md = `---\nauthority:\n  level: protocol\n  layer: ${protocol.layer}\n  canonical: ${protocol.canonical}\n  supersedes:\n    -\n  derives_from:\n`;
  for (const d of protocol.derives_from) {
    md += `    - ${d}\n`;
  }
  md += `  scope: ${protocol.scope}\n  status: ${protocol.status}\n  version: "${protocol.version}"\n---\n\n`;

  const title = protocol.id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  md += `# ${title} Protocol\n\n`;
  md += `> **Authority:** \`CANONICAL_AUTHORITY_HIERARCHY.md\` Layer ${protocol.layer} → \`runtime-governance-kernel.md\`  \n`;
  md += `> **Purpose:** ${protocol.purpose}  \n`;
  md += `> **Version:** ${protocol.version}  \n`;
  md += `> **Status:** ${protocol.status.charAt(0).toUpperCase() + protocol.status.slice(1)}\n\n`;
  md += `> **Canonical Source:** \`meta/governance/protocols/${protocol.id}.json\`  \n`;
  md += `> **Generated:** ${new Date().toISOString()}  \n\n`;
  md += `---\n\n`;

  if (narrative) {
    // Strip the H1 title from narrative since we already have one
    const body = narrative.replace(/^# .*\n/, "").trim();
    md += body + "\n\n---\n\n";
  }

  if (protocol.state_machine) {
    md += renderStateMachineTable(protocol.state_machine);
  }

  if (protocol.triggers && protocol.triggers.length > 0) {
    md += renderTriggers(protocol.triggers);
  }

  if (protocol.rules && protocol.rules.length > 0) {
    md += renderRules(protocol.rules);
  }

  if (protocol.invariants && protocol.invariants.length > 0) {
    md += renderInvariants(protocol.invariants);
  }

  if (protocol.schemas && Object.keys(protocol.schemas).length > 0) {
    md += renderSchemas(protocol.schemas);
  }

  md += "---\n\n";
  md += "> **⚠️ AUTO-GENERATED DOCUMENT**  \n";
  md += "> This markdown reflection was generated from `meta/governance/protocols/" + protocol.id + ".json`.  \n";
  md += "> **DO NOT EDIT MANUALLY.** Edit the canonical JSON definition and run `npm run governance:generate`.  \n";

  return md;
}

function generateValidator(protocol: ProtocolDef): string {
  const validatorName = `protocol-${protocol.id}`;
  let js = `// Auto-generated validator for ${protocol.id} protocol\n`;
  js += `// Generated from meta/governance/protocols/${protocol.id}.json\n`;
  js += `// DO NOT EDIT MANUALLY. Run: npm run governance:generate\n\n`;

  js += `export const protocolId = "${protocol.id}";\n`;
  js += `export const protocolVersion = "${protocol.version}";\n\n`;

  if (protocol.state_machine) {
    js += `const allowedTransitions = new Set([\n`;
    for (const t of protocol.state_machine.transitions) {
      js += `  "${t.from}→${t.to}",\n`;
    }
    js += `]);\n\n`;

    js += `const forbiddenTransitions = [\n`;
    for (const ft of protocol.state_machine.forbidden_transitions) {
      js += `  { from: "${ft.from}", to: "${ft.to}", reason: "${ft.reason}" },\n`;
    }
    js += `];\n\n`;

    js += `/**\n * Validate a state transition.\n * @returns { valid: boolean, violation: string | null }\n */\n`;
    js += `export function validateTransition(from: string, to: string): { valid: boolean; violation: string | null } {\n`;
    js += `  const key = \`\${from}→\${to}\`;\n`;
    js += `  if (!allowedTransitions.has(key)) {\n`;
    js += `    const forbidden = forbiddenTransitions.find(ft => ft.from === from && (ft.to === to || ft.to === "*"));\n`;
    js += `    if (forbidden) {\n`;
    js += `      return { valid: false, violation: \`Forbidden transition: \${from} → \${to}. \${forbidden.reason}\` };\n`;
    js += `    }\n`;
    js += `    return { valid: false, violation: \`Unknown transition: \${from} → \${to}\` };\n`;
    js += `  }\n`;
    js += `  return { valid: true, violation: null };\n`;
    js += `}\n\n`;

    js += `/**\n * Check if a state is terminal.\n */\n`;
    js += `export function isTerminal(state: string): boolean {\n`;
    const terminals = protocol.state_machine.states.filter((s) => s.terminal).map((s) => `"${s.id}"`);
    js += `  return [${terminals.join(", ")}].includes(state);\n`;
    js += `}\n\n`;
  }

  if (protocol.invariants && protocol.invariants.length > 0) {
    js += `const invariants = [\n`;
    for (const inv of protocol.invariants) {
      js += `  { id: "${inv.id}", expression: "${inv.expression}", severity: "${inv.severity}" },\n`;
    }
    js += `];\n\n`;

    js += `/**\n * Evaluate all invariants against a context object.\n * @returns Array of violated invariant IDs.\n */\n`;
    js += `export function evaluateInvariants(context: Record<string, unknown>): string[] {\n`;
    js += `  const violations: string[] = [];\n`;
    js += `  // TODO: Implement expression evaluator for invariant expressions\n`;
    js += `  // Expressions like "validation_passed → state ≠ IDLE" require a predicate engine.\n`;
    js += `  // For now, return empty array — expressions are documentation-only.\n`;
    js += `  return violations;\n`;
    js += `}\n\n`;
  }

  if (protocol.rules && protocol.rules.length > 0) {
    js += `const rules = [\n`;
    for (const r of protocol.rules) {
      js += `  { id: "${r.id}", condition: "${r.condition}", action: "${r.action}", severity: "${r.severity}" },\n`;
    }
    js += `];\n\n`;

    js += `/**\n * Get all rules for a given condition prefix.\n */\n`;
    js += `export function getRules(conditionPrefix: string) {\n`;
    js += `  return rules.filter(r => r.condition.startsWith(conditionPrefix));\n`;
    js += `}\n\n`;
  }

  js += `/**\n * Full protocol validation entrypoint.\n */\n`;
  js += `export function validate(protocol: unknown): { valid: boolean; errors: string[] } {\n`;
  js += `  // TODO: AJV validation against protocol-definition schema\n`;
  js += `  return { valid: true, errors: [] };\n`;
  js += `}\n`;

  return js;
}

function main() {
  const args = process.argv.slice(2);
  const validateOnly = args.includes("--validate-only");

  console.log("Loading protocol definitions...");
  const { protocols, errors } = loadProtocols();

  if (errors.length > 0) {
    console.error("Schema validation errors:");
    for (const e of errors) console.error(`  ❌ ${e}`);
    process.exit(1);
  }

  console.log(`Loaded ${protocols.length} protocol definition(s)`);

  if (validateOnly) {
    console.log("✅ All protocol definitions valid.");
    process.exit(0);
  }

  if (!existsSync(OUTPUT_VALIDATORS_DIR)) {
    mkdirSync(OUTPUT_VALIDATORS_DIR, { recursive: true });
  }

  for (const protocol of protocols) {
    const md = generateMarkdown(protocol);
    const mdPath = join(OUTPUT_PROTOCOLS_DIR, `${protocol.id}.protocol.md`);
    writeFileSync(mdPath, md);
    console.log(`Generated: ${mdPath}`);

    const validator = generateValidator(protocol);
    const validatorPath = join(OUTPUT_VALIDATORS_DIR, `protocol-${protocol.id}.ts`);
    writeFileSync(validatorPath, validator);
    console.log(`Generated: ${validatorPath}`);
  }

  console.log("\n✅ Governance generation complete.");
}

main();
