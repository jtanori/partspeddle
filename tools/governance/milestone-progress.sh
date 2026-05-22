#!/bin/bash
# capability: governance.milestone.progress
# reads: project-management/data/governance-milestones.json, project-management/data/governance-tickets.json
# writes: nothing
# timeout: 10s

set -euo pipefail

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

MILESTONES_FILE="project-management/data/governance-milestones.json"
TICKETS_FILE="project-management/data/governance-tickets.json"

if [ ! -f "$MILESTONES_FILE" ] || [ ! -f "$TICKETS_FILE" ]; then
  echo '{"capability":"governance.milestone.progress","status":"FAIL","timestamp":"'"$TS"'","summary":"Missing governance data files","data":null,"warnings":[],"errors":["governance-milestones.json or governance-tickets.json not found"],"metrics":{},"next_actions":[]}'
  exit 1
fi

# Use Node.js to aggregate since bash JSON processing is fragile
node -e "
const fs = require('fs');
const milestones = JSON.parse(fs.readFileSync('$MILESTONES_FILE', 'utf-8'));
const tickets = JSON.parse(fs.readFileSync('$TICKETS_FILE', 'utf-8'));

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
  status: 'PASS',
  timestamp: '$TS',
  summary: summary.substring(0, 200),
  data: { milestones: result },
  warnings: [],
  errors: [],
  metrics: { milestone_count: result.length },
  next_actions: []
}, null, 2));
"
