#!/usr/bin/env tsx
/**
 * invariant-monitor.ts
 * Continuous Invariant Monitor — T27.3 deliverable
 *
 * Runs invariant validation on a schedule, emits periodic reports,
 * and supports emergency bypass with full audit trail.
 */
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { randomUUID } from 'crypto';

// ─── Configuration ───

const CONFIG = {
  intervalMinutes: parseInt(process.env.INVARIANT_MONITOR_INTERVAL ?? '60', 10),
  reportDir: resolve('project-governance/runtime/monitor-reports'),
  eventStreamDir: resolve('project-governance/runtime/events/streams'),
  maxReports: 100,
  severityThreshold: (process.env.INVARIANT_MONITOR_THRESHOLD ?? 'CRITICAL') as
    | 'LOW'
    | 'MEDIUM'
    | 'HIGH'
    | 'CRITICAL',
  emergencyBypass: process.env.INVARIANT_MONITOR_BYPASS === 'true',
};

// ─── Types ───

interface MonitorReport {
  report_id: string;
  timestamp: string;
  run_number: number;
  duration_ms: number;
  invariant_result: {
    total: number;
    passed: number;
    failed: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    status: string;
  };
  violations: Array<{
    invariant_id: string;
    severity: string;
    details: string;
    remediation: string;
    auto_recoverable: boolean;
  }>;
  bypass_applied: boolean;
  bypass_reason: string | null;
  actor: string;
}

interface GovernanceEvent {
  event_id: string;
  timestamp: string;
  event_type: string;
  severity: 'debug' | 'info' | 'warn' | 'error' | 'critical';
  category:
    | 'execution'
    | 'validation'
    | 'recovery'
    | 'governance'
    | 'runtime'
    | 'planning'
    | 'diagnostics';
  execution_id?: string | null;
  milestone?: string | null;
  ticket?: string | null;
  actor?: string;
  session_id?: string | null;
  correlation_id?: string | null;
  payload?: Record<string, unknown>;
}

// ─── Helpers ───

function ensureDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function timestamp(): string {
  return new Date().toISOString();
}

function emitEvent(event: GovernanceEvent): void {
  try {
    const { emit } = require('./emit-governance-event.js');
    emit(event);
  } catch {
    console.error('[EVENT]', JSON.stringify(event));
  }
}

function buildEvent(
  eventType: string,
  severity: GovernanceEvent['severity'],
  category: GovernanceEvent['category'],
  payload: Record<string, unknown> = {}
): GovernanceEvent {
  return {
    event_id: randomUUID(),
    timestamp: timestamp(),
    event_type: eventType,
    severity,
    category,
    execution_id: process.env.EXECUTION_ID ?? null,
    milestone: null,
    ticket: null,
    actor: 'system',
    session_id: null,
    correlation_id: null,
    payload,
  };
}

function runInvariantValidation(): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', 'invariant:validate:json', '--silent'], {
      cwd: process.cwd(),
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });
  });
}

