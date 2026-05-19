import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmdirSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  readJson,
  writeJson,
  updateJson,
  readJsonDir,
  backupJson,
  listBackups,
  restoreJson,
  inspectJson,
  diffJson,
  batchUpdateJson,
  createValidator,
  JsonFileError,
} from '../../scripts/lib/json-utils.js';

describe('json-utils', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'json-utils-test-'));
  });

  afterEach(() => {
    // Cleanup temp files
    const files = readFileSync;
    // Best effort cleanup
  });

  it('reads and parses JSON', () => {
    const path = join(tempDir, 'test.json');
    writeFileSync(path, '{"foo": 42}', 'utf8');

    const result = readJson(path);
    expect(result).toEqual({ foo: 42 });
  });

  it('throws on missing file', () => {
    expect(() => readJson(join(tempDir, 'missing.json'))).toThrow('JSON_FILE_NOT_FOUND');
  });

  it('throws on invalid JSON', () => {
    const path = join(tempDir, 'bad.json');
    writeFileSync(path, '{invalid}', 'utf8');
    expect(() => readJson(path)).toThrow('JSON_PARSE_ERROR');
  });

  it('writes formatted JSON', () => {
    const path = join(tempDir, 'out.json');
    writeJson(path, { bar: 'baz' });

    const content = readFileSync(path, 'utf8');
    expect(content).toContain('"bar": "baz"');
    expect(content.endsWith('\n')).toBe(true);
  });

  it('updateJson applies transform', () => {
    const path = join(tempDir, 'update.json');
    writeFileSync(path, '{"count": 1}', 'utf8');

    const result = updateJson(path, (data: { count: number }) => ({ ...data, count: data.count + 1 }));

    expect(result.count).toBe(2);
    expect(readJson(path).count).toBe(2);
  });

  it('updateJson creates file if missing', () => {
    const path = join(tempDir, 'new.json');
    const result = updateJson(path, () => ({ created: true }));

    expect(result.created).toBe(true);
    expect(existsSync(path)).toBe(true);
  });

  it('reads all JSON files in directory', () => {
    writeFileSync(join(tempDir, 'a.json'), '{"id": 1}', 'utf8');
    writeFileSync(join(tempDir, 'b.json'), '{"id": 2}', 'utf8');
    writeFileSync(join(tempDir, 'c.txt'), 'not json', 'utf8');

    const results = readJsonDir(tempDir);
    expect(results).toHaveLength(2);
    expect(results.map((r: { id: number }) => r.id).sort()).toEqual([1, 2]);
  });

  it('readJsonDir includes file names when requested', () => {
    writeFileSync(join(tempDir, 'x.json'), '{"val": 1}', 'utf8');

    const results = readJsonDir(tempDir, { includeFileName: true });
    expect(results[0].fileName).toBe('x.json');
    expect(results[0].data.val).toBe(1);
  });

  it('creates backup before write when requested', () => {
    const path = join(tempDir, 'backup-test.json');
    writeFileSync(path, '{"v": 1}', 'utf8');

    writeJson(path, { v: 2 }, { backup: true });

    const backups = listBackups(path);
    expect(backups.length).toBeGreaterThan(0);
    expect(readJson(backups[0]).v).toBe(1);
  });

  it('restores from backup', () => {
    const path = join(tempDir, 'restore.json');
    writeFileSync(path, '{"v": 1}', 'utf8');
    writeJson(path, { v: 2 }, { backup: true });

    restoreJson(path);
    expect(readJson(path).v).toBe(1);
  });

  it('inspects JSON metadata', () => {
    const path = join(tempDir, 'inspect.json');
    writeFileSync(path, '{"a": 1, "b": 2}', 'utf8');

    const info = inspectJson(path);
    expect(info.exists).toBe(true);
    expect(info.keys).toContain('a');
    expect(info.keys).toContain('b');
    expect(info.type).toBe('object');
  });

  it('inspects missing file', () => {
    const info = inspectJson(join(tempDir, 'missing.json'));
    expect(info.exists).toBe(false);
  });

  it('diffs two JSON objects', () => {
    const before = { a: 1, b: { c: 2, d: 3 } };
    const after = { a: 1, b: { c: 99, e: 4 } };

    const changes = diffJson(before, after);
    const paths = changes.map(c => c.path);

    expect(paths).toContain('b.c');
    expect(paths).toContain('b.d');
    expect(paths).toContain('b.e');
    expect(paths).not.toContain('a');
  });

  it('batch updates multiple files', () => {
    writeFileSync(join(tempDir, 'f1.json'), '{"x": 1}', 'utf8');
    writeFileSync(join(tempDir, 'f2.json'), '{"x": 2}', 'utf8');

    const results = batchUpdateJson(tempDir, (data: { x: number }) => ({ x: data.x * 10 }));

    expect(results.filter(r => r.updated).length).toBe(2);
    expect(readJson(join(tempDir, 'f1.json')).x).toBe(10);
    expect(readJson(join(tempDir, 'f2.json')).x).toBe(20);
  });

  it('validates against schema', () => {
    const schema = {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string' } },
    };
    const validator = createValidator(schema);

    expect(validator.validate({ id: 'abc' }).valid).toBe(true);
    expect(validator.validate({ missing: true }).valid).toBe(false);
  });

  it('JsonFileError has code and path', () => {
    const err = new JsonFileError('TEST_CODE', 'test message', '/path.json');
    expect(err.code).toBe('TEST_CODE');
    expect(err.filePath).toBe('/path.json');
    expect(err.name).toBe('JsonFileError');
  });
});
