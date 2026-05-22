#!/usr/bin/env node
/**
 * create-ticket.ts — Automated Ticket Creation Protocol
 *
 * Implements TICKET_CREATION_PROTOCOL.md Steps 2–5.
 *
 * Usage:
 *   tsx scripts/create-ticket.ts --file path/to/ticket.json
 *   tsx scripts/create-ticket.ts --id T12.1 --milestone M12 --title "..." ...
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, "../project-management/data");
const TICKETS_DIR = join(DATA_DIR, "tickets");
const MILESTONES_FILE = join(DATA_DIR, "milestones.json");
const GOV_MILESTONES_FILE = join(DATA_DIR, "governance-milestones.json");

interface Ticket {
  id: string;
  milestone_id: string;
  title: string;
  domain: string;
  capability: string;
  purpose: string;
  dependencies?: string[];
  deliverables: Array<{ path: string; description: string; type: string }>;
  acceptance_criteria: string[];
  estimated_hours?: number;
  status?: string;
}

function loadJSON<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function writeJSON(path: string, data: unknown) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].startsWith("--")) {
      const key = raw[i].slice(2).replace(/-/g, "_");
      args[key] = raw[i + 1] ?? "";
      i++;
    }
  }
  return args;
}

function emitResult(result: {
  status: "PASS" | "FAIL";
  ticket_id?: string;
  milestone_id?: string;
  message: string;
  errors?: string[];
  step?: string;
}) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === "PASS" ? 0 : 1);
}

// ─── MAIN ───────────────────────────────────────────────────────────────────

const args = parseArgs();

// Build ticket from --file or inline args
let ticket: Ticket;

if (args.file) {
  try {
    ticket = loadJSON<Ticket>(args.file)!;
    if (!ticket) throw new Error("File not found or empty");
  } catch (e: any) {
    emitResult({ status: "FAIL", message: `Failed to read --file: ${e.message}`, step: "parse" });
    process.exit(1);
  }
} else {
  const required = ["id", "milestone_id", "title", "domain", "capability", "purpose"];
  const missing = required.filter((k) => !args[k]);
  if (missing.length > 0) {
    emitResult({
      status: "FAIL",
      message: `Missing required arguments: ${missing.join(", ")}`,
      step: "parse",
    });
    process.exit(1);
  }

  let deliverables: Ticket["deliverables"] = [];
  let acceptanceCriteria: string[] = [];
  let dependencies: string[] = [];

  try {
    if (args.deliverables) deliverables = JSON.parse(args.deliverables);
    if (args.acceptance_criteria) acceptanceCriteria = JSON.parse(args.acceptance_criteria);
    if (args.dependencies) dependencies = JSON.parse(args.dependencies);
  } catch (e: any) {
    emitResult({ status: "FAIL", message: `JSON parse error: ${e.message}`, step: "parse" });
    process.exit(1);
  }

  ticket = {
    id: args.id,
    milestone_id: args.milestone_id,
    title: args.title,
    domain: args.domain,
    capability: args.capability,
    purpose: args.purpose,
    dependencies,
    deliverables,
    acceptance_criteria: acceptanceCriteria,
    estimated_hours: args.estimated_hours ? parseFloat(args.estimated_hours) : undefined,
    status: args.status || "planned",
  };
}

// Validate ticket has minimum fields
if (!ticket.id || !ticket.milestone_id || !ticket.title || !ticket.domain || !ticket.capability || !ticket.purpose) {
  emitResult({ status: "FAIL", message: "Ticket missing required fields", step: "validate-structure" });
  process.exit(1);
}

// ─── STEP 1: Validate milestone exists ──────────────────────────────────────

const mainMilestones = loadJSON<any[]>(MILESTONES_FILE) ?? [];
const govMilestones = loadJSON<any[]>(GOV_MILESTONES_FILE) ?? [];
const allMilestones = [...mainMilestones, ...govMilestones];

const milestone = allMilestones.find((m) => m.id === ticket.milestone_id);
if (!milestone) {
  emitResult({
    status: "FAIL",
    message: `Milestone ${ticket.milestone_id} not found`,
    step: "validate-milestone",
  });
  process.exit(1);
}

if (!milestone.tickets.includes(ticket.id)) {
  emitResult({
    status: "FAIL",
    message: `Ticket ${ticket.id} is not reserved in ${ticket.milestone_id}.tickets array`,
    step: "validate-milestone",
  });
  process.exit(1);
}

// ─── STEP 2: Check for collision ────────────────────────────────────────────

const ticketPath = join(TICKETS_DIR, `${ticket.id}.json`);
if (existsSync(ticketPath)) {
  emitResult({
    status: "FAIL",
    message: `Ticket file already exists: ${ticketPath}`,
    step: "write-file",
  });
  process.exit(1);
}

// ─── STEP 3: Write ticket file ──────────────────────────────────────────────

writeJSON(ticketPath, ticket);

// ─── STEP 4: Register in milestone (exists=true, isValid=false) ─────────────

milestone.ticket_paths = milestone.ticket_paths || {};
milestone.ticket_paths[ticket.id] = {
  path: `tickets/${ticket.id}.json`,
  exists: true,
  isValid: false,
};

if (mainMilestones.includes(milestone)) {
  writeJSON(MILESTONES_FILE, mainMilestones);
} else {
  writeJSON(GOV_MILESTONES_FILE, govMilestones);
}

// ─── STEP 5: Run validation ─────────────────────────────────────────────────

try {
  execSync("node scripts/validate-pm.js", {
    cwd: join(__dirname, ".."),
    stdio: "pipe",
    encoding: "utf-8",
  });
} catch (e: any) {
  // Validation failed — leave exists=true, isValid=false
  emitResult({
    status: "FAIL",
    ticket_id: ticket.id,
    milestone_id: ticket.milestone_id,
    message: `Ticket file written but validation failed. Fix errors and re-run validate-pm.js.`,
    errors: [e.stdout || e.message],
    step: "validate",
  });
  process.exit(1);
}

// ─── STEP 6: Mark valid ─────────────────────────────────────────────────────

milestone.ticket_paths[ticket.id].isValid = true;

if (mainMilestones.includes(milestone)) {
  writeJSON(MILESTONES_FILE, mainMilestones);
} else {
  writeJSON(GOV_MILESTONES_FILE, govMilestones);
}

emitResult({
  status: "PASS",
  ticket_id: ticket.id,
  milestone_id: ticket.milestone_id,
  message: `Ticket ${ticket.id} created, registered, and validated.`,
  step: "complete",
});
