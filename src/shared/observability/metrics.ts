/**
 * Process-Local Metrics Collection
 *
 * In-memory metrics store with Prometheus text format export.
 *
 * ⚠️  NON-AUTHORITATIVE: These are process-local metrics only.
 *    Cluster-wide visibility requires external aggregation (Prometheus/Grafana).
 *
 * @see /project-knowledge/runtime-governance.md
 */

/** Labels with high cardinality are forbidden to prevent Prometheus disasters. */
const FORBIDDEN_LABELS = [
  'userId',
  'email',
  'listingId',
  'transactionId',
  'vin',
  'correlationId',
  'traceId',
  'sessionId',
];

function validateLabels(labels: Record<string, string>): void {
  for (const key of Object.keys(labels)) {
    if (FORBIDDEN_LABELS.includes(key)) {
      throw new Error(
        `Forbidden metric label: "${key}". High-cardinality labels ` +
          `cause Prometheus storage explosions. See runtime-governance.md.`,
      );
    }
  }
}

function labelString(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  return '{' + entries.map(([k, v]) => `${k}="${v}"`).join(',') + '}';
}

// ─── Counter ────────────────────────────────────────────────────────────────

interface CounterState {
  value: number;
  labels: Record<string, string>;
}

export class Counter {
  private entries = new Map<string, CounterState>();

  constructor(private readonly name: string, private readonly help: string) {}

  inc(labels: Record<string, string> = {}, value = 1): void {
    validateLabels(labels);
    const key = JSON.stringify(labels);
    const existing = this.entries.get(key);
    if (existing) {
      existing.value += value;
    } else {
      this.entries.set(key, { value, labels });
    }
  }

  toPrometheus(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const entry of this.entries.values()) {
      lines.push(`${this.name}${labelString(entry.labels)} ${entry.value}`);
    }
    return lines.join('\n');
  }
}

// ─── Histogram ──────────────────────────────────────────────────────────────

interface HistogramState {
  buckets: number[];
  sum: number;
  count: number;
  labels: Record<string, string>;
}

const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export class Histogram {
  private entries = new Map<string, HistogramState>();

  constructor(
    private readonly name: string,
    private readonly help: string,
    private readonly buckets: number[] = DEFAULT_BUCKETS,
  ) {}

  observe(value: number, labels: Record<string, string> = {}): void {
    validateLabels(labels);
    const key = JSON.stringify(labels);
    const existing = this.entries.get(key);

    if (existing) {
      existing.sum += value;
      existing.count += 1;
      for (let i = 0; i < existing.buckets.length; i++) {
        if (value <= this.buckets[i]) {
          existing.buckets[i] += 1;
        }
      }
    } else {
      const initialBuckets = this.buckets.map((b) => (value <= b ? 1 : 0));
      this.entries.set(key, {
        buckets: initialBuckets,
        sum: value,
        count: 1,
        labels,
      });
    }
  }

  toPrometheus(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const entry of this.entries.values()) {
      for (let i = 0; i < this.buckets.length; i++) {
        const bucketLabels = { ...entry.labels, le: String(this.buckets[i]) };
        lines.push(`${this.name}_bucket${labelString(bucketLabels)} ${entry.buckets[i]}`);
      }
      const infLabels = { ...entry.labels, le: '+Inf' };
      lines.push(`${this.name}_bucket${labelString(infLabels)} ${entry.count}`);
      lines.push(`${this.name}_sum${labelString(entry.labels)} ${entry.sum}`);
      lines.push(`${this.name}_count${labelString(entry.labels)} ${entry.count}`);
    }
    return lines.join('\n');
  }
}

// ─── Gauge ──────────────────────────────────────────────────────────────────

interface GaugeState {
  value: number;
  labels: Record<string, string>;
}

export class Gauge {
  private entries = new Map<string, GaugeState>();

  constructor(private readonly name: string, private readonly help: string) {}

  set(value: number, labels: Record<string, string> = {}): void {
    validateLabels(labels);
    const key = JSON.stringify(labels);
    this.entries.set(key, { value, labels });
  }

  inc(labels: Record<string, string> = {}, value = 1): void {
    validateLabels(labels);
    const key = JSON.stringify(labels);
    const existing = this.entries.get(key);
    if (existing) {
      existing.value += value;
    } else {
      this.entries.set(key, { value, labels });
    }
  }

  dec(labels: Record<string, string> = {}, value = 1): void {
    this.inc(labels, -value);
  }

  toPrometheus(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
    for (const entry of this.entries.values()) {
      lines.push(`${this.name}${labelString(entry.labels)} ${entry.value}`);
    }
    return lines.join('\n');
  }
}

// ─── Registry ───────────────────────────────────────────────────────────────

type Metric = Counter | Histogram | Gauge;

class Registry {
  private metrics = new Map<string, Metric>();

  register(name: string, metric: Metric): void {
    if (this.metrics.has(name)) {
      throw new Error(`Metric already registered: ${name}`);
    }
    this.metrics.set(name, metric);
  }

  get(name: string): Metric | undefined {
    return this.metrics.get(name);
  }

  toPrometheus(): string {
    const parts: string[] = [];
    for (const metric of this.metrics.values()) {
      parts.push(metric.toPrometheus());
    }
    return parts.join('\n\n');
  }
}

export const metricsRegistry = new Registry();
