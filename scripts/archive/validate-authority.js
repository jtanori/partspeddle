#!/usr/bin/env node
/**
 * Authority Declaration Validator
 *
 * Validates that all governance documents contain proper authority frontmatter.
 * Checks:
 *   - YAML frontmatter exists
 *   - Frontmatter validates against authority-declaration.schema.json
 *   - Only one canonical document per scope
 *   - Projections (level=projection) do not claim canonical=true
 *   - Deprecated documents reference their successor
 *
 * Exit codes:
 *   0 = all valid
 *   1 = validation errors found
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(__filename, "../..");

const DOCS = [
  "project-governance/runtime/*.md",
  "project-governance/protocols/*.md",
];

function readYamlFrontmatter(content) {
  if (!content.startsWith("---\n")) return null;
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) return null;
  const yamlText = content.slice(4, end);
  try {
    return yaml.load(yamlText);
  } catch {
    return null;
  }
}

function findDocs() {
  const docs = [];
  const dirs = [
    join(PROJECT_ROOT, "project-governance/runtime"),
    join(PROJECT_ROOT, "project-governance/protocols"),
  ];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    for (const f of files) {
      docs.push(join(dir, f));
    }
  }
  return docs;
}

function main() {
  const schemaPath = join(
    PROJECT_ROOT,
    "meta/governance/schemas/authority-declaration.schema.json"
  );
  if (!existsSync(schemaPath)) {
    console.error("❌ Schema not found:", schemaPath);
    process.exit(1);
  }

  const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  const docs = findDocs();
  const errors = [];
  const canonicalByScope = new Map();

  console.log(`Validating ${docs.length} governance documents...\n`);

  for (const docPath of docs) {
    const relPath = docPath.replace(PROJECT_ROOT + "/", "");
    const content = readFileSync(docPath, "utf-8");
    const frontmatter = readYamlFrontmatter(content);

    if (!frontmatter) {
      errors.push(`${relPath}: missing or malformed YAML frontmatter`);
      continue;
    }

    const valid = validate(frontmatter);
    if (!valid) {
      const msgs = validate.errors?.map((e) => `${e.instancePath} ${e.message}`).join("; ");
      errors.push(`${relPath}: ${msgs}`);
      continue;
    }

    const auth = frontmatter.authority;

    // Rule: projections cannot be canonical
    if (auth.level === "projection" && auth.canonical) {
      errors.push(`${relPath}: projections cannot claim canonical=true`);
    }

    // Rule: only one canonical per scope at layer 1 (kernel)
    // Layer 2+ may have multiple protocols per scope
    if (auth.canonical && auth.layer === 1) {
      const key = `${auth.scope}::L${auth.layer}`;
      const existing = canonicalByScope.get(key);
      if (existing) {
        errors.push(
          `${relPath}: duplicate canonical kernel for scope '${auth.scope}' (also claimed by ${existing})`
        );
      } else {
        canonicalByScope.set(key, relPath);
      }
    }

    // Rule: deprecated docs should declare superseded_by
    if (auth.status === "deprecated" && (!auth.superseded_by || auth.superseded_by.length === 0)) {
      errors.push(`${relPath}: deprecated document must declare superseded_by`);
    }
  }

  // Summary
  const passed = docs.length - errors.length;
  console.log(`  ✅ ${passed}/${docs.length} documents valid`);
  if (errors.length > 0) {
    console.log(`  ❌ ${errors.length} error(s):\n`);
    for (const e of errors) {
      console.error(`    - ${e}`);
    }
    console.error("\n❌ Authority validation failed");
    process.exit(1);
  }

  console.log("\n✅ All authority declarations valid");
  console.log(`  Canonical authorities by scope:`);
  for (const [scope, doc] of canonicalByScope) {
    console.log(`    ${scope} → ${doc}`);
  }
  process.exit(0);
}

main();
