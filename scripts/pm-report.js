#!/usr/bin/env node
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const milestones = JSON.parse(readFileSync(join(__dirname, '../project-management/data/milestones.json'), 'utf8'));

// Load tickets from individual files
const ticketsDir = join(__dirname, '../project-management/data/tickets');
const tickets = readdirSync(ticketsDir)
  .filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(readFileSync(join(ticketsDir, f), 'utf8')));

const args = process.argv.slice(2);
const format = args.includes('--json') ? 'json' : 'markdown';

const now = new Date().toISOString();
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

// Markdown report
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
