#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, dirname as pathDirname } from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── CLI args ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const ticketArg = args.find((_, i) => args[i - 1] === '--ticket') || args.find(a => a.startsWith('T') && a.includes('.'));
const milestoneArg = args.find((_, i) => args[i - 1] === '--milestone') || args.find(a => a.startsWith('M') && !a.includes('.'));
const domainArg = args.find((_, i) => args[i - 1] === '--domain');
const allFlag = args.includes('--all') || args.length === 0;
const groupedFlag = args.includes('--grouped');

// ─── Load schemas & data ────────────────────────────────────────────────────
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

const ticketSchema = JSON.parse(readFileSync(join(__dirname, '../project-management/schemas/ticket.schema.json'), 'utf8'));
const milestoneSchema = JSON.parse(readFileSync(join(__dirname, '../project-management/schemas/milestone.schema.json'), 'utf8'));
const ticketValidate = ajv.compile(ticketSchema);
const milestoneValidate = ajv.compile(milestoneSchema);

const milestones = JSON.parse(readFileSync(join(__dirname, '../project-management/data/milestones.json'), 'utf8'));

const ticketsDir = join(__dirname, '../project-management/data/tickets');
const allTicketFiles = readdirSync(ticketsDir).filter(f => f.endsWith('.json'));
const allTickets = allTicketFiles.map(f => JSON.parse(readFileSync(join(ticketsDir, f), 'utf8')));

// ─── Determine which tickets to assess ──────────────────────────────────────
let ticketsToAssess = [];

if (ticketArg) {
  const t = allTickets.find(x => x.id === ticketArg);
  if (!t) { console.error(`❌ Ticket ${ticketArg} not found`); process.exit(1); }
  ticketsToAssess = [t];
} else if (milestoneArg) {
  ticketsToAssess = allTickets.filter(t => t.milestone_id === milestoneArg);
  if (ticketsToAssess.length === 0) { console.error(`❌ No tickets for milestone ${milestoneArg}`); process.exit(1); }
} else if (domainArg) {
  ticketsToAssess = allTickets.filter(t => t.domain === domainArg);
  if (ticketsToAssess.length === 0) { console.error(`❌ No tickets for domain ${domainArg}`); process.exit(1); }
} else {
  ticketsToAssess = allTickets;
}

