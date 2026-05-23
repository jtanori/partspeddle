/**
 * scripts/validators/governance/governance-event.ts
 * Generated validator for governance events.
 * Validates an event object against governance-event.schema.json
 */

export type Severity = "debug" | "info" | "warn" | "error" | "critical";
export type Category = "execution" | "validation" | "recovery" | "governance" | "runtime" | "planning" | "diagnostics";
export type Actor = "agent" | "human" | "system" | "scheduler";

export interface GovernanceEvent {
  event_id: string;
  timestamp: string;
  event_type: string;
  severity: Severity;
  category: Category;
  execution_id?: string | null;
  milestone?: string | null;
  ticket?: string | null;
  actor?: Actor;
  session_id?: string | null;
  correlation_id?: string | null;
  causation_id?: string | null;
  payload?: Record<string, unknown>;
  metadata?: {
    source_file?: string;
    line_number?: number;
    git_commit?: string;
    version?: string;
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXEC_RE = /^EXEC-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{3}$/;
const MILESTONE_RE = /^M[0-9]+$/;
const TICKET_RE = /^T[0-9]+\.[0-9A-Z]+$/;
const EVENT_TYPE_RE = /^[a-z]+\.[a-z]+(_[a-z]+)*$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;

const VALID_SEVERITIES: Severity[] = ["debug", "info", "warn", "error", "critical"];
const VALID_CATEGORIES: Category[] = ["execution", "validation", "recovery", "governance", "runtime", "planning", "diagnostics"];
const VALID_ACTORS: Actor[] = ["agent", "human", "system", "scheduler"];

export function validateGovernanceEvent(event: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof event !== "object" || event === null) {
    return { valid: false, errors: ["Event must be an object"] };
  }

  const e = event as Record<string, unknown>;

  // Required fields
  if (typeof e.event_id !== "string" || !UUID_RE.test(e.event_id)) {
    errors.push("event_id must be a valid UUID string");
  }
  if (typeof e.timestamp !== "string" || !ISO_DATE_RE.test(e.timestamp)) {
    errors.push("timestamp must be an ISO-8601 datetime string");
  }
  if (typeof e.event_type !== "string" || !EVENT_TYPE_RE.test(e.event_type)) {
    errors.push("event_type must match pattern domain.action_name");
  }
  if (!VALID_SEVERITIES.includes(e.severity as Severity)) {
    errors.push(`severity must be one of ${VALID_SEVERITIES.join(", ")}`);
  }
  if (!VALID_CATEGORIES.includes(e.category as Category)) {
    errors.push(`category must be one of ${VALID_CATEGORIES.join(", ")}`);
  }

  // Optional fields with format checks
  if (e.execution_id !== undefined && e.execution_id !== null) {
    if (typeof e.execution_id !== "string" || !EXEC_RE.test(e.execution_id)) {
      errors.push("execution_id must match EXEC-YYYY-MM-DD-NNN");
    }
  }
  if (e.milestone !== undefined && e.milestone !== null) {
    if (typeof e.milestone !== "string" || !MILESTONE_RE.test(e.milestone)) {
      errors.push("milestone must match M<N>");
    }
  }
  if (e.ticket !== undefined && e.ticket !== null) {
    if (typeof e.ticket !== "string" || !TICKET_RE.test(e.ticket)) {
      errors.push("ticket must match T<N>.<sequence>");
    }
  }
  if (e.actor !== undefined) {
    if (!VALID_ACTORS.includes(e.actor as Actor)) {
      errors.push(`actor must be one of ${VALID_ACTORS.join(", ")}`);
    }
  }
  if (e.correlation_id !== undefined && e.correlation_id !== null) {
    if (typeof e.correlation_id !== "string" || !UUID_RE.test(e.correlation_id)) {
      errors.push("correlation_id must be a valid UUID");
    }
  }
  if (e.causation_id !== undefined && e.causation_id !== null) {
    if (typeof e.causation_id !== "string" || !UUID_RE.test(e.causation_id)) {
      errors.push("causation_id must be a valid UUID");
    }
  }
  if (e.payload !== undefined && typeof e.payload !== "object") {
    errors.push("payload must be an object");
  }
  if (e.metadata !== undefined) {
    if (typeof e.metadata !== "object" || e.metadata === null) {
      errors.push("metadata must be an object");
    } else {
      const m = e.metadata as Record<string, unknown>;
      if (m.line_number !== undefined && typeof m.line_number !== "number") {
        errors.push("metadata.line_number must be a number");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export default validateGovernanceEvent;
