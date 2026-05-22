#!/usr/bin/env node
/**
 * Runtime Projection Generator
 *
 * Reads canonical runtime state from project-governance/runtime/state/
 * and generates human-readable Markdown projections in project-governance/runtime/projections/
 *
 * Usage:
 *   tsx scripts/generate-runtime-projections.ts
 *
 * Authority: STATE_MUTATION_RULES.md
 * Protocols: CHECKPOINT_PROTOCOL.md, HEARTBEAT_POLICY.md
 */

import fs from "fs";
import path from "path";

const RUNTIME_DIR = path.resolve("project-governance/runtime");
const STATE_DIR = path.join(RUNTIME_DIR, "state");
const PROJECTIONS_DIR = path.join(RUNTIME_DIR, "projections");
const HEARTBEATS_DIR = path.join(RUNTIME_DIR, "heartbeats");

interface ActiveExecution {
  protocol_version: string;
  execution_active: boolean;
  execution: ExecutionRecord | null;
  last_execution: {
    execution_id: string;
    task_id: string;
    milestone_id: string;
    status: string;
    started_at: string;
    completed_at: string;
    checkpoint_path: string;
    completion_report_path: string;
  } | null;
  system: {
    name: string;
    version: string;
    updated_at: string;
  };
}

interface ExecutionRecord {
  execution_id: string;
  status: string;
  started_at: string;
  last_heartbeat: string;
  milestone: { id: string; title: string };
  ticket: { id: string; title: string; status: string; priority: string };
  execution: {
    phase: string;
    progress_percent: number;
    confidence: number;
    estimated_completion: string;
  };
  files: { created: string[]; modified: string[]; deleted: string[] };
  validation: {
    tests_passed: number;
    tests_failed: number;
    pending_validations: string[];
  };
  drift: {
    detected: boolean;
    severity: string | null;
    details: string | null;
  };
  blockers: string[];
  next_actions: string[];
  resume: {
    safe_resume_point: string;
    rollback_available: boolean;
  };
}

function loadJson<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

