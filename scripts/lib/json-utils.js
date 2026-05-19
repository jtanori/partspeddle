/**
 * JSON File Utilities
 *
 * Centralized read/write/validate operations for all PM JSON artifacts.
 * Provides atomic writes, backups, batch directory loading, and schema validation.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const DEFAULT_INDENT = 2;
const BACKUP_SUFFIX = '.bak';

// ─── Reading ────────────────────────────────────────────────────────────────

/**
 * Read and parse a JSON file.
 *
 * @template T
 * @param {string} filePath - Absolute or relative path to JSON file
 * @returns {T} Parsed JSON object
 * @throws {Error} If file does not exist or contains invalid JSON
 */
export function readJson(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`JSON_FILE_NOT_FOUND: ${filePath}`);
    }
    throw new Error(`JSON_PARSE_ERROR: ${filePath} — ${error.message}`);
  }
}

/**
 * Read all JSON files from a directory.
 *
 * @template T
 * @param {string} dirPath - Directory path
 * @param {object} options
 * @param {RegExp} [options.pattern=/\.json$/] - File pattern to match
 * @param {boolean} [options.includeFileName=false] - Include filename in result
 * @returns {T[] | {fileName: string, data: T}[]}
 */
export function readJsonDir(dirPath, options = {}) {
  const { pattern = /\.json$/, includeFileName = false } = options;

  if (!existsSync(dirPath)) {
    throw new Error(`JSON_DIR_NOT_FOUND: ${dirPath}`);
  }

  const files = readdirSync(dirPath).filter(f => pattern.test(f));

  if (includeFileName) {
    return files.map(f => ({
      fileName: f,
      data: readJson(join(dirPath, f)),
    }));
  }

  return files.map(f => readJson(join(dirPath, f)));
}

// ─── Writing ────────────────────────────────────────────────────────────────

/**
 * Write data to a JSON file with formatting.
 *
 * @param {string} filePath - Target path
 * @param {unknown} data - Data to serialize
 * @param {object} options
 * @param {number} [options.indent=2] - JSON indentation
 * @param {boolean} [options.atomic=true] - Use atomic write (temp + rename)
 * @param {boolean} [options.backup=false] - Create .bak backup before write
 */
export function writeJson(filePath, data, options = {}) {
  const { indent = DEFAULT_INDENT, atomic = true, backup = false } = options;

  const content = JSON.stringify(data, null, indent) + '\n';

  if (backup && existsSync(filePath)) {
    backupJson(filePath);
  }

  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  if (atomic) {
    const tempPath = filePath + '.tmp';
    writeFileSync(tempPath, content, 'utf8');
    renameSync(tempPath, filePath);
  } else {
    writeFileSync(filePath, content, 'utf8');
  }
}

/**
 * Atomically update a JSON file.
 *
 * Reads the file, applies the updater function, writes back.
 * If the file does not exist, updater receives {}.
 *
 * @template T
 * @param {string} filePath - Path to JSON file
 * @param {(data: T) => T} updater - Transform function
 * @param {object} options - Passed to writeJson
 * @returns {T} Updated data
 */
export function updateJson(filePath, updater, options = {}) {
  const data = existsSync(filePath) ? readJson(filePath) : {};
  const updated = updater(data);
  writeJson(filePath, updated, options);
  return updated;
}

// ─── Backups ────────────────────────────────────────────────────────────────

/**
 * Create a timestamped backup of a JSON file.
 *
 * @param {string} filePath - Path to JSON file
 * @returns {string} Path to the backup file
 */
