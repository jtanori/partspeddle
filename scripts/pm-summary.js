#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── CLI args ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const ticketArg = args.find((_, i) => args[i - 1] === '--ticket');
const ticketIds = ticketArg ? ticketArg.split(',').map(s => s.trim()) : [];
const milestoneArg = args.find((_, i) => args[i - 1] === '--milestone') || args.find(a => a.startsWith('M') && !a.includes('.'));
const domainArg = args.find((_, i) => args[i - 1] === '--domain');
const allFlag = args.includes('--all') || (!ticketArg && !milestoneArg && !domainArg);
const fileFlag = args.includes('--file') || args.includes('-f');
const jsonFlag = args.includes('--json') || args.includes('-j');
const fullFlag = args.includes('--full');
const helpFlag = args.includes('--help') || args.includes('-h');

// ─── Scoped field access ────────────────────────────────────────────────────
function parseFieldArg() {
  const idx = args.findIndex(a => a === '--field');
  if (idx !== -1 && args[idx + 1]) return [args[idx + 1].trim()];
  return null;
}
function parseFieldsArg() {
  const idx = args.findIndex(a => a === '--fields');
  if (idx !== -1 && args[idx + 1]) return args[idx + 1].split(',').map(s => s.trim()).filter(Boolean);
  return null;
}
const singleField = parseFieldArg();
const multiFields = parseFieldsArg();
const fieldPaths = singleField || multiFields || null;

// ─── Dot-notation in ticket ID will be resolved after allTickets is loaded ──
let fieldFromTicket = null;

if (helpFlag) {
  console.log(`
pm-summary.js — Generate structured summaries of tickets, milestones, or the full project

USAGE:
  node scripts/pm-summary.js [options]

OPTIONS:
  --ticket <id>      Summary for a single ticket (e.g., T1.2)
  --milestone <id>   Summary for all tickets in a milestone (e.g., M1)
  --domain <name>    Summary for all tickets in a domain (e.g., Shared)
  --all              Summary for the entire project (default)
  --file, -f         Force output to temp file instead of stdout
  --json, -j         Output as JSON instead of plain text
  --full             Print all ticket fields (deliverables, criteria, traceability, etc.)
  --field <path>     Print a specific field only (e.g., deliverables, observability.metrics)
  --fields <paths>   Comma-separated list of fields to print
  --help, -h         Show this help

EXAMPLES:
  node scripts/pm-summary.js --ticket T1.2
  node scripts/pm-summary.js --milestone M1 --file
  node scripts/pm-summary.js --domain Shared --json
  node scripts/pm-summary.js --ticket T1.2 --full
  node scripts/pm-summary.js --ticket T1.2 --field deliverables
  node scripts/pm-summary.js --ticket T1.2 --fields title,domain,status
  node scripts/pm-summary.js --ticket T1.2 --field observability.metrics
  node scripts/pm-summary.js --all
`);
  process.exit(0);
}

// ─── Load data ──────────────────────────────────────────────────────────────
const milestones = JSON.parse(readFileSync(join(__dirname, '../project-management/data/milestones.json'), 'utf8'));

const ticketsDir = join(__dirname, '../project-management/data/tickets');
const allTickets = readdirSync(ticketsDir)
  .filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(readFileSync(join(ticketsDir, f), 'utf8')));

// Resolve dot-notation in ticket ID now that allTickets is loaded
// Syntax: T1.2.deliverables or T1.2.observability.metrics
if (ticketArg && ticketArg.includes('.') && ticketArg.split('.').length > 2) {
  const parts = ticketArg.split('.');
  const idParts = parts.slice(0, 2);
  const maybeId = idParts.join('.');
  if (allTickets.some(t => t.id === maybeId)) {
    fieldFromTicket = parts.slice(2).join('.');
    ticketIds[0] = maybeId;
  }
}

// ─── Determine scope ────────────────────────────────────────────────────────
let ticketsToSummarize = [];
let scopeLabel = '';

