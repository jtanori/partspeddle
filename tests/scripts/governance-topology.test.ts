import { describe, it, expect } from 'vitest';
import { buildTopology, saveTopology } from '../../scripts/lib/governance-topology.js';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('governance-topology', () => {
  it('builds a topology with nodes, edges, and subsystems', () => {
    const topo = buildTopology();
    expect(topo.nodes.length).toBeGreaterThan(0);
    expect(topo.edges.length).toBeGreaterThan(0);
    expect(topo.subsystems.length).toBeGreaterThan(0);
    expect(topo.version).toBe('1.0.0');
    expect(topo.generated_at).toBeTruthy();
  });

  it('includes validators, emitters, and policies', () => {
    const topo = buildTopology();
    const validators = topo.nodes.filter((n) => n.type === 'validator');
    const emitters = topo.nodes.filter((n) => n.type === 'emitter');
    const policies = topo.nodes.filter((n) => n.type === 'policy');

    expect(validators.length).toBeGreaterThan(0);
    expect(emitters.length).toBeGreaterThan(0);
    expect(policies.length).toBeGreaterThan(0);
  });

  it('saves topology to disk', () => {
    const topo = buildTopology();
    const tmpDir = mkdtempSync(join(tmpdir(), 'gov-topo-'));
    const outPath = join(tmpDir, 'topology.json');

    saveTopology(topo, outPath);
    expect(existsSync(outPath)).toBe(true);

    const saved = JSON.parse(readFileSync(outPath, 'utf-8'));
    expect(saved.nodes.length).toBe(topo.nodes.length);
    expect(saved.edges.length).toBe(topo.edges.length);

    rmSync(tmpDir, { recursive: true, force: true });
  });
});
