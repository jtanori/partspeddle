#!/usr/bin/env node
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

const milestoneSchema = JSON.parse(readFileSync(join(__dirname, '../project-management/schemas/milestone.schema.json'), 'utf8'));
const ticketSchema = JSON.parse(readFileSync(join(__dirname, '../project-management/schemas/ticket.schema.json'), 'utf8'));
const dependencyGraphSchema = JSON.parse(readFileSync(join(__dirname, '../project-management/schemas/dependency-graph.schema.json'), 'utf8'));
const sequenceSchema = JSON.parse(readFileSync(join(__dirname, '../project-management/schemas/sequence.schema.json'), 'utf8'));
const riskRegisterSchema = JSON.parse(readFileSync(join(__dirname, '../project-management/schemas/risk-register.schema.json'), 'utf8'));
const milestones = JSON.parse(readFileSync(join(__dirname, '../project-management/data/milestones.json'), 'utf8'));

// Load tickets from individual files
const ticketsDir = join(__dirname, '../project-management/data/tickets');
const ticketFiles = readdirSync(ticketsDir).filter(f => f.endsWith('.json'));
const tickets = ticketFiles.map(f => JSON.parse(readFileSync(join(ticketsDir, f), 'utf8')));

const milestoneValidate = ajv.compile(milestoneSchema);
const ticketValidate = ajv.compile(ticketSchema);
const dependencyGraphValidate = ajv.compile(dependencyGraphSchema);
const sequenceValidate = ajv.compile(sequenceSchema);
const riskRegisterValidate = ajv.compile(riskRegisterSchema);

let errors = 0;

console.log('Validating milestones...');
for (const m of milestones) {
  if (!milestoneValidate(m)) {
    console.error(`  ❌ ${m.id}: ${ajv.errorsText(milestoneValidate.errors)}`);
    errors++;
  } else {
    console.log(`  ✅ ${m.id}`);
  }
}

console.log('\nValidating tickets...');
for (const t of tickets) {
  if (!ticketValidate(t)) {
    console.error(`  ❌ ${t.id}: ${ajv.errorsText(ticketValidate.errors)}`);
    errors++;
  } else {
    console.log(`  ✅ ${t.id}`);
  }
}

// Dependency graph validation
console.log('\nValidating dependency graph...');
const dependencyGraph = JSON.parse(readFileSync(join(__dirname, '../project-management/data/dependency-graph.json'), 'utf8'));
if (!dependencyGraphValidate(dependencyGraph)) {
  console.error(`  ❌ dependency-graph.json: ${ajv.errorsText(dependencyGraphValidate.errors)}`);
  errors++;
} else {
  console.log('  ✅ dependency-graph.json');
}

// Sequence validation
console.log('\nValidating sequence...');
const sequence = JSON.parse(readFileSync(join(__dirname, '../project-management/data/sequence.json'), 'utf8'));
if (!sequenceValidate(sequence)) {
  console.error(`  ❌ sequence.json: ${ajv.errorsText(sequenceValidate.errors)}`);
  errors++;
} else {
  console.log('  ✅ sequence.json');
}

// Risk register validation
console.log('\nValidating risk register...');
const riskRegister = JSON.parse(readFileSync(join(__dirname, '../project-management/data/risk-register.json'), 'utf8'));
if (!riskRegisterValidate(riskRegister)) {
  console.error(`  ❌ risk-register.json: ${ajv.errorsText(riskRegisterValidate.errors)}`);
  errors++;
} else {
  console.log('  ✅ risk-register.json');
}

// Cross-reference validation
console.log('\nCross-referencing...');
const milestoneIds = new Set(milestones.map(m => m.id));
const ticketIds = new Set(tickets.map(t => t.id));
const milestoneTicketIds = new Set();

for (const m of milestones) {
  for (const tid of m.tickets) {
    if (!ticketIds.has(tid)) {
      console.error(`  ❌ Milestone ${m.id} references missing ticket ${tid}`);
      errors++;
    }
    milestoneTicketIds.add(tid);
  }
}

for (const t of tickets) {
  if (!milestoneIds.has(t.milestone_id)) {
    console.error(`  ❌ Ticket ${t.id} references missing milestone ${t.milestone_id}`);
    errors++;
  }
  if (!milestoneTicketIds.has(t.id)) {
    console.error(`  ❌ Ticket ${t.id} not referenced by any milestone`);
    errors++;
  }
}

// Check for orphaned ticket files
for (const f of ticketFiles) {
  const tid = f.replace('.json', '');
  if (!ticketIds.has(tid)) {
    console.error(`  ❌ Orphaned ticket file: ${f}`);
    errors++;
  }
}

if (errors === 0) {
  console.log('\n✅ All validations passed');
  process.exit(0);
} else {
  console.error(`\n❌ ${errors} validation error(s)`);
  process.exit(1);
}
