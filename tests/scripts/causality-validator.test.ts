import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  validateCausality,
  type GovernanceEvent,
  type ValidationPaths,
} from '../../scripts/lib/causality-validator.js';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'causality-test-'));
}

function writeNdjson(dir: string, filename: string, events: GovernanceEvent[]): void {
  const lines = events.map((e) => JSON.stringify(e)).join('\n');
  writeFileSync(join(dir, filename), lines + (lines ? '\n' : ''), 'utf-8');
}

function defaultPaths(base: string): ValidationPaths {
  return {
    eventsDir: join(base, 'events'),
    sequenceStorePath: join(base, 'sequence-store.json'),
    causalityStorePath: join(base, 'causality-store.json'),
    checkpointsDir: join(base, 'checkpoints'),
  };
}

function setupEmpty(base: string): ValidationPaths {
  const paths = defaultPaths(base);
  mkdirSync(paths.eventsDir, { recursive: true });
  mkdirSync(paths.checkpointsDir, { recursive: true });
  return paths;
}

describe('causality-validator', () => {
  it('passes on empty streams', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    const result = validateCausality(paths);
    expect(result.passed).toBe(true);
    expect(result.findings).toHaveLength(0);
    expect(result.stats.eventsInspected).toBe(0);
  });

  it('CI-001: detects temporal inversion', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    const events: GovernanceEvent[] = [
      {
        event_id: 'a',
        timestamp: '2026-01-01T00:00:00Z',
        event_type: 'test.a',
        severity: 'info',
        category: 'runtime',
        global_sequence: 2,
        causality_chain: [],
      },
      {
        event_id: 'b',
        timestamp: '2026-01-01T00:00:01Z',
        event_type: 'test.b',
        severity: 'info',
        category: 'runtime',
        global_sequence: 1,
        causality_chain: ['a'],
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    const result = validateCausality(paths);
    expect(result.passed).toBe(false);
    const f = result.findings.find((x) => x.invariant === 'CI-001');
    expect(f).toBeDefined();
    if (!f) throw new Error('Expected finding to exist');
    expect(f.severity).toBe('CRITICAL');
  });

  it('CI-001: passes when sequences are monotonic', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    const events: GovernanceEvent[] = [
      {
        event_id: 'a',
        timestamp: '2026-01-01T00:00:00Z',
        event_type: 'test.a',
        severity: 'info',
        category: 'runtime',
        global_sequence: 1,
        causality_chain: [],
      },
      {
        event_id: 'b',
        timestamp: '2026-01-01T00:00:01Z',
        event_type: 'test.b',
        severity: 'info',
        category: 'runtime',
        global_sequence: 2,
        causality_chain: ['a'],
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    const result = validateCausality(paths);
    expect(result.findings.filter((f) => f.invariant === 'CI-001')).toHaveLength(0);
  });

  it('CI-002: flags missing parent', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    const events: GovernanceEvent[] = [
      {
        event_id: 'a',
        timestamp: '2026-01-01T00:00:00Z',
        event_type: 'test.a',
        severity: 'info',
        category: 'runtime',
        parent_event_id: 'missing',
        causality_chain: ['missing'],
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    const result = validateCausality(paths);
    const f = result.findings.find((x) => x.invariant === 'CI-002');
    expect(f).toBeDefined();
    if (!f) throw new Error('Expected finding to exist');
    expect(f.severity).toBe('HIGH');
  });

  it('CI-002: allows parent known via causality store', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    const events: GovernanceEvent[] = [
      {
        event_id: 'b',
        timestamp: '2026-01-01T00:00:01Z',
        event_type: 'test.b',
        severity: 'info',
        category: 'runtime',
        parent_event_id: 'a',
        causality_chain: ['a'],
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    writeFileSync(
      paths.causalityStorePath,
      JSON.stringify({
        execution_parents: { __no_execution__: 'b' },
        execution_chains: { __no_execution__: ['a'] },
        updated_at: '2026-01-01T00:00:00Z',
      }),
      'utf-8'
    );
    const result = validateCausality(paths);
    expect(result.findings.filter((f) => f.invariant === 'CI-002')).toHaveLength(0);
  });

  it('CI-003: detects self-reference', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    const events: GovernanceEvent[] = [
      {
        event_id: 'a',
        timestamp: '2026-01-01T00:00:00Z',
        event_type: 'test.a',
        severity: 'info',
        category: 'runtime',
        causality_chain: ['a'],
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    const result = validateCausality(paths);
    const f = result.findings.find((x) => x.invariant === 'CI-003');
    expect(f).toBeDefined();
    if (!f) throw new Error('Expected finding to exist');
    expect(f.severity).toBe('CRITICAL');
  });

  it('CI-003: detects cycle through ancestors', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    const events: GovernanceEvent[] = [
      {
        event_id: 'a',
        timestamp: '2026-01-01T00:00:00Z',
        event_type: 'test.a',
        severity: 'info',
        category: 'runtime',
        causality_chain: ['c'],
      },
      {
        event_id: 'b',
        timestamp: '2026-01-01T00:00:01Z',
        event_type: 'test.b',
        severity: 'info',
        category: 'runtime',
        causality_chain: ['a'],
      },
      {
        event_id: 'c',
        timestamp: '2026-01-01T00:00:02Z',
        event_type: 'test.c',
        severity: 'info',
        category: 'runtime',
        causality_chain: ['b'],
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    const result = validateCausality(paths);
    const f = result.findings.find((x) => x.invariant === 'CI-003');
    expect(f).toBeDefined();
    if (!f) throw new Error('Expected finding to exist');
    expect(f.severity).toBe('CRITICAL');
  });

  it('CI-004: flags unclassified cross-execution linkage', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    const events: GovernanceEvent[] = [
      {
        event_id: 'a',
        timestamp: '2026-01-01T00:00:00Z',
        event_type: 'test.a',
        severity: 'info',
        category: 'runtime',
        execution_id: 'exec-1',
      },
      {
        event_id: 'b',
        timestamp: '2026-01-01T00:00:01Z',
        event_type: 'test.b',
        severity: 'info',
        category: 'runtime',
        execution_id: 'exec-2',
        parent_event_id: 'a',
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    const result = validateCausality(paths);
    const f = result.findings.find((x) => x.invariant === 'CI-004');
    expect(f).toBeDefined();
    if (!f) throw new Error('Expected finding to exist');
    expect(f.severity).toBe('HIGH');
  });

  it('CI-004: allows classified cross-execution linkage', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    const events: GovernanceEvent[] = [
      {
        event_id: 'a',
        timestamp: '2026-01-01T00:00:00Z',
        event_type: 'test.a',
        severity: 'info',
        category: 'runtime',
        execution_id: 'exec-1',
      },
      {
        event_id: 'b',
        timestamp: '2026-01-01T00:00:01Z',
        event_type: 'test.b',
        severity: 'info',
        category: 'runtime',
        execution_id: 'exec-2',
        parent_event_id: 'a',
        metadata: { linkage_type: 'handoff' },
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    const result = validateCausality(paths);
    expect(result.findings.filter((f) => f.invariant === 'CI-004')).toHaveLength(0);
  });

  it('CI-005: detects chain mismatch', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    const events: GovernanceEvent[] = [
      {
        event_id: 'a',
        timestamp: '2026-01-01T00:00:00Z',
        event_type: 'test.a',
        severity: 'info',
        category: 'runtime',
        global_sequence: 1,
      },
      {
        event_id: 'b',
        timestamp: '2026-01-01T00:00:01Z',
        event_type: 'test.b',
        severity: 'info',
        category: 'runtime',
        global_sequence: 2,
        parent_event_id: 'a',
        causality_chain: ['x'],
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    const result = validateCausality(paths);
    const f = result.findings.find((x) => x.invariant === 'CI-005');
    expect(f).toBeDefined();
    if (!f) throw new Error('Expected finding to exist');
    expect(f.severity).toBe('HIGH');
  });

  it('CI-005: passes on correct chain reconstruction', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    const events: GovernanceEvent[] = [
      {
        event_id: 'a',
        timestamp: '2026-01-01T00:00:00Z',
        event_type: 'test.a',
        severity: 'info',
        category: 'runtime',
        global_sequence: 1,
      },
      {
        event_id: 'b',
        timestamp: '2026-01-01T00:00:01Z',
        event_type: 'test.b',
        severity: 'info',
        category: 'runtime',
        global_sequence: 2,
        parent_event_id: 'a',
        causality_chain: ['a'],
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    const result = validateCausality(paths);
    expect(result.findings.filter((f) => f.invariant === 'CI-005')).toHaveLength(0);
  });

  it('CI-006: flags missing sequence anchors', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    writeFileSync(
      join(paths.checkpointsDir, 'cp_T99.9_20260101_000000_complete.json'),
      JSON.stringify({
        checkpoint_id: 'cp_T99.9_20260101_000000_complete',
        status: 'complete',
      }),
      'utf-8'
    );
    const result = validateCausality(paths);
    const findings = result.findings.filter((x) => x.invariant === 'CI-006');
    expect(findings.length).toBe(2); // global_sequence + execution_sequence
  });

  it('CI-006: exempts pre-causality checkpoints', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    writeFileSync(
      join(paths.checkpointsDir, 'cp_T27.1_20260101_000000_complete.json'),
      JSON.stringify({
        checkpoint_id: 'cp_T27.1_20260101_000000_complete',
        status: 'complete',
      }),
      'utf-8'
    );
    const result = validateCausality(paths);
    expect(result.findings.filter((f) => f.invariant === 'CI-006')).toHaveLength(0);
  });

  it('CI-007: detects lineage mutation', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    const events: GovernanceEvent[] = [
      {
        event_id: 'a',
        timestamp: '2026-01-01T00:00:00Z',
        event_type: 'test.a',
        severity: 'info',
        category: 'runtime',
        parent_event_id: null,
        causality_chain: [],
      },
      {
        event_id: 'a',
        timestamp: '2026-01-01T00:00:01Z',
        event_type: 'test.a',
        severity: 'info',
        category: 'runtime',
        parent_event_id: 'x',
        causality_chain: ['x'],
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    const result = validateCausality(paths);
    const f = result.findings.find((x) => x.invariant === 'CI-007');
    expect(f).toBeDefined();
    if (!f) throw new Error('Expected finding to exist');
    expect(f.severity).toBe('CRITICAL');
  });

  it('CI-008: flags missing fork event', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    const events: GovernanceEvent[] = [
      {
        event_id: 'a',
        timestamp: '2026-01-01T00:00:00Z',
        event_type: 'test.a',
        severity: 'info',
        category: 'runtime',
      },
      {
        event_id: 'b',
        timestamp: '2026-01-01T00:00:01Z',
        event_type: 'test.b',
        severity: 'info',
        category: 'runtime',
        parent_event_id: 'a',
      },
      {
        event_id: 'c',
        timestamp: '2026-01-01T00:00:02Z',
        event_type: 'test.c',
        severity: 'info',
        category: 'runtime',
        parent_event_id: 'a',
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    const result = validateCausality(paths);
    const f = result.findings.find((x) => x.invariant === 'CI-008');
    expect(f).toBeDefined();
    if (!f) throw new Error('Expected finding to exist');
    expect(f.severity).toBe('MEDIUM');
  });

  it('CI-008: passes when lineage.fork emitted', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    const events: GovernanceEvent[] = [
      {
        event_id: 'a',
        timestamp: '2026-01-01T00:00:00Z',
        event_type: 'test.a',
        severity: 'info',
        category: 'runtime',
      },
      {
        event_id: 'b',
        timestamp: '2026-01-01T00:00:01Z',
        event_type: 'test.b',
        severity: 'info',
        category: 'runtime',
        parent_event_id: 'a',
      },
      {
        event_id: 'c',
        timestamp: '2026-01-01T00:00:02Z',
        event_type: 'test.c',
        severity: 'info',
        category: 'runtime',
        parent_event_id: 'a',
      },
      {
        event_id: 'd',
        timestamp: '2026-01-01T00:00:03Z',
        event_type: 'lineage.fork',
        severity: 'info',
        category: 'runtime',
        payload: { fork_origin: 'a' },
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    const result = validateCausality(paths);
    expect(result.findings.filter((f) => f.invariant === 'CI-008')).toHaveLength(0);
  });

  it('CI-009: detects invalid event type ordering', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    const events: GovernanceEvent[] = [
      {
        event_id: 'a',
        timestamp: '2026-01-01T00:00:00Z',
        event_type: 'execution.completed',
        severity: 'info',
        category: 'runtime',
      },
      {
        event_id: 'b',
        timestamp: '2026-01-01T00:00:01Z',
        event_type: 'execution.started',
        severity: 'info',
        category: 'runtime',
        causality_chain: ['a'],
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    const result = validateCausality(paths);
    const f = result.findings.find((x) => x.invariant === 'CI-009');
    expect(f).toBeDefined();
    if (!f) throw new Error('Expected finding to exist');
    expect(f.severity).toBe('HIGH');
  });

  it('CI-010: flags large sequence gaps', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    const events: GovernanceEvent[] = [
      {
        event_id: 'a',
        timestamp: '2026-01-01T00:00:00Z',
        event_type: 'test.a',
        severity: 'info',
        category: 'runtime',
        global_sequence: 1,
      },
      {
        event_id: 'b',
        timestamp: '2026-01-01T00:00:01Z',
        event_type: 'test.b',
        severity: 'info',
        category: 'runtime',
        global_sequence: 150,
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    const result = validateCausality(paths);
    const f = result.findings.find((x) => x.invariant === 'CI-010');
    expect(f).toBeDefined();
    if (!f) throw new Error('Expected finding to exist');
    expect(f.severity).toBe('MEDIUM');
  });

  it('CI-010: ignores small sequence gaps', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    const events: GovernanceEvent[] = [
      {
        event_id: 'a',
        timestamp: '2026-01-01T00:00:00Z',
        event_type: 'test.a',
        severity: 'info',
        category: 'runtime',
        global_sequence: 1,
      },
      {
        event_id: 'b',
        timestamp: '2026-01-01T00:00:01Z',
        event_type: 'test.b',
        severity: 'info',
        category: 'runtime',
        global_sequence: 5,
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    const result = validateCausality(paths);
    expect(result.findings.filter((f) => f.invariant === 'CI-010')).toHaveLength(0);
  });

  it('deduplicates events across multiple stream files', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    const event: GovernanceEvent = {
      event_id: 'dup',
      timestamp: '2026-01-01T00:00:00Z',
      event_type: 'test.a',
      severity: 'info',
      category: 'runtime',
    };
    writeNdjson(paths.eventsDir, 's1.ndjson', [event]);
    writeNdjson(paths.eventsDir, 's2.ndjson', [event]);
    const result = validateCausality(paths);
    expect(result.stats.eventsInspected).toBe(1);
  });
});
