#!/usr/bin/env tsx
/**
 * runtime-storage.ts
 * Storage Adapter Interface and Factory — T28.1 deliverable
 *
 * Abstracts all runtime state mutations through a storage adapter layer.
 * Supports filesystem backend today; SQLite and Postgres adapters planned.
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  appendFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  renameSync,
} from 'fs';
import { resolve, dirname, join } from 'path';

// ─── Types ───

export type StoreType =
  | 'event_store'
  | 'checkpoint_store'
  | 'state_store'
  | 'lock_store'
  | 'audit_store';

export type OperationType =
  | 'read'
  | 'write'
  | 'append'
  | 'delete'
  | 'list'
  | 'exists'
  | 'atomic_swap';

export interface ReadResult<T = unknown> {
  data: T | null;
  exists: boolean;
  error: string | null;
}

export interface WriteResult {
  success: boolean;
  path: string;
  bytes_written: number;
  error: string | null;
}

export interface AppendResult {
  success: boolean;
  path: string;
  lines_appended: number;
  error: string | null;
}

export interface DeleteResult {
  success: boolean;
  path: string;
  error: string | null;
}

export interface ListResult {
  entries: string[];
  error: string | null;
}

export interface ExistsResult {
  exists: boolean;
  path: string;
}

export interface AtomicSwapResult {
  success: boolean;
  old_path: string;
  new_path: string;
  error: string | null;
}

export interface StorageAdapter {
  readonly adapter_id: string;
  readonly adapter_type: string;
  readonly version: string;

  // Generic operations
  read<T = unknown>(path: string): Promise<ReadResult<T>>;
  write(path: string, data: string | Buffer): Promise<WriteResult>;
  append(path: string, data: string): Promise<AppendResult>;
  delete(path: string): Promise<DeleteResult>;
  list(dir: string): Promise<ListResult>;
  exists(path: string): Promise<ExistsResult>;
  atomicSwap(oldPath: string, newPath: string): Promise<AtomicSwapResult>;

  // Store-specific operations with semantic awareness
  readEvent(streamPath: string, position?: number): Promise<ReadResult<string>>;
  appendEvent(streamPath: string, event: string): Promise<AppendResult>;
  readCheckpoint(checkpointId: string): Promise<ReadResult<Record<string, unknown>>>;
  writeCheckpoint(checkpointId: string, data: Record<string, unknown>): Promise<WriteResult>;
  readState(statePath: string): Promise<ReadResult<Record<string, unknown>>>;
  writeState(statePath: string, data: Record<string, unknown>): Promise<WriteResult>;
  readLock(lockPath: string): Promise<ReadResult<Record<string, unknown>>>;
  writeLock(lockPath: string, data: Record<string, unknown>): Promise<WriteResult>;
  readAudit(auditPath: string): Promise<ReadResult<string>>;
  appendAudit(auditPath: string, entry: string): Promise<AppendResult>;

  // Lifecycle
  initialize(): Promise<{ success: boolean; error: string | null }>;
  healthCheck(): Promise<{ healthy: boolean; details: string }>;
  close(): Promise<void>;
}

export interface AdapterConfig {
  base_path?: string;
  connection_string?: string;
  options?: Record<string, unknown>;
}

// ─── Filesystem Adapter ───

export class FilesystemAdapter implements StorageAdapter {
  readonly adapter_id = 'filesystem-adapter';
  readonly adapter_type = 'filesystem';
  readonly version = '1.0.0';

  private basePath: string;
  private ensuredDirs: Set<string> = new Set();

  constructor(config: AdapterConfig = {}) {
    this.basePath = config.base_path ? resolve(config.base_path) : resolve('.');
  }

  private resolvePath(path: string): string {
    return resolve(this.basePath, path);
  }

  private ensureDir(path: string): void {
    const dir = dirname(path);
    if (this.ensuredDirs.has(dir)) {
      return;
    }
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.ensuredDirs.add(dir);
  }

  async initialize(): Promise<{ success: boolean; error: string | null }> {
    try {
      if (!existsSync(this.basePath)) {
        mkdirSync(this.basePath, { recursive: true });
      }
      return { success: true, error: null };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; details: string }> {
    try {
      const testPath = join(this.basePath, '.health-check');
      writeFileSync(testPath, JSON.stringify({ timestamp: new Date().toISOString() }));
      const data = readFileSync(testPath, 'utf-8');
      unlinkSync(testPath);
      return { healthy: true, details: 'Filesystem adapter healthy' };
    } catch (err) {
      return { healthy: false, details: String(err) };
    }
  }

  async read<T = unknown>(path: string): Promise<ReadResult<T>> {
    const fullPath = this.resolvePath(path);
    try {
      if (!existsSync(fullPath)) {
        return { data: null, exists: false, error: null };
      }
      const raw = readFileSync(fullPath, 'utf-8');
      const data = JSON.parse(raw) as T;
      return { data, exists: true, error: null };
    } catch (err) {
      return { data: null, exists: existsSync(fullPath), error: String(err) };
    }
  }

  async write(path: string, data: string | Buffer): Promise<WriteResult> {
    const fullPath = this.resolvePath(path);
    const payload = typeof data === 'string' ? data : data.toString('utf-8');

    // Atomic write: write to temp, then rename
    const tempPath = fullPath + '.tmp';
    const maxRetries = 3;
    let lastError: string | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.ensureDir(fullPath);
        writeFileSync(tempPath, payload, 'utf-8');
        // Atomic rename
        renameSync(tempPath, fullPath);
        return {
          success: true,
          path: fullPath,
          bytes_written: Buffer.byteLength(payload, 'utf-8'),
          error: null,
        };
      } catch (err) {
        lastError = String(err);
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 100; // exponential backoff: 200ms, 400ms
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    // Emit governance event on persistent failure
    try {
      const { emit, buildEvent } = await import('./emit-governance-event.js');
      const event = buildEvent('storage.write_failed', 'error', 'runtime', {
        path: fullPath,
        error: lastError,
        retries: maxRetries,
        adapter: this.adapter_id,
      });
      emit(event);
    } catch {
      // ignore event emission failure
    }

    return { success: false, path: fullPath, bytes_written: 0, error: lastError };
  }

  async append(path: string, data: string): Promise<AppendResult> {
    const fullPath = this.resolvePath(path);
    try {
      this.ensureDir(fullPath);
      const lines = data.split('\n').filter((l) => l.trim().length > 0);
      appendFileSync(fullPath, data, 'utf-8');
      return { success: true, path: fullPath, lines_appended: lines.length, error: null };
    } catch (err) {
      return { success: false, path: fullPath, lines_appended: 0, error: String(err) };
    }
  }

  async delete(path: string): Promise<DeleteResult> {
    const fullPath = this.resolvePath(path);
    try {
      if (!existsSync(fullPath)) {
        return { success: true, path: fullPath, error: null };
      }
      unlinkSync(fullPath);
      return { success: true, path: fullPath, error: null };
    } catch (err) {
      return { success: false, path: fullPath, error: String(err) };
    }
  }

  async list(dir: string): Promise<ListResult> {
    const fullDir = this.resolvePath(dir);
    try {
      if (!existsSync(fullDir)) {
        return { entries: [], error: null };
      }
      const entries = readdirSync(fullDir);
      return { entries, error: null };
    } catch (err) {
      return { entries: [], error: String(err) };
    }
  }

  async exists(path: string): Promise<ExistsResult> {
    const fullPath = this.resolvePath(path);
    return { exists: existsSync(fullPath), path: fullPath };
  }

  async atomicSwap(oldPath: string, newPath: string): Promise<AtomicSwapResult> {
    const fullOld = this.resolvePath(oldPath);
    const fullNew = this.resolvePath(newPath);
    try {
      if (!existsSync(fullOld)) {
        return {
          success: false,
          old_path: fullOld,
          new_path: fullNew,
          error: 'Source path does not exist',
        };
      }
      this.ensureDir(fullNew);
      // Write to temp, then rename for atomicity
      const tempPath = fullNew + '.tmp';
      writeFileSync(tempPath, readFileSync(fullOld, 'utf-8'), 'utf-8');
      // On POSIX, rename is atomic
      renameSync(tempPath, fullNew);
      unlinkSync(fullOld);
      return { success: true, old_path: fullOld, new_path: fullNew, error: null };
    } catch (err) {
      return { success: false, old_path: fullOld, new_path: fullNew, error: String(err) };
    }
  }

  // ─── Store-specific operations ───

  async readEvent(streamPath: string, position?: number): Promise<ReadResult<string>> {
    const fullPath = this.resolvePath(streamPath);
    try {
      if (!existsSync(fullPath)) {
        return { data: null, exists: false, error: null };
      }
      const raw = readFileSync(fullPath, 'utf-8');
      const lines = raw.split('\n').filter((l) => l.trim().length > 0);
      if (position !== undefined && position >= 0) {
        const data = lines.slice(position).join('\n');
        return { data, exists: true, error: null };
      }
      return { data: raw, exists: true, error: null };
    } catch (err) {
      return { data: null, exists: existsSync(fullPath), error: String(err) };
    }
  }

  async appendEvent(streamPath: string, event: string): Promise<AppendResult> {
    // Events are append-only
    const fullPath = this.resolvePath(streamPath);
    try {
      this.ensureDir(fullPath);
      const line = event.trim() + '\n';
      appendFileSync(fullPath, line, 'utf-8');
      return { success: true, path: fullPath, lines_appended: 1, error: null };
    } catch (err) {
      return { success: false, path: fullPath, lines_appended: 0, error: String(err) };
    }
  }

  async readCheckpoint(checkpointId: string): Promise<ReadResult<Record<string, unknown>>> {
    const path = `project-governance/runtime/checkpoints/${checkpointId}.json`;
    return this.read<Record<string, unknown>>(path);
  }

  async writeCheckpoint(checkpointId: string, data: Record<string, unknown>): Promise<WriteResult> {
    const path = `project-governance/runtime/checkpoints/${checkpointId}.json`;
    return this.write(path, JSON.stringify(data, null, 2) + '\n');
  }

  async readState(statePath: string): Promise<ReadResult<Record<string, unknown>>> {
    return this.read<Record<string, unknown>>(statePath);
  }

  async writeState(statePath: string, data: Record<string, unknown>): Promise<WriteResult> {
    return this.write(statePath, JSON.stringify(data, null, 2) + '\n');
  }

  async readLock(lockPath: string): Promise<ReadResult<Record<string, unknown>>> {
    return this.read<Record<string, unknown>>(lockPath);
  }

  async writeLock(lockPath: string, data: Record<string, unknown>): Promise<WriteResult> {
    return this.write(lockPath, JSON.stringify(data, null, 2) + '\n');
  }

  async readAudit(auditPath: string): Promise<ReadResult<string>> {
    const fullPath = this.resolvePath(auditPath);
    try {
      if (!existsSync(fullPath)) {
        return { data: null, exists: false, error: null };
      }
      const raw = readFileSync(fullPath, 'utf-8');
      return { data: raw, exists: true, error: null };
    } catch (err) {
      return { data: null, exists: existsSync(fullPath), error: String(err) };
    }
  }

  async appendAudit(auditPath: string, entry: string): Promise<AppendResult> {
    // Audit entries are append-only
    return this.append(auditPath, entry.trim() + '\n');
  }

  async close(): Promise<void> {
    // No-op for filesystem adapter
  }
}

// ─── Adapter Factory ───

export function createAdapter(type: string, config: AdapterConfig = {}): StorageAdapter {
  switch (type) {
    case 'filesystem':
      return new FilesystemAdapter(config);
    case 'sqlite':
      throw new Error('SQLite adapter not yet implemented. See migration path in T28.2.');
    case 'postgres':
      throw new Error('Postgres adapter not yet implemented. See migration path in T28.2.');
    case 'memory':
      throw new Error('Memory adapter not yet implemented.');
    default:
      throw new Error(`Unknown adapter type: ${type}`);
  }
}

// ─── Singleton Runtime Storage ───

let globalAdapter: StorageAdapter | null = null;

export function getRuntimeStorage(): StorageAdapter {
  if (!globalAdapter) {
    globalAdapter = createAdapter('filesystem', { base_path: process.cwd() });
  }
  return globalAdapter;
}

export function setRuntimeStorage(adapter: StorageAdapter): void {
  globalAdapter = adapter;
}

// ─── Migration Utilities ───

export interface MigrationPlan {
  from_adapter: string;
  to_adapter: string;
  steps: string[];
  rollback_steps: string[];
  verification_command: string;
}

export function generateMigrationPlan(from: string, to: string): MigrationPlan {
  return {
    from_adapter: from,
    to_adapter: to,
    steps: [
      `Initialize ${to} adapter alongside ${from}`,
      `Mirror all writes to both adapters (dual-write mode)`,
      `Run validation suite against ${to} adapter`,
      `Switch reads to ${to} adapter`,
      `Disable ${from} adapter writes`,
      `Archive ${from} adapter data`,
    ],
    rollback_steps: [
      `Re-enable ${from} adapter`,
      `Switch reads back to ${from}`,
      `Disable ${to} adapter writes`,
      `Investigate ${to} failure`,
    ],
    verification_command: `npm run storage:validate`,
  };
}

// ─── CLI ───

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0] ?? 'help';

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log('Usage: tsx scripts/runtime-storage.ts <command> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  health        Run health check on default filesystem adapter');
    console.log('  read <path>   Read and parse JSON from path');
    console.log('  write <path>  Write JSON to path (reads from stdin)');
    console.log('  list <dir>    List directory entries');
    console.log('  migrate-plan  Generate migration plan from filesystem to sqlite');
    console.log('  help          Show this help');
    process.exit(0);
  }

  if (cmd === 'health') {
    const adapter = createAdapter('filesystem', { base_path: process.cwd() });
    const init = await adapter.initialize();
    if (!init.success) {
      console.error('Initialization failed:', init.error);
      process.exit(1);
    }
    const health = await adapter.healthCheck();
    console.log('Health:', health.healthy ? 'HEALTHY' : 'UNHEALTHY');
    console.log('Details:', health.details);
    await adapter.close();
    process.exit(health.healthy ? 0 : 1);
  }

  if (cmd === 'read') {
    const path = args[1];
    if (!path) {
      console.error('Usage: tsx scripts/runtime-storage.ts read <path>');
      process.exit(1);
    }
    const adapter = getRuntimeStorage();
    const result = await adapter.read(path);
    if (result.error) {
      console.error('Error:', result.error);
      process.exit(1);
    }
    console.log(JSON.stringify(result.data, null, 2));
    process.exit(0);
  }

  if (cmd === 'write') {
    const path = args[1];
    if (!path) {
      console.error('Usage: tsx scripts/runtime-storage.ts write <path>');
      process.exit(1);
    }
    const adapter = getRuntimeStorage();
    const data = await new Promise<string>((resolve) => {
      let buffer = '';
      process.stdin.on('data', (chunk) => {
        buffer += chunk;
      });
      process.stdin.on('end', () => resolve(buffer));
    });
    const result = await adapter.write(path, data);
    if (!result.success) {
      console.error('Write failed:', result.error);
      process.exit(1);
    }
    console.log('Wrote', result.bytes_written, 'bytes to', result.path);
    process.exit(0);
  }

  if (cmd === 'list') {
    const dir = args[1] ?? '.';
    const adapter = getRuntimeStorage();
    const result = await adapter.list(dir);
    if (result.error) {
      console.error('Error:', result.error);
      process.exit(1);
    }
    result.entries.forEach((e) => console.log(e));
    process.exit(0);
  }

  if (cmd === 'migrate-plan') {
    const plan = generateMigrationPlan('filesystem', 'sqlite');
    console.log(JSON.stringify(plan, null, 2));
    process.exit(0);
  }

  console.error('Unknown command:', cmd);
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
