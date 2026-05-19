#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── CLI args ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const ticketArg = args.find((_, i) => args[i - 1] === '--ticket') || args.find(a => a.startsWith('T') && a.includes('.'));
const milestoneArg = args.find((_, i) => args[i - 1] === '--milestone') || args.find(a => a.startsWith('M') && !a.includes('.'));
const domainArg = args.find((_, i) => args[i - 1] === '--domain');
const allFlag = args.includes('--all') || (!ticketArg && !milestoneArg && !domainArg);
const fileFlag = args.includes('--file') || args.includes('-f');
const jsonFlag = args.includes('--json') || args.includes('-j');
const helpFlag = args.includes('--help') || args.includes('-h');

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
  --help, -h         Show this help

EXAMPLES:
  node scripts/pm-summary.js --ticket T1.2
  node scripts/pm-summary.js --milestone M1 --file
  node scripts/pm-summary.js --domain Shared --json
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

// ─── Determine scope ────────────────────────────────────────────────────────
let ticketsToSummarize = [];
let scopeLabel = '';

if (ticketArg) {
  const t = allTickets.find(x => x.id === ticketArg);
  if (!t) { console.error(`❌ Ticket ${ticketArg} not found`); process.exit(1); }
  ticketsToSummarize = [t];
  scopeLabel = `Ticket ${t.id}`;
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
  }

  lines.push(`\n${'='.repeat(80)}`);
  return lines.join('\n');
}

function formatJSON(ticketSummaries, projectSummary) {
  const now = new Date().toISOString();
  return JSON.stringify({
    generated_at: now,
    scope: scopeLabel,
    project_summary: projectSummary || undefined,
    tickets: ticketSummaries,
    count: ticketSummaries.length,
  }, null, 2);
}

// ─── Generate output ────────────────────────────────────────────────────────
const ticketSummaries = ticketsToSummarize.map(buildTicketSummary);
const projectSummary = allFlag ? buildProjectSummary() : null;

const outputText = jsonFlag ? formatJSON(ticketSummaries, projectSummary) : formatText(ticketSummaries, projectSummary);
const lineCount = outputText.split('\n').length;
const byteSize = Buffer.byteLength(outputText, 'utf8');

// ─── Output routing ─────────────────────────────────────────────────────────
const LARGE_LINE_THRESHOLD = 80;
const LARGE_BYTE_THRESHOLD = 8 * 1024;

const isLarge = lineCount > LARGE_LINE_THRESHOLD || byteSize > LARGE_BYTE_THRESHOLD;

if (fileFlag || isLarge) {
  // Write to temp directory
  const tmpDir = join(tmpdir(), 'vintrack');
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

  const ext = jsonFlag ? 'json' : 'txt';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const scopeSlug = scopeLabel.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const fileName = `vintrack-summary-${scopeSlug}-${timestamp}.${ext}`;
  const filePath = join(tmpDir, fileName);

  writeFileSync(filePath, outputText);

  console.log(`Output written to temp file:`);
  console.log(`  ${filePath}`);
  console.log(`  Lines: ${lineCount}  Size: ${(byteSize / 1024).toFixed(1)} KB`);

  if (isLarge && !fileFlag) {
    console.log(`\n(Auto-redirected to file because output exceeds ${LARGE_LINE_THRESHOLD} lines / ${(LARGE_BYTE_THRESHOLD/1024).toFixed(0)} KB)`);
    console.log(`Use --file to force file output, or pipe to less: npm run pm:summary -- --all | less`);
  }
} else {
  console.log(outputText);
}
