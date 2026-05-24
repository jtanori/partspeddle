#!/usr/bin/env node
/**
 * Reflection Integrity Validator
 * Ticket: T26.2
 *
 * Validates that markdown reflections in project-governance/protocols/
 * are synchronized with canonical JSON protocols in meta/governance/protocols/.
 *
 * Exit codes:
 *   0 = all reflections valid, no orphans
 *   1 = validation errors found
 *   2 = unrecoverable error
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import { resolve, join, basename } from "path";
import { createHash } from "crypto";

const ROOT = resolve(".");
const JSON_PROTOCOLS_DIR = join(ROOT, "meta/governance/protocols");
const REFLECTIONS_DIR = join(ROOT, "project-governance/protocols");
const ARCHIVE_DIR = join(REFLECTIONS_DIR, "archive");

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    total_json_protocols: number;
    total_reflections: number;
    orphaned_reflections: number;
    missing_reflections: number;
    canonical_without_reflection: number;
  };
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function discoverJsonProtocols(): Array<{ id: string; path: string; canonical: boolean }> {
  const files = readdirSync(JSON_PROTOCOLS_DIR).filter((f) => f.endsWith(".json"));
  return files.map((file) => {
    const data = JSON.parse(readFileSync(join(JSON_PROTOCOLS_DIR, file), "utf-8"));
    return {
      id: data.id || basename(file, ".json"),
      path: join(JSON_PROTOCOLS_DIR, file),
      canonical: !!data.canonical,
    };
  });
}

function discoverReflections(): Array<{ id: string; path: string }> {
  const files = readdirSync(REFLECTIONS_DIR).filter(
    (f) => f.endsWith(".protocol.md") && !f.startsWith("archive")
  );
  return files.map((file) => ({
    id: basename(file, ".protocol.md"),
    path: join(REFLECTIONS_DIR, file),
  }));
}

function validateReflections(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const jsonProtocols = discoverJsonProtocols();
  const reflections = discoverReflections();

  const jsonIds = new Map(jsonProtocols.map((p) => [p.id, p]));
  const reflectionIds = new Map(reflections.map((r) => [r.id, r]));

  // Check for orphaned reflections (markdown without JSON source)
  for (const reflection of reflections) {
    if (!jsonIds.has(reflection.id)) {
      errors.push(
        `ORPHANED: Reflection '${reflection.id}' has no canonical JSON source`
      );
    }
  }

  // Check for canonical protocols missing reflections
  let canonicalWithoutReflection = 0;
  for (const protocol of jsonProtocols) {
    if (protocol.canonical && !reflectionIds.has(protocol.id)) {
      warnings.push(
        `MISSING_REFLECTION: Canonical protocol '${protocol.id}' has no generated reflection`
      );
      canonicalWithoutReflection++;
    }
  }

  // Check that non-canonical protocols don't have reflections (they shouldn't)
  for (const protocol of jsonProtocols) {
    if (!protocol.canonical && reflectionIds.has(protocol.id)) {
      warnings.push(
        `UNEXPECTED_REFLECTION: Non-canonical protocol '${protocol.id}' has a reflection`
      );
    }
  }

  // Check archive directory exists (evidence of archival)
  if (!existsSync(ARCHIVE_DIR)) {
    warnings.push("ARCHIVE_MISSING: No archive directory found for old protocols");
  }

  // Check for duplicate naming convention violations
  const archiveFiles = existsSync(ARCHIVE_DIR)
    ? readdirSync(ARCHIVE_DIR).filter((f) => f.endsWith(".md"))
    : [];
  const duplicatePairs = archiveFiles.filter((f) => {
    const base = basename(f, ".md");
    const reflectionName = base.toLowerCase().replace(/_/g, "-") + ".protocol.md";
    return reflections.some((r) => basename(r.path) === reflectionName);
  });
  if (duplicatePairs.length > 0) {
    warnings.push(
      `DUPLICATES_ARCHIVED: ${duplicatePairs.length} old naming conventions archived`
    );
  }

  const orphaned = reflections.filter((r) => !jsonIds.has(r.id)).length;
  const missing = jsonProtocols.filter(
    (p) => p.canonical && !reflectionIds.has(p.id)
  ).length;

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      total_json_protocols: jsonProtocols.length,
      total_reflections: reflections.length,
      orphaned_reflections: orphaned,
      missing_reflections: missing,
      canonical_without_reflection: canonicalWithoutReflection,
    },
  };
}

function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  REFLECTION INTEGRITY VALIDATOR  (T26.2)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  try {
    const result = validateReflections();

    console.log("   Stats:");
    console.log(`   • JSON protocols:        ${result.stats.total_json_protocols}`);
    console.log(`   • Reflections:           ${result.stats.total_reflections}`);
    console.log(`   • Orphaned:              ${result.stats.orphaned_reflections}`);
    console.log(`   • Missing reflections:   ${result.stats.missing_reflections}`);
    console.log(`   • Canonical w/o refl:    ${result.stats.canonical_without_reflection}`);
    console.log("");

    if (result.warnings.length > 0) {
      console.log("   Warnings:");
      for (const w of result.warnings) {
        console.log(`   ⚠️  ${w}`);
      }
      console.log("");
    }

    if (!result.valid) {
      console.log("❌ VALIDATION FAILED");
      console.log("   Errors:");
      for (const e of result.errors) {
        console.log(`   ❌ ${e}`);
      }
      console.log("");
      process.exit(1);
    }

    console.log("✅ ALL REFLECTIONS VALID\n");
    process.exit(0);
  } catch (err) {
    console.error("❌ UNRECOVERABLE ERROR:");
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
}

main();
