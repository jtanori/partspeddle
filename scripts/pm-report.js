#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Load milestones via registry ────────────────────────────────────────────
const registry = JSON.parse(readFileSync(join(__dirname, '../project-management/data/milestones.registry.json'), 'utf8'));
const milestones = [];
for (const file of registry.files || []) {
  const filePath = resolve(file);
  if (existsSync(filePath)) {
    const domain = JSON.parse(readFileSync(filePath, 'utf8'));
    if (Array.isArray(domain)) milestones.push(...domain);
  }
}

// Load tickets from individual files
const ticketsDir = join(__dirname, '../project-management/data/tickets');
const tickets = readdirSync(ticketsDir)
  .filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(readFileSync(join(ticketsDir, f), 'utf8')));

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const format = args.includes('--json') ? 'json' : 'markdown';
const milestoneArg = args.find((_, i) => args[i - 1] === '--milestone');

const now = new Date().toISOString();

// ─── Milestone-scoped report ─────────────────────────────────────────────────
if (milestoneArg) {
  const m = milestones.find(x => x.id === milestoneArg);
  if (!m) {
    console.error(`❌ Milestone ${milestoneArg} not found`);
    process.exit(1);
  }

  const mTickets = tickets.filter(t => t.milestone_id === m.id);
  const completed = mTickets.filter(t => t.status === 'completed');
  const inProgress = mTickets.filter(t => t.status === 'in_progress');
  const planned = mTickets.filter(t => t.status === 'planned');
  const blocked = mTickets.filter(t => t.status === 'blocked');
  const review = mTickets.filter(t => t.status === 'review');

  const totalHours = mTickets.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
  const completedHours = completed.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);

  // Deliverables status check
  const deliverablesStatus = mTickets.flatMap(t =>
    (t.deliverables || []).map(d => ({
      ticket: t.id,
      path: d.path,
      description: d.description,
      type: d.type,
      exists: existsSync(join(__dirname, '..', d.path))
    }))
  );

  // Dependency health
  const depHealth = mTickets.map(t => ({
    ticket: t.id,
    dependencies: t.dependencies || [],
    resolved: (t.dependencies || []).every(depId => {
      const dep = tickets.find(x => x.id === depId);
      return dep && (dep.status === 'completed' || dep.status === 'review');
    })
  }));

  if (format === 'json') {
    console.log(JSON.stringify({
      generated_at: now,
      milestone: { id: m.id, title: m.title, status: m.status, phase: m.phase },
      summary: {
        total_tickets: mTickets.length,
        completed: completed.length,
        in_progress: inProgress.length,
        planned: planned.length,
        blocked: blocked.length,
        review: review.length,
        total_hours: totalHours,
        completed_hours: completedHours,
        percent_complete: mTickets.length > 0 ? Math.round((completed.length / mTickets.length) * 100) : 0
      },
      tickets: mTickets.map(t => ({
        id: t.id, title: t.title, status: t.status,
        domain: t.domain, estimated_hours: t.estimated_hours,
        dependencies: t.dependencies || []
      })),
      deliverables: deliverablesStatus,
      dependency_health: depHealth
    }, null, 2));
    process.exit(0);
  }

  // Markdown milestone report
  console.log(`# Milestone Report: ${m.id} — ${m.title}`);
  console.log(`\n**Generated:** ${now}`);
  console.log(`\n**Status:** ${m.status} | **Phase:** ${m.phase}`);
  console.log(`\n## Summary`);
  console.log(`\n| Metric | Value |`);
  console.log(`|--------|-------|`);
  console.log(`| Total Tickets | ${mTickets.length} |`);
  console.log(`| Completed | ${completed.length} |`);
  console.log(`| In Progress | ${inProgress.length} |`);
  console.log(`| Planned | ${planned.length} |`);
  console.log(`| Blocked | ${blocked.length} |`);
  console.log(`| Review | ${review.length} |`);
  console.log(`| Total Hours | ${totalHours} |`);
  console.log(`| Completed Hours | ${completedHours} (${mTickets.length > 0 ? ((completedHours/totalHours)*100).toFixed(1) : 0}%) |`);
  console.log(`| Progress | ${mTickets.length > 0 ? Math.round((completed.length / mTickets.length) * 100) : 0}% |`);

  console.log(`\n## Tickets`);
  console.log(`\n| ID | Title | Status | Domain | Hours |`);
  console.log(`|----|-------|--------|--------|-------|`);
  for (const t of mTickets.sort((a, b) => a.id.localeCompare(b.id))) {
    const statusEmoji = { completed: '✅', in_progress: '🔄', planned: '⏳', blocked: '🚨', review: '👀' }[t.status] || '⏳';
    console.log(`| ${t.id} | ${t.title} | ${statusEmoji} ${t.status} | ${t.domain} | ${t.estimated_hours || '-'} |`);
  }

  console.log(`\n## Deliverables Status`);
  console.log(`\n| Ticket | Path | Type | Exists |`);
  console.log(`|--------|------|------|--------|`);
  for (const d of deliverablesStatus) {
    console.log(`| ${d.ticket} | ${d.path} | ${d.type} | ${d.exists ? '✅' : '❌'} |`);
  }

  console.log(`\n## Dependency Health`);
  console.log(`\n| Ticket | Dependencies | Status |`);
  console.log(`|--------|--------------|--------|`);
  for (const d of depHealth) {
    const depStr = d.dependencies.join(', ') || 'None';
    console.log(`| ${d.ticket} | ${depStr} | ${d.resolved ? '✅' : '⚠️ unresolved'} |`);
  }

  if (m.exit_criteria) {
    console.log(`\n## Exit Criteria`);
    for (const ec of m.exit_criteria) {
      console.log(`- ${ec}`);
    }
  }

  process.exit(0);
}

