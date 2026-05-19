import type { Request, Response, NextFunction } from 'express';
import { setTraceContext, generateTraceparent, parseTraceparent } from '../../observability/tracing.js';

/**
 * Express middleware that extracts or generates correlation IDs and traceparent.
 *
 * - Extracts `X-Correlation-Id` header or generates a new UUID
 * - Extracts `traceparent` header or generates a new W3C trace context
 * - Stores trace context in AsyncLocalStorage for request-scoped access
 * - Attaches both IDs to the response headers
 *
 * @see /project-knowledge/runtime-governance.md
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId =
    (req.headers['x-correlation-id'] as string | undefined) ?? crypto.randomUUID();

  const traceparentHeader = req.headers['traceparent'] as string | undefined;
  const traceContext = traceparentHeader
    ? parseTraceparent(traceparentHeader) ?? generateTraceparent()
    : generateTraceparent();

  // Store in AsyncLocalStorage for request-scoped access
  setTraceContext(traceContext);

  // Attach correlation context to request for downstream handlers
  (req as unknown as Record<string, unknown>).correlationId = correlationId;
  (req as unknown as Record<string, unknown>).traceparent = traceContext.traceparent;

  // Propagate back to client
  res.setHeader('X-Correlation-Id', correlationId);
  res.setHeader('traceparent', traceContext.traceparent);

  next();
}