function formatTimestamp(iso: string): string {
  return iso.replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

function generateLatestStatus(state: ActiveExecution): string {
  const exec = state.execution;
  const last = state.last_execution;

  let body = `# Latest Execution Status\n\n`;
  body += `> **Generated from:** \`runtime/state/active-execution.json\`  \n`;
  body += `> **Generated at:** ${new Date().toISOString()}  \n`;
  body += `> **Do not edit manually.** This is a machine-generated projection.\n\n---\n\n`;

  body += `## System Status\n\n`;
  body += `| Attribute | Value |\n|-----------|-------|\n`;
  body += `| **System** | ${state.system.name} v${state.system.version} |\n`;
  body += `| **Execution Active** | ${state.execution_active ? "Yes" : "No"} |\n`;
  body += `| **Runtime Status** | ${state.runtime_status} |\n`;
  body += `| **Safe to Resume** | ${state.safe_to_resume ? "Yes" : "No"} |\n`;
  if (state.runtime_confidence) {
    body += `| **Runtime Confidence** | ${(state.runtime_confidence.score * 100).toFixed(0)}% |\n`;
  }
  if (state.drift_risk) {
    body += `| **Drift Risk** | ${state.drift_risk.level} |\n`;
  }
  if (last) {
    body += `| **Last Execution** | ${last.execution_id} |\n`;
    body += `| **Last Completed** | ${formatTimestamp(last.completed_at)} |\n`;
  }
  body += `\n`;

  if (exec) {
    body += `## Active Execution\n\n`;
    body += `| Attribute | Value |\n|-----------|-------|\n`;
    body += `| **Execution ID** | ${exec.execution_id} |\n`;
    body += `| **Status** | ${exec.status} |\n`;
    body += `| **Task** | ${exec.ticket.id} — ${exec.ticket.title} |\n`;
    body += `| **Milestone** | ${exec.milestone.id} — ${exec.milestone.title} |\n`;
    body += `| **Phase** | ${exec.execution.phase} |\n`;
    body += `| **Progress** | ${exec.execution.progress_percent}% |\n`;
    body += `| **Confidence** | ${Math.round(exec.execution.confidence * 100)}% |\n`;
    body += `| **Started** | ${formatTimestamp(exec.started_at)} |\n`;
    body += `| **Last Heartbeat** | ${formatTimestamp(exec.last_heartbeat)} |\n`;
    body += `| **Est. Completion** | ${formatTimestamp(exec.execution.estimated_completion)} |\n`;
    body += `\n`;

    if (exec.files.created.length || exec.files.modified.length || exec.files.deleted.length) {
      body += `## Files\n\n`;
      if (exec.files.created.length) {
        body += `**Created (${exec.files.created.length}):**\n`;
        for (const f of exec.files.created) body += `- \`${f}\`\n`;
      }
      if (exec.files.modified.length) {
        body += `**Modified (${exec.files.modified.length}):**\n`;
        for (const f of exec.files.modified) body += `- \`${f}\`\n`;
      }
      if (exec.files.deleted.length) {
        body += `**Deleted (${exec.files.deleted.length}):**\n`;
        for (const f of exec.files.deleted) body += `- \`${f}\`\n`;
      }
      body += `\n`;
    }

    body += `## Validation\n\n`;
    body += `| Metric | Value |\n|--------|-------|\n`;
    body += `| Tests Passed | ${exec.validation.tests_passed} |\n`;
    body += `| Tests Failed | ${exec.validation.tests_failed} |\n`;
    if (exec.validation.pending_validations.length) {
      body += `| Pending | ${exec.validation.pending_validations.join(", ")} |\n`;
    }
    body += `\n`;

    body += `## Drift Status\n\n`;
    if (exec.drift.detected) {
      body += `🔴 **DRIFT DETECTED** — Severity: ${exec.drift.severity}\n\n`;
      body += `${exec.drift.details}\n\n`;
    } else {
      body += `✅ No drift detected.\n\n`;
    }

    if (exec.blockers.length) {
      body += `## Blockers\n\n`;
      for (const b of exec.blockers) body += `- ${b}\n`;
      body += `\n`;
    }

    if (exec.next_actions.length) {
      body += `## Next Actions\n\n`;
      for (let i = 0; i < exec.next_actions.length; i++) {
        body += `${i + 1}. ${exec.next_actions[i]}\n`;
      }
      body += `\n`;
    }

    body += `## Resume\n\n`;
    body += `| Attribute | Value |\n|-----------|-------|\n`;
    body += `| **Safe Resume Point** | ${exec.resume.safe_resume_point} |\n`;
    body += `| **Rollback Available** | ${exec.resume.rollback_available ? "Yes" : "No"} |\n`;
    body += `\n`;
  } else if (last) {
    body += `## Last Execution Summary\n\n`;
    body += `| Attribute | Value |\n|-----------|-------|\n`;
    body += `| **Task** | ${last.task_id} |\n`;
    body += `| **Milestone** | ${last.milestone_id} |\n`;
    body += `| **Status** | ${last.status} |\n`;
    body += `| **Checkpoint** | \`${last.checkpoint_path}\` |\n`;
    body += `| **Completion Report** | \`${last.completion_report_path}\` |\n`;
    body += `\n`;
  } else {
    body += `## No Execution History\n\n`;
    body += `No executions have been recorded.\n\n`;
  }

  body += `---\n\n`;
  body += `*To start a new execution, acquire the execution lock and update \`active-execution.json\` per STATE_MUTATION_RULES.md.*\n`;
  return body;
}

function generateLatestHeartbeat(): string {
  const heartbeats = fs
    .readdirSync(HEARTBEATS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  let body = `# Latest Heartbeat Projection\n\n`;
  body += `> **Generated from:** \`runtime/heartbeats/\`  \n`;
  body += `> **Generated at:** ${new Date().toISOString()}  \n`;
  body += `> **Do not edit manually.** This is a machine-generated projection.\n\n---\n\n`;

  if (!heartbeats.length) {
    body += `## Heartbeat Status\n\nNo active execution. No heartbeats found.\n\n`;
    body += `---\n\n*Heartbeats are emitted every 10 minutes or 5 files during active execution.*\n`;
    return body;
  }

  const latest = loadJson<any>(path.join(HEARTBEATS_DIR, heartbeats[heartbeats.length - 1]));
  body += `## Latest Heartbeat\n\n`;
  body += `| Attribute | Value |\n|-----------|-------|\n`;
  body += `| **Heartbeat ID** | ${latest.HEARTBEAT?.metadata?.heartbeat_id || "unknown"} |\n`;
  body += `| **Task** | ${latest.HEARTBEAT?.metadata?.task_id || "unknown"} |\n`;
  body += `| **Sequence** | ${latest.HEARTBEAT?.metadata?.sequence_number || 0} |\n`;
  body += `| **Timestamp** | ${formatTimestamp(latest.HEARTBEAT?.metadata?.timestamp || new Date().toISOString())} |\n`;
  body += `| **Progress** | ${latest.HEARTBEAT?.active_task?.progress_percent || 0}% |\n`;
  body += `| **Drift Risk** | ${latest.HEARTBEAT?.drift_risk?.level || "UNKNOWN"} |\n`;
  body += `| **Confidence** | ${latest.HEARTBEAT?.confidence?.score || 0} |\n`;
  body += `\n`;

  body += `## Heartbeat History\n\n`;
  body += `| Sequence | Time | Progress | Drift Risk | Confidence |\n`;
  body += `|----------|------|----------|------------|------------|\n`;
  for (const hbFile of heartbeats.slice(-10)) {
    const hb = loadJson<any>(path.join(HEARTBEATS_DIR, hbFile));
    const m = hb.HEARTBEAT?.metadata || {};
    const at = hb.HEARTBEAT?.active_task || {};
    const dr = hb.HEARTBEAT?.drift_risk || {};
    const cf = hb.HEARTBEAT?.confidence || {};
    body += `| ${m.sequence_number || "?"} | ${formatTimestamp(m.timestamp || "")} | ${at.progress_percent ?? "?"}% | ${dr.level || "?"} | ${cf.score ?? "?"} |\n`;
  }
  body += `\n`;

  body += `---\n\n*Heartbeats are emitted every 10 minutes or 5 files during active execution.*\n`;
  return body;
}

function generateCurrentContext(state: ActiveExecution): string {
  const milestone = loadJson<any>(path.join(STATE_DIR, "current-milestone.json"));
  const ticket = loadJson<any>(path.join(STATE_DIR, "current-ticket.json"));
  const runtimeState = loadJson<any>(path.join(RUNTIME_DIR, "runtime-state.json"));

  let body = `# Current Operational Context\n\n`;
  body += `> **Generated from:** \`runtime/state/active-execution.json\` + \`current-milestone.json\` + \`current-ticket.json\`  \n`;
  body += `> **Generated at:** ${new Date().toISOString()}  \n`;
  body += `> **Purpose:** Compressed resumability anchor for agent sessions.  \n`;
  body += `> **Do not edit manually.** This is a machine-generated projection.\n\n---\n\n`;

  body += `## Active Milestone\n\n`;
  body += `**${milestone.active_milestone?.id} — ${milestone.active_milestone?.title}**\n`;
  body += `- Status: ${milestone.active_milestone?.status}\n`;
  body += `- Phase: ${milestone.active_milestone?.phase}\n`;
  if (milestone.previous_milestone) {
    body += `- Previous: ${milestone.previous_milestone.id} (${milestone.previous_milestone.title}, ${milestone.previous_milestone.status})\n`;
  }
  body += `\n`;

  body += `## Active Ticket\n\n`;
  if (ticket.active && ticket.ticket) {
    body += `**${ticket.ticket.id} — ${ticket.ticket.title}**\n`;
    body += `- Domain: ${ticket.ticket.domain}\n`;
    body += `- Status: ${ticket.ticket.status}\n`;
  } else if (ticket.last_ticket) {
    body += `No active ticket. System idle. Last completed: ${ticket.last_ticket.id} (${ticket.last_ticket.title}).\n`;
  } else {
    body += `No active ticket. System idle.\n`;
  }
  body += `\n`;

  body += `## Execution State\n\n`;
  body += `- **Status:** ${state.execution_active ? state.execution?.status || "UNKNOWN" : state.runtime_status}\n`;
  body += `- **Lock:** ${loadJson<any>(path.join(STATE_DIR, "execution-lock.json")).locked ? "Held" : "Free"}\n`;
  if (state.last_execution) {
    body += `- **Last Execution:** ${state.last_execution.execution_id} (${state.last_execution.status})\n`;
  }
  if (state.runtime_confidence) {
    body += `- **Runtime Confidence:** ${(state.runtime_confidence.score * 100).toFixed(0)}%\n`;
  }
  if (state.drift_risk) {
    body += `- **Drift Risk:** ${state.drift_risk.level} — ${state.drift_risk.reason}\n`;
  }
  body += `\n`;

  if (state.governance_compliance) {
    body += `## Governance Compliance\n\n`;
    body += `| Protocol | Status |\n|----------|--------|\n`;
    body += `| Heartbeat Policy | ${state.governance_compliance.heartbeat_policy} |\n`;
    body += `| Checkpoint Protocol | ${state.governance_compliance.checkpoint_protocol} |\n`;
    body += `| Drift Detection | ${state.governance_compliance.drift_detection} |\n`;
    body += `| Enforcement Gates | ${state.governance_compliance.enforcement_gates} |\n`;
    body += `| Safe Exit Protocol | ${state.governance_compliance.safe_exit_protocol} |\n`;
    body += `| State Mutation Rules | ${state.governance_compliance.state_mutation_rules} |\n`;
    body += `| Resumability Validated | ${state.governance_compliance.resumability_validated ? "YES" : "NO"} |\n`;
    body += `\n`;
  }

  if (state.safe_exit_verification) {
    body += `## Safe Exit Verification\n\n`;
    body += `| Check | Status |\n|-------|--------|\n`;
    body += `| Lock Released | ${state.safe_exit_verification.lock_released ? "✅" : "❌"} |\n`;
    body += `| Checkpoint Persisted | ${state.safe_exit_verification.checkpoint_persisted ? "✅" : "❌"} |\n`;
    body += `| Projections Synchronized | ${state.safe_exit_verification.projections_synchronized ? "✅" : "❌"} |\n`;
    body += `| No Active Mutations | ${state.safe_exit_verification.no_active_mutations ? "✅" : "❌"} |\n`;
    body += `| Last Verified | ${formatTimestamp(state.safe_exit_verification.last_verified_at)} |\n`;
    body += `\n`;
  }

  if (runtimeState.active_constraints?.length) {
    body += `## Current Constraints\n\n`;
    for (const c of runtimeState.active_constraints) body += `- ${c}\n`;
    body += `\n`;
  }

  body += `## Required Context Files for Next Execution\n\n`;
  body += `1. \`runtime/state/active-execution.json\`\n`;
  body += `2. \`runtime/state/current-milestone.json\`\n`;
  body += `3. \`runtime/state/current-ticket.json\`\n`;
  body += `4. \`runtime/runtime-state.json\`\n`;
  body += `5. Domain REFERENCE.md for active bounded context\n`;
  body += `\n`;

  body += `## Next Safe Action\n\n`;
  if (state.execution_active && state.execution?.next_actions?.length) {
    for (let i = 0; i < state.execution.next_actions.length; i++) {
      body += `${i + 1}. ${state.execution.next_actions[i]}\n`;
    }
  } else {
    body += `Start next ticket in M3 backlog, or transition M3 to completed if all tickets delivered.\n`;
  }
  body += `\n`;

  body += `---\n\n*This projection is regenerated after every checkpoint, heartbeat, or state transition.*\n`;
  return body;
}

function generateResumeInstruction(state: ActiveExecution): string {
  const milestone = loadJson<any>(path.join(STATE_DIR, "current-milestone.json"));
  const ticket = loadJson<any>(path.join(STATE_DIR, "current-ticket.json"));
  const bootstrap = loadJson<any>(path.join(RUNTIME_DIR, "bootstrap", "runtime-bootstrap.json"));

  let body = `# Resume Instruction\n\n`;
  body += `> **Generated at:** ${new Date().toISOString()}  \n`;
  body += `> **Exit Type:** ${state.safe_exit ? state.safe_exit.exit_reason : "N/A"}  \n`;
  body += `> **Protocol:** SAFE_EXIT_PROTOCOL.md v1.0.0  \n`;
  body += `> **Do not edit manually.** This is a machine-generated projection.\n\n---\n\n`;

  body += `## System Status\n\n`;
  if (state.safe_exit) {
    body += `SAFE EXIT COMPLETE\n\n`;
  } else if (state.execution_active) {
    body += `EXECUTION ACTIVE — Resume not required.\n\n`;
  } else {
    body += `IDLE — No active execution.\n\n`;
  }

  body += `## Last Active Execution\n\n`;
  if (state.last_execution) {
    body += `| Attribute | Value |\n|-----------|-------|\n`;
    body += `| **Execution ID** | ${state.last_execution.execution_id} |\n`;
    body += `| **Task** | ${state.last_execution.task_id} |\n`;
    body += `| **Milestone** | ${state.last_execution.milestone_id} |\n`;
    body += `| **Status** | ${state.last_execution.status} |\n`;
    if (state.safe_exit) {
      body += `| **Exited At** | ${formatTimestamp(state.safe_exit.exited_at)} |\n`;
      body += `| **Exit Reason** | ${state.safe_exit.exit_reason} |\n`;
    }
    body += `\n`;
  } else {
    body += `No prior executions recorded.\n\n`;
  }

  body += `## Milestone Context\n\n`;
  body += `**${milestone.active_milestone?.id} — ${milestone.active_milestone?.title}**\n`;
  body += `- Status: ${milestone.active_milestone?.status}\n\n`;

  body += `## Ticket Context\n\n`;
  if (ticket.active && ticket.ticket) {
    body += `**${ticket.ticket.id} — ${ticket.ticket.title}**\n`;
    body += `- Status: ${ticket.ticket.status}\n`;
    if (bootstrap.safe_resume_point) {
      body += `- Safe Resume Point: **${bootstrap.safe_resume_point}**\n`;
    }
  } else if (ticket.last_ticket) {
    body += `No active ticket. Last completed: ${ticket.last_ticket.id} (${ticket.last_ticket.title}).\n`;
  } else {
    body += `No active ticket.\n`;
  }
  body += `\n`;

  body += `## Required Resume Procedure\n\n`;
  if (state.safe_exit && state.safe_to_resume) {
    body += `1. Validate runtime integrity per \`runtime/bootstrap/runtime-bootstrap.json\`\n`;
    body += `2. Restore checkpoint \`${state.safe_exit.exit_checkpoint_id || "latest"}\`\n`;
    body += `3. Reacquire execution lock (\`runtime/state/execution-lock.json\`)\n`;
    body += `4. Resume heartbeat monitoring\n`;
    body += `5. Continue pending work from safe resume point\n`;
  } else if (state.execution_active && state.execution) {
    body += `Execution is active. Resume from current state:\n`;
    body += `1. Load \`runtime/state/active-execution.json\`\n`;
    body += `2. Resume from phase: ${state.execution.execution.phase}\n`;
    body += `3. Continue next action: ${state.execution.next_actions[0] || "unknown"}\n`;
  } else {
    body += `No resume required. System is idle.\n`;
    body += `1. Select next ticket from active milestone backlog\n`;
    body += `2. Acquire execution lock\n`;
    body += `3. Begin execution per EXECUTION_LIFECYCLE_PROTOCOL.md\n`;
  }
  body += `\n`;

  if (state.execution?.files?.created?.length) {
    body += `## Files Already Created\n\n`;
    for (const f of state.execution.files.created) body += `- \`${f}\`\n`;
    body += `\n`;
  }

  if (state.execution?.pending_work?.length) {
    body += `## Pending Work\n\n`;
    for (const w of state.execution.pending_work) body += `- ${w}\n`;
    body += `\n`;
  }

  if (state.execution?.unresolved_risks?.length) {
    body += `## Risks to Verify on Resume\n\n`;
    for (const r of state.execution.unresolved_risks) body += `- ${r}\n`;
    body += `\n`;
  }

  body += `---\n\n`;
  body += `*This instruction is regenerated after every safe exit, checkpoint, or state transition.*\n`;
  return body;
}

function main() {
  if (!fs.existsSync(PROJECTIONS_DIR)) {
    fs.mkdirSync(PROJECTIONS_DIR, { recursive: true });
  }

  const state = loadJson<ActiveExecution>(path.join(STATE_DIR, "active-execution.json"));

  fs.writeFileSync(path.join(PROJECTIONS_DIR, "latest-status.md"), generateLatestStatus(state));
  fs.writeFileSync(path.join(PROJECTIONS_DIR, "latest-heartbeat.md"), generateLatestHeartbeat());
  fs.writeFileSync(path.join(PROJECTIONS_DIR, "current-context.md"), generateCurrentContext(state));
  fs.writeFileSync(path.join(PROJECTIONS_DIR, "resume-instruction.md"), generateResumeInstruction(state));

  console.log("Runtime projections regenerated successfully.");
  console.log("  - latest-status.md");
  console.log("  - latest-heartbeat.md");
  console.log("  - current-context.md");
  console.log("  - resume-instruction.md");
}

main();
