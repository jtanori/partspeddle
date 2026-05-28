/**
 * Error normalization from backend DomainError to frontend-friendly errors.
 *
 * Backend errors follow: { code, message, correlationId, retryable, details }
 * Frontend errors: { message, code, correlationId, retryable, original }
 */

export interface ApiError {
  readonly message: string;
  readonly code: string;
  readonly correlationId?: string;
  readonly retryable: boolean;
  readonly original: unknown;
}

export function normalizeError(error: unknown): ApiError {
  if (error instanceof Response) {
    return {
      message: `HTTP ${error.status}: ${error.statusText}`,
      code: `HTTP_${error.status}`,
      retryable: error.status >= 500 || error.status === 429,
      original: error,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      code: 'CLIENT_ERROR',
      retryable: false,
      original: error,
    };
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  ) {
    const e = error as Record<string, unknown>;
    return {
      message: String(e.message),
      code: String(e.code),
      correlationId: typeof e.correlationId === 'string' ? e.correlationId : undefined,
      retryable: Boolean(e.retryable),
      original: error,
    };
  }

  return {
    message: 'An unexpected error occurred',
    code: 'UNKNOWN_ERROR',
    retryable: false,
    original: error,
  };
}

export function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof Error && error.message.includes('fetch'));
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly correlationId: string | undefined;
  readonly retryable: boolean;
  readonly original: unknown;

  constructor(apiError: ApiError) {
    super(apiError.message);
    this.code = apiError.code;
    this.correlationId = apiError.correlationId;
    this.retryable = apiError.retryable;
    this.original = apiError.original;
  }
}

export function isRetryable(error: ApiError): boolean {
  return error.retryable || isNetworkError(error.original);
}
