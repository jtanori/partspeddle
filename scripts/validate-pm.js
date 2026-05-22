#!/usr/bin/env node
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readJson, readJsonDir, createValidator } from './lib/json-utils.js';
import { loadMilestonesSync } from './lib/milestone-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

const dataDir = join(__dirname, '../project-management/data');
const schemaDir = join(__dirname, '../project-management/schemas');

// Load schemas via json-utils
const milestoneSchema = readJson(join(schemaDir, 'milestone.schema.json'));
const ticketSchema = readJson(join(schemaDir, 'ticket.schema.json'));
const dependencyGraphSchema = readJson(join(schemaDir, 'dependency-graph.schema.json'));
const sequenceSchema = readJson(join(schemaDir, 'sequence.schema.json'));
const riskRegisterSchema = readJson(join(schemaDir, 'risk-register.schema.json'));

let errors = 0;

// Load data via registry-based loader
const { milestones, errors: loadErrors, warnings: loadWarnings } = loadMilestonesSync();
const tickets = readJsonDir(join(dataDir, 'tickets'));

// Report loader warnings
for (const w of loadWarnings) {
  console.log(`  ℹ️  ${w}`);
}
// Report loader errors
for (const e of loadErrors) {
  console.error(`  ❌ Loader: ${e}`);
  errors++;
}

// Compile validators
const milestoneValidate = ajv.compile(milestoneSchema);
const ticketValidate = ajv.compile(ticketSchema);
const dependencyGraphValidate = ajv.compile(dependencyGraphSchema);
const sequenceValidate = ajv.compile(sequenceSchema);
const riskRegisterValidate = ajv.compile(riskRegisterSchema);

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
const dependencyGraph = readJson(join(dataDir, 'dependency-graph.json'));
if (!dependencyGraphValidate(dependencyGraph)) {
  console.error(`  ❌ dependency-graph.json: ${ajv.errorsText(dependencyGraphValidate.errors)}`);
  errors++;
} else {
  console.log('  ✅ dependency-graph.json');
}

// Sequence validation
console.log('\nValidating sequence...');
const sequence = readJson(join(dataDir, 'sequence.json'));
if (!sequenceValidate(sequence)) {
  console.error(`  ❌ sequence.json: ${ajv.errorsText(sequenceValidate.errors)}`);
  errors++;
} else {
  console.log('  ✅ sequence.json');
}

// Risk register validation
console.log('\nValidating risk register...');
const riskRegister = readJson(join(dataDir, 'risk-register.json'));
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
const ticketFiles = readJsonDir(join(dataDir, 'tickets'), { includeFileName: true });
for (const { fileName, data } of ticketFiles) {
  const tid = fileName.replace('.json', '');
  if (!ticketIds.has(tid)) {
    console.error(`  ❌ Orphaned ticket file: ${fileName}`);
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