export function backupJson(filePath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.${timestamp}${BACKUP_SUFFIX}`;

  if (existsSync(filePath)) {
    writeFileSync(backupPath, readFileSync(filePath, 'utf8'), 'utf8');
  }

  return backupPath;
}

/**
 * List available backups for a JSON file.
 *
 * @param {string} filePath - Path to JSON file
 * @returns {string[]} Sorted array of backup file paths
 */
export function listBackups(filePath) {
  const dir = dirname(filePath);
  const base = filePath.split(/[\\/]/).pop();
  const backupPattern = new RegExp(`^${base.replace(/\./g, '\\.')}\..*\\.bak$`);

  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter(f => backupPattern.test(f))
    .map(f => join(dir, f))
    .sort();
}

/**
 * Restore a JSON file from its most recent backup.
 *
 * @param {string} filePath - Path to JSON file
 * @returns {string} Path to the restored file
 * @throws {Error} If no backup exists
 */
export function restoreJson(filePath) {
  const backups = listBackups(filePath);
  if (backups.length === 0) {
    throw new Error(`JSON_NO_BACKUP: ${filePath}`);
  }

  const latest = backups[backups.length - 1];
  writeFileSync(filePath, readFileSync(latest, 'utf8'), 'utf8');
  return filePath;
}

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Create a reusable JSON schema validator.
 *
 * @param {object} schema - JSON Schema object
 * @returns {{validate: (data: unknown) => {valid: boolean, errors?: string}}}
 */
export function createValidator(schema) {
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  return {
    validate(data) {
      const valid = validate(data);
      if (valid) return { valid: true };
      return { valid: false, errors: ajv.errorsText(validate.errors) };
    },
  };
}

/**
 * Validate data against a JSON schema loaded from file.
 *
 * @param {unknown} data - Data to validate
 * @param {string} schemaPath - Path to JSON schema file
 * @returns {{valid: boolean, errors?: string}}
 */
export function validateAgainstSchemaFile(data, schemaPath) {
  const schema = readJson(schemaPath);
  const validator = createValidator(schema);
  return validator.validate(data);
}

// ─── Inspection ─────────────────────────────────────────────────────────────

/**
 * Inspect a JSON file and return metadata without full parse.
 *
 * @param {string} filePath
 * @returns {{exists: boolean, size: number, keys: string[], type: string}}
 */
export function inspectJson(filePath) {
  if (!existsSync(filePath)) {
    return { exists: false, size: 0, keys: [], type: 'null' };
  }

  const stats = readFileSync(filePath);
  const data = JSON.parse(stats.toString('utf8'));

  return {
    exists: true,
    size: stats.length,
    keys: typeof data === 'object' && data !== null ? Object.keys(data) : [],
    type: Array.isArray(data) ? 'array' : typeof data,
  };
}

/**
 * Diff two JSON objects and return changed paths.
 *
 * @param {unknown} before
 * @param {unknown} after
 * @param {string} [prefix='']
 * @returns {{path: string, before: unknown, after: unknown}[]}
 */
export function diffJson(before, after, prefix = '') {
  const changes = [];

  if (typeof before !== 'object' || typeof after !== 'object' || before === null || after === null) {
    if (before !== after) {
      changes.push({ path: prefix || '.', before, after });
    }
    return changes;
  }

  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (!(key in before)) {
      changes.push({ path, before: undefined, after: after[key] });
    } else if (!(key in after)) {
      changes.push({ path, before: before[key], after: undefined });
    } else if (typeof before[key] === 'object' && before[key] !== null &&
               typeof after[key] === 'object' && after[key] !== null) {
      changes.push(...diffJson(before[key], after[key], path));
    } else if (before[key] !== after[key]) {
      changes.push({ path, before: before[key], after: after[key] });
    }
  }

  return changes;
}

// ─── Batch Operations ───────────────────────────────────────────────────────

/**
 * Batch update multiple JSON files in a directory.
 *
 * @template T
 * @param {string} dirPath - Directory containing JSON files
 * @param {(data: T, fileName: string) => T} updater
 * @param {object} options - Passed to writeJson
 * @returns {{fileName: string, updated: boolean, error?: string}[]}
 */
export function batchUpdateJson(dirPath, updater, options = {}) {
  const files = readdirSync(dirPath).filter(f => f.endsWith('.json'));
  const results = [];

  for (const fileName of files) {
    const filePath = join(dirPath, fileName);
    try {
      updateJson(filePath, data => updater(data, fileName), options);
      results.push({ fileName, updated: true });
    } catch (error) {
      results.push({ fileName, updated: false, error: error.message });
    }
  }

  return results;
}

// ─── Error Classes ──────────────────────────────────────────────────────────

export class JsonFileError extends Error {
  constructor(code, message, filePath) {
    super(message);
    this.code = code;
    this.filePath = filePath;
    this.name = 'JsonFileError';
  }
}
