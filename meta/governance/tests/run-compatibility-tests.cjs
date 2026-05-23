#!/usr/bin/env node
/**
 * Governance Compatibility Tests (Node.js assert)
 */

const { readFileSync, readdirSync } = require("fs");
const { join } = require("path");
const Ajv = require("ajv");
const addFormats = require("ajv-formats");

const GOVERNANCE_DIR = "meta/governance";
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
    failed++;
  }
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function compileSchema(path) {
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  return ajv.compile(loadJson(path));
}

console.log("Running Governance Compatibility Tests...\n");

test("all protocol definitions validate against protocol-definition.schema.json", () => {
  const validate = compileSchema(join(GOVERNANCE_DIR, "schemas/protocol-definition.schema.json"));
  const files = readdirSync(join(GOVERNANCE_DIR, "protocols")).filter((f) => f.endsWith(".json"));
  if (files.length === 0) throw new Error("No protocol definitions found");
  for (const file of files) {
    const data = loadJson(join(GOVERNANCE_DIR, "protocols", file));
    const valid = validate(data);
    if (!valid) throw new Error(`${file}: ${JSON.stringify(validate.errors)}`);
  }
});

test("governance registry validates against governance-registry.schema.json", () => {
  const validate = compileSchema(join(GOVERNANCE_DIR, "schemas/governance-registry.schema.json"));
  const data = loadJson(join(GOVERNANCE_DIR, "registries/governance-registry.json"));
  const valid = validate(data);
  if (!valid) throw new Error(JSON.stringify(validate.errors));
});

test("all schemas in registry exist on disk", () => {
  const reg = loadJson(join(GOVERNANCE_DIR, "registries/governance-registry.json"));
  for (const schema of reg.schemas) {
    readFileSync(schema.path);
  }
});

test("no duplicate canonical protocols in registry", () => {
  const reg = loadJson(join(GOVERNANCE_DIR, "registries/governance-registry.json"));
  const canonicals = reg.protocols.filter((p) => p.canonical);
  const scopes = new Set();
  for (const p of canonicals) {
    if (scopes.has(p.scope)) throw new Error(`Duplicate canonical scope: ${p.scope}`);
    scopes.add(p.scope);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