if (ticketIds.length > 0) {
  ticketsToSummarize = allTickets.filter(t => ticketIds.includes(t.id));
  const missing = ticketIds.filter(id => !allTickets.some(t => t.id === id));
  if (missing.length > 0) { console.error(`❌ Ticket(s) not found: ${missing.join(', ')}`); process.exit(1); }
  scopeLabel = ticketIds.length === 1 ? `Ticket ${ticketIds[0]}` : `Tickets: ${ticketIds.join(', ')}`;
} else if (milestoneArg) {
  ticketsToSummarize = allTickets.filter(t => t.milestone_id === milestoneArg);
  if (ticketsToSummarize.length === 0) { console.error(`❌ No tickets for milestone ${milestoneArg}`); process.exit(1); }
  const m = milestones.find(x => x.id === milestoneArg);
  scopeLabel = `Milestone ${milestoneArg}${m ? ` — ${m.title}` : ''}`;
} else if (domainArg) {
  ticketsToSummarize = allTickets.filter(t => t.domain === domainArg);
  if (ticketsToSummarize.length === 0) { console.error(`❌ No tickets for domain ${domainArg}`); process.exit(1); }
  scopeLabel = `Domain: ${domainArg}`;
} else {
  ticketsToSummarize = allTickets;
  scopeLabel = 'Full Project';
}

// Re-apply dot-notation field extraction after tickets are resolved
if (fieldFromTicket && ticketIds.length === 1) {
  Object.defineProperty(globalThis, '__pm_summary_field_paths', { value: [fieldFromTicket], writable: true, configurable: true });
}

// ─── Build summary ──────────────────────────────────────────────────────────
function buildTicketSummary(ticket) {
  const m = milestones.find(x => x.id === ticket.milestone_id);
  const depStatuses = (ticket.dependencies || []).map(did => {
    const d = allTickets.find(t => t.id === did);
    return { id: did, status: d ? d.status : 'missing' };
  });

  const deliverablesTotal = ticket.deliverables ? ticket.deliverables.filter(d => d.path && !d.path.includes('<')).length : 0;
  const deliverablesFound = ticket.deliverables ? ticket.deliverables.filter(d => {
    if (!d.path || d.path.includes('<')) return false;
    return existsSync(d.path);
  }).length : 0;

  const hasTests = ticket.deliverables ? ticket.deliverables.some(d => {
    if (!d.path || d.path.includes('<')) return false;
    if (d.type === 'test') return existsSync(d.path);
    const testPath = d.path.replace(/\.ts$/, '.test.ts');
    const dirTestPath = join(dirnamePath(d.path), '__tests__', basename(d.path).replace(/\.ts$/, '.test.ts'));
    return existsSync(testPath) || existsSync(dirTestPath);
  }) : false;

  return {
    id: ticket.id,
    title: ticket.title,
    milestone_id: ticket.milestone_id,
    milestone_title: m ? m.title : null,
    domain: ticket.domain,
    status: ticket.status,
    capability: ticket.capability,
    estimated_hours: ticket.estimated_hours,
    assignee: ticket.assignee,
    git_commit: ticket.git_commit,
    dependencies: depStatuses,
    deliverables: { total: deliverablesTotal, found: deliverablesFound },
    has_tests: hasTests,
    acceptance_criteria_count: ticket.acceptance_criteria ? ticket.acceptance_criteria.length : 0,
    traceability_count: ticket.traceability ? ticket.traceability.length : 0,
    failure_modes_count: ticket.failure_modes ? ticket.failure_modes.length : 0,
    metadata_version: ticket.metadata ? ticket.metadata.version : 1,
  };
}

function buildProjectSummary() {
  const byStatus = {};
  for (const t of allTickets) byStatus[t.status] = (byStatus[t.status] || 0) + 1;

  const byDomain = {};
  for (const t of allTickets) byDomain[t.domain] = (byDomain[t.domain] || 0) + 1;

  const totalHours = allTickets.reduce((s, t) => s + (t.estimated_hours || 0), 0);
  const completedHours = allTickets.filter(t => t.status === 'completed').reduce((s, t) => s + (t.estimated_hours || 0), 0);

  const milestoneSummaries = milestones.sort((a, b) => a.phase - b.phase).map(m => {
    const mTickets = allTickets.filter(t => t.milestone_id === m.id);
    const completed = mTickets.filter(t => t.status === 'completed').length;
    const blocked = mTickets.filter(t => t.status === 'blocked').length;
    return {
      id: m.id,
      title: m.title,
      status: m.status,
      progress: `${completed}/${mTickets.length}`,
      percent: mTickets.length ? Math.round((completed / mTickets.length) * 100) : 0,
      blocked,
      critical_path: ['M1','M2','M3','M6','M10'].includes(m.id),
    };
  });

  return {
    scope: 'Full Project',
    total_tickets: allTickets.length,
    total_milestones: milestones.length,
    total_estimated_hours: totalHours,
    completed_hours: completedHours,
    completion_percent: totalHours ? Math.round((completedHours / totalHours) * 100) : 0,
    by_status: byStatus,
    by_domain: byDomain,
    milestones: milestoneSummaries,
    critical_path: milestoneSummaries.filter(m => m.critical_path),
    blocked_tickets: allTickets.filter(t => t.status === 'blocked').map(t => ({ id: t.id, title: t.title, domain: t.domain })),
    in_progress: allTickets.filter(t => t.status === 'in_progress').map(t => ({ id: t.id, title: t.title, domain: t.domain })),
  };
}