// ─── Assessment engine ──────────────────────────────────────────────────────
function assessTicket(ticket) {
  const results = [];
  const milestone = milestones.find(m => m.id === ticket.milestone_id);

  // 1. Schema validation
  const schemaOk = ticketValidate(ticket);
  results.push({
    check: 'Schema validation',
    category: 'structure',
    status: schemaOk ? 'pass' : 'fail',
    reason: schemaOk ? 'Valid against ticket.schema.json' : ajv.errorsText(ticketValidate.errors),
  });

  // 2. Cross-reference: milestone references this ticket
  const inMilestone = milestone && milestone.tickets.includes(ticket.id);
  results.push({
    check: 'Milestone reference',
    category: 'structure',
    status: inMilestone ? 'pass' : 'fail',
    reason: inMilestone ? `Referenced by ${ticket.milestone_id}` : `Not in ${ticket.milestone_id}.tickets array`,
  });

  // 3. Dependency satisfaction
  for (const depId of ticket.dependencies || []) {
    const dep = allTickets.find(t => t.id === depId);
    const depSatisfied = dep && (dep.status === 'completed' || dep.status === 'review');
    results.push({
      check: `Dependency ${depId}`,
      category: 'dependencies',
      status: depSatisfied ? 'pass' : dep ? 'fail' : 'fail',
      reason: depSatisfied ? `${dep.status}` : dep ? `Blocked: ${dep.status}` : 'Missing ticket',
    });
  }
  if (ticket.dependencies.length === 0) {
    results.push({
      check: 'Dependencies',
      category: 'dependencies',
      status: 'pass',
      reason: 'No dependencies',
    });
  }

  // 4. Deliverable existence
  let deliverablesFound = 0;
  let deliverablesTotal = 0;
  for (const d of ticket.deliverables || []) {
    if (d.type === 'directory') {
      const exists = existsSync(d.path) && statSync(d.path).isDirectory();
      deliverablesTotal++;
      if (exists) deliverablesFound++;
    } else if (d.path && !d.path.includes('<')) {
      const exists = existsSync(d.path);
      deliverablesTotal++;
      if (exists) deliverablesFound++;
    }
  }
  results.push({
    check: 'Deliverables exist',
    category: 'implementation',
    status: deliverablesTotal === 0 ? 'manual' : deliverablesFound === deliverablesTotal ? 'pass' : deliverablesFound > 0 ? 'partial' : 'fail',
    reason: deliverablesTotal === 0 ? 'No deliverables defined' : `${deliverablesFound}/${deliverablesTotal} found`,
  });

  // 5. Test files existence (check adjacent .test.ts files)
  let testsFound = 0;
  const testPaths = new Set();
  for (const d of ticket.deliverables || []) {
    if (d.type === 'test' && d.path && existsSync(d.path)) {
      testsFound++;
      testPaths.add(d.path);
    } else if (d.path && d.path.startsWith('src/') && d.type === 'file') {
      const base = d.path.replace(/\.ts$/, '');
      const testPath = base + '.test.ts';
      const dirTestPath = join(pathDirname(d.path), '__tests__', basename(d.path).replace(/\.ts$/, '.test.ts'));
      if (existsSync(testPath)) { testsFound++; testPaths.add(testPath); }
      else if (existsSync(dirTestPath)) { testsFound++; testPaths.add(dirTestPath); }
    }
  }
  results.push({
    check: 'Tests exist',
    category: 'implementation',
    status: testsFound > 0 ? 'pass' : 'manual',
    reason: testsFound > 0 ? `${testsFound} test file(s) found` : 'No tests detected (may be in separate test dir)',
  });

  // 6. Traceability for completed/review tickets
  const hasTraceability = ticket.traceability && ticket.traceability.length > 0;
  if (ticket.status === 'completed' || ticket.status === 'review') {
    results.push({
      check: 'Traceability recorded',
      category: 'governance',
      status: hasTraceability ? 'pass' : 'fail',
      reason: hasTraceability ? `${ticket.traceability.length} entry(ies)` : 'Status is ' + ticket.status + ' but traceability is empty',
    });
  } else {
    results.push({
      check: 'Traceability',
      category: 'governance',
      status: 'pass',
      reason: `Status ${ticket.status} does not require traceability yet`,
    });
  }

  // 7. Acceptance criteria structural check
  const hasCriteria = ticket.acceptance_criteria && ticket.acceptance_criteria.length > 0;
  results.push({
    check: 'Acceptance criteria defined',
    category: 'structure',
    status: hasCriteria ? 'pass' : 'fail',
    reason: hasCriteria ? `${ticket.acceptance_criteria.length} criteria` : 'Empty acceptance criteria',
  });

  // 8. Metadata versioning
  const versionCurrent = ticket.metadata && ticket.metadata.version >= 1;
  results.push({
    check: 'Metadata version',
    category: 'governance',
    status: versionCurrent ? 'pass' : 'fail',
    reason: versionCurrent ? `Version ${ticket.metadata.version}` : 'Missing or invalid metadata.version',
  });

  return { ticket, results, milestone };
}

function basename(p) { return p.split(/[\\/]/).pop(); }

// ─── Run assessments ─────────────────────────────────────────────────────────
const assessments = ticketsToAssess.map(assessTicket);

// ─── Grouping ────────────────────────────────────────────────────────────────
function printAssessments(list) {
  for (const { ticket, results } of list) {
    console.log(`\n┌─────────────────────────────────────────────────────────────────────────────┐`);
    console.log(`│ ${ticket.id} — ${ticket.title.padEnd(67)}│`);
    console.log(`│ Domain: ${ticket.domain.padEnd(12)}  Status: ${ticket.status.padEnd(12)}  Milestone: ${ticket.milestone_id.padEnd(8)}│`);
    console.log(`└─────────────────────────────────────────────────────────────────────────────┘`);

    const byCat = {};
    for (const r of results) {
      byCat[r.category] = byCat[r.category] || [];
      byCat[r.category].push(r);
    }

    for (const cat of Object.keys(byCat)) {
      console.log(`  [${cat.toUpperCase()}]`);
      for (const r of byCat[cat]) {
        const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : r.status === 'partial' ? '⚠️' : '⏸️';
        console.log(`    ${icon} ${r.check.padEnd(28)} — ${r.reason}`);
      }
    }

    // Summary counts
    const passed = results.filter(r => r.status === 'pass').length;
    const failed = results.filter(r => r.status === 'fail').length;
    const partial = results.filter(r => r.status === 'partial').length;
    const manual = results.filter(r => r.status === 'manual').length;
    console.log(`  ── Score: ${passed} pass · ${failed} fail · ${partial} partial · ${manual} manual ──`);
  }
}

// ─── Print results ──────────────────────────────────────────────────────────
if (groupedFlag) {
  const byDomain = {};
  for (const a of assessments) {
    byDomain[a.ticket.domain] = byDomain[a.ticket.domain] || [];
    byDomain[a.ticket.domain].push(a);
  }
  for (const [domain, list] of Object.entries(byDomain).sort()) {
    console.log(`\n═══════════════════════════════════════════════════════════════════════════════`);
    console.log(`  DOMAIN: ${domain}`);
    console.log(`═══════════════════════════════════════════════════════════════════════════════`);
    printAssessments(list);
  }
} else {
  printAssessments(assessments);
}

