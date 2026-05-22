/**
 * Correlation ID Middleware
 *
 * Attaches a correlation ID and traceparent to every incoming request.
 * Uses existing headers if present (for distributed tracing), or generates fresh.
 */

import type { Request, Response, NextFunction } from 'express';

const CORRELATION_ID_HEADER = 'x-correlation-id';
const TRACEPARENT_HEADER = 'traceparent';

export function correlationIdMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  req.correlationId =
    req.get(CORRELATION_ID_HEADER) ?? crypto.randomUUID();
  req.traceparent =
    req.get(TRACEPARENT_HEADER) ?? undefined;
  next();
}