function dirnamePath(p) {
  const sep = p.includes('/') ? '/' : '\\';
  const parts = p.split(sep);
  parts.pop();
  return parts.join(sep);
}

function basename(p) {
  const sep = p.includes('/') ? '/' : '\\';
  return p.split(sep).pop();
}

// ─── Format output ──────────────────────────────────────────────────────────
function formatText(ticketSummaries, projectSummary) {
  const lines = [];
  const now = new Date().toISOString();

  lines.push(`VINTRACK PROJECT SUMMARY`);
  lines.push(`Generated: ${now}`);
  lines.push(`Scope: ${scopeLabel}`);
  lines.push(`=`.repeat(80));

  if (projectSummary) {
    lines.push(`\n📊 PROJECT OVERVIEW`);
    lines.push(`  Total Tickets:        ${projectSummary.total_tickets}`);
    lines.push(`  Total Milestones:     ${projectSummary.total_milestones}`);
    lines.push(`  Estimated Hours:      ${projectSummary.total_estimated_hours}`);
    lines.push(`  Completed Hours:      ${projectSummary.completed_hours} (${projectSummary.completion_percent}%)`);
    lines.push(`\n  By Status:`);
    for (const [s, c] of Object.entries(projectSummary.by_status).sort((a, b) => b[1] - a[1])) {
      lines.push(`    ${s.padEnd(14)} ${c.toString().padStart(3)}`);
    }
    lines.push(`\n  By Domain:`);
    for (const [d, c] of Object.entries(projectSummary.by_domain).sort((a, b) => b[1] - a[1])) {
      lines.push(`    ${d.padEnd(20)} ${c.toString().padStart(3)}`);
    }

    lines.push(`\n📋 MILESTONES`);
    for (const m of projectSummary.milestones) {
      const bar = '█'.repeat(Math.round(m.percent / 10)) + '░'.repeat(10 - Math.round(m.percent / 10));
      const flag = m.blocked > 0 ? ' 🚨' : '';
      const cp = m.critical_path ? ' *' : '';
      lines.push(`  ${m.id} ${bar} ${m.percent.toString().padStart(3)}% ${m.status.padEnd(12)} ${m.progress.padStart(5)} ${m.title}${cp}${flag}`);
    }

    if (projectSummary.blocked_tickets.length > 0) {
      lines.push(`\n🚨 BLOCKED TICKETS`);
      for (const t of projectSummary.blocked_tickets) {
        lines.push(`  ${t.id} ${t.title} (${t.domain})`);
      }
    }

    if (projectSummary.in_progress.length > 0) {
      lines.push(`\n🎯 IN PROGRESS`);
      for (const t of projectSummary.in_progress) {
        lines.push(`  ${t.id} ${t.title} (${t.domain})`);
      }
    }
  }

  for (const s of ticketSummaries) {
    const ticket = ticketsToSummarize.find(t => t.id === s.id);
    lines.push(`\n${'─'.repeat(80)}`);
    lines.push(`${s.id} — ${s.title}`);
    lines.push(`  Status:      ${s.status}`);
    lines.push(`  Domain:      ${s.domain}`);
    lines.push(`  Milestone:   ${s.milestone_id}${s.milestone_title ? ' — ' + s.milestone_title : ''}`);
    lines.push(`  Capability:  ${s.capability}`);
    lines.push(`  Hours:       ${s.estimated_hours}`);
    lines.push(`  Assignee:    ${s.assignee || 'unassigned'}`);
    lines.push(`  Git Commit:  ${s.git_commit || 'none'}`);
    lines.push(`  Version:     ${s.metadata_version}`);
    lines.push(`  Deliverables: ${s.deliverables.found}/${s.deliverables.total} on disk`);
    lines.push(`  Tests:       ${s.has_tests ? 'yes' : 'no'}`);
    lines.push(`  Acceptance:  ${s.acceptance_criteria_count} criteria`);
    lines.push(`  Traceability: ${s.traceability_count} entries`);
    lines.push(`  Failure Modes: ${s.failure_modes_count} documented`);

    if (s.dependencies.length > 0) {
      lines.push(`  Dependencies:`);
      for (const d of s.dependencies) {
        const icon = d.status === 'completed' ? '✅' : d.status === 'review' ? '👀' : d.status === 'missing' ? '❌' : '⏳';
        lines.push(`    ${icon} ${d.id} — ${d.status}`);
      }
    }

    if (fullFlag && ticket) {
      if (ticket.purpose) {
        lines.push(`\n  📌 PURPOSE`);
        lines.push(`    ${ticket.purpose}`);
      }

      if (ticket.architectural_constraints && ticket.architectural_constraints.length > 0) {
        lines.push(`\n  🏗️  ARCHITECTURAL CONSTRAINTS`);
        for (const c of ticket.architectural_constraints) {
          lines.push(`    • ${c}`);
        }
      }

      if (ticket.deliverables && ticket.deliverables.length > 0) {
        lines.push(`\n  📁 DELIVERABLES`);
        for (const d of ticket.deliverables) {
          const exists = d.path && !d.path.includes('<') ? (existsSync(d.path) ? '✅' : '❌') : '⏸️';
          lines.push(`    ${exists} [${d.type}] ${d.path}`);
          lines.push(`       ${d.description}`);
        }
      }

      if (ticket.acceptance_criteria && ticket.acceptance_criteria.length > 0) {
        lines.push(`\n  ✅ ACCEPTANCE CRITERIA`);
        for (let i = 0; i < ticket.acceptance_criteria.length; i++) {
          lines.push(`    ${i + 1}. ${ticket.acceptance_criteria[i]}`);
        }
      }

      if (ticket.traceability && ticket.traceability.length > 0) {
        lines.push(`\n  🔗 TRACEABILITY`);
        for (const tr of ticket.traceability) {
          lines.push(`    Commit: ${tr.commit_hash}`);
          lines.push(`    Time:   ${tr.timestamp}`);
          lines.push(`    Desc:   ${tr.description}`);
          if (tr.files_changed && tr.files_changed.length > 0) {
            for (const f of tr.files_changed) {
              lines.push(`      • ${f}`);
            }
          }
          lines.push('');
        }
      }

      if (ticket.failure_modes && ticket.failure_modes.length > 0) {
        lines.push(`\n  ⚠️  FAILURE MODES`);
        for (const fm of ticket.failure_modes) {
          lines.push(`    [${fm.severity.toUpperCase()}] ${fm.scenario}`);
          lines.push(`      Mitigation: ${fm.mitigation}`);
        }
      }

      if (ticket.observability) {
        const obs = ticket.observability;
        const hasObs = (obs.metrics && obs.metrics.length) || (obs.logs && obs.logs.length) || (obs.traces && obs.traces.length);
        if (hasObs) {
          lines.push(`\n  📡 OBSERVABILITY`);
          if (obs.metrics && obs.metrics.length > 0) {
            lines.push(`    Metrics:`);
            for (const m of obs.metrics) lines.push(`      • ${m}`);
          }
          if (obs.logs && obs.logs.length > 0) {
            lines.push(`    Logs:`);
            for (const l of obs.logs) lines.push(`      • ${l}`);
          }
          if (obs.traces && obs.traces.length > 0) {
            lines.push(`    Traces:`);
            for (const t of obs.traces) lines.push(`      • ${t}`);
          }
        }
      }
    }
  }

  lines.push(`\n${'='.repeat(80)}`);
  return lines.join('\n');
}

