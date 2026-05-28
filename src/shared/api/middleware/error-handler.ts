import type { Request, Response, NextFunction } from 'express';
import { DomainError } from '../../errors/domain-error.js';
import { mapToHttpResponse } from '../../errors/error-mapper.js';
import { logger } from '../../observability/logger.js';

/**
 * Express error handling middleware.
 *
 * Catches all errors and returns a canonical API error response.
 * Never leaks raw Error messages or stack traces to the client.
 *
 * @see /project-knowledge/runtime-governance.md
 */
export function errorHandlerMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const correlationId =
    ((req as unknown as Record<string, unknown>).correlationId as string | undefined) ?? 'unknown';

  let domainError: DomainError;

  if (err instanceof DomainError) {
    domainError = err;
  } else {
    domainError = new DomainError(
      'SHARED_INTERNAL_ERROR',
      'An unexpected error occurred',
      correlationId,
      false
    );
  }

  // Log full error details internally (including stack for non-domain errors)
  logger.error(domainError.message, {
    code: domainError.code,
    correlationId: domainError.correlationId,
    stack: err instanceof DomainError ? undefined : err.stack,
    originalMessage: err instanceof DomainError ? undefined : err.message,
  });

  const { status, body } = mapToHttpResponse(domainError);
  res.status(status).json(body);
}
