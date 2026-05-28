/**
 * Structured JSON Logger
 *
 * Emits JSON logs with mandatory fields. Redacts secrets automatically.
 * Includes structural protections against cyclic objects and oversized payloads.
 *
 * @see /project-knowledge/runtime-governance.md
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  correlationId?: string;
  traceparent?: string;
  message: string;
  context?: Record<string, unknown>;
}

const REDACTED = '[REDACTED]';

/** Keys that trigger automatic redaction. */
const SENSITIVE_KEYS = [
  /password/i,
  /secret/i,
  /token/i,
  /key/i,
  /auth/i,
  /credential/i,
  /private/i,
];

/** JWT pattern: eyJ... */
const JWT_PATTERN = /^eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*$/;

const MAX_DEPTH = 5;
const MAX_SERIALIZED_BYTES = 32 * 1024;

/**
 * Recursively clone an object, redacting sensitive values and
 * protecting against cycles, excessive depth, and oversized payloads.
 */
function sanitizeContext(value: unknown, depth = 0, seen = new WeakSet()): unknown {
  if (depth > MAX_DEPTH) {
    return '[MAX_DEPTH_EXCEEDED]';
  }

  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string' && JWT_PATTERN.test(value)) {
      return REDACTED;
    }
    return value;
  }

  if (seen.has(value)) {
    return '[CIRCULAR]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeContext(item, depth + 1, seen));
  }

  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(record)) {
    if (SENSITIVE_KEYS.some((pattern) => pattern.test(key))) {
      result[key] = REDACTED;
    } else {
      result[key] = sanitizeContext(val, depth + 1, seen);
    }
  }

  return result;
}

function serialize(entry: LogEntry): string {
  const json = JSON.stringify(entry);
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > MAX_SERIALIZED_BYTES) {
    return JSON.stringify({
      ...entry,
      context: '[OVERSIZED_LOG_ENTRY]',
    });
  }
  return json;
}

function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  meta?: { correlationId?: string; traceparent?: string }
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    service: 'vintrack',
    correlationId: meta?.correlationId,
    traceparent: meta?.traceparent,
    message,
    context: context ? (sanitizeContext(context) as Record<string, unknown>) : undefined,
  };

  // eslint-disable-next-line no-console
  console.log(serialize(entry));
}

export const logger = {
  debug: (
    message: string,
    context?: Record<string, unknown>,
    meta?: { correlationId?: string; traceparent?: string }
  ) => {
    log('debug', message, context, meta);
  },
  info: (
    message: string,
    context?: Record<string, unknown>,
    meta?: { correlationId?: string; traceparent?: string }
  ) => {
    log('info', message, context, meta);
  },
  warn: (
    message: string,
    context?: Record<string, unknown>,
    meta?: { correlationId?: string; traceparent?: string }
  ) => {
    log('warn', message, context, meta);
  },
  error: (
    message: string,
    context?: Record<string, unknown>,
    meta?: { correlationId?: string; traceparent?: string }
  ) => {
    log('error', message, context, meta);
  },
};
