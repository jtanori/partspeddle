/**
 * Distributed Tracing — W3C Trace Context
 *
 * Parses, generates, and propagates traceparent headers.
 * Uses AsyncLocalStorage for request-scoped trace context.
 *
 * @see https://www.w3.org/TR/trace-context/
 * @see /project-knowledge/runtime-governance.md
 */

import { AsyncLocalStorage } from 'async_hooks';

export interface TraceContext {
  readonly traceId: string;
  readonly parentId: string;
  readonly flags: string;
  readonly traceparent: string;
}

const traceStorage = new AsyncLocalStorage<TraceContext>();

const TRACEPARENT_PATTERN = /^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/;

function generateTraceId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

function generateParentId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

/**
 * Parse a W3C traceparent header value.
 *
 * Returns null if invalid.
 */
export function parseTraceparent(header: string): TraceContext | null {
  const match = TRACEPARENT_PATTERN.exec(header);
  if (!match) return null;

  return {
    traceId: match[1],
    parentId: match[2],
    flags: match[3],
    traceparent: header,
  };
}

/**
 * Generate a new traceparent with a fresh trace ID.
 */
export function generateTraceparent(): TraceContext {
  const traceId = generateTraceId();
  const parentId = generateParentId();
  const flags = '01'; // sampled
  const traceparent = `00-${traceId}-${parentId}-${flags}`;

  return { traceId, parentId, flags, traceparent };
}

/**
 * Create a child traceparent from an existing context.
 *
 * Used when crossing a service/queue boundary:
 * - traceId stays the same
 * - parentId becomes a new span ID
 */
export function createChildTraceparent(parent: TraceContext): TraceContext {
  const parentId = generateParentId();
  const traceparent = `00-${parent.traceId}-${parentId}-${parent.flags}`;

  return {
    traceId: parent.traceId,
    parentId,
    flags: parent.flags,
    traceparent,
  };
}

/**
 * Store trace context in AsyncLocalStorage for the current async context.
 */
export function setTraceContext(ctx: TraceContext): void {
  traceStorage.enterWith(ctx);
}

/**
 * Retrieve the current trace context from AsyncLocalStorage.
 */
export function getTraceContext(): TraceContext | undefined {
  return traceStorage.getStore();
}

/**
 * Run a callback within a trace context scope.
 */
export function runWithTraceContext<T>(ctx: TraceContext, callback: () => T): T {
  return traceStorage.run(ctx, callback);
}
