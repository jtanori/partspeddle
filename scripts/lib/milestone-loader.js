/**
 * Milestone Loader — Registry-based Aggregation Layer
 *
 * Implements ADR-003: Modular Storage, Centralized Authority.
 */

import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(__filename, "../../..");

const REGISTRY_PATH = join(PROJECT_ROOT, "project-management/data/milestones.registry.json");
const MILESTONE_SCHEMA_PATH = join(PROJECT_ROOT, "project-management/schemas/milestone.schema.json");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function compileSchema(path) {
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  return ajv.compile(readJson(path));
}

export function loadMilestonesSync() {
  const errors = [];
  const warnings = [];

  if (!existsSync(REGISTRY_PATH)) {
    errors.push(`Milestone registry not found: ${REGISTRY_PATH}`);
    return { milestones: [], errors, warnings, registry: null };
  }

  let registry;
  try {
    registry = readJson(REGISTRY_PATH);
  } catch (e) {
    errors.push(`Registry parse error: ${e.message}`);
    return { milestones: [], errors, warnings, registry: null };
  }

  if (!registry.files || registry.files.length === 0) {
    errors.push("Registry has no files listed");
    return { milestones: [], errors, warnings, registry: null };
  }

  const milestoneValidate = compileSchema(MILESTONE_SCHEMA_PATH);
  const allMilestones = [];
  const seenMilestoneIds = new Set();
  const seenTicketIds = new Set();

  for (const file of registry.files) {
    const filePath = resolve(PROJECT_ROOT, file);

    if (!existsSync(filePath)) {
      errors.push(`Registry references missing file: ${file}`);
      continue;
    }

    let domainMilestones;
    try {
      domainMilestones = readJson(filePath);
    } catch (e) {
      errors.push(`Failed to load ${file}: ${e.message}`);
      continue;
    }

    if (!Array.isArray(domainMilestones)) {
      errors.push(`File ${file} does not contain a milestone array`);
      continue;
    }

    for (const m of domainMilestones) {
      if (!milestoneValidate(m)) {
        errors.push(
          `${m.id || "unknown"} in ${file}: ${milestoneValidate.errors?.map((e) => e.message).join(", ") || "schema validation failed"}`
        );
        continue;
      }

      if (seenMilestoneIds.has(m.id)) {
        errors.push(`Duplicate milestone ID: ${m.id} (found in ${file})`);
        continue;
      }
      seenMilestoneIds.add(m.id);

      for (const tid of m.tickets || []) {
        if (seenTicketIds.has(tid)) {
          errors.push(`Duplicate ticket ID: ${tid} (referenced by ${m.id} in ${file})`);
        } else {
          seenTicketIds.add(tid);
        }
      }

      allMilestones.push(m);
    }
  }

  const milestoneIds = new Set(allMilestones.map((m) => m.id));
  for (const m of allMilestones) {
    for (const depId of m.dependencies || []) {
      if (!milestoneIds.has(depId)) {
        errors.push(`${m.id} references missing dependency: ${depId}`);
      }
    }
  }

  if (errors.length === 0) {
    warnings.push(`Loaded ${allMilestones.length} milestones from ${registry.files.length} domain files`);
  }

  return { milestones: allMilestones, errors, warnings, registry };
}

export async function loadMilestones() {
  return loadMilestonesSync();
}
