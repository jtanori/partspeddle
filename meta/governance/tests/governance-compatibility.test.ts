/**
 * Governance Compatibility Tests
 *
 * Validates that machine-readable governance definitions
 * are consistent with runtime expectations.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const GOVERNANCE_DIR = "meta/governance";

function loadJson(path: string) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function compileSchema(path: string) {
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  return ajv.compile(loadJson(path));
}

describe("Governance Compatibility", () => {
  it("all protocol definitions validate against protocol-definition.schema.json", () => {
    const validate = compileSchema(join(GOVERNANCE_DIR, "schemas/protocol-definition.schema.json"));
    const files = readdirSync(join(GOVERNANCE_DIR, "protocols")).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const data = loadJson(join(GOVERNANCE_DIR, "protocols", file));
      const valid = validate(data);
      expect(valid, `${file}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });

  it("governance registry validates against governance-registry.schema.json", () => {
    const validate = compileSchema(join(GOVERNANCE_DIR, "schemas/governance-registry.schema.json"));
    const data = loadJson(join(GOVERNANCE_DIR, "registries/governance-registry.json"));
    const valid = validate(data);
    expect(valid, JSON.stringify(validate.errors)).toBe(true);
  });

  it("all schemas in registry exist on disk", () => {
    const reg = loadJson(join(GOVERNANCE_DIR, "registries/governance-registry.json"));
    for (const schema of reg.schemas) {
      expect(
        readFileSync(join(schema.path)),
        `Schema ${schema.id} at ${schema.path} should exist`
      ).toBeDefined();
    }
  });

  it("no duplicate canonical protocols in registry", () => {
    const reg = loadJson(join(GOVERNANCE_DIR, "registries/governance-registry.json"));
    const canonicals = reg.protocols.filter((p: { canonical: boolean }) => p.canonical);
    const scopes = new Set<string>();
    for (const p of canonicals) {
      expect(scopes.has(p.scope), `Duplicate canonical scope: ${p.scope}`).toBe(false);
      scopes.add(p.scope);
    }
  });
});