// ─── Full project report (default) ───────────────────────────────────────────
const total = tickets.length;
const byStatus = {};
for (const t of tickets) byStatus[t.status] = (byStatus[t.status] || 0) + 1;

const byDomain = {};
for (const t of tickets) byDomain[t.domain] = (byDomain[t.domain] || 0) + 1;

const totalHours = tickets.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
const completedHours = tickets.filter(t => t.status === 'completed').reduce((sum, t) => sum + (t.estimated_hours || 0), 0);

if (format === 'json') {
  console.log(JSON.stringify({
    generated_at: now,
    summary: { total_tickets: total, by_status: byStatus, by_domain: byDomain, total_hours: totalHours, completed_hours: completedHours },
    milestones: milestones.map(m => ({
      id: m.id, title: m.title, status: m.status,
      tickets_total: m.tickets.length,
      tickets_completed: tickets.filter(t => t.milestone_id === m.id && t.status === 'completed').length
    })),
    tickets: tickets.map(t => ({
      id: t.id, milestone_id: t.milestone_id, title: t.title,
      domain: t.domain, status: t.status, estimated_hours: t.estimated_hours
    }))
  }, null, 2));
  process.exit(0);
}

// Markdown full report
console.log(`# Project Status Report`);
console.log(`\n**Generated:** ${now}`);
console.log(`\n## Summary`);
console.log(`\n| Metric | Value |`);
console.log(`|--------|-------|`);
console.log(`| Total Tickets | ${total} |`);
console.log(`| Total Estimated Hours | ${totalHours} |`);
console.log(`| Completed Hours | ${completedHours} (${((completedHours/totalHours)*100).toFixed(1)}%) |`);
console.log(`| Completed | ${byStatus.completed || 0} |`);
console.log(`| In Progress | ${byStatus.in_progress || 0} |`);
console.log(`| Review | ${byStatus.review || 0} |`);
console.log(`| Blocked | ${byStatus.blocked || 0} |`);
console.log(`| Planned | ${byStatus.planned || 0} |`);

console.log(`\n## Milestones`);
console.log(`\n| ID | Title | Status | Progress |`);
console.log(`|----|-------|--------|----------|`);
for (const m of milestones.sort((a, b) => a.phase - b.phase)) {
  const completed = tickets.filter(t => t.milestone_id === m.id && t.status === 'completed').length;
  console.log(`| ${m.id} | ${m.title} | ${m.status} | ${completed}/${m.tickets.length} |`);
}

console.log(`\n## Critical Path`);
console.log(`\n| Milestone | Title | Status |`);
console.log(`|-----------|-------|--------|`);
const criticalPath = ['M1','M2','M3','M6','M10'];
for (const mid of criticalPath) {
  const m = milestones.find(x => x.id === mid);
  console.log(`| ${m.id} | ${m.title} | ${m.status} |`);
}

console.log(`\n## Blocked Tickets`);
const blocked = tickets.filter(t => t.status === 'blocked');
if (blocked.length === 0) {
  console.log(`\n_None_`);
} else {
  console.log(`\n| ID | Title | Domain |`);
  console.log(`|----|-------|--------|`);
  for (const t of blocked) {
    console.log(`| ${t.id} | ${t.title} | ${t.domain} |`);
  }
}

console.log(`\n## Domain Distribution`);
console.log(`\n| Domain | Tickets |`);
console.log(`|--------|---------|`);
for (const [d, c] of Object.entries(byDomain).sort((a, b) => b[1] - a[1])) {
  console.log(`| ${d} | ${c} |`);
}