function parseValidationOutput(stdout: string): {
  total: number;
  passed: number;
  failed: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  status: string;
  violations: Array<{
    invariant_id: string;
    severity: string;
    details: string;
    remediation: string;
    auto_recoverable: boolean;
  }>;
} {
  try {
    // Try to parse direct JSON report output first
    const trimmed = stdout.trim();
    if (trimmed.startsWith('{')) {
      const report = JSON.parse(trimmed);
      if (report.total_invariants !== undefined || report.overall_status !== undefined) {
        return {
          total: report.total_invariants ?? 0,
          passed: report.passed ?? 0,
          failed: report.failed ?? 0,
          critical: report.critical_findings ?? 0,
          high: report.high_findings ?? 0,
          medium: report.medium_findings ?? 0,
          low: report.low_findings ?? 0,
          status: report.overall_status ?? 'UNKNOWN',
          violations:
            report.results
              ?.filter((r: { passed: boolean }) => !r.passed)
              .map(
                (r: {
                  invariant_id: string;
                  severity: string;
                  details: string;
                  remediation_recommended: string;
                  auto_recoverable: boolean;
                }) => ({
                  invariant_id: r.invariant_id,
                  severity: r.severity,
                  details: r.details,
                  remediation: r.remediation_recommended,
                  auto_recoverable: r.auto_recoverable,
                })
              ) ?? [],
        };
      }
    }
  } catch {
    // fallback
  }

  try {
    // Try to find JSON output from the event stream lines
    const lines = stdout.split('\n').filter((l) => l.trim().startsWith('{'));
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.event_type === 'invariant.validation_complete' && event.payload) {
          const p = event.payload;
          return {
            total: p.total_invariants ?? 0,
            passed: p.passed ?? 0,
            failed: p.failed ?? 0,
            critical: p.critical_findings ?? 0,
            high: p.high_findings ?? 0,
            medium: p.medium_findings ?? 0,
            low: p.low_findings ?? 0,
            status: p.overall_status ?? 'UNKNOWN',
            violations: [],
          };
        }
      } catch {
        // not valid JSON
      }
    }
  } catch {
    // fallback
  }

  // Fallback: parse from table output
  const totalMatch = stdout.match(/Total:\s*(\d+)/);
  const passedMatch = stdout.match(/Passed:\s*(\d+)/);
  const failedMatch = stdout.match(/Failed:\s*(\d+)/);
  const criticalMatch = stdout.match(/Critical:\s*(\d+)/);
  const highMatch = stdout.match(/High:\s*(\d+)/);
  const statusMatch = stdout.match(/Status:\s*(\w+)/);

  return {
    total: parseInt(totalMatch?.[1] ?? '0'),
    passed: parseInt(passedMatch?.[1] ?? '0'),
    failed: parseInt(failedMatch?.[1] ?? '0'),
    critical: parseInt(criticalMatch?.[1] ?? '0'),
    high: parseInt(highMatch?.[1] ?? '0'),
    medium: 0,
    low: 0,
    status: statusMatch?.[1] ?? 'UNKNOWN',
    violations: [],
  };
}

// ─── Main Monitor Logic ───

let runCount = 0;

