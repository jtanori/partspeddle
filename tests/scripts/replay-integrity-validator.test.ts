import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  validateReplayIntegrity,
  type GovernanceEvent,
  type ValidationPaths,
} from '../../scripts/lib/replay-integrity-validator.js';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'replay-test-'));
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

describe('replay-integrity-validator', () => {
  it('passes on empty streams', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    const result = validateReplayIntegrity(paths);
    expect(result.passed).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it('RI-001: detects causal break via unknown ancestor', () => {
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
        causality_chain: ['missing'],
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    const result = validateReplayIntegrity(paths);
    const f = result.findings.find((x) => x.invariant === 'RI-001');
    expect(f).toBeDefined();
    if (!f) throw new Error('Expected finding to exist');
    expect(f.severity).toBe('CRITICAL');
  });

  it('RI-001: detects prefix mismatch in ancestor chain', () => {
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
        event_id: 'x',
        timestamp: '2026-01-01T00:00:00Z',
        event_type: 'test.x',
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
        causality_chain: ['x'],
      },
      {
        event_id: 'c',
        timestamp: '2026-01-01T00:00:02Z',
        event_type: 'test.c',
        severity: 'info',
        category: 'runtime',
        global_sequence: 3,
        causality_chain: ['a', 'b'],
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    const result = validateReplayIntegrity(paths);
    const findings = result.findings.filter((x) => x.invariant === 'RI-001');
    expect(findings.length).toBeGreaterThan(0);
    const high = findings.find((f) => f.severity === 'HIGH');
    expect(high).toBeDefined();
  });

  it('RI-002: detects duplicate global_sequence', () => {
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
        global_sequence: 1,
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    const result = validateReplayIntegrity(paths);
    const f = result.findings.find((x) => x.invariant === 'RI-002');
    expect(f).toBeDefined();
    if (!f) throw new Error('Expected finding to exist');
    expect(f.severity).toBe('CRITICAL');
  });

  it('RI-002: detects timestamp inversion', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    const events: GovernanceEvent[] = [
      {
        event_id: 'a',
        timestamp: '2026-01-01T00:02:00Z',
        event_type: 'test.a',
        severity: 'info',
        category: 'runtime',
        global_sequence: 1,
      },
      {
        event_id: 'b',
        timestamp: '2026-01-01T00:00:00Z',
        event_type: 'test.b',
        severity: 'info',
        category: 'runtime',
        global_sequence: 2,
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    const result = validateReplayIntegrity(paths);
    const f = result.findings.find((x) => x.invariant === 'RI-002');
    expect(f).toBeDefined();
    if (!f) throw new Error('Expected finding to exist');
    expect(f.severity).toBe('HIGH');
  });

  it('RI-003: detects orphaned events', () => {
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
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    const result = validateReplayIntegrity(paths);
    const f = result.findings.find((x) => x.invariant === 'RI-003');
    expect(f).toBeDefined();
    if (!f) throw new Error('Expected finding to exist');
    expect(f.severity).toBe('HIGH');
  });

  it('RI-004: detects duplicate events within same stream', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    const event: GovernanceEvent = {
      event_id: 'dup',
      timestamp: '2026-01-01T00:00:00Z',
      event_type: 'test.a',
      severity: 'info',
      category: 'runtime',
    };
    writeNdjson(paths.eventsDir, 's1.ndjson', [event, event]);
    const result = validateReplayIntegrity(paths);
    const f = result.findings.find((x) => x.invariant === 'RI-004');
    expect(f).toBeDefined();
    if (!f) throw new Error('Expected finding to exist');
    expect(f.severity).toBe('MEDIUM');
  });

  it('RI-004: ignores cross-stream duplicates', () => {
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
    const result = validateReplayIntegrity(paths);
    expect(result.findings.filter((x) => x.invariant === 'RI-004')).toHaveLength(0);
  });

  it('RI-005: detects future timestamp', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    const future = new Date(Date.now() + 600000).toISOString();
    const events: GovernanceEvent[] = [
      {
        event_id: 'a',
        timestamp: future,
        event_type: 'test.a',
        severity: 'info',
        category: 'runtime',
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    const result = validateReplayIntegrity(paths);
    const f = result.findings.find((x) => x.invariant === 'RI-005');
    expect(f).toBeDefined();
    if (!f) throw new Error('Expected finding to exist');
    expect(f.severity).toBe('HIGH');
  });

  it('RI-005: detects timestamp/sequence contradiction within execution', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    const events: GovernanceEvent[] = [
      {
        event_id: 'a',
        timestamp: '2026-01-01T00:00:01Z',
        event_type: 'test.a',
        severity: 'info',
        category: 'runtime',
        execution_id: 'exec-1',
        global_sequence: 2,
      },
      {
        event_id: 'b',
        timestamp: '2026-01-01T00:00:02Z',
        event_type: 'test.b',
        severity: 'info',
        category: 'runtime',
        execution_id: 'exec-1',
        global_sequence: 1,
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    const result = validateReplayIntegrity(paths);
    const f = result.findings.find((x) => x.invariant === 'RI-005');
    expect(f).toBeDefined();
    if (!f) throw new Error('Expected finding to exist');
    expect(f.severity).toBe('HIGH');
  });

  it('RI-006: detects replay gap from sequence store', () => {
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
        execution_sequence: 1,
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    writeFileSync(
      paths.sequenceStorePath,
      JSON.stringify({ global_sequence: 5, execution_sequences: { __no_execution__: 1 } }),
      'utf-8'
    );
    const result = validateReplayIntegrity(paths);
    const f = result.findings.find((x) => x.invariant === 'RI-006');
    expect(f).toBeDefined();
    if (!f) throw new Error('Expected finding to exist');
    expect(f.severity).toBe('HIGH');
  });

  it('RI-006: detects middle gap', () => {
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
        execution_sequence: 1,
      },
      {
        event_id: 'b',
        timestamp: '2026-01-01T00:00:01Z',
        event_type: 'test.b',
        severity: 'info',
        category: 'runtime',
        global_sequence: 5,
        execution_sequence: 2,
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    writeFileSync(
      paths.sequenceStorePath,
      JSON.stringify({ global_sequence: 5, execution_sequences: { __no_execution__: 2 } }),
      'utf-8'
    );
    const result = validateReplayIntegrity(paths);
    const f = result.findings.find((x) => x.invariant === 'RI-006');
    expect(f).toBeDefined();
    if (!f) throw new Error('Expected finding to exist');
    expect(f.severity).toBe('MEDIUM');
  });

  it('RI-006: flags missing execution_sequence', () => {
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
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    const result = validateReplayIntegrity(paths);
    const f = result.findings.find((x) => x.invariant === 'RI-006');
    expect(f).toBeDefined();
    if (!f) throw new Error('Expected finding to exist');
    expect(f.severity).toBe('MEDIUM');
  });

  it('RI-007: detects missing anchor event for checkpoint', () => {
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
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    writeFileSync(
      join(paths.checkpointsDir, 'cp_T99.9_20260101_000000_complete.json'),
      JSON.stringify({
        checkpoint_id: 'cp_T99.9_20260101_000000_complete',
        status: 'complete',
        global_sequence: 99,
      }),
      'utf-8'
    );
    const result = validateReplayIntegrity(paths);
    const f = result.findings.find((x) => x.invariant === 'RI-007');
    expect(f).toBeDefined();
    if (!f) throw new Error('Expected finding to exist');
    expect(f.severity).toBe('HIGH');
  });

  it('RI-007: exempts pre-causality checkpoints', () => {
    const base = makeTempDir();
    const paths = setupEmpty(base);
    writeFileSync(
      join(paths.checkpointsDir, 'cp_T27.1_20260101_000000_complete.json'),
      JSON.stringify({
        checkpoint_id: 'cp_T27.1_20260101_000000_complete',
        status: 'complete',
        global_sequence: 99,
      }),
      'utf-8'
    );
    const result = validateReplayIntegrity(paths);
    expect(result.findings.filter((f) => f.invariant === 'RI-007')).toHaveLength(0);
  });

  it('passes on clean event stream', () => {
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
        execution_sequence: 1,
      },
      {
        event_id: 'b',
        timestamp: '2026-01-01T00:00:01Z',
        event_type: 'test.b',
        severity: 'info',
        category: 'runtime',
        global_sequence: 2,
        execution_sequence: 2,
        parent_event_id: 'a',
        causality_chain: ['a'],
      },
    ];
    writeNdjson(paths.eventsDir, 'default.ndjson', events);
    writeFileSync(
      paths.sequenceStorePath,
      JSON.stringify({ global_sequence: 2, execution_sequences: { __no_execution__: 2 } }),
      'utf-8'
    );
    const result = validateReplayIntegrity(paths);
    expect(result.passed).toBe(true);
    expect(result.findings).toHaveLength(0);
  });
});
