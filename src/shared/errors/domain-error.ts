export class DomainError extends Error {
  readonly code: string;
  readonly correlationId: string;
  readonly isRetryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    correlationId: string,
    isRetryable = false,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.code = code;
    this.correlationId = correlationId;
    this.isRetryable = isRetryable;
    this.details = details;
    this.name = 'DomainError';

    // Maintain proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DomainError);
    }
  }
}
