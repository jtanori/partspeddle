#!/usr/bin/env tsx
/**
 * migrate-to-storage-adapter.ts
 * Migration script for converting direct filesystem mutations to storage adapter usage.
 *
 * Scans runtime scripts for direct fs.* calls and reports migration status.
 * Optionally generates patched versions using the storage adapter.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, extname } from 'path';

// ─── Configuration ───

const SCAN_DIRS = ['scripts', 'project-governance/runtime'];

const IGNORE_PATTERNS = [
  /node_modules/,
  /\.d\.ts$/,
  /\.test\.ts$/,
  /\.spec\.ts$/,
  /runtime-storage\.ts$/, // The adapter itself
  /migrate-to-storage-adapter\.ts$/, // This script
];

const DIRECT_FS_PATTERNS = [
  { pattern: /writeFileSync\s*\(/, name: 'writeFileSync' },
  { pattern: /readFileSync\s*\(/, name: 'readFileSync' },
  { pattern: /appendFileSync\s*\(/, name: 'appendFileSync' },
  { pattern: /unlinkSync\s*\(/, name: 'unlinkSync' },
  { pattern: /mkdirSync\s*\(/, name: 'mkdirSync' },
  { pattern: /readdirSync\s*\(/, name: 'readdirSync' },
  { pattern: /renameSync\s*\(/, name: 'renameSync' },
];

// ─── Types ───

interface MigrationReport {
  scanned_files: number;
  files_with_direct_fs: number;
  total_direct_calls: number;
  breakdown: Array<{
    file: string;
    calls: Array<{ line: number; column: number; method: string; code: string }>;
  }>;
  migration_ready: boolean;
}

// ─── Scanner ───

function shouldIgnore(filePath: string): boolean {
  return IGNORE_PATTERNS.some((p) => p.test(filePath));
}

function findFiles(dir: string, files: string[] = []): string[] {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = resolve(dir, entry);
    if (shouldIgnore(fullPath)) continue;

    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      findFiles(fullPath, files);
    } else if (stat.isFile() && (extname(entry) === '.ts' || extname(entry) === '.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

function scanFile(
  filePath: string
): Array<{ line: number; column: number; method: string; code: string }> {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const calls: Array<{ line: number; column: number; method: string; code: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const fsPattern of DIRECT_FS_PATTERNS) {
      const match = fsPattern.pattern.exec(line);
      if (match) {
        // Skip comments
        const beforeMatch = line.substring(0, match.index).trim();
        if (beforeMatch.startsWith('//') || beforeMatch.startsWith('*')) continue;

        calls.push({
          line: i + 1,
          column: match.index + 1,
          method: fsPattern.name,
          code: line.trim(),
        });
      }
    }
  }

  return calls;
}

function runMigrationScan(): MigrationReport {
  const allFiles: string[] = [];
  for (const dir of SCAN_DIRS) {
    try {
      const files = findFiles(resolve(dir));
      allFiles.push(...files);
    } catch {
      // directory may not exist
    }
  }

  const breakdown: MigrationReport['breakdown'] = [];
  let filesWithDirectFs = 0;
  let totalDirectCalls = 0;

  for (const file of allFiles) {
    const calls = scanFile(file);
    if (calls.length > 0) {
      filesWithDirectFs++;
      totalDirectCalls += calls.length;
      breakdown.push({ file, calls });
    }
  }

  return {
    scanned_files: allFiles.length,
    files_with_direct_fs: filesWithDirectFs,
    total_direct_calls: totalDirectCalls,
    breakdown,
    migration_ready: totalDirectCalls === 0,
  };
}

// ─── CLI ───

function main(): void {
  const args = process.argv.slice(2);
  const format = args.includes('--json') ? 'json' : 'table';
  const verbose = args.includes('--verbose') || args.includes('-v');

  const report = runMigrationScan();

  if (format === 'json') {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║           STORAGE ADAPTER MIGRATION REPORT                                   ║');
    console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
    console.log(`║  Scanned files:      ${String(report.scanned_files).padEnd(58)} ║`);
    console.log(`║  Files with direct fs: ${String(report.files_with_direct_fs).padEnd(56)} ║`);
    console.log(`║  Total direct calls:  ${String(report.total_direct_calls).padEnd(57)} ║`);
    console.log(
      `║  Migration ready:     ${String(report.migration_ready ? 'YES' : 'NO').padEnd(57)} ║`
    );
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

    if (report.total_direct_calls > 0) {
      console.log();
      console.log('FILES REQUIRING MIGRATION:');
      for (const entry of report.breakdown) {
        console.log(`  ${entry.file} (${entry.calls.length} calls)`);
        if (verbose) {
          for (const call of entry.calls) {
            console.log(`    Line ${call.line}, Col ${call.column}: ${call.method}`);
            console.log(`      ${call.code.substring(0, 80)}`);
          }
        }
      }
      console.log();
      console.log('Migration path:');
      console.log("  1. Import { getRuntimeStorage } from './runtime-storage.js'");
      console.log('  2. Replace fs.writeFileSync(path, data) → storage.write(path, data)');
      console.log('  3. Replace fs.readFileSync(path) → storage.read(path)');
      console.log('  4. Replace fs.appendFileSync(path, data) → storage.append(path, data)');
      console.log('  5. Replace fs.unlinkSync(path) → storage.delete(path)');
      console.log('  6. Run this script again to verify zero direct calls');
    } else {
      console.log();
      console.log('✅ All runtime scripts use the storage adapter. No direct fs mutations found.');
    }
  }

  process.exit(report.migration_ready ? 0 : 1);
}

main();
