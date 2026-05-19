import { DomainError } from './domain-error.js';

/**
 * Canonical API error response shape.
 *
 * All API errors return this structure. Never includes stack traces.
 */
export interface CanonicalError {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly correlationId: string;
    readonly retryable: boolean;
  };
}

/**
 * Wrap a raw Error in a DomainError.
 *
 * Use at infrastructure boundaries to prevent raw errors from leaking.
 */
export function wrapError(
  error: unknown,
  code: string,
  correlationId: string,
  isRetryable = false,
): DomainError {
  if (error instanceof DomainError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  return new DomainError(code, message, correlationId, isRetryable);
}

/**
 * Map a DomainError to an HTTP status code and canonical response body.
 */
export function mapToHttpResponse(error: DomainError): {
  status: number;
  body: CanonicalError;
} {
  const code = error.code;
  let status = 500;

  if (code.endsWith('_NOT_FOUND')) {
    status = 404;
  } else if (code.endsWith('_CONFLICT')) {
    status = 409;
  } else if (code.endsWith('_UNAUTHORIZED')) {
    status = 401;
  } else if (code.endsWith('_FORBIDDEN')) {
    status = 403;
  } else if (code.endsWith('_VALIDATION')) {
    status = 422;
  } else if (code.startsWith('SHARED_')) {
    status = 500;
  } else if (code.startsWith('IDENTITY_')) {
    status = 400;
  } else {
    status = 500;
  }

  return {
    status,
    body: {
      error: {
        code: error.code,
        message: error.message,
        correlationId: error.correlationId,
        retryable: error.isRetryable,
      },
    },
  };
}

/**
 * Determine if an error is operationally retryable.
 *
 * Retryable means the operation can be safely retried by infrastructure
 * (queues, outbox, workers). It does NOT mean the client should retry the HTTP request.
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof DomainError) {
    return error.isRetryable;
  }
  return false;
}
