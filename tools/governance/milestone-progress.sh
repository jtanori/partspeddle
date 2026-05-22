#!/bin/bash
# capability: governance.milestone.progress
# reads: project-management/data/milestones.registry.json, project-management/data/tickets/
# writes: nothing
# timeout: 10s

set -euo pipefail

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

REGISTRY="project-management/data/milestones.registry.json"
TICKETS_DIR="project-management/data/tickets"

if [ ! -f "$REGISTRY" ]; then
  echo '{"capability":"governance.milestone.progress","status":"FAIL","timestamp":"'"$TS"'","summary":"Milestone registry not found","data":null,"warnings":[],"errors":["project-management/data/milestones.registry.json not found"],"metrics":{},"next_actions":[]}'
  exit 1
fi

if [ ! -d "$TICKETS_DIR" ]; then
  echo '{"capability":"governance.milestone.progress","status":"FAIL","timestamp":"'"$TS"'","summary":"Tickets directory not found","data":null,"warnings":[],"errors":["project-management/data/tickets/ not found"],"metrics":{},"next_actions":[]}'
  exit 1
fi

# Use Node.js to aggregate since bash JSON processing is fragile
node -e "
const fs = require('fs');
const path = require('path');

const registry = JSON.parse(fs.readFileSync('$REGISTRY', 'utf-8'));
const ticketsDir = '$TICKETS_DIR';
const tickets = fs.readdirSync(ticketsDir)
  .filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(fs.readFileSync(path.join(ticketsDir, f), 'utf-8')));

const milestones = [];
const errors = [];

for (const file of registry.files || []) {
  const filePath = path.resolve(file);
  if (!fs.existsSync(filePath)) {
    errors.push('Missing domain file: ' + file);
    continue;
  }
  const domain = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (Array.isArray(domain)) {
    milestones.push(...domain);
  } else {
    errors.push('Not an array: ' + file);
  }
}

const result = milestones.map(m => {
  const mt = tickets.filter(t => t.milestone_id === m.id);
  const total = mt.length;
  const completed = mt.filter(t => t.status === 'completed').length;
  const in_progress = mt.filter(t => t.status === 'in_progress').length;
  const planned = mt.filter(t => t.status === 'planned').length;
  return {
    id: m.id,
    title: m.title,
    status: m.status,
    total_tickets: total,
    completed,
    in_progress,
    planned,
    percent_complete: total > 0 ? Math.round((completed / total) * 100) : 0
  };
});

const summary = result.map(r => r.id + '=' + r.percent_complete + '%').join(', ');

console.log(JSON.stringify({
  capability: 'governance.milestone.progress',
  status: errors.length > 0 ? 'PARTIAL' : 'PASS',
  timestamp: '$TS',
  summary: summary.substring(0, 200),
  data: { milestones: result },
  warnings: [],
  errors: errors,
  metrics: { milestone_count: result.length, domain_files: registry.files.length },
  next_actions: errors.length > 0 ? ['Fix missing domain milestone files'] : []
}, null, 2));
"
