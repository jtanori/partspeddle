#!/usr/bin/env tsx
/**
 * VINTRACK Bootstrap Script
 *
 * Reads current git branch, infers active ticket,
 * loads governance files, and generates runtime-state.json.
 *
 * Usage:
 *   npm run bootstrap
 *   npx tsx scripts/bootstrap.ts
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const GOVERNANCE_DIR = join(process.cwd(), 'project-governance', 'runtime');
const TICKETS_DIR = join(process.cwd(), 'project-management', 'data', 'tickets');
const MILESTONES_FILE = join(process.cwd(), 'project-management', 'data', 'milestones.json');

interface RuntimeState {
  system: string;
  version: string;
  active_phase: number;
  active_milestone: {
    id: string;
    title: string;
    status: string;
  };
  previous_milestone?: {
    id: string;
    title: string;
    status: string;
  };
  active_ticket: {
    id: string;
    title: string;
    status: string;
  };
  execution_surface: string;
  current_branch: string;
  blocked_tickets: string[];
  completed_tickets: string[];
  required_governance_documents: string[];
  active_constraints: string[];
  ci_requirements: string[];
  emergency_notes?: string[];
  updated_at: string;
}

function getGitBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function inferTicketFromBranch(branch: string): string | null {
  // Match ticket patterns like T3.1, T2.8, T3.2A
  // Require a dot + number to distinguish from milestone IDs like M2, M3
  const match = branch.match(/\b(T\d+\.\d+[A-Z]?)\b/);
  return match?.[1] ?? null;
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function findTicketFile(ticketId: string): string | null {
  const candidates = [
    join(TICKETS_DIR, `${ticketId}.json`),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function findMilestoneForTicket(ticketId: string): { id: string; title: string; status: string } | null {
  const milestones = loadJson<Array<{ id: string; title: string; status: string; tickets: string[] }>>(MILESTONES_FILE);
  for (const m of milestones) {
    if (m.tickets.includes(ticketId)) {
      return { id: m.id, title: m.title, status: m.status };
    }
  }
  return null;
}

function findPreviousMilestone(currentId: string): { id: string; title: string; status: string } | null {
  const milestones = loadJson<Array<{ id: string; title: string; status: string; phase: number }>>(MILESTONES_FILE);
  const current = milestones.find((m) => m.id === currentId);
  if (!current) return null;
  const previous = milestones
    .filter((m) => m.phase < current.phase && m.status === 'completed')
    .sort((a, b) => b.phase - a.phase)[0];
  return previous ? { id: previous.id, title: previous.title, status: previous.status } : null;
}

function gatherCompletedTickets(): string[] {
  const tickets = loadJson<Array<{ id: string; status: string }>>(MILESTONES_FILE);
  const completed: string[] = [];
  for (const m of tickets) {
    if (m.status === 'completed' && Array.isArray((m as unknown as Record<string, unknown>).tickets)) {
      completed.push(...((m as unknown as Record<string, string[]>).tickets));
    }
  }
  return completed;
}

function inferSurfaceFromTicket(ticket: { domain?: string; deliverables?: Array<{ path?: string }> }): string {
  const domain = ticket.domain?.toLowerCase() ?? '';
  const paths = ticket.deliverables?.map((d) => d.path?.toLowerCase() ?? '') ?? [];

  const hasFrontend = paths.some((p) => p.includes('frontend') || p.includes('ui') || p.includes('page'));
  const hasBackend = paths.some((p) => p.includes('api') || p.includes('domain') || p.includes('infrastructure'));
  const hasShared = paths.some((p) => p.includes('shared'));

  if (domain.includes('frontend') || hasFrontend) return 'frontend';
  if (hasShared && hasFrontend) return 'fullstack';
  if (hasShared && hasBackend) return 'fullstack';
  if (hasShared) return 'shared';
  if (domain.includes('infrastructure') || domain.includes('ci')) return 'infrastructure';
  return 'backend';
}

function main(): void {
  const branch = getGitBranch();
  const inferredTicketId = inferTicketFromBranch(branch);

  let ticketId = inferredTicketId;
  let ticketTitle = 'Unknown';
  let ticketStatus = 'planned';
  let executionSurface = 'backend';

  // Try to load existing runtime state as baseline
  const statePath = join(GOVERNANCE_DIR, 'runtime-state.json');
  let existingState: Partial<RuntimeState> = {};
  if (existsSync(statePath)) {
    existingState = loadJson<RuntimeState>(statePath);
  }

  if (ticketId) {
    const ticketFile = findTicketFile(ticketId);
    if (ticketFile) {
      const ticket = loadJson<{
        id: string;
        title: string;
        status: string;
        domain?: string;
        deliverables?: Array<{ path?: string }>;
      }>(ticketFile);
      ticketTitle = ticket.title;
      ticketStatus = ticket.status;
      executionSurface = inferSurfaceFromTicket(ticket);
    }
  } else if (existingState.active_ticket) {
    // Fall back to existing state if branch doesn't infer a ticket
    ticketId = existingState.active_ticket.id;
    ticketTitle = existingState.active_ticket.title;
    ticketStatus = existingState.active_ticket.status;
    executionSurface = existingState.execution_surface ?? 'backend';
  }

  if (!ticketId) {
    console.error('ERROR: No active ticket inferred from branch and no existing runtime state.');
    console.error(`Branch: ${branch}`);
    process.exit(1);
  }

  const milestone = findMilestoneForTicket(ticketId);
  if (!milestone) {
    console.error(`ERROR: Could not find milestone for ticket ${ticketId}`);
    process.exit(1);
  }

  const previousMilestone = findPreviousMilestone(milestone.id);
  const completedTickets = gatherCompletedTickets();

  const state: RuntimeState = {
    system: 'VINTRACK',
    version: existingState.version ?? '0.1.0',
    active_phase: milestone.id === 'M3' ? 3 : parseInt(milestone.id.replace('M', ''), 10),
    active_milestone: milestone,
    ...(previousMilestone ? { previous_milestone: previousMilestone } : {}),
    active_ticket: {
      id: ticketId,
      title: ticketTitle,
      status: ticketStatus,
    },
    execution_surface: executionSurface,
    current_branch: branch,
    blocked_tickets: existingState.blocked_tickets ?? [],
    completed_tickets: completedTickets,
    required_governance_documents: [
      'project-governance/runtime/runtime-governance-kernel.md',
      'project-governance/runtime/execution-modes.md',
      'project-knowledge/repository-structure.md',
      'project-knowledge/fullstack-orchestration-model.md',
    ],
    active_constraints: existingState.active_constraints ?? [
      'frontend cannot import backend infrastructure',
      'shared contracts are canonical',
      'single package.json governance remains active',
    ],
    ci_requirements: existingState.ci_requirements ?? [
      'backend tests pass',
      'frontend build passes',
      'lint passes',
      'typecheck passes',
    ],
    updated_at: new Date().toISOString(),
  };

  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');

  // Write to runtime/state/ projection files
  const stateDir = join(process.cwd(), 'project-governance', 'runtime', 'state');
  writeFileSync(join(stateDir, 'current-milestone.json'), JSON.stringify({
    protocol_version: '1.0.0',
    active_milestone: state.active_milestone,
    previous_milestone: state.previous_milestone,
    updated_at: state.updated_at,
  }, null, 2) + '\n');
  writeFileSync(join(stateDir, 'current-ticket.json'), JSON.stringify({
    protocol_version: '1.0.0',
    active: true,
    ticket: state.active_ticket,
    updated_at: state.updated_at,
  }, null, 2) + '\n');

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║          VINTRACK BOOTSTRAP COMPLETE                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log(`Branch:          ${branch}`);
  console.log(`Active Milestone: ${milestone.id} — ${milestone.title} (${milestone.status})`);
  if (previousMilestone) {
    console.log(`Previous:         ${previousMilestone.id} — ${previousMilestone.title} (${previousMilestone.status})`);
  }
  console.log(`Active Ticket:    ${ticketId} — ${ticketTitle} (${ticketStatus})`);
  console.log(`Execution Surface: ${executionSurface}`);
  console.log(`Completed Tickets: ${completedTickets.length}`);
  console.log(`\nRuntime state written to: ${statePath}\n`);
}

main();