function formatJSON(ticketSummaries, projectSummary) {
  const now = new Date().toISOString();
  const payload = {
    generated_at: now,
    scope: scopeLabel,
    project_summary: projectSummary || undefined,
    tickets: fullFlag ? ticketsToSummarize : ticketSummaries,
    count: ticketSummaries.length,
  };
  return JSON.stringify(payload, null, 2);
}

// ─── Generate output ────────────────────────────────────────────────────────
// ─── Field value extraction ─────────────────────────────────────────────────
function getFieldValue(obj, path) {
  const keys = path.split('.');
  let val = obj;
  for (const key of keys) {
    if (val === null || val === undefined) return undefined;
    val = val[key];
  }
  return val;
}

function formatFieldText(tickets, paths) {
  const lines = [];
  for (const ticket of tickets) {
    if (tickets.length > 1) lines.push(`${ticket.id}:`);
    for (const path of paths) {
      const val = getFieldValue(ticket, path);
      if (val === undefined) {
        lines.push(`  ${path}: <undefined>`);
      } else if (Array.isArray(val)) {
        lines.push(`  ${path}:`);
        for (const item of val) {
          if (typeof item === 'object' && item !== null) {
            lines.push(`    - ${JSON.stringify(item)}`);
          } else {
            lines.push(`    - ${item}`);
          }
        }
      } else if (typeof val === 'object' && val !== null) {
        lines.push(`  ${path}:`);
        for (const [k, v] of Object.entries(val)) {
          lines.push(`    ${k}: ${JSON.stringify(v)}`);
        }
      } else {
        lines.push(`  ${path}: ${val}`);
      }
    }
  }
  return lines.join('\n');
}

