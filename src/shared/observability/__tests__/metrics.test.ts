import { describe, it, expect } from 'vitest';
import { Counter, Histogram, Gauge } from '../metrics.js';

describe('Counter', () => {
  it('increments and emits Prometheus format', () => {
    const counter = new Counter('jobs_total', 'Total jobs processed');
    counter.inc({ domain: 'identity' }, 1);
    counter.inc({ domain: 'identity' }, 2);
    counter.inc({ domain: 'marketplace' }, 1);

    const output = counter.toPrometheus();
    expect(output).toContain('# HELP jobs_total Total jobs processed');
    expect(output).toContain('# TYPE jobs_total counter');
    expect(output).toContain('jobs_total{domain="identity"} 3');
    expect(output).toContain('jobs_total{domain="marketplace"} 1');
  });

  it('throws on forbidden label', () => {
    const counter = new Counter('test', 'test');
    expect(() => counter.inc({ userId: '123' })).toThrow('Forbidden metric label');
  });
});

describe('Histogram', () => {
  it('observes values and emits buckets', () => {
    const hist = new Histogram('latency_seconds', 'Request latency', [0.1, 0.5, 1, 5]);
    hist.observe(0.05, { operation: 'query' });
    hist.observe(0.3, { operation: 'query' });
    hist.observe(2, { operation: 'query' });

    const output = hist.toPrometheus();
    expect(output).toContain('# TYPE latency_seconds histogram');
    expect(output).toContain('latency_seconds_bucket{operation="query",le="0.1"} 1');
    expect(output).toContain('latency_seconds_bucket{operation="query",le="0.5"} 2');
    expect(output).toContain('latency_seconds_bucket{operation="query",le="1"} 2');
    expect(output).toContain('latency_seconds_bucket{operation="query",le="5"} 3');
    expect(output).toContain('latency_seconds_bucket{operation="query",le="+Inf"} 3');
    expect(output).toContain('latency_seconds_sum{operation="query"} 2.35');
    expect(output).toContain('latency_seconds_count{operation="query"} 3');
  });
});

describe('Gauge', () => {
  it('sets and increments', () => {
    const gauge = new Gauge('connections', 'Active connections');
    gauge.set(5, { pool: 'main' });
    gauge.inc({ pool: 'main' }, 2);
    gauge.dec({ pool: 'main' }, 1);

    const output = gauge.toPrometheus();
    expect(output).toContain('connections{pool="main"} 6');
  });
});