// ─── Acceptance Criteria Matrix ─────────────────────────────────────────────
console.log(`\n╔═══════════════════════════════════════════════════════════════════════════════╗`);
console.log(`║           ACCEPTANCE CRITERIA MATRIX                                          ║`);
console.log(`╚═══════════════════════════════════════════════════════════════════════════════╝`);

for (const { ticket, results } of assessments) {
  console.log(`\n${ticket.id} — ${ticket.title}`);
  console.log(`-`.repeat(80));

  // Map automated checks to acceptance criteria where possible
  const deliverableResult = results.find(r => r.check === 'Deliverables exist');
  const testResult = results.find(r => r.check === 'Tests exist');
  const schemaResult = results.find(r => r.check === 'Schema validation');
  const traceResult = results.find(r => r.check === 'Traceability recorded' || r.check === 'Traceability');

  for (let i = 0; i < ticket.acceptance_criteria.length; i++) {
    const ac = ticket.acceptance_criteria[i];
    let status = '⏸️ MANUAL';
    let reason = 'Requires human verification';

    // Automated mappings
    const lower = ac.toLowerCase();
    if (lower.includes('npm run typecheck') || lower.includes('tsc')) {
      status = '⏸️ MANUAL';
      reason = 'Run: npm run typecheck';
    } else if (lower.includes('npm run lint')) {
      status = '⏸️ MANUAL';
      reason = 'Run: npm run lint';
    } else if (lower.includes('npm run test') || lower.includes('test:ci') || lower.includes('coverage')) {
      if (testResult && testResult.status === 'pass') { status = '✅ VERIFIED'; reason = 'Tests exist'; }
      else { status = '⏸️ MANUAL'; reason = 'Run test suite manually'; }
    } else if (lower.includes('event') && (lower.includes('validate') || lower.includes('emitted'))) {
      if (schemaResult && schemaResult.status === 'pass') { status = '✅ VERIFIED'; reason = 'Schema validates'; }
      else { status = '⏸️ MANUAL'; reason = 'Verify event emission in integration test'; }
    } else if (lower.includes('db migration') || lower.includes('schema') || lower.includes('rls')) {
      status = '⏸️ MANUAL';
      reason = 'Verify via supabase db reset';
    } else if (lower.includes('file') || lower.includes('directory') || lower.includes('config')) {
      if (deliverableResult && deliverableResult.status === 'pass') { status = '✅ VERIFIED'; reason = deliverableResult.reason; }
      else if (deliverableResult && deliverableResult.status === 'partial') { status = '⚠️ PARTIAL'; reason = deliverableResult.reason; }
      else { status = '❌ FAILED'; reason = deliverableResult ? deliverableResult.reason : 'Missing deliverables'; }
    }

    console.log(`  ${status}  ${ac}`);
    if (reason && status !== '✅ VERIFIED') {
      console.log(`         → ${reason}`);
    }
  }
}

// ─── Grand summary ──────────────────────────────────────────────────────────
console.log(`\n═══════════════════════════════════════════════════════════════════════════════`);
console.log(`  ASSESSMENT SUMMARY`);
console.log(`═══════════════════════════════════════════════════════════════════════════════`);

const allResults = assessments.flatMap(a => a.results);
const totalPass = allResults.filter(r => r.status === 'pass').length;
const totalFail = allResults.filter(r => r.status === 'fail').length;
const totalPartial = allResults.filter(r => r.status === 'partial').length;
const totalManual = allResults.filter(r => r.status === 'manual').length;
const totalChecks = allResults.length;

console.log(`  Tickets assessed: ${assessments.length}`);
console.log(`  Total checks:     ${totalChecks}`);
console.log(`  ✅ Pass:          ${totalPass}`);
console.log(`  ❌ Fail:          ${totalFail}`);
console.log(`  ⚠️  Partial:       ${totalPartial}`);
console.log(`  ⏸️  Manual:        ${totalManual}`);
console.log(`  Pass rate:        ${((totalPass / totalChecks) * 100).toFixed(1)}%`);

const failingTickets = assessments.filter(a => a.results.some(r => r.status === 'fail'));
if (failingTickets.length > 0) {
  console.log(`\n  ❌ TICKETS WITH FAILURES:`);
  for (const { ticket } of failingTickets) {
    const fails = ticket.results ? ticket.results.filter(r => r.status === 'fail').map(r => r.check).join(', ') : 'see above';
    console.log(`     ${ticket.id}: ${ticket.title}`);
  }
}

console.log(`\n  Usage: node scripts/pm-assess.js [--ticket T1.2] [--milestone M1] [--domain Shared] [--grouped] [--all]`);