function formatFieldJSON(tickets, paths) {
  const out = [];
  for (const ticket of tickets) {
    const entry = { id: ticket.id };
    for (const path of paths) {
      entry[path] = getFieldValue(ticket, path);
    }
    out.push(entry);
  }
  return JSON.stringify(out.length === 1 ? out[0] : out, null, 2);
}

// ─── Resolve effective field paths (CLI args + dot-notation override) ───────
const effectiveFieldPaths = globalThis.__pm_summary_field_paths || fieldPaths;

const ticketSummaries = ticketsToSummarize.map(buildTicketSummary);
const projectSummary = allFlag ? buildProjectSummary() : null;

let outputText;
if (effectiveFieldPaths && ticketIds.length > 0) {
  outputText = jsonFlag
    ? formatFieldJSON(ticketsToSummarize, effectiveFieldPaths)
    : formatFieldText(ticketsToSummarize, effectiveFieldPaths);
} else {
  outputText = jsonFlag ? formatJSON(ticketSummaries, projectSummary) : formatText(ticketSummaries, projectSummary);
}
const lineCount = outputText.split('\n').length;
const byteSize = Buffer.byteLength(outputText, 'utf8');

// ─── Output routing ─────────────────────────────────────────────────────────
const LARGE_LINE_THRESHOLD = 80;
const LARGE_BYTE_THRESHOLD = 8 * 1024;

const isLarge = lineCount > LARGE_LINE_THRESHOLD || byteSize > LARGE_BYTE_THRESHOLD;

if (fileFlag || isLarge) {
  // Write to project-knowledge/reports/ for persistence and searchability
  const reportsDir = join(__dirname, '../project-knowledge/reports');
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });

  const ext = jsonFlag ? 'json' : 'txt';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const scopeSlug = scopeLabel.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const fieldSlug = effectiveFieldPaths ? '_fields-' + effectiveFieldPaths.join('_') : '';
  const fileName = `vintrack-summary-${scopeSlug}${fieldSlug}-${timestamp}.${ext}`;
  const filePath = join(reportsDir, fileName);

  writeFileSync(filePath, outputText);

  console.log(`Output written to report file:`);
  console.log(`  ${filePath}`);
  console.log(`  Lines: ${lineCount}  Size: ${(byteSize / 1024).toFixed(1)} KB`);

  if (isLarge && !fileFlag) {
    console.log(`\n(Auto-redirected to file because output exceeds ${LARGE_LINE_THRESHOLD} lines / ${(LARGE_BYTE_THRESHOLD/1024).toFixed(0)} KB)`);
    console.log(`Use --file to force file output, or pipe to less: npm run pm:summary -- --all | less`);
  }
} else {
  console.log(outputText);
}
