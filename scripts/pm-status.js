#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load milestones via registry
const registry = JSON.parse(readFileSync(join(__dirname, '../project-management/data/milestones.registry.json'), 'utf8'));
const milestones = [];
for (const file of registry.files || []) {
  const filePath = join(__dirname, '..', file);
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

const statusColors = {
  completed: '\x1b[32m',
  in_progress: '\x1b[33m',
  planned: '\x1b[90m',
  blocked: '\x1b[31m',
  review: '\x1b[36m'
};
const reset = '\x1b[0m';

function color(status) {
  return (statusColors[status] || '') + status + reset;
}

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║              VINTRACK PROJECT STATUS REPORT                      ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

// Summary
const total = tickets.length;
const byStatus = {};
for (const t of tickets) {
  byStatus[t.status] = (byStatus[t.status] || 0) + 1;
}

console.log('📊 OVERVIEW');
console.log(`   Total tickets: ${total}`);
for (const [s, c] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) {
  const pct = ((c / total) * 100).toFixed(1);
  console.log(`   ${color(s)}: ${c} (${pct}%)`);
}
console.log();

// Milestones
console.log('📋 MILESTONES');
for (const m of milestones.sort((a, b) => a.phase - b.phase)) {
  const mTickets = tickets.filter(t => t.milestone_id === m.id);
  const completed = mTickets.filter(t => t.status === 'completed').length;
  const blocked = mTickets.filter(t => t.status === 'blocked').length;
  const pct = mTickets.length ? ((completed / mTickets.length) * 100).toFixed(0) : 0;
  const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
  const flag = blocked > 0 ? ' 🚨' : '';
  console.log(`   ${m.id} ${bar} ${pct}% ${color(m.status)} ${completed}/${mTickets.length} ${m.title}${flag}`);
}
console.log();

// Critical path
console.log('🛤️  CRITICAL PATH');
const criticalPath = ['M1','M2','M3','M6','M10'];
for (const mid of criticalPath) {
  const m = milestones.find(x => x.id === mid);
  const mTickets = tickets.filter(t => t.milestone_id === mid);
  const completed = mTickets.filter(t => t.status === 'completed').length;
  const blocked = mTickets.filter(t => t.status === 'blocked').length;
  const icon = m.status === 'completed' ? '✅' : blocked > 0 ? '🚨' : m.status === 'in_progress' ? '🔄' : '⏳';
  console.log(`   ${icon} ${mid}: ${m.title} (${completed}/${mTickets.length}) ${color(m.status)}`);
}
console.log();

// Blocked items
const blockedTickets = tickets.filter(t => t.status === 'blocked');
if (blockedTickets.length > 0) {
  console.log('🚨 BLOCKED');
  for (const t of blockedTickets) {
    console.log(`   ${t.id}: ${t.title}`);
  }
  console.log();
}

// Next up (in_progress or first planned)
console.log('🎯 IN PROGRESS / NEXT UP');
const inProgress = tickets.filter(t => t.status === 'in_progress');
if (inProgress.length > 0) {
  for (const t of inProgress) {
    console.log(`   🔄 ${t.id}: ${t.title} (${t.domain})`);
  }
} else {
  const nextPlanned = tickets.find(t => t.status === 'planned');
  if (nextPlanned) {
    console.log(`   ⏳ ${nextPlanned.id}: ${nextPlanned.title} (${nextPlanned.domain})`);
  }
}
console.log();