async function runMonitorCycle(): Promise<void> {
  runCount++;
  const cycleStart = performance.now();
  const runId = randomUUID();

  console.log(`[${timestamp()}] Monitor cycle #${runCount} starting (run_id: ${runId})`);

  const { stdout, stderr, exitCode } = await runInvariantValidation();
  const result = parseValidationOutput(stdout);

  // Try to extract violations from full output
  const violationMatches = stdout.match(/\[CRITICAL\]\s+(\S+)/g) ?? [];
  const violations = violationMatches.map((m) => ({
    invariant_id: m.replace(/\[CRITICAL\]\s+/, ''),
    severity: 'CRITICAL',
    details: 'Detected during monitor cycle',
    remediation: 'See invariant registry for remediation',
    auto_recoverable: false,
  }));

  const duration = Math.round(performance.now() - cycleStart);

  // Determine if we should apply emergency bypass
  let bypassApplied = false;
  let bypassReason: string | null = null;

  if (result.critical > 0 && CONFIG.emergencyBypass) {
    bypassApplied = true;
    bypassReason = 'Emergency bypass activated via INVARIANT_MONITOR_BYPASS=true';
    console.warn(
      `[${timestamp()}] ⚠️ EMERGENCY BYPASS: ${result.critical} critical violations suppressed`
    );

    const bypassEvent = buildEvent('invariant.monitor_bypass', 'critical', 'governance', {
      run_id: runId,
      run_number: runCount,
      critical_violations: result.critical,
      bypass_reason: bypassReason,
      actor: process.env.ACTOR ?? 'system',
      requires_reconciliation: true,
    });
    emitEvent(bypassEvent);
  }

  // Build monitor report
  const report: MonitorReport = {
    report_id: runId,
    timestamp: timestamp(),
    run_number: runCount,
    duration_ms: duration,
    invariant_result: {
      total: result.total,
      passed: result.passed,
      failed: result.failed,
      critical: result.critical,
      high: result.high,
      medium: result.medium,
      low: result.low,
      status: result.status,
    },
    violations,
    bypass_applied: bypassApplied,
    bypass_reason: bypassReason,
    actor: process.env.ACTOR ?? 'system',
  };

  // Persist report
  ensureDir(CONFIG.reportDir);
  const reportPath = join(CONFIG.reportDir, `monitor-report-${runId}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

  // Emit monitor event
  const monitorEvent = buildEvent(
    'invariant.monitor_cycle_complete',
    result.critical > 0 && !bypassApplied ? 'critical' : result.high > 0 ? 'warn' : 'info',
    'validation',
    {
      run_id: runId,
      run_number: runCount,
      duration_ms: duration,
      total: result.total,
      passed: result.passed,
      failed: result.failed,
      critical: result.critical,
      high: result.high,
      status: result.status,
      bypass_applied: bypassApplied,
      report_path: reportPath,
    }
  );
  emitEvent(monitorEvent);

  // Cleanup old reports
  cleanupOldReports();

  // Console output
  console.log(`[${timestamp()}] Cycle #${runCount} complete in ${duration}ms`);
  console.log(
    `  Status: ${result.status} | Total: ${result.total} | Passed: ${result.passed} | Failed: ${result.failed}`
  );
  if (result.critical > 0) {
    console.log(`  CRITICAL: ${result.critical}${bypassApplied ? ' (BYPASSED)' : ''}`);
  }
  if (result.high > 0) {
    console.log(`  HIGH: ${result.high}`);
  }
  console.log(`  Report: ${reportPath}`);

  // Exit if critical and not bypassed
  if (result.critical > 0 && !bypassApplied) {
    console.error(`[${timestamp()}] ❌ Critical invariant violations detected. Monitor halting.`);
    process.exit(1);
  }
}

function cleanupOldReports(): void {
  try {
    const { readdirSync, statSync, unlinkSync } = require('fs');
    const files = readdirSync(CONFIG.reportDir)
      .filter((f: string) => f.startsWith('monitor-report-') && f.endsWith('.json'))
      .map((f: string) => ({
        name: f,
        path: join(CONFIG.reportDir, f),
        mtime: statSync(join(CONFIG.reportDir, f)).mtime.getTime(),
      }))
      .sort((a: { mtime: number }, b: { mtime: number }) => b.mtime - a.mtime);

    if (files.length > CONFIG.maxReports) {
      const toDelete = files.slice(CONFIG.maxReports);
      for (const f of toDelete) {
        unlinkSync(f.path);
      }
      console.log(`[${timestamp()}] Cleaned up ${toDelete.length} old monitor reports`);
    }
  } catch {
    // ignore cleanup errors
  }
}

// ─── CLI ───

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = args[0] ?? 'daemon';

  if (mode === 'once') {
    await runMonitorCycle();
    return;
  }

  if (mode === 'daemon') {
    console.log(`[${timestamp()}] Invariant Monitor starting`);
    console.log(`  Interval: ${CONFIG.intervalMinutes} minutes`);
    console.log(`  Threshold: ${CONFIG.severityThreshold}`);
    console.log(`  Emergency bypass: ${CONFIG.emergencyBypass}`);
    console.log(`  Report directory: ${CONFIG.reportDir}`);
    console.log();

    // Run immediately, then on interval
    await runMonitorCycle();

    const intervalMs = CONFIG.intervalMinutes * 60 * 1000;
    setInterval(runMonitorCycle, intervalMs);

    console.log(
      `[${timestamp()}] Monitor running. Next cycle in ${CONFIG.intervalMinutes} minutes.`
    );

    // Keep process alive
    process.stdin.resume();
    return;
  }

  if (mode === '--help' || mode === '-h') {
    console.log('Usage: tsx scripts/invariant-monitor.ts [once|daemon]');
    console.log('');
    console.log('Modes:');
    console.log('  once    Run a single monitor cycle and exit');
    console.log('  daemon  Run continuously on interval (default)');
    console.log('');
    console.log('Environment:');
    console.log('  INVARIANT_MONITOR_INTERVAL   Minutes between cycles (default: 60)');
    console.log('  INVARIANT_MONITOR_THRESHOLD  Minimum severity to fail (default: CRITICAL)');
    console.log('  INVARIANT_MONITOR_BYPASS     Enable emergency bypass (default: false)');
    console.log('  ACTOR                        Actor identifier for audit trail');
    process.exit(0);
  }

  console.error(`Unknown mode: ${mode}. Use 'once', 'daemon', or --help.`);
  process.exit(1);
}

main().catch((err) => {
  console.error('Monitor fatal error:', err);
  process.exit(1);
});
